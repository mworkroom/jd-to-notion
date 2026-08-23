import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';
import { GoogleSheetsAppError } from '../src/server/googleSheets/errors.js';

test('GET /api/google-sheets/status returns the read-only connection result', async () => {
  const server = createAppServer({
    googleSheetsStatusService: {
      async getStatus() {
        return {
          ok: true,
          readOnly: true,
          ready: true,
          target: { name: '26년 9월' }
        };
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/google-sheets/status`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.ready, true);
    assert.equal(payload.target.name, '26년 9월');
  } finally {
    await close(server);
  }
});

test('GET /api/google-sheets/status returns a safe structured error', async () => {
  const server = createAppServer({
    googleSheetsStatusService: {
      async getStatus() {
        throw new GoogleSheetsAppError({
          code: 'GOOGLE_SHEETS_FORBIDDEN',
          statusCode: 403,
          message: 'The Google service account cannot access this spreadsheet.'
        });
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/google-sheets/status`);
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, 'GOOGLE_SHEETS_FORBIDDEN');
  } finally {
    await close(server);
  }
});

test('POST /api/google-sheets/preview returns grouped read-only rows', async () => {
  const server = createAppServer({
    googleSheetsPreviewService: {
      async preview() {
        return {
          ok: true,
          readOnly: true,
          counts: { outputRows: 1 },
          rows: [{ values: { C: 1.33, G: '입학 요강' } }]
        };
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/google-sheets/preview`,
      { method: 'POST' }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.readOnly, true);
    assert.equal(payload.counts.outputRows, 1);
    assert.equal(payload.rows[0].values.C, 1.33);
  } finally {
    await close(server);
  }
});

test('POST /api/google-sheets/sync forwards confirmation to the guarded sync service', async () => {
  const calls = [];
  const server = createAppServer({
    googleSheetsSyncService: {
      async sync(payload) {
        calls.push(payload);
        return { ok: true, writtenRowCount: 1, writtenPageCount: 1 };
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/google-sheets/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'controlled',
          confirm: true,
          outputGroupKeys: ['group-1']
        })
      }
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.writtenRowCount, 1);
    assert.deepEqual(calls[0].outputGroupKeys, ['group-1']);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
