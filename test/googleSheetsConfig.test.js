import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireGoogleSheetsWriteEnabled,
  requireGoogleSyncStartAt,
  validateGoogleSheetsConfig
} from '../src/server/googleSheets/config.js';

const completeEnv = {
  GOOGLE_SHEETS_ENABLED: 'true',
  GOOGLE_SPREADSHEET_ID: 'spreadsheet-id',
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: 'C:\\secrets\\service-account.json',
  GOOGLE_SYNC_LOG_SHEET_NAME: '_JD_SYNC'
};

test('blocks Google Sheets configuration while the feature flag is disabled', () => {
  assert.throws(
    () => validateGoogleSheetsConfig({ ...completeEnv, GOOGLE_SHEETS_ENABLED: 'false' }),
    (error) => {
      assert.equal(error.code, 'GOOGLE_SHEETS_DISABLED');
      assert.equal(error.statusCode, 503);
      return true;
    }
  );
});

test('reports missing Google Sheets configuration without revealing secret values', () => {
  assert.throws(
    () => validateGoogleSheetsConfig({
      ...completeEnv,
      GOOGLE_SPREADSHEET_ID: '',
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: ''
    }),
    (error) => {
      assert.equal(error.code, 'GOOGLE_SHEETS_CONFIG_MISSING');
      assert.deepEqual(error.details.missing, [
        'GOOGLE_SPREADSHEET_ID',
        'GOOGLE_SERVICE_ACCOUNT_KEY_PATH'
      ]);
      return true;
    }
  );
});

test('trims Google Sheets configuration and defaults the sync log sheet name', () => {
  const config = validateGoogleSheetsConfig({
    GOOGLE_SHEETS_ENABLED: ' TRUE ',
    GOOGLE_SPREADSHEET_ID: ' spreadsheet-id ',
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: ' C:\\secrets\\service-account.json ',
    GOOGLE_SYNC_START_AT: ' 2026-08-24T00:00:00+09:00 '
  });

  assert.deepEqual(config, {
    enabled: true,
    writeEnabled: false,
    spreadsheetId: 'spreadsheet-id',
    serviceAccountKeyPath: 'C:\\secrets\\service-account.json',
    syncStartAt: '2026-08-24T00:00:00+09:00',
    syncLogSheetName: '_JD_SYNC'
  });
});

test('requires the independent Google Sheets write gate', () => {
  assert.doesNotThrow(() => requireGoogleSheetsWriteEnabled({ writeEnabled: true }));
  assert.throws(
    () => requireGoogleSheetsWriteEnabled({ writeEnabled: false }),
    (error) => error.code === 'GOOGLE_SHEETS_WRITE_DISABLED'
  );
});

test('requires an ISO sync cutoff with an explicit time-zone offset', () => {
  assert.equal(
    requireGoogleSyncStartAt({ syncStartAt: '2026-08-24T00:00:00+09:00' }),
    '2026-08-24T00:00:00+09:00'
  );
  assert.throws(
    () => requireGoogleSyncStartAt({ syncStartAt: '' }),
    (error) => error.code === 'GOOGLE_SYNC_START_AT_MISSING'
  );
  assert.throws(
    () => requireGoogleSyncStartAt({ syncStartAt: '2026-08-24' }),
    (error) => error.code === 'GOOGLE_SYNC_START_AT_INVALID'
  );
});
