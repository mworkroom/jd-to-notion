import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  html: new URL('../public/index.html', import.meta.url),
  app: new URL('../public/app.js', import.meta.url),
  sopDownloadPanel: new URL('../public/sopDownloadPanel.js', import.meta.url)
};

test('SOP download panel owns watcher state, timers, endpoints, and status rendering', async () => {
  const [html, app, sopDownloadPanel] = await Promise.all([
    readFile(files.html, 'utf8'),
    readFile(files.app, 'utf8'),
    readFile(files.sopDownloadPanel, 'utf8')
  ]);

  assert.match(html, /id="sop-download-status"/u);
  assert.match(app, /from '\.\/sopDownloadPanel\.js'/u);
  assert.match(app, /const sopDownloadPanel = initializeSopDownloadPanel/u);
  assert.match(app, /requestState,\s+message: elements\.jandiMessage\.value/u);
  assert.doesNotMatch(
    app,
    /sopDownloadContextId|sopDownloadPollTimer|function armSopDownload|function renderSopDownloadStatus/u
  );

  assert.match(sopDownloadPanel, /export function initializeSopDownloadPanel/u);
  assert.match(sopDownloadPanel, /rearmDelayMs = 500/u);
  assert.match(sopDownloadPanel, /pollDelayMs = 750/u);
  assert.match(sopDownloadPanel, /fetchImpl\('\/api\/sop-download\/arm'/u);
  assert.match(sopDownloadPanel, /\/api\/sop-download\/status\?id=/u);
  assert.match(sopDownloadPanel, /fetchImpl\('\/api\/sop-download\/cancel'/u);
  assert.match(sopDownloadPanel, /currentRequestSequence !== requestSequence/u);
  assert.match(sopDownloadPanel, /statusElement\.dataset\.tone = tone/u);
});
