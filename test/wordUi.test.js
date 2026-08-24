import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  html: new URL('../public/index.html', import.meta.url),
  app: new URL('../public/app.js', import.meta.url),
  wordPanel: new URL('../public/wordPanel.js', import.meta.url)
};

test('Word panel owns its DOM, state, rendering, and guarded generation request', async () => {
  const [html, app, wordPanel] = await Promise.all([
    readFile(files.html, 'utf8'),
    readFile(files.app, 'utf8'),
    readFile(files.wordPanel, 'utf8')
  ]);

  for (const id of [
    'programme-label',
    'word-filename',
    'copy-filename-button',
    'copy-status',
    'word-status',
    'word-readiness',
    'word-summary',
    'word-result',
    'generate-word-button',
    'word-generation-status'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(app, /from '\.\/wordPanel\.js'/u);
  assert.match(app, /const wordPanel = initializeWordPanel/u);
  assert.match(app, /requestState,\s+notionPreviewState: getNotionPreviewState\(\),\s+finalStudentName: getFinalStudentName\(\)/u);
  assert.doesNotMatch(app, /wordEnvironmentState|isGeneratingWord|function generateWordFile/u);

  assert.match(wordPanel, /export function initializeWordPanel/u);
  assert.match(wordPanel, /fetchImpl\('\/api\/word\/status'\)/u);
  assert.match(wordPanel, /fetchImpl\('\/api\/word\/generate'/u);
  assert.match(wordPanel, /method: 'POST'/u);
  assert.match(wordPanel, /body: JSON\.stringify\(payload\)/u);
  assert.match(wordPanel, /Word 파일 생성 완료/u);
});
