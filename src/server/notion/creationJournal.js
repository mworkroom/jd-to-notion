import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createFileCreationJournal({ filePath, now = () => new Date() }) {
  if (!filePath) {
    throw new Error('A journal file path is required.');
  }

  return createJournal({
    now,
    async loadRecords() {
      try {
        const contents = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(contents);
        return Array.isArray(parsed.records) ? parsed.records : [];
      } catch (error) {
        if (error.code === 'ENOENT') {
          return [];
        }
        throw error;
      }
    },
    async saveRecords(records) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify({ version: 1, records }, null, 2)}\n`, 'utf8');
    }
  });
}

export function createMemoryCreationJournal({ now = () => new Date() } = {}) {
  let records = [];
  return createJournal({
    now,
    async loadRecords() {
      return structuredClone(records);
    },
    async saveRecords(nextRecords) {
      records = structuredClone(nextRecords);
    }
  });
}

function createJournal({ loadRecords, saveRecords, now }) {
  return {
    async get(fingerprint) {
      const records = await loadRecords();
      const record = records.find((item) => item.fingerprint === fingerprint) ?? null;
      return record ? structuredClone(normalizeRecord(record)) : null;
    },

    async begin(fingerprint) {
      const records = await loadRecords();
      const existing = records.find((record) => record.fingerprint === fingerprint);
      if (existing) {
        normalizeRecord(existing);
        existing.status = 'in_progress';
        existing.failedStep = null;
        existing.errorCode = null;
        await saveRecords(records);
        return structuredClone(existing);
      }

      const record = {
        fingerprint,
        status: 'in_progress',
        startedAt: now().toISOString(),
        completedAt: null,
        failedStep: null,
        errorCode: null,
        pages: {
          student: null,
          universities: [],
          majors: [],
          workLogs: []
        }
      };
      records.push(record);
      await saveRecords(records);
      return structuredClone(record);
    },

    async recordPage(fingerprint, entity, page) {
      const records = await loadRecords();
      const record = requireRecord(records, fingerprint);
      const safePage = sanitizeJournalPage(page);

      normalizeRecord(record);

      if (entity === 'student') {
        record.pages[entity] = safePage;
      } else if (entity === 'universities' || entity === 'majors' || entity === 'workLogs') {
        const index = record.pages[entity].findIndex((item) => item.key === safePage.key);
        if (index >= 0) {
          record.pages[entity][index] = safePage;
        } else {
          record.pages[entity].push(safePage);
        }
      } else {
        throw new Error(`Unsupported journal entity: ${entity}`);
      }

      await saveRecords(records);
      return structuredClone(record);
    },

    async fail(fingerprint, { step, errorCode }) {
      const records = await loadRecords();
      const record = requireRecord(records, fingerprint);
      record.status = 'failed';
      record.failedStep = step;
      record.errorCode = errorCode;
      await saveRecords(records);
      return structuredClone(record);
    },

    async complete(fingerprint) {
      const records = await loadRecords();
      const record = requireRecord(records, fingerprint);
      record.status = 'completed';
      record.completedAt = now().toISOString();
      record.failedStep = null;
      record.errorCode = null;
      await saveRecords(records);
      return structuredClone(record);
    }
  };
}

function requireRecord(records, fingerprint) {
  const record = records.find((item) => item.fingerprint === fingerprint);
  if (!record) {
    throw new Error('Journal record was not started.');
  }
  return record;
}

function sanitizeJournalPage(page = {}) {
  return {
    key: String(page.key ?? ''),
    id: String(page.id ?? ''),
    action: page.action === 'reuse' ? 'reuse' : 'create'
  };
}

function normalizeRecord(record) {
  record.pages ??= {};
  record.pages.student ??= null;
  record.pages.universities ??= [];
  record.pages.majors ??= [];
  record.pages.workLogs ??= [];

  if (record.pages.workLog?.id && record.pages.workLogs.length === 0) {
    record.pages.workLogs.push({
      ...record.pages.workLog,
      key: record.pages.workLog.key || 'work_log:legacy'
    });
  }
  delete record.pages.workLog;
  return record;
}
