import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const DEFAULT_CONTEXT_MAX_AGE_MS = 120_000;
const DEFAULT_CONTEXT_PATH = fileURLToPath(
  new URL('../../../.local/jandi-source-context.json', import.meta.url)
);
const DEFAULT_SCRIPT_PATH = fileURLToPath(
  new URL('../../../automation/inspect-jandi-cdp.mjs', import.meta.url)
);

export function createJandiAttachmentTrigger({
  contextPath = DEFAULT_CONTEXT_PATH,
  scriptPath = DEFAULT_SCRIPT_PATH,
  contextMaxAgeMs = DEFAULT_CONTEXT_MAX_AGE_MS,
  now = () => Date.now(),
  runInspector = runInspectorProcess
} = {}) {
  return {
    async trigger({ message, filename }) {
      try {
        const context = JSON.parse(await readFile(contextPath, 'utf8'));
        const capturedAt = Date.parse(context.capturedAt);
        if (!Number.isFinite(capturedAt) || now() - capturedAt > contextMaxAgeMs) {
          return manualResult('source_context_expired', filename);
        }
        if (context.messageSha256 !== sha256(message)) {
          return manualResult('source_context_mismatch', filename);
        }
        if (!(context.attachmentNames ?? []).some((name) => sameName(name, filename))) {
          return manualResult('attachment_not_in_source_context', filename);
        }

        await runInspector({
          scriptPath,
          contextPath,
          filename
        });
        return {
          status: 'triggered',
          reason: '',
          filename
        };
      } catch (error) {
        return manualResult(error.code === 'ENOENT'
          ? 'source_context_missing'
          : 'jandi_click_failed', filename);
      }
    }
  };
}

async function runInspectorProcess({ scriptPath, contextPath, filename }) {
  await execFileAsync(process.execPath, [
    scriptPath,
    '--download=' + filename,
    '--context=' + contextPath
  ], {
    timeout: 10_000,
    windowsHide: true
  });
}

function manualResult(reason, filename) {
  return {
    status: 'manual',
    reason,
    filename
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '').trim()).digest('hex');
}

function sameName(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
    sensitivity: 'accent'
  }) === 0;
}
