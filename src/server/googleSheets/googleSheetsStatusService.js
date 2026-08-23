import { createGoogleSheetsClient } from './client.js';
import { getGoogleSheetsConfig } from './config.js';
import { mapGoogleSheetsError } from './errors.js';
import {
  calculateTargetSheet,
  EXPECTED_MONTHLY_HEADERS,
  normalizeHeaderRow,
  quoteSheetName
} from './targetSheet.js';

export function createGoogleSheetsStatusService({
  client,
  config,
  now = () => new Date()
} = {}) {
  const resolvedConfig = config ?? getGoogleSheetsConfig();
  const resolvedClient = client ?? createGoogleSheetsClient(resolvedConfig);

  return {
    async getStatus() {
      const checkedAt = now();
      const target = calculateTargetSheet(checkedAt);

      try {
        const metadataResponse = await resolvedClient.spreadsheets.get({
          spreadsheetId: resolvedConfig.spreadsheetId,
          fields: 'properties(title),sheets(properties(sheetId,title,index,hidden))'
        });
        const sheets = (metadataResponse.data.sheets ?? []).map(({ properties = {} }) => ({
          sheetId: properties.sheetId,
          title: properties.title,
          index: properties.index,
          hidden: properties.hidden === true
        }));
        const targetSheet = sheets.find((sheet) => sheet.title === target.name);
        const baseResult = {
          ok: true,
          enabled: true,
          writeEnabled: resolvedConfig.writeEnabled === true,
          readOnly: true,
          ready: false,
          checkedAt: checkedAt.toISOString(),
          spreadsheet: {
            id: resolvedConfig.spreadsheetId,
            title: metadataResponse.data.properties?.title ?? null,
            sheetCount: sheets.length
          },
          target: {
            ...target,
            exists: Boolean(targetSheet),
            sheetId: targetSheet?.sheetId ?? null
          }
        };

        if (!targetSheet) {
          return {
            ...baseResult,
            issue: {
              code: 'GOOGLE_TARGET_SHEET_MISSING',
              message: `${target.name} 탭이 아직 만들어지지 않았습니다.`
            },
            headers: {
              range: `${quoteSheetName(target.name)}!C4:G4`,
              expected: [...EXPECTED_MONTHLY_HEADERS],
              actual: [],
              valid: false
            }
          };
        }

        const range = `${quoteSheetName(target.name)}!C4:G4`;
        const valuesResponse = await resolvedClient.spreadsheets.values.get({
          spreadsheetId: resolvedConfig.spreadsheetId,
          range,
          majorDimension: 'ROWS'
        });
        const actualHeaders = normalizeHeaderRow(valuesResponse.data.values?.[0]);
        const headersValid = EXPECTED_MONTHLY_HEADERS.every(
          (expected, index) => actualHeaders[index] === expected
        );

        return {
          ...baseResult,
          ready: headersValid,
          issue: headersValid
            ? null
            : {
                code: 'GOOGLE_TARGET_HEADERS_INVALID',
                message: `${target.name} 탭의 C4:G4 헤더가 예상 구조와 다릅니다.`
              },
          headers: {
            range,
            expected: [...EXPECTED_MONTHLY_HEADERS],
            actual: actualHeaders,
            valid: headersValid
          }
        };
      } catch (error) {
        throw mapGoogleSheetsError(error);
      }
    }
  };
}

export function createDefaultGoogleSheetsStatusService(options = {}) {
  return createGoogleSheetsStatusService(options);
}
