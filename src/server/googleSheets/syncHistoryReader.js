import { GoogleSheetsAppError, mapGoogleSheetsError } from './errors.js';
import { quoteSheetName } from './targetSheet.js';

export const GOOGLE_SYNC_LOG_HEADERS = Object.freeze([
  'notion_page_id',
  'synced_at',
  'target_sheet_id',
  'target_row',
  'output_group_key'
]);

export async function readGoogleSyncHistory({ client, config }) {
  try {
    const metadataResponse = await client.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
      fields: 'sheets(properties(sheetId,title,hidden))'
    });
    const logSheet = (metadataResponse.data.sheets ?? []).find(
      ({ properties }) => properties?.title === config.syncLogSheetName
    );

    if (!logSheet) {
      return {
        exists: false,
        sheetId: null,
        pageIds: new Set(),
        rowCount: 0,
        latestSyncedAt: null
      };
    }

    const range = `${quoteSheetName(config.syncLogSheetName)}!A:E`;
    const valuesResponse = await client.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range,
      majorDimension: 'ROWS'
    });
    const rows = valuesResponse.data.values ?? [];
    const headers = GOOGLE_SYNC_LOG_HEADERS.map(
      (_, index) => String(rows[0]?.[index] ?? '').trim()
    );
    const validHeaders = GOOGLE_SYNC_LOG_HEADERS.every(
      (expected, index) => headers[index] === expected
    );

    if (!validHeaders) {
      throw new GoogleSheetsAppError({
        code: 'GOOGLE_SYNC_LOG_INVALID',
        statusCode: 409,
        message: `${config.syncLogSheetName} 탭의 A1:E1 헤더가 예상 구조와 다릅니다.`,
        details: {
          expected: [...GOOGLE_SYNC_LOG_HEADERS],
          actual: headers
        }
      });
    }

    const pageIds = new Set(
      rows.slice(1)
        .map((row) => normalizeNotionPageId(row[0]))
        .filter(Boolean)
    );
    const latestSyncedAt = rows.slice(1)
      .map((row) => String(row[1] ?? '').trim())
      .filter((value) => Number.isFinite(Date.parse(value)))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;

    return {
      exists: true,
      sheetId: logSheet.properties?.sheetId ?? null,
      pageIds,
      rowCount: pageIds.size,
      latestSyncedAt
    };
  } catch (error) {
    throw mapGoogleSheetsError(error);
  }
}

export function normalizeNotionPageId(value) {
  return String(value ?? '').trim().replaceAll('-', '').toLowerCase();
}
