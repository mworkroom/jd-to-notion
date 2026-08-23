import { GoogleSheetsAppError } from './errors.js';

export const GOOGLE_SHEETS_ENV_KEYS = Object.freeze({
  enabled: 'GOOGLE_SHEETS_ENABLED',
  writeEnabled: 'GOOGLE_SHEETS_WRITE_ENABLED',
  spreadsheetId: 'GOOGLE_SPREADSHEET_ID',
  serviceAccountKeyPath: 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
  syncStartAt: 'GOOGLE_SYNC_START_AT',
  syncLogSheetName: 'GOOGLE_SYNC_LOG_SHEET_NAME'
});

export const GOOGLE_SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly';
export const GOOGLE_SHEETS_WRITE_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets';

export function validateGoogleSheetsConfig(env = process.env) {
  const enabledValue = readEnvValue(env, GOOGLE_SHEETS_ENV_KEYS.enabled).toLowerCase();

  if (enabledValue !== 'true') {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SHEETS_DISABLED',
      statusCode: 503,
      message: 'Google Sheets integration is disabled.',
      details: { envKey: GOOGLE_SHEETS_ENV_KEYS.enabled }
    });
  }

  const spreadsheetId = readEnvValue(env, GOOGLE_SHEETS_ENV_KEYS.spreadsheetId);
  const serviceAccountKeyPath = readEnvValue(env, GOOGLE_SHEETS_ENV_KEYS.serviceAccountKeyPath);
  const missing = [];

  if (!spreadsheetId) {
    missing.push(GOOGLE_SHEETS_ENV_KEYS.spreadsheetId);
  }

  if (!serviceAccountKeyPath) {
    missing.push(GOOGLE_SHEETS_ENV_KEYS.serviceAccountKeyPath);
  }

  if (missing.length > 0) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SHEETS_CONFIG_MISSING',
      statusCode: 503,
      message: 'Google Sheets is not configured.',
      details: { missing }
    });
  }

  return {
    enabled: true,
    writeEnabled:
      readEnvValue(env, GOOGLE_SHEETS_ENV_KEYS.writeEnabled).toLowerCase() === 'true',
    spreadsheetId,
    serviceAccountKeyPath,
    syncStartAt: readEnvValue(env, GOOGLE_SHEETS_ENV_KEYS.syncStartAt) || null,
    syncLogSheetName:
      readEnvValue(env, GOOGLE_SHEETS_ENV_KEYS.syncLogSheetName) || '_JD_SYNC'
  };
}

export function requireGoogleSheetsWriteEnabled(config) {
  if (config?.writeEnabled !== true) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SHEETS_WRITE_DISABLED',
      statusCode: 403,
      message: 'Google Sheets write operations are disabled.',
      details: { envKey: GOOGLE_SHEETS_ENV_KEYS.writeEnabled }
    });
  }
}

export function requireGoogleSyncStartAt(config) {
  const value = String(config?.syncStartAt ?? '').trim();
  const timestamp = Date.parse(value);

  if (!value) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_START_AT_MISSING',
      statusCode: 503,
      message: 'Google Sheets sync start time is not configured.',
      details: { envKey: GOOGLE_SHEETS_ENV_KEYS.syncStartAt }
    });
  }

  if (!Number.isFinite(timestamp) || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_START_AT_INVALID',
      statusCode: 503,
      message: 'Google Sheets sync start time must be an ISO timestamp with a time-zone offset.',
      details: { envKey: GOOGLE_SHEETS_ENV_KEYS.syncStartAt }
    });
  }

  return value;
}

export function getGoogleSheetsConfig(env = process.env) {
  return validateGoogleSheetsConfig(env);
}

function readEnvValue(env, key) {
  return String(env?.[key] ?? '').trim();
}
