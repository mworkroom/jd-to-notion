import { randomUUID } from 'node:crypto';
import { access, readdir, rename, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  extractSopAttachmentNames,
  extractPotentialStudentNameTokens,
  matchesExpectedDownloadName,
  normalizeSopFilename,
  selectSopAttachment
} from '../../shared/sopFilename.js';
import { createJandiAttachmentTrigger } from './jandiAttachmentTrigger.js';
import { createNotionClient } from '../notion/client.js';
import { getNotionConfig } from '../notion/config.js';
import { createNotionRepositories } from '../notion/repositories/index.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_STABLE_POLL_COUNT = 2;
const TEMPORARY_DOWNLOAD_EXTENSIONS = new Set(['.crdownload', '.download', '.part', '.tmp']);

export function createDefaultSopDownloadService(options = {}) {
  let studentsRepository = null;
  const jandiAttachmentTrigger = options.jandiAttachmentTrigger
    ?? createJandiAttachmentTrigger(options.jandiAttachmentTriggerOptions);
  const resolveKnownStudentNames = async (candidateNames) => {
    if (candidateNames.length === 0) {
      return [];
    }

    if (!studentsRepository) {
      const config = options.notionConfig ?? getNotionConfig();
      const client = options.notionClient ?? createNotionClient(config);
      studentsRepository = createNotionRepositories({ client, config }).students;
    }

    return studentsRepository.findKnownBaseNames(candidateNames);
  };

  return createSopDownloadService({
    downloadsDirectory: options.downloadsDirectory,
    timeoutMs: options.timeoutMs,
    pollIntervalMs: options.pollIntervalMs,
    stablePollCount: options.stablePollCount,
    resolveKnownStudentNames,
    triggerJandiDownload: (input) => jandiAttachmentTrigger.trigger(input)
  });
}

export function createSopDownloadService({
  downloadsDirectory = process.env.JANDI_DOWNLOAD_DIR?.trim()
    || path.join(os.homedir(), 'Downloads'),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  stablePollCount = DEFAULT_STABLE_POLL_COUNT,
  resolveKnownStudentNames = async () => [],
  triggerJandiDownload = async ({ filename }) => ({
    status: 'manual',
    reason: 'auto_download_unavailable',
    filename
  })
} = {}) {
  let current = null;
  let activeController = null;

  return {
    async arm(input = {}) {
      activeController?.abort();

      const studentName = String(input.studentName ?? '').trim();
      const message = String(input.message ?? '').trim();
      const detectedAttachmentNames = uniqueSopAttachmentNames(
        input.attachmentNames?.length
          ? input.attachmentNames
          : extractSopAttachmentNames(message)
      );
      const selection = selectSopAttachment(detectedAttachmentNames);
      const allowAutoDownload = input.autoDownload !== false;
      const attachmentNames = selection.status === 'selected'
        ? [selection.filename]
        : selection.candidateNames;
      const id = randomUUID();

      if (!studentName) {
        current = terminalState(id, 'not_armed', 'student_name_missing');
        return publicState(current);
      }
      if (detectedAttachmentNames.length === 0) {
        current = terminalState(id, 'not_armed', 'supported_attachment_not_found', { studentName });
        return publicState(current);
      }
      if (attachmentNames.length === 0) {
        current = terminalState(id, 'not_armed', selection.reason, {
          studentName,
          detectedAttachmentNames,
          autoDownloadStatus: 'manual',
          autoDownloadReason: selection.reason
        });
        return publicState(current);
      }

      let knownStudentNames = [];
      let rosterCheck = 'complete';
      const candidateNames = extractPotentialStudentNameTokens(attachmentNames, studentName);
      try {
        knownStudentNames = await resolveKnownStudentNames(candidateNames);
      } catch {
        rosterCheck = 'unavailable';
      }

      const conflict = attachmentNames
        .map((filename) => normalizeSopFilename({
          studentName,
          originalFilename: filename,
          knownStudentNames
        }))
        .find((result) => result.status === 'conflict');

      if (conflict) {
        current = terminalState(id, 'conflict', 'student_name_mismatch', {
          studentName: conflict.studentName,
          originalFilename: conflict.originalFilename,
          conflictingStudentNames: conflict.conflictingStudentNames,
          attachmentNames,
          detectedAttachmentNames,
          rosterCheck
        });
        return publicState(current);
      }

      try {
        await access(downloadsDirectory);
      } catch {
        current = terminalState(id, 'error', 'downloads_directory_unavailable', {
          studentName,
          attachmentNames,
          detectedAttachmentNames,
          rosterCheck
        });
        return publicState(current);
      }

      const baseline = await readDirectoryState(downloadsDirectory, attachmentNames);
      const controller = new AbortController();
      activeController = controller;
      current = {
        id,
        status: 'armed',
        reason: '',
        studentName,
        attachmentNames,
        detectedAttachmentNames,
        rosterCheck,
        selectedAttachmentName: selection.filename,
        autoDownloadStatus: selection.status === 'selected'
          ? (allowAutoDownload ? 'preparing' : 'watching')
          : 'manual',
        autoDownloadReason: selection.status === 'selected'
          ? (allowAutoDownload ? '' : 'rearmed_without_click')
          : selection.reason,
        originalFilename: '',
        filename: '',
        conflictingStudentNames: [],
        collisionSuffixApplied: false,
        armedAt: new Date().toISOString()
      };

      void monitorDownloads({
        id,
        downloadsDirectory,
        attachmentNames,
        studentName,
        knownStudentNames,
        baseline,
        timeoutMs,
        pollIntervalMs,
        stablePollCount,
        signal: controller.signal,
        update: (next) => {
          if (current?.id === id) {
            current = { ...current, ...next };
          }
        }
      }).catch((error) => {
        if (current?.id === id && !controller.signal.aborted) {
          current = {
            ...current,
            status: 'error',
            reason: error.code ?? 'download_watch_failed'
          };
        }
      });

      if (selection.status === 'selected' && allowAutoDownload) {
        const autoDownload = await triggerJandiDownload({
          message,
          filename: selection.filename
        });
        if (current?.id === id && current.status === 'armed') {
          current = {
            ...current,
            autoDownloadStatus: autoDownload.status,
            autoDownloadReason: autoDownload.reason ?? ''
          };
        }
      }

      return publicState(current);
    },

    getStatus(id = '') {
      if (!current || (id && current.id !== id)) {
        return null;
      }
      return publicState(current);
    },

    cancel() {
      activeController?.abort();
      activeController = null;
      if (current?.status === 'armed') {
        current = { ...current, status: 'cancelled', reason: 'cancelled' };
      }
      return current ? publicState(current) : null;
    }
  };
}

async function monitorDownloads({
  id,
  downloadsDirectory,
  attachmentNames,
  studentName,
  knownStudentNames,
  baseline,
  timeoutMs,
  pollIntervalMs,
  stablePollCount,
  signal,
  update
}) {
  const deadline = Date.now() + timeoutMs;
  const stability = new Map();

  while (!signal.aborted && Date.now() < deadline) {
    await delay(pollIntervalMs, signal);
    if (signal.aborted) {
      return;
    }

    const entries = await readDirectoryState(downloadsDirectory, attachmentNames);
    for (const [filename, metadata] of entries) {
      if (!isDownloadCandidate(filename, attachmentNames, metadata, baseline.get(filename))) {
        continue;
      }

      const previous = stability.get(filename);
      const unchanged = previous
        && previous.size === metadata.size
        && previous.mtimeMs === metadata.mtimeMs;
      const stableCount = unchanged ? previous.stableCount + 1 : 1;
      stability.set(filename, { ...metadata, stableCount });

      if (metadata.size === 0 || stableCount < stablePollCount) {
        continue;
      }

      const result = normalizeSopFilename({
        studentName,
        originalFilename: filename,
        knownStudentNames
      });
      if (result.status === 'conflict') {
        update({
          status: 'conflict',
          reason: 'student_name_mismatch',
          originalFilename: filename,
          conflictingStudentNames: result.conflictingStudentNames
        });
        return;
      }
      if (result.status !== 'ready') {
        update({ status: 'error', reason: result.reason ?? 'filename_normalization_failed' });
        return;
      }

      const sourcePath = path.join(downloadsDirectory, filename);
      const destination = await resolveAvailableDestination(
        downloadsDirectory,
        result.filename,
        sourcePath
      );
      if (destination.path !== sourcePath) {
        await rename(sourcePath, destination.path);
      }

      update({
        status: 'completed',
        reason: '',
        originalFilename: filename,
        filename: path.basename(destination.path),
        collisionSuffixApplied: destination.collisionSuffixApplied,
        completedAt: new Date().toISOString()
      });
      return;
    }
  }

  if (!signal.aborted) {
    update({ status: 'timed_out', reason: 'matching_download_not_found' });
  }
}

async function readDirectoryState(directory, expectedNames) {
  const result = new Map();
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(entries.filter((entry) => (
    entry.isFile()
      && !TEMPORARY_DOWNLOAD_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      && expectedNames.some((expected) => matchesExpectedDownloadName(entry.name, expected))
  )).map(async (entry) => {
    const metadata = await stat(path.join(directory, entry.name));
    result.set(entry.name, { size: metadata.size, mtimeMs: metadata.mtimeMs });
  }));

  return result;
}

function isDownloadCandidate(filename, expectedNames, metadata, baselineMetadata) {
  if (!expectedNames.some((expected) => matchesExpectedDownloadName(filename, expected))) {
    return false;
  }
  if (!baselineMetadata) {
    return true;
  }
  return baselineMetadata.size !== metadata.size || baselineMetadata.mtimeMs !== metadata.mtimeMs;
}

async function resolveAvailableDestination(directory, filename, sourcePath) {
  const preferred = path.join(directory, filename);
  if (samePath(preferred, sourcePath) || !(await fileExists(preferred))) {
    return { path: preferred, collisionSuffixApplied: false };
  }

  const parsed = path.parse(filename);
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = path.join(directory, `${parsed.name} (${suffix})${parsed.ext}`);
    if (!(await fileExists(candidate))) {
      return { path: candidate, collisionSuffixApplied: true };
    }
  }

  const error = new Error('No collision-free filename was available.');
  error.code = 'filename_collision_exhausted';
  throw error;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function uniqueSopAttachmentNames(names) {
  return [...new Set((names ?? [])
    .map((name) => path.basename(String(name ?? '').trim()))
    .filter((name) => ['.docx', '.pdf'].includes(path.extname(name).toLowerCase())))];
}

function terminalState(id, status, reason, details = {}) {
  return {
    id,
    status,
    reason,
    studentName: '',
    attachmentNames: [],
    detectedAttachmentNames: [],
    rosterCheck: 'complete',
    selectedAttachmentName: '',
    autoDownloadStatus: 'manual',
    autoDownloadReason: reason,
    originalFilename: '',
    filename: '',
    conflictingStudentNames: [],
    collisionSuffixApplied: false,
    ...details
  };
}

function publicState(state) {
  return { ...state };
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
