import { GoogleSheetsAppError, mapGoogleSheetsError } from './errors.js';
import {
  GOOGLE_SYNC_LOG_HEADERS,
  normalizeNotionPageId,
  readGoogleSyncHistory
} from './syncHistoryReader.js';
import { quoteSheetName } from './targetSheet.js';

const DEFAULT_NEW_SYNC_LOG_SHEET_ID = 1_900_000_000;

export async function writePreviewRowsAtomically({
  client,
  config,
  target,
  rows,
  now = () => new Date(),
  sleep = wait
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      writtenRowCount: 0,
      writtenPageCount: 0,
      rows: [],
      syncLogCreated: false,
      recoveredAfterUnknownResponse: false
    };
  }

  const state = await readWriteState({ client, config, target, rowCount: rows.length });
  const pageIds = rows.flatMap((row) => row.pageIds);
  const duplicatePageIds = pageIds.filter(
    (pageId) => state.syncedPageIds.has(normalizeNotionPageId(pageId))
  );

  if (duplicatePageIds.length > 0) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_PRECONDITION_FAILED',
      statusCode: 409,
      message: 'One or more selected Notion pages were already synced.',
      details: { duplicatePageIds }
    });
  }

  const syncedAt = now().toISOString();
  const writePlan = buildAtomicWritePlan({
    state,
    config,
    target,
    rows,
    syncedAt
  });
  const recoveredAfterUnknownResponse = await executeAtomicBatch({
    client,
    config,
    requestBody: { requests: writePlan.requests },
    pageIds,
    sleep
  });

  await verifyAtomicWrite({
    client,
    config,
    writePlan,
    beforeAB: state.beforeAB
  });

  return {
    writtenRowCount: rows.length,
    writtenPageCount: pageIds.length,
    rows: writePlan.outputRows,
    syncLogCreated: !state.syncLog.exists,
    recoveredAfterUnknownResponse
  };
}

async function readWriteState({ client, config, target, rowCount }) {
  try {
    const metadataResponse = await client.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
      fields: 'sheets(properties(sheetId,title,hidden,gridProperties(rowCount,columnCount)))'
    });
    const sheets = (metadataResponse.data.sheets ?? []).map(({ properties = {} }) => properties);
    const targetSheet = sheets.find(
      (sheet) => sheet.sheetId === target.sheetId && sheet.title === target.name
    );

    if (!targetSheet) {
      throw new GoogleSheetsAppError({
        code: 'GOOGLE_TARGET_SHEET_CHANGED',
        statusCode: 409,
        message: 'The target monthly sheet changed after preview.'
      });
    }

    const syncLogSheet = sheets.find((sheet) => sheet.title === config.syncLogSheetName) ?? null;
    const valueRequests = [
      client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${quoteSheetName(target.name)}!A:G`,
        majorDimension: 'ROWS'
      })
    ];
    if (syncLogSheet) {
      valueRequests.push(client.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${quoteSheetName(config.syncLogSheetName)}!A:E`,
        majorDimension: 'ROWS'
      }));
    }

    const [targetValuesResponse, syncLogValuesResponse] = await Promise.all(valueRequests);
    const targetRows = targetValuesResponse.data.values ?? [];
    const targetStartRow = lastNonEmptyRow(targetRows) + 1;
    const targetEndRow = targetStartRow + rowCount - 1;
    const beforeAB = rowsFromRange(targetRows, targetStartRow, targetEndRow, 0, 2);
    const syncLogRows = syncLogValuesResponse?.data.values ?? [];
    const syncedPageIds = validateAndCollectSyncHistory(syncLogSheet, syncLogRows, config);
    const historyStartRow = syncLogSheet ? lastNonEmptyRow(syncLogRows) + 1 : 2;
    const newSyncLogSheetId = syncLogSheet
      ? syncLogSheet.sheetId
      : allocateSyncLogSheetId(sheets.map((sheet) => sheet.sheetId));

    return {
      target: {
        ...targetSheet,
        startRow: targetStartRow,
        endRow: targetEndRow
      },
      syncLog: {
        exists: Boolean(syncLogSheet),
        sheetId: newSyncLogSheetId,
        rowCount: syncLogSheet?.gridProperties?.rowCount ?? 1000,
        startRow: historyStartRow
      },
      syncedPageIds,
      beforeAB
    };
  } catch (error) {
    throw mapGoogleSheetsError(error);
  }
}

function validateAndCollectSyncHistory(syncLogSheet, rows, config) {
  if (!syncLogSheet) {
    return new Set();
  }

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
      details: { expected: [...GOOGLE_SYNC_LOG_HEADERS], actual: headers }
    });
  }

  return new Set(
    rows.slice(1).map((row) => normalizeNotionPageId(row[0])).filter(Boolean)
  );
}

export function buildAtomicWritePlan({ state, config, target, rows, syncedAt }) {
  const requests = [];
  const historyRows = [];
  const outputRows = rows.map((row, index) => ({
    outputGroupKey: row.outputGroupKey,
    pageIds: [...row.pageIds],
    targetRow: state.target.startRow + index,
    values: { ...row.values }
  }));

  if (!state.syncLog.exists) {
    requests.push({
      addSheet: {
        properties: {
          sheetId: state.syncLog.sheetId,
          title: config.syncLogSheetName,
          hidden: true,
          gridProperties: {
            rowCount: Math.max(1000, rows.length + 1),
            columnCount: GOOGLE_SYNC_LOG_HEADERS.length,
            frozenRowCount: 1
          }
        }
      }
    });
    requests.push(updateCellsRequest({
      sheetId: state.syncLog.sheetId,
      startRowIndex: 0,
      startColumnIndex: 0,
      values: [GOOGLE_SYNC_LOG_HEADERS],
      bold: true
    }));
  }

  if (state.target.endRow > state.target.gridProperties.rowCount) {
    requests.push({
      appendDimension: {
        sheetId: target.sheetId,
        dimension: 'ROWS',
        length: state.target.endRow - state.target.gridProperties.rowCount
      }
    });
  }

  requests.push(updateCellsRequest({
    sheetId: target.sheetId,
    startRowIndex: state.target.startRow - 1,
    startColumnIndex: 2,
    values: outputRows.map((row) => [
      row.values.C,
      row.values.D,
      row.values.E,
      row.values.F,
      row.values.G
    ])
  }));

  for (const row of outputRows) {
    for (const pageId of row.pageIds) {
      historyRows.push([
        pageId,
        syncedAt,
        String(target.sheetId),
        String(row.targetRow),
        row.outputGroupKey
      ]);
    }
  }

  const historyEndRow = state.syncLog.startRow + historyRows.length - 1;
  if (state.syncLog.exists && historyEndRow > state.syncLog.rowCount) {
    requests.push({
      appendDimension: {
        sheetId: state.syncLog.sheetId,
        dimension: 'ROWS',
        length: historyEndRow - state.syncLog.rowCount
      }
    });
  }

  requests.push(updateCellsRequest({
    sheetId: state.syncLog.sheetId,
    startRowIndex: state.syncLog.startRow - 1,
    startColumnIndex: 0,
    values: historyRows
  }));

  return {
    requests,
    outputRows,
    historyRows,
    targetRange: `${quoteSheetName(target.name)}!C${state.target.startRow}:G${state.target.endRow}`,
    targetABRange: `${quoteSheetName(target.name)}!A${state.target.startRow}:B${state.target.endRow}`,
    historyRange: `${quoteSheetName(config.syncLogSheetName)}!A${state.syncLog.startRow}:E${historyEndRow}`
  };
}

function updateCellsRequest({
  sheetId,
  startRowIndex,
  startColumnIndex,
  values,
  bold = false
}) {
  const fields = bold
    ? 'userEnteredValue,userEnteredFormat.textFormat.bold'
    : 'userEnteredValue';

  return {
    updateCells: {
      start: { sheetId, rowIndex: startRowIndex, columnIndex: startColumnIndex },
      rows: values.map((row) => ({
        values: row.map((value) => ({
          userEnteredValue: toUserEnteredValue(value),
          ...(bold ? { userEnteredFormat: { textFormat: { bold: true } } } : {})
        }))
      })),
      fields
    }
  };
}

function toUserEnteredValue(value) {
  if (typeof value === 'number') {
    return { numberValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  return { stringValue: String(value ?? '') };
}

async function executeAtomicBatch({ client, config, requestBody, pageIds, sleep }) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await client.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody
      });
      return false;
    } catch (error) {
      const recovery = await checkUnknownWriteOutcome({ client, config, pageIds });
      if (recovery === 'complete') {
        return true;
      }
      if (recovery === 'partial') {
        throw new GoogleSheetsAppError({
          code: 'GOOGLE_SYNC_RECOVERY_INCONSISTENT',
          statusCode: 409,
          message: 'Only part of the selected Page ID history exists after an unknown write outcome.'
        });
      }
      if (!isRetryableGoogleWrite(error) || attempt === maxAttempts) {
        throw mapGoogleSheetsError(error);
      }
      await sleep(getRetryDelayMs(error, attempt));
    }
  }

  throw new Error('Google Sheets atomic write retry loop ended unexpectedly.');
}

async function checkUnknownWriteOutcome({ client, config, pageIds }) {
  try {
    const history = await readGoogleSyncHistory({ client, config });
    const matches = pageIds.filter(
      (pageId) => history.pageIds.has(normalizeNotionPageId(pageId))
    ).length;
    if (matches === pageIds.length) {
      return 'complete';
    }
    return matches === 0 ? 'none' : 'partial';
  } catch {
    return 'none';
  }
}

async function verifyAtomicWrite({ client, config, writePlan, beforeAB }) {
  try {
    const response = await client.spreadsheets.values.batchGet({
      spreadsheetId: config.spreadsheetId,
      ranges: [writePlan.targetRange, writePlan.targetABRange, writePlan.historyRange],
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    const [targetRange, abRange, historyRange] = response.data.valueRanges ?? [];
    const expectedTarget = writePlan.outputRows.map((row) => [
      row.values.C,
      row.values.D,
      row.values.E,
      row.values.F,
      row.values.G
    ]);
    const actualTarget = normalizeMatrix(targetRange?.values, expectedTarget.length, 5);
    const actualAB = normalizeMatrix(abRange?.values, expectedTarget.length, 2);
    const actualHistory = normalizeMatrix(
      historyRange?.values,
      writePlan.historyRows.length,
      5
    ).map((row) => row.map(String));
    const expectedHistory = writePlan.historyRows.map((row) => row.map(String));

    if (!matricesEqual(actualTarget, expectedTarget)) {
      throw verificationError('GOOGLE_SYNC_TARGET_VERIFY_FAILED', 'Target C:G verification failed.');
    }
    if (!matricesEqual(actualAB, beforeAB)) {
      throw verificationError('GOOGLE_SYNC_AB_CHANGED', 'Target A:B changed during the sync.');
    }
    if (!matricesEqual(actualHistory, expectedHistory)) {
      throw verificationError('GOOGLE_SYNC_HISTORY_VERIFY_FAILED', 'Sync history verification failed.');
    }
  } catch (error) {
    throw error instanceof GoogleSheetsAppError ? error : mapGoogleSheetsError(error);
  }
}

function verificationError(code, message) {
  return new GoogleSheetsAppError({ code, statusCode: 502, message });
}

function normalizeMatrix(values, rowCount, columnCount) {
  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) =>
      values?.[rowIndex]?.[columnIndex] ?? ''
    )
  );
}

function matricesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function rowsFromRange(rows, startRow, endRow, startColumn, columnCount) {
  return Array.from({ length: endRow - startRow + 1 }, (_, index) =>
    Array.from({ length: columnCount }, (_, columnIndex) =>
      rows[startRow - 1 + index]?.[startColumn + columnIndex] ?? ''
    )
  );
}

function lastNonEmptyRow(rows) {
  let last = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if ((rows[index] ?? []).some((value) => String(value ?? '').trim() !== '')) {
      last = index + 1;
    }
  }
  return last;
}

function allocateSyncLogSheetId(existingIds) {
  const ids = new Set(existingIds.filter(Number.isInteger));
  let candidate = DEFAULT_NEW_SYNC_LOG_SHEET_ID;
  while (ids.has(candidate) && candidate > 1) {
    candidate -= 1;
  }
  if (ids.has(candidate)) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_LOG_ID_UNAVAILABLE',
      statusCode: 409,
      message: 'A free sheet ID could not be allocated for the sync log.'
    });
  }
  return candidate;
}

function isRetryableGoogleWrite(error) {
  const status = Number(error?.response?.status ?? error?.status ?? error?.statusCode ?? 0);
  return error?.code === 'ETIMEDOUT'
    || error?.code === 'ECONNRESET'
    || error?.code === 'EAI_AGAIN'
    || status === 429
    || (status >= 500 && status <= 504);
}

function getRetryDelayMs(error, attempt) {
  const retryAfter = error?.response?.headers?.get?.('retry-after')
    ?? error?.headers?.get?.('retry-after')
    ?? error?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(4000, 500 * (2 ** (attempt - 1)));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
