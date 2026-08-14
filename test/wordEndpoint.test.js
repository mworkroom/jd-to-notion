import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';
import { WordGenerationError } from '../src/server/word/errors.js';

test('Word status and generation endpoints use an independent service', async () => {
  const calls = [];
  const server = createAppServer({
    wordGenerationService: {
      async getStatus() {
        return {
          ok: true,
          enabled: true,
          ready: true,
          template: { valid: true },
          output: { writable: true }
        };
      },
      async generate(payload) {
        calls.push(payload);
        return {
          ok: true,
          filename: 'sample.docx',
          outputPath: 'C:\\output\\sample.docx',
          programmeCount: payload.programmes.length
        };
      }
    }
  });
  await listen(server);

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const status = await fetch(`${baseUrl}/api/word/status`);
    assert.equal(status.status, 200);
    assert.equal((await status.json()).ready, true);

    const generated = await fetch(`${baseUrl}/api/word/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: '학생',
        programmes: [{ universityName: 'York' }]
      })
    });
    assert.equal(generated.status, 201);
    assert.equal((await generated.json()).filename, 'sample.docx');
    assert.equal(calls.length, 1);
  } finally {
    await close(server);
  }
});

test('Word endpoint returns a user-safe structured error', async () => {
  const server = createAppServer({
    wordGenerationService: {
      async getStatus() {
        return { ok: false, enabled: false, ready: false };
      },
      async generate() {
        throw new WordGenerationError(
          'WORD_GENERATION_DISABLED',
          'Word 자동 생성 기능이 아직 비활성화되어 있습니다.',
          { statusCode: 403 }
        );
      }
    }
  });
  await listen(server);

  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/word/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: 'WORD_GENERATION_DISABLED',
        message: 'Word 자동 생성 기능이 아직 비활성화되어 있습니다.',
        details: {}
      }
    });
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
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
