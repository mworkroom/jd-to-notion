import { getDefaultNotionClient } from '../notion/client.js';
import { getNotionConfig } from '../notion/config.js';
import { createGoogleSheetsClient } from './client.js';
import { getGoogleSheetsConfig, requireGoogleSyncStartAt } from './config.js';
import { GoogleSheetsAppError } from './errors.js';
import { createGoogleSheetsStatusService } from './googleSheetsStatusService.js';
import { readWorkLogsCreatedSince } from './notionWorkLogsReader.js';
import { buildGoogleSheetsPreviewRows } from './previewRows.js';
import { createGoogleSheetsRelationResolver } from './relationResolver.js';
import { normalizeNotionPageId, readGoogleSyncHistory } from './syncHistoryReader.js';

export function createGoogleSheetsPreviewService({
  googleClient,
  googleConfig,
  notionClient,
  notionConfig,
  statusService,
  now = () => new Date()
} = {}) {
  const resolvedGoogleConfig = googleConfig ?? getGoogleSheetsConfig();
  const resolvedGoogleClient = googleClient ?? createGoogleSheetsClient(resolvedGoogleConfig);
  const resolvedNotionConfig = notionConfig ?? getNotionConfig();
  const resolvedNotionClient = notionClient ?? getDefaultNotionClient();
  const resolvedStatusService = statusService ?? createGoogleSheetsStatusService({
    client: resolvedGoogleClient,
    config: resolvedGoogleConfig,
    now
  });

  return {
    async preview() {
      const syncStartAt = requireGoogleSyncStartAt(resolvedGoogleConfig);
      const status = await resolvedStatusService.getStatus();

      if (!status.ready) {
        throw new GoogleSheetsAppError({
          code: 'GOOGLE_SHEETS_NOT_READY',
          statusCode: 409,
          message: 'Google Sheets target is not ready for preview.',
          details: { issue: status.issue, target: status.target }
        });
      }

      const [history, workLogs] = await Promise.all([
        readGoogleSyncHistory({
          client: resolvedGoogleClient,
          config: resolvedGoogleConfig
        }),
        readWorkLogsCreatedSince({
          client: resolvedNotionClient,
          dataSourceId: resolvedNotionConfig.dataSourceIds.workLog,
          syncStartAt
        })
      ]);
      const unsynced = workLogs.filter(
        (workLog) => !history.pageIds.has(normalizeNotionPageId(workLog.id))
      );
      const resolver = createGoogleSheetsRelationResolver({ client: resolvedNotionClient });
      const resolvedItems = await mapWithConcurrency(unsynced, 2, async (workLog) => {
        const relationResult = await resolver.resolve(workLog);
        return {
          ...workLog,
          relations: relationResult.ok ? relationResult.value : null,
          relationIssue: relationResult.ok ? null : relationResult.issue
        };
      });

      const preview = buildGoogleSheetsPreviewRows(resolvedItems, {
        targetSheetId: status.target.sheetId
      });

      return {
        ok: true,
        readOnly: true,
        syncStartAt,
        spreadsheet: status.spreadsheet,
        target: status.target,
        syncHistory: {
          sheetName: resolvedGoogleConfig.syncLogSheetName,
          exists: history.exists,
          rowCount: history.rowCount,
          latestSyncedAt: history.latestSyncedAt
        },
        counts: {
          foundSinceCutoff: workLogs.length,
          alreadySynced: workLogs.length - unsynced.length,
          unsynced: unsynced.length,
          outputRows: preview.rows.length,
          readyPages: preview.readyPageCount,
          heldPages: preview.heldPageCount
        },
        rows: preview.rows,
        held: preview.held
      };
    }
  };
}

export function createDefaultGoogleSheetsPreviewService(options = {}) {
  return createGoogleSheetsPreviewService(options);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
