import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSheetsPreviewService } from '../src/server/googleSheets/googleSheetsPreviewService.js';
import { GOOGLE_SYNC_LOG_HEADERS } from '../src/server/googleSheets/syncHistoryReader.js';
import { NOTION_PROPERTY_NAMES } from '../src/server/notion/schema.js';

const googleConfig = {
  enabled: true,
  spreadsheetId: 'test-sheet-id',
  serviceAccountKeyPath: 'unused.json',
  syncStartAt: '2026-08-24T00:00:00+09:00',
  syncLogSheetName: '_JD_SYNC'
};
const notionConfig = { dataSourceIds: { workLog: 'work-log-ds' } };

test('excludes synced Page IDs and groups the remaining admissions logs with relation caching', async () => {
  const notionClient = makeNotionClient();
  const service = createGoogleSheetsPreviewService({
    googleClient: makeGoogleClient('work-synced'),
    googleConfig,
    notionClient,
    notionConfig,
    statusService: readyStatusService()
  });

  const result = await service.preview();

  assert.equal(result.readOnly, true);
  assert.deepEqual(result.counts, {
    foundSinceCutoff: 3,
    alreadySynced: 1,
    unsynced: 2,
    outputRows: 1,
    readyPages: 2,
    heldPages: 0
  });
  assert.equal(result.rows[0].values.C, 1);
  assert.equal(result.rows[0].values.F, 'University - Major 1\nUniversity - Major 2');
  assert.equal(notionClient.calls.retrieve.length, 5);
  assert.equal(new Set(notionClient.calls.retrieve).size, 5);
});

test('stops before Notion queries when the calculated Google target is not ready', async () => {
  let notionQueries = 0;
  const service = createGoogleSheetsPreviewService({
    googleClient: makeGoogleClient(),
    googleConfig,
    notionClient: {
      dataSources: { async query() { notionQueries += 1; } }
    },
    notionConfig,
    statusService: {
      async getStatus() {
        return {
          ready: false,
          issue: { code: 'GOOGLE_TARGET_SHEET_MISSING' },
          target: { name: '26년 9월' }
        };
      }
    }
  });

  await assert.rejects(
    () => service.preview(),
    (error) => error.code === 'GOOGLE_SHEETS_NOT_READY'
  );
  assert.equal(notionQueries, 0);
});

test('groups only new admissions 4 and 5 when admissions 1 to 3 are already synced', async () => {
  const notionClient = makeAdditionalAdmissionsClient();
  const service = createGoogleSheetsPreviewService({
    googleClient: makeGoogleClient(['work-1', 'work-2', 'work-3']),
    googleConfig,
    notionClient,
    notionConfig,
    statusService: readyStatusService()
  });

  const result = await service.preview();

  assert.equal(result.counts.foundSinceCutoff, 5);
  assert.equal(result.counts.alreadySynced, 3);
  assert.equal(result.counts.unsynced, 2);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].pageIds, ['work-4', 'work-5']);
  assert.equal(result.rows[0].values.C, 0.83);
  assert.equal(result.rows[0].values.F, 'University - Major 4\nUniversity - Major 5');
});

function readyStatusService() {
  return {
    async getStatus() {
      return {
        ready: true,
        spreadsheet: { id: 'test-sheet-id', title: 'Test' },
        target: { name: '26년 9월', sheetId: 931518682 }
      };
    }
  };
}

function makeGoogleClient(syncedIds = []) {
  const ids = Array.isArray(syncedIds)
    ? syncedIds
    : (syncedIds ? [syncedIds] : []);
  return {
    spreadsheets: {
      async get() {
        return {
          data: { sheets: [{ properties: { title: '_JD_SYNC', sheetId: 99 } }] }
        };
      },
      values: {
        async get() {
          return {
            data: {
              values: [
                GOOGLE_SYNC_LOG_HEADERS,
                ...ids.map((id) => [id, '', '', '', ''])
              ]
            }
          };
        }
      }
    }
  };
}

function makeAdditionalAdmissionsClient() {
  const workLogs = [
    workLog('work-1', '입학 요강 1', 0.5, 'major-1'),
    workLog('work-2', '입학 요강 2', 0.5, 'major-2'),
    workLog('work-3', '입학 요강 3', 0.5, 'major-3'),
    workLog('work-4', '입학 요강 4', 0.5, 'major-4'),
    workLog('work-5', '입학 요강 5', 0.33, 'major-5')
  ];
  const pages = new Map([
    ['student-1', studentPage()],
    ['agent-1', titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Agent')],
    ['university-1', titlePage('university-1', NOTION_PROPERTY_NAMES.universities.name, 'University')],
    ...Array.from({ length: 5 }, (_, index) => {
      const number = index + 1;
      return [`major-${number}`, majorPage(`major-${number}`, `Major ${number}`)];
    })
  ]);

  return {
    dataSources: {
      async query() {
        return { results: workLogs, has_more: false, next_cursor: null };
      }
    },
    pages: {
      async retrieve({ page_id }) {
        return structuredClone(pages.get(page_id));
      }
    }
  };
}

function makeNotionClient() {
  const workLogs = [
    workLog('work-1', '입학 요강 1', 0.5, 'major-1'),
    workLog('work-2', '입학 요강 2', 0.5, 'major-2'),
    workLog('work-synced', 'SOP 감수', 0.33, 'major-1', 'SOP 감수(국문)')
  ];
  const pages = new Map([
    ['student-1', studentPage()],
    ['agent-1', titlePage('agent-1', NOTION_PROPERTY_NAMES.agents.name, 'Agent')],
    ['major-1', majorPage('major-1', 'Major 1')],
    ['major-2', majorPage('major-2', 'Major 2')],
    ['university-1', titlePage('university-1', NOTION_PROPERTY_NAMES.universities.name, 'University')]
  ]);
  const calls = { retrieve: [] };

  return {
    calls,
    dataSources: {
      async query() {
        return { results: workLogs, has_more: false, next_cursor: null };
      }
    },
    pages: {
      async retrieve({ page_id }) {
        calls.retrieve.push(page_id);
        return structuredClone(pages.get(page_id));
      }
    }
  };
}

function workLog(id, title, hours, majorId, category = '입학 요강') {
  return {
    id,
    created_time: '2026-08-24T01:00:00.000Z',
    properties: {
      [NOTION_PROPERTY_NAMES.workLog.title]: titleProperty(title),
      [NOTION_PROPERTY_NAMES.workLog.category]: { type: 'select', select: { name: category } },
      [NOTION_PROPERTY_NAMES.workLog.hours]: { type: 'number', number: hours },
      [NOTION_PROPERTY_NAMES.workLog.students]: relationProperty(['student-1']),
      [NOTION_PROPERTY_NAMES.workLog.major]: relationProperty([majorId])
    }
  };
}

function studentPage() {
  return {
    ...titlePage('student-1', NOTION_PROPERTY_NAMES.students.name, 'Student'),
    properties: {
      [NOTION_PROPERTY_NAMES.students.name]: titleProperty('Student'),
      [NOTION_PROPERTY_NAMES.students.agentRelation]: relationProperty(['agent-1'])
    }
  };
}

function majorPage(id, name) {
  return {
    ...titlePage(id, NOTION_PROPERTY_NAMES.majors.name, name),
    properties: {
      [NOTION_PROPERTY_NAMES.majors.name]: titleProperty(name),
      [NOTION_PROPERTY_NAMES.majors.universityRelation]: relationProperty(['university-1'])
    }
  };
}

function titlePage(id, propertyName, value) {
  return { id, properties: { [propertyName]: titleProperty(value) } };
}

function titleProperty(value) {
  return { type: 'title', title: [{ plain_text: value }] };
}

function relationProperty(ids) {
  return { type: 'relation', relation: ids.map((id) => ({ id })) };
}
