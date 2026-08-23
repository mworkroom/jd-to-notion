import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_SYNC_LOG_HEADERS,
  normalizeNotionPageId,
  readGoogleSyncHistory
} from '../src/server/googleSheets/syncHistoryReader.js';

const config = {
  spreadsheetId: 'sheet-id',
  syncLogSheetName: '_JD_SYNC'
};

test('treats a missing sync-log tab as an empty history without requesting values', async () => {
  let valuesCalls = 0;
  const result = await readGoogleSyncHistory({
    config,
    client: {
      spreadsheets: {
        async get() {
          return { data: { sheets: [{ properties: { title: '26년 9월' } }] } };
        },
        values: {
          async get() {
            valuesCalls += 1;
          }
        }
      }
    }
  });

  assert.equal(result.exists, false);
  assert.equal(result.pageIds.size, 0);
  assert.equal(valuesCalls, 0);
});

test('reads and normalizes Notion page IDs from a valid sync-log tab', async () => {
  const result = await readGoogleSyncHistory({
    config,
    client: historyClient([
      GOOGLE_SYNC_LOG_HEADERS,
      ['ABC-123', '2026-08-24T09:00:00.000Z', '123', '5', 'group'],
      ['DEF-456', '2026-08-24T10:30:00.000Z', '123', '6', 'group-2']
    ])
  });

  assert.equal(result.exists, true);
  assert.equal(result.rowCount, 2);
  assert.equal(result.pageIds.has('abc123'), true);
  assert.equal(result.latestSyncedAt, '2026-08-24T10:30:00.000Z');
  assert.equal(normalizeNotionPageId('ABC-123'), 'abc123');
});

test('blocks preview when an existing sync-log tab has unexpected headers', async () => {
  await assert.rejects(
    () => readGoogleSyncHistory({
      config,
      client: historyClient([['wrong header']])
    }),
    (error) => error.code === 'GOOGLE_SYNC_LOG_INVALID'
  );
});

function historyClient(rows) {
  return {
    spreadsheets: {
      async get() {
        return {
          data: {
            sheets: [{ properties: { title: '_JD_SYNC', sheetId: 99, hidden: true } }]
          }
        };
      },
      values: {
        async get() {
          return { data: { values: rows } };
        }
      }
    }
  };
}
