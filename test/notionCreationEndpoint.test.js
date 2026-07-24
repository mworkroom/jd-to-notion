import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';

test('/api/notion/create is disabled by default before the live-write gate', async () => {
  let called = false;
  const server = createAppServer({
    notionCreationService: {
      async create() {
        called = true;
        return { ok: true };
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notion/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const payload = await response.json();

    assert.equal(response.status, 403);
    assert.equal(payload.error.code, 'NOTION_CREATION_DISABLED');
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test('/api/notion/create returns only the creation service safe result when explicitly enabled', async () => {
  const server = createAppServer({
    notionCreationEnabled: true,
    notionCreationService: {
      async create(payload) {
        assert.equal(payload.requesterName, 'Requester');
        return {
          ok: true,
          fingerprint: 'a'.repeat(64),
          student: { id: 'student-1', action: 'create' },
          universities: [],
          majors: [],
          workLogs: [{
              id: 'work-1',
              url: 'https://notion.test/work-1',
              action: 'create'
          }],
          finalStudentName: 'Kim'
        };
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notion/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterName: 'Requester' })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.workLogs[0].url, 'https://notion.test/work-1');
    assert.doesNotMatch(JSON.stringify(payload), /token|properties|raw/i);
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
