import test from 'node:test';
import assert from 'node:assert/strict';

import { createAppServer } from '../src/server/server.js';

test('SOP download endpoints arm, report, and cancel the active context', async () => {
  const calls = [];
  const state = {
    id: 'download-1',
    status: 'armed',
    attachmentNames: ['SOP_초안.docx']
  };
  const service = {
    async arm(payload) {
      calls.push(['arm', payload]);
      return state;
    },
    getStatus(id) {
      calls.push(['status', id]);
      return id === state.id ? state : null;
    },
    cancel() {
      calls.push(['cancel']);
      return { ...state, status: 'cancelled' };
    }
  };
  const server = createAppServer({ sopDownloadService: service });
  await listen(server);

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;
    const armResponse = await fetch(`${baseUrl}/api/sop-download/arm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: '은주하', message: 'SOP_초안.docx' })
    });
    assert.equal(armResponse.status, 200);
    assert.deepEqual(await armResponse.json(), state);

    const statusResponse = await fetch(`${baseUrl}/api/sop-download/status?id=download-1`);
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(await statusResponse.json(), state);

    const cancelResponse = await fetch(`${baseUrl}/api/sop-download/cancel`, { method: 'POST' });
    assert.equal(cancelResponse.status, 200);
    assert.equal((await cancelResponse.json()).status, 'cancelled');
    assert.deepEqual(calls.slice(0, 3), [
      ['arm', { studentName: '은주하', message: 'SOP_초안.docx' }],
      ['status', 'download-1'],
      ['cancel']
    ]);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
