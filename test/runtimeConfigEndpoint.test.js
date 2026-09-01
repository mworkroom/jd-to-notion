import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/server/server.js';
import { REQUEST_SEASON } from '../src/shared/workLog.js';
import {
  getAdmissionsCycleStartYear,
  getAdmissionsFilenamePrefix
} from '../src/shared/admissionsCycle.js';

test('runtime config exposes only the active admissions cycle and derived filename values', async () => {
  const server = createAppServer();
  await listen(server, '127.0.0.1', 0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/runtime-config.js`);
    const source = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/javascript/u);
    assert.ok(source.includes(`ADMISSIONS_CYCLE = ${JSON.stringify(REQUEST_SEASON)}`));
    assert.ok(source.includes(
      `ADMISSIONS_CYCLE_START_YEAR = ${JSON.stringify(getAdmissionsCycleStartYear(REQUEST_SEASON))}`
    ));
    assert.ok(source.includes(
      `ADMISSIONS_FILENAME_PREFIX = ${JSON.stringify(getAdmissionsFilenamePrefix(REQUEST_SEASON))}`
    ));
    assert.doesNotMatch(source, /NOTION_TOKEN|WORD_TEMPLATE_SHA256/u);
  } finally {
    await close(server);
  }
});

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
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
