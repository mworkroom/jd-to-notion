import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSheetsSyncService } from '../src/server/googleSheets/googleSheetsSyncService.js';

const config = {
  enabled: true,
  writeEnabled: true,
  spreadsheetId: 'test-sheet',
  serviceAccountKeyPath: 'unused.json',
  syncStartAt: '2026-08-24T00:00:00+09:00',
  syncLogSheetName: '_JD_SYNC'
};

test('requires explicit confirmation before invoking preview or writer', async () => {
  let previewCalls = 0;
  const service = createGoogleSheetsSyncService({
    googleConfig: config,
    writeClient: {},
    previewService: { async preview() { previewCalls += 1; } },
    writer: async () => ({})
  });

  await assert.rejects(
    () => service.sync({ mode: 'all', confirm: false }),
    (error) => error.code === 'GOOGLE_SYNC_CONFIRMATION_REQUIRED'
  );
  assert.equal(previewCalls, 0);
});

test('recomputes preview and sends only selected server-side rows to the writer', async () => {
  const rows = [previewRow('group-1'), previewRow('group-2')];
  const writerCalls = [];
  const service = createGoogleSheetsSyncService({
    googleConfig: config,
    writeClient: { marker: 'write-client' },
    previewService: {
      async preview() {
        return {
          target: { name: '26년 9월', sheetId: 1 },
          counts: { alreadySynced: 7, heldPages: 2 },
          rows
        };
      }
    },
    writer: async (request) => {
      writerCalls.push(request);
      return {
        writtenRowCount: 1,
        writtenPageCount: 1,
        rows: [{ targetRow: 18 }]
      };
    }
  });

  const result = await service.sync({
    mode: 'controlled',
    confirm: true,
    outputGroupKeys: ['group-2']
  });

  assert.equal(result.writtenRowCount, 1);
  assert.deepEqual(writerCalls[0].rows, [rows[1]]);
  assert.equal(writerCalls[0].client.marker, 'write-client');
  assert.equal(result.alreadySyncedCount, 7);
  assert.equal(result.heldPageCount, 2);
});

test('treats a repeated controlled selection as an idempotent no-op', async () => {
  let writerCalls = 0;
  const service = createGoogleSheetsSyncService({
    googleConfig: config,
    writeClient: {},
    previewService: {
      async preview() {
        return {
          target: { name: '26년 9월', sheetId: 1 },
          counts: { alreadySynced: 8, heldPages: 1 },
          rows: []
        };
      }
    },
    writer: async () => { writerCalls += 1; }
  });

  const result = await service.sync({
    mode: 'controlled',
    confirm: true,
    outputGroupKeys: ['already-synced-group']
  });

  assert.equal(result.writtenRowCount, 0);
  assert.equal(result.alreadySyncedCount, 8);
  assert.equal(result.heldPageCount, 1);
  assert.deepEqual(result.skippedOutputGroupKeys, ['already-synced-group']);
  assert.equal(writerCalls, 0);
});

function previewRow(key) {
  return {
    outputGroupKey: key,
    pageIds: [`page-${key}`],
    values: { C: 1, D: 'A', E: 'S', F: 'U - M', G: 'Note' }
  };
}
