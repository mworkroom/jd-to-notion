import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  app: new URL('../public/app.js', import.meta.url),
  notionPreviewController: new URL('../public/notionPreviewController.js', import.meta.url)
};

test('Notion preview controller owns read-only requests and preview state', async () => {
  const [app, notionPreviewController] = await Promise.all([
    readFile(files.app, 'utf8'),
    readFile(files.notionPreviewController, 'utf8')
  ]);

  assert.match(app, /from '\.\/notionPreviewController\.js'/u);
  assert.match(app, /notionPreviewController = initializeNotionPreviewController/u);
  assert.match(app, /notionPreviewState: getNotionPreviewState\(\)/u);
  assert.match(app, /prepareState: \(payload\) => notionPreviewPanel\.prepareState\(payload\)/u);
  assert.doesNotMatch(
    app,
    /let notionPreviewState|function previewNotionMatches|function updateWorkLogTitleForSelection|\/api\/notion\/(preview|work-log-title)/u
  );

  assert.match(notionPreviewController, /export function initializeNotionPreviewController/u);
  assert.match(notionPreviewController, /previewNotionButton: documentRef\.querySelector\('#preview-notion-button'\)/u);
  assert.match(notionPreviewController, /notionPreviewStatus: documentRef\.querySelector\('#notion-preview-status'\)/u);
  assert.match(notionPreviewController, /fetchImpl\('\/api\/notion\/preview'/u);
  assert.match(notionPreviewController, /fetchImpl\('\/api\/notion\/work-log-title'/u);
  assert.match(notionPreviewController, /let previewRequestSequence = 0/u);
  assert.match(notionPreviewController, /let workLogRequestSequence = 0/u);
  assert.match(notionPreviewController, /sequence !== previewRequestSequence/u);
  assert.match(notionPreviewController, /sequence !== workLogRequestSequence/u);
});
