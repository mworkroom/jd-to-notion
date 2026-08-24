import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  html: new URL('../public/index.html', import.meta.url),
  app: new URL('../public/app.js', import.meta.url),
  notionCreationPanel: new URL('../public/notionCreationPanel.js', import.meta.url)
};

test('Notion creation panel owns schema state, creation gate, and guarded write request', async () => {
  const [html, app, notionCreationPanel] = await Promise.all([
    readFile(files.html, 'utf8'),
    readFile(files.app, 'utf8'),
    readFile(files.notionCreationPanel, 'utf8')
  ]);

  for (const id of [
    'notion-status',
    'notion-plan-summary',
    'creation-plan',
    'creation-plan-details',
    'creation-readiness',
    'creation-gate-note',
    'creation-result',
    'create-notion-button'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(app, /from '\.\/notionCreationPanel\.js'/u);
  assert.match(app, /const notionCreationPanel = initializeNotionCreationPanel/u);
  assert.match(app, /requestState,\s+notionPreviewState: getNotionPreviewState\(\),\s+clientMode,\s+finalStudentName: getFinalStudentName\(\)/u);
  assert.doesNotMatch(
    app,
    /notionSchemaValid|notionCreationEnabled|isCreatingNotion|creationCompleted|function createNotionRecords/u
  );

  assert.match(notionCreationPanel, /export function initializeNotionCreationPanel/u);
  assert.match(notionCreationPanel, /fetchImpl\('\/api\/notion\/schema'\)/u);
  assert.match(notionCreationPanel, /confirmImpl\(\[/u);
  assert.match(notionCreationPanel, /fetchImpl\('\/api\/notion\/create'/u);
  assert.match(notionCreationPanel, /body: JSON\.stringify\(buildCreationPayload\(context\)\)/u);
  assert.match(notionCreationPanel, /NOTION_CREATION_DISABLED/u);
  assert.match(notionCreationPanel, /Notion 생성과 저장 검증이 완료됐습니다/u);
});
