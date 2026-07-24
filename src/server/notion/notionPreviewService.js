import { calculateWeekdayDeadline } from '../../shared/deadline.js';
import { deriveProgrammeFields, normalizeWhitespace } from '../../shared/normalization.js';
import {
  ADMISSIONS_CATEGORY,
  REQUEST_SEASON,
  getNextWorkLogTitles
} from '../../shared/workLog.js';
import { createNotionClient } from './client.js';
import { getNotionConfig } from './config.js';
import { NotionAppError } from './errors.js';
import { createNotionRepositories } from './repositories/index.js';

const PENDING_WORK_LOG_TITLE = '기존 학생 선택 필요';

export function createDefaultNotionPreviewService({ client, config } = {}) {
  const activeConfig = config ?? getNotionConfig();
  const activeClient = client ?? createNotionClient(activeConfig);

  return createNotionPreviewService({
    repositories: createNotionRepositories({
      client: activeClient,
      config: activeConfig
    })
  });
}

export function createNotionPreviewService({ repositories }) {
  return {
    async preview(input) {
      const request = validatePreviewRequest(input);
      const agent = await repositories.agents.findByExactName(request.requesterName);
      const matchedAgentId = agent.status === 'matched' ? agent.selected.id : null;
      const student = await buildStudentPreview({
        repositories,
        request,
        matchedAgentId
      });
      const programmes = await Promise.all(
        request.programmes.map((programme, index) => buildProgrammePreview({
          repositories,
          programme,
          index
        }))
      );
      const workLog = await buildWorkLogPreview({
        repositories,
        request,
        selectedStudentId: student.selectedStudentId
      });
      const blockingIssues = collectBlockingIssues({ agent, student, programmes });

      return {
        ok: true,
        blockingIssues,
        agent,
        student,
        programmes,
        workLog,
        phase3Plan: buildPhase3Plan({
          request,
          student,
          programmes
        })
      };
    },

    async getWorkLogTitleForStudent(studentId, workLogCount = 1) {
      const cleanStudentId = normalizeWhitespace(studentId);
      if (!cleanStudentId) {
        throw new NotionAppError({
          code: 'INVALID_PREVIEW_REQUEST',
          statusCode: 400,
          message: 'Selected Student page ID is required.',
          details: { errors: ['selectedStudentId is required.'] }
        });
      }

      const count = normalizeWorkLogCount(workLogCount);
      const existingLogs = await repositories.workLogs.findAdmissionsLogsForStudent(cleanStudentId);
      const titles = getNextWorkLogTitles(existingLogs, count);
      return {
        ok: true,
        workLog: {
          title: titles[0] ?? '',
          titles,
          count,
          category: ADMISSIONS_CATEGORY,
          requestSeason: REQUEST_SEASON
        }
      };
    }
  };
}

export function validatePreviewRequest(input = {}) {
  const errors = [];
  const clientMode = input.clientMode;
  const requesterName = normalizeWhitespace(input.requesterName);
  const studentName = normalizeWhitespace(input.studentName);
  const programmes = Array.isArray(input.programmes) ? input.programmes : [];

  if (!['new', 'existing'].includes(clientMode)) {
    errors.push('clientMode must be "new" or "existing".');
  }

  if (!requesterName) {
    errors.push('requesterName is required.');
  }

  if (!studentName) {
    errors.push('studentName is required.');
  }

  if (programmes.length === 0) {
    errors.push('At least one programme is required.');
  }

  const normalizedProgrammes = programmes.map((programme, index) => {
    const normalized = deriveProgrammeFields({
      rawUniversityName: programme?.rawUniversityName ?? programme?.universityName ?? '',
      universityName: normalizeWhitespace(programme?.universityName),
      programmeNameOriginal: normalizeWhitespace(programme?.programmeNameOriginal),
      programmeUrl: normalizeWhitespace(programme?.programmeUrl)
    });

    if (!normalized.universityName) {
      errors.push(`programmes.${index}.universityName is required.`);
    }

    if (!normalized.majorSearchKey) {
      errors.push(`programmes.${index}.majorSearchKey is required.`);
    }

    return normalized;
  });

  if (errors.length > 0) {
    throw new NotionAppError({
      code: 'INVALID_PREVIEW_REQUEST',
      statusCode: 400,
      message: 'Preview request is invalid.',
      details: { errors }
    });
  }

  return {
    clientMode,
    requesterName,
    studentName,
    requestDateTime: normalizeWhitespace(input.requestDateTime),
    programmes: normalizedProgrammes
  };
}

async function buildStudentPreview({ repositories, request, matchedAgentId }) {
  if (request.clientMode === 'new') {
    const preview = await repositories.students.getNewClientPreview(request.studentName);
    return {
      mode: 'new',
      baseName: preview.baseName,
      existingFamily: preview.existingFamily,
      suggestedStudentName: preview.suggestedStudentName,
      selectedStudentId: null,
      proposedAction: 'create'
    };
  }

  const preview = await repositories.students.getExistingClientPreview(request.studentName, matchedAgentId);
  return {
    mode: 'existing',
    baseName: preview.baseName,
    candidates: preview.candidates,
    selectedStudentId: preview.selectedStudentId,
    selection: preview.selection,
    proposedAction: preview.selectedStudentId ? 'reuse' : 'select'
  };
}

async function buildProgrammePreview({ repositories, programme, index }) {
  try {
    const university = await repositories.universities.findByExactName(programme.universityName);
    const major = await repositories.majors.findByUniversityAndKey({
      universityId: university.selected?.id ?? null,
      majorSearchKey: programme.majorSearchKey,
      requestedOriginalName: programme.programmeNameOriginal,
      proposedCreateName: programme.notionMajorNameProposed
    });

    return {
      index,
      university,
      major,
      officialProgrammeName: programme.programmeNameOriginal,
      programmeUrl: programme.programmeUrl,
      needsMajorNameReview: programme.needsMajorNameReview
    };
  } catch (error) {
    return {
      index,
      university: {
        status: 'error',
        requestedName: programme.universityName,
        selected: null,
        candidates: []
      },
      major: {
        status: 'blocked',
        requestedOriginalName: programme.programmeNameOriginal,
        searchKey: programme.majorSearchKey,
        proposedCreateName: programme.notionMajorNameProposed,
        selected: null,
        candidates: []
      },
      error: {
        code: error.code ?? 'NOTION_API_ERROR',
        message: error.message ?? 'Programme preview failed.'
      },
      officialProgrammeName: programme.programmeNameOriginal,
      programmeUrl: programme.programmeUrl,
      needsMajorNameReview: programme.needsMajorNameReview
    };
  }
}

async function buildWorkLogPreview({ repositories, request, selectedStudentId }) {
  const count = countUniqueProgrammeIdentities(request.programmes);
  const titles = request.clientMode === 'new'
    ? getNextWorkLogTitles([], count)
    : selectedStudentId
      ? getNextWorkLogTitles(
          await repositories.workLogs.findAdmissionsLogsForStudent(selectedStudentId),
          count
        )
      : [PENDING_WORK_LOG_TITLE];

  return {
    title: titles[0] ?? '',
    titles,
    count,
    deadline: calculateWeekdayDeadline(request.requestDateTime),
    category: ADMISSIONS_CATEGORY,
    requestSeason: REQUEST_SEASON
  };
}

function countUniqueProgrammeIdentities(programmes) {
  return new Set(programmes.map((programme) => [
    normalizeWhitespace(programme.universityName).toLowerCase(),
    programme.majorSearchKey
  ].join('|'))).size;
}

function normalizeWorkLogCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new NotionAppError({
      code: 'INVALID_PREVIEW_REQUEST',
      statusCode: 400,
      message: 'Work Log count must be an integer between 1 and 100.',
      details: { errors: ['workLogCount must be an integer between 1 and 100.'] }
    });
  }
  return parsed;
}

function collectBlockingIssues({ agent, student, programmes }) {
  const issues = [];

  if (agent.status === 'missing') {
    issues.push('Requester Agent was not found.');
  } else if (agent.status === 'ambiguous') {
    issues.push('Requester Agent matched multiple rows.');
  }

  if (student.mode === 'existing' && !student.selectedStudentId) {
    issues.push('Existing Student selection is unresolved.');
  }

  for (const programme of programmes) {
    if (programme.university.status === 'ambiguous') {
      issues.push(`Programme ${programme.index + 1}: University match is ambiguous.`);
    }
    if (programme.university.status === 'error') {
      issues.push(`Programme ${programme.index + 1}: University lookup failed.`);
    }
    if (programme.major.status === 'ambiguous') {
      issues.push(`Programme ${programme.index + 1}: Major match is ambiguous.`);
    }
    if (programme.major.status === 'blocked'
      && programme.university.status !== 'missing') {
      issues.push(`Programme ${programme.index + 1}: Major lookup is blocked until University is resolved.`);
    }
  }

  return issues;
}

function buildPhase3Plan({ request, student, programmes }) {
  const universitiesToCreate = uniqueByName(
    programmes
      .filter((programme) => programme.university.status === 'missing')
      .map((programme) => ({
        name: programme.university.proposedCreateName ?? programme.university.requestedName
      }))
  );
  const majorsToCreate = uniqueByMajorIdentity(
    programmes
      .filter((programme) => programme.major.status === 'missing'
        || (programme.major.status === 'blocked'
          && programme.university.status === 'missing'))
      .map((programme) => ({
        name: programme.major.proposedCreateName,
        universityName: programme.university.selected?.name ?? programme.university.requestedName
      }))
  );

  return {
    canCreate: false,
    reasons: ['Controlled live-write approval is still required.'],
    studentAction: request.clientMode === 'new'
      ? 'create'
      : student.selectedStudentId
        ? 'reuse'
        : 'select',
    universitiesToCreate,
    majorsToCreate
  };
}

function uniqueByMajorIdentity(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = [
      normalizeWhitespace(item.universityName).toLowerCase(),
      normalizeWhitespace(item.name).toLowerCase()
    ].join('|');
    if (!item.name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function uniqueByName(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = normalizeWhitespace(item.name).toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
