import { createGoogleSheetsWriteClient } from './client.js';
import {
  getGoogleSheetsConfig,
  requireGoogleSheetsWriteEnabled
} from './config.js';
import { GoogleSheetsAppError } from './errors.js';
import { createGoogleSheetsPreviewService } from './googleSheetsPreviewService.js';
import { writePreviewRowsAtomically } from './googleSheetsWriter.js';

export function createGoogleSheetsSyncService({
  googleConfig,
  writeClient,
  previewService,
  now = () => new Date(),
  writer = writePreviewRowsAtomically
} = {}) {
  const resolvedConfig = googleConfig ?? getGoogleSheetsConfig();
  const resolvedWriteClient = writeClient ?? createGoogleSheetsWriteClient(resolvedConfig);
  const resolvedPreviewService = previewService ?? createGoogleSheetsPreviewService({
    googleConfig: resolvedConfig,
    now
  });
  let syncInProgress = false;

  return {
    async sync(request = {}) {
      requireGoogleSheetsWriteEnabled(resolvedConfig);
      validateSyncRequest(request);

      if (syncInProgress) {
        throw new GoogleSheetsAppError({
          code: 'GOOGLE_SYNC_IN_PROGRESS',
          statusCode: 409,
          message: 'A Google Sheets sync is already running.'
        });
      }

      syncInProgress = true;
      try {
        const preview = await resolvedPreviewService.preview();
        const selection = selectRows(preview.rows, request);

        if (selection.rows.length === 0) {
          return {
            ok: true,
            target: preview.target,
            writtenRowCount: 0,
            writtenPageCount: 0,
            alreadySyncedCount: preview.counts?.alreadySynced ?? 0,
            heldPageCount: preview.counts?.heldPages ?? 0,
            skippedOutputGroupKeys: selection.missingKeys,
            message: 'No selected unsynced rows remain.'
          };
        }

        if (selection.missingKeys.length > 0) {
          throw new GoogleSheetsAppError({
            code: 'GOOGLE_SYNC_PREVIEW_STALE',
            statusCode: 409,
            message: 'The selected preview changed before sync. Preview again before writing.',
            details: { missingOutputGroupKeys: selection.missingKeys }
          });
        }

        const result = await writer({
          client: resolvedWriteClient,
          config: resolvedConfig,
          target: preview.target,
          rows: selection.rows,
          now
        });

        return {
          ok: true,
          target: preview.target,
          ...result,
          alreadySyncedCount: preview.counts?.alreadySynced ?? 0,
          heldPageCount: preview.counts?.heldPages ?? 0,
          skippedOutputGroupKeys: []
        };
      } finally {
        syncInProgress = false;
      }
    }
  };
}

export function createDefaultGoogleSheetsSyncService(options = {}) {
  return createGoogleSheetsSyncService(options);
}

function validateSyncRequest(request) {
  if (request.confirm !== true) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_CONFIRMATION_REQUIRED',
      statusCode: 400,
      message: 'Explicit confirmation is required before writing to Google Sheets.'
    });
  }

  if (!['controlled', 'all'].includes(request.mode)) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_MODE_INVALID',
      statusCode: 400,
      message: 'Google Sheets sync mode must be controlled or all.'
    });
  }

  if (request.mode === 'controlled'
    && (!Array.isArray(request.outputGroupKeys) || request.outputGroupKeys.length === 0)) {
    throw new GoogleSheetsAppError({
      code: 'GOOGLE_SYNC_SELECTION_REQUIRED',
      statusCode: 400,
      message: 'Controlled sync requires at least one output group key.'
    });
  }
}

function selectRows(rows, request) {
  if (request.mode === 'all') {
    return { rows: [...rows], missingKeys: [] };
  }

  const requestedKeys = [...new Set(request.outputGroupKeys.map(String))];
  const rowByKey = new Map(rows.map((row) => [row.outputGroupKey, row]));
  return {
    rows: requestedKeys.map((key) => rowByKey.get(key)).filter(Boolean),
    missingKeys: requestedKeys.filter((key) => !rowByKey.has(key))
  };
}
