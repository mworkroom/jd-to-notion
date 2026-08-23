import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSheetsStatusService } from '../src/server/googleSheets/googleSheetsStatusService.js';

const config = {
  enabled: true,
  writeEnabled: true,
  spreadsheetId: 'test-spreadsheet-id',
  serviceAccountKeyPath: 'unused-in-injected-client.json',
  syncStartAt: null,
  syncLogSheetName: '_JD_SYNC'
};
const fixedNow = () => new Date('2026-08-24T03:00:00.000Z');

test('returns ready for an accessible target tab with the expected C4:G4 headers', async () => {
  const calls = [];
  const client = createClient({ calls });
  const service = createGoogleSheetsStatusService({ client, config, now: fixedNow });

  const result = await service.getStatus();

  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.writeEnabled, true);
  assert.equal(result.ready, true);
  assert.equal(result.target.name, '26년 9월');
  assert.equal(result.target.sheetId, 931518682);
  assert.equal(result.headers.range, "'26년 9월'!C4:G4");
  assert.equal(result.headers.valid, true);
  assert.deepEqual(calls.map((call) => call.method), ['get', 'values.get']);
});

test('does not request cell values when the calculated monthly tab is missing', async () => {
  const calls = [];
  const client = createClient({ calls, sheets: [{ sheetId: 1, title: '26년 8월' }] });
  const service = createGoogleSheetsStatusService({ client, config, now: fixedNow });

  const result = await service.getStatus();

  assert.equal(result.ready, false);
  assert.equal(result.target.exists, false);
  assert.equal(result.issue.code, 'GOOGLE_TARGET_SHEET_MISSING');
  assert.deepEqual(calls.map((call) => call.method), ['get']);
});

test('reports a mismatched header without writing to Google Sheets', async () => {
  const client = createClient({ headers: ['시간', '담당자', '고객', '학교', '메모'] });
  const service = createGoogleSheetsStatusService({ client, config, now: fixedNow });

  const result = await service.getStatus();

  assert.equal(result.ready, false);
  assert.equal(result.issue.code, 'GOOGLE_TARGET_HEADERS_INVALID');
  assert.deepEqual(result.headers.actual, ['시간', '담당자', '고객', '학교', '메모']);
});

test('maps a forbidden Google response to a safe application error', async () => {
  const client = createClient({ metadataError: { response: { status: 403 } } });
  const service = createGoogleSheetsStatusService({ client, config, now: fixedNow });

  await assert.rejects(
    () => service.getStatus(),
    (error) => {
      assert.equal(error.code, 'GOOGLE_SHEETS_FORBIDDEN');
      assert.equal(error.statusCode, 403);
      return true;
    }
  );
});

function createClient({
  calls = [],
  sheets = [{ sheetId: 931518682, title: '26년 9월' }],
  headers = ['소요시간(H)', 'edm 담당자', '고객이름', '지원학교 / 전공', '비고'],
  metadataError = null
} = {}) {
  return {
    spreadsheets: {
      async get(params) {
        calls.push({ method: 'get', params });
        if (metadataError) {
          throw metadataError;
        }
        return {
          data: {
            properties: { title: '[TEST] JD to Notion' },
            sheets: sheets.map((properties) => ({ properties }))
          }
        };
      },
      values: {
        async get(params) {
          calls.push({ method: 'values.get', params });
          return { data: { values: [headers] } };
        }
      }
    }
  };
}
