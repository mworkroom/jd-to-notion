import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  html: new URL('../public/index.html', import.meta.url),
  app: new URL('../public/app.js', import.meta.url),
  notionPreviewPanel: new URL('../public/notionPreviewPanel.js', import.meta.url)
};

test('Notion preview panel owns preview rendering and review interactions', async () => {
  const [html, app, notionPreviewPanel] = await Promise.all([
    readFile(files.html, 'utf8'),
    readFile(files.app, 'utf8'),
    readFile(files.notionPreviewPanel, 'utf8')
  ]);

  assert.match(html, /id="notion-preview"/u);
  assert.match(html, /id="sop-major-selection"/u);
  assert.match(app, /from '\.\/notionPreviewPanel\.js'/u);
  assert.match(app, /const notionPreviewPanel = initializeNotionPreviewPanel/u);
  assert.match(app, /notionPreviewState: getNotionPreviewState\(\)/u);
  assert.match(app, /notionPreviewPanel\.prepareState\(payload\)/u);
  assert.doesNotMatch(
    app,
    /sopCandidatesExpanded|function renderNotionPreview|function renderAgentPreview|function bindPreviewInteractions/u
  );

  assert.match(notionPreviewPanel, /export function initializeNotionPreviewPanel/u);
  assert.match(notionPreviewPanel, /notionPreview: documentRef\.querySelector\('#notion-preview'\)/u);
  assert.match(notionPreviewPanel, /sopMajorSelection: documentRef\.querySelector\('#sop-major-selection'\)/u);
  assert.match(notionPreviewPanel, /input\.dataset\.studentSelection = candidate\.id/u);
  assert.match(notionPreviewPanel, /input\.dataset\.majorCreateName = String\(programmeIndex\)/u);
  assert.match(notionPreviewPanel, /checkbox\.dataset\.majorNameConfirmation = String\(programmeIndex\)/u);
  assert.match(notionPreviewPanel, /onPreviewEdit\(\{ type: 'sop-major-selection' \}\)/u);
  assert.match(notionPreviewPanel, /export function getSelectedStudentName/u);
});
