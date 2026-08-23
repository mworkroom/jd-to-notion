import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAtomicWritePlan,
  writePreviewRowsAtomically
} from '../src/server/googleSheets/googleSheetsWriter.js';
import { GOOGLE_SYNC_LOG_HEADERS } from '../src/server/googleSheets/syncHistoryReader.js';

const config = {
  spreadsheetId: 'test-spreadsheet',
  syncLogSheetName: '_JD_SYNC'
};
const target = { name: '26년 9월', sheetId: 931518682 };
const fixedNow = () => new Date('2026-08-24T04:00:00.000Z');

test('creates a hidden sync log and writes target C:G plus Page ID history in one atomic batch', async () => {
  const calls = { batchUpdate: [] };
  const row = previewRow('group-1', ['page-1'], 0.33);
  const client = makeClient({
    calls,
    targetRows: targetRowsThrough(5),
    verifyTarget: [[0.33, 'Agent', 'Student', 'University - Major', 'SOP 감수']],
    verifyAB: [[]],
    verifyHistory: [['page-1', '2026-08-24T04:00:00.000Z', '931518682', '6', 'group-1']]
  });

  const result = await writePreviewRowsAtomically({
    client,
    config,
    target,
    rows: [row],
    now: fixedNow
  });

  assert.equal(result.writtenRowCount, 1);
  assert.equal(result.writtenPageCount, 1);
  assert.equal(result.rows[0].targetRow, 6);
  assert.equal(result.syncLogCreated, true);
  assert.equal(calls.batchUpdate.length, 1);
  const requests = calls.batchUpdate[0].requestBody.requests;
  assert.equal(requests[0].addSheet.properties.hidden, true);
  assert.equal(requests[0].addSheet.properties.title, '_JD_SYNC');
  const targetWrite = requests.find(
    (request) => request.updateCells?.start?.sheetId === target.sheetId
  );
  assert.equal(targetWrite.updateCells.start.columnIndex, 2);
  assert.equal(targetWrite.updateCells.start.rowIndex, 5);
  assert.equal(targetWrite.updateCells.rows[0].values.length, 5);
});

test('blocks a Page ID already present in the sync history before any write', async () => {
  const calls = { batchUpdate: [] };
  const client = makeClient({
    calls,
    targetRows: targetRowsThrough(5),
    syncLogRows: [
      GOOGLE_SYNC_LOG_HEADERS,
      ['page-1', '2026-08-24', '931518682', '6', 'group-1']
    ]
  });

  await assert.rejects(
    () => writePreviewRowsAtomically({
      client,
      config,
      target,
      rows: [previewRow('group-1', ['page-1'], 0.33)],
      now: fixedNow
    }),
    (error) => error.code === 'GOOGLE_SYNC_PRECONDITION_FAILED'
  );
  assert.equal(calls.batchUpdate.length, 0);
});

test('recovers without duplicating when the atomic write succeeds but its response is lost', async () => {
  const calls = { batchUpdate: [] };
  const history = [
    GOOGLE_SYNC_LOG_HEADERS,
    ['page-1', '2026-08-24T04:00:00.000Z', '931518682', '6', 'group-1']
  ];
  let metadataCalls = 0;
  const client = makeClient({
    calls,
    targetRows: targetRowsThrough(5),
    verifyTarget: [[0.33, 'Agent', 'Student', 'University - Major', 'SOP 감수']],
    verifyAB: [[]],
    verifyHistory: [history[1]],
    batchError: Object.assign(new Error('response lost'), { code: 'ETIMEDOUT' }),
    afterBatchSyncLogRows: history,
    onMetadata() {
      metadataCalls += 1;
      return metadataCalls === 1 ? sheets(false) : sheets(true);
    }
  });

  const result = await writePreviewRowsAtomically({
    client,
    config,
    target,
    rows: [previewRow('group-1', ['page-1'], 0.33)],
    now: fixedNow,
    sleep: async () => {}
  });

  assert.equal(result.recoveredAfterUnknownResponse, true);
  assert.equal(calls.batchUpdate.length, 1);
});

test('builds one atomic batch for multiple target rows and every grouped Page ID', () => {
  const state = {
    target: {
      sheetId: target.sheetId,
      title: target.name,
      startRow: 19,
      endRow: 20,
      gridProperties: { rowCount: 1000 }
    },
    syncLog: {
      exists: true,
      sheetId: 1900000000,
      rowCount: 1000,
      startRow: 3
    }
  };
  const rows = [
    previewRow('admissions-a', ['p1', 'p2', 'p3', 'p4'], 1.33),
    previewRow('admissions-b', ['p5', 'p6', 'p7'], 0.5)
  ];

  const plan = buildAtomicWritePlan({
    state,
    config,
    target,
    rows,
    syncedAt: '2026-08-24T05:00:00.000Z'
  });

  const targetRequest = plan.requests.find(
    (request) => request.updateCells?.start?.sheetId === target.sheetId
  );
  const historyRequest = plan.requests.find(
    (request) => request.updateCells?.start?.sheetId === state.syncLog.sheetId
  );
  assert.equal(targetRequest.updateCells.start.columnIndex, 2);
  assert.equal(targetRequest.updateCells.rows.length, 2);
  assert.equal(historyRequest.updateCells.rows.length, 7);
  assert.deepEqual(plan.outputRows.map((row) => row.targetRow), [19, 20]);
  assert.equal(plan.requests.some((request) => request.addSheet), false);
});

function makeClient({
  calls,
  targetRows,
  syncLogRows = null,
  verifyTarget = [],
  verifyAB = [],
  verifyHistory = [],
  batchError = null,
  afterBatchSyncLogRows = null,
  onMetadata = null
}) {
  let batchAttempted = false;
  return {
    spreadsheets: {
      async get() {
        return { data: onMetadata ? onMetadata() : sheets(Boolean(syncLogRows)) };
      },
      values: {
        async get({ range }) {
          if (range.includes('A:G')) {
            return { data: { values: targetRows } };
          }
          if (range.includes('_JD_SYNC')) {
            return {
              data: {
                values: batchAttempted && afterBatchSyncLogRows
                  ? afterBatchSyncLogRows
                  : (syncLogRows ?? [])
              }
            };
          }
          throw new Error(`Unexpected range: ${range}`);
        },
        async batchGet() {
          return {
            data: {
              valueRanges: [
                { values: verifyTarget },
                { values: verifyAB },
                { values: verifyHistory }
              ]
            }
          };
        }
      },
      async batchUpdate(request) {
        calls.batchUpdate.push(structuredClone(request));
        batchAttempted = true;
        if (batchError) {
          throw batchError;
        }
        return { data: {} };
      }
    }
  };
}

function sheets(withSyncLog) {
  return {
    sheets: [
      {
        properties: {
          sheetId: target.sheetId,
          title: target.name,
          hidden: false,
          gridProperties: { rowCount: 1000, columnCount: 26 }
        }
      },
      ...(withSyncLog
        ? [{
            properties: {
              sheetId: 1900000000,
              title: '_JD_SYNC',
              hidden: true,
              gridProperties: { rowCount: 1000, columnCount: 5 }
            }
          }]
        : [])
    ]
  };
}

function targetRowsThrough(lastRow) {
  return Array.from({ length: lastRow }, (_, index) =>
    index === 3
      ? ['', '', '소요시간(H)', 'edm 담당자', '고객이름', '지원학교 / 전공', '비고']
      : index === lastRow - 1
        ? ['', '', 1, 'Old Agent', 'Old Student', 'Old Major', 'Old note']
        : []
  );
}

function previewRow(outputGroupKey, pageIds, hours) {
  return {
    outputGroupKey,
    pageIds,
    values: {
      C: hours,
      D: 'Agent',
      E: 'Student',
      F: 'University - Major',
      G: 'SOP 감수'
    }
  };
}
