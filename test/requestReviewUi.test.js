import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
  html: new URL('../public/index.html', import.meta.url),
  app: new URL('../public/app.js', import.meta.url),
  requestReviewPanel: new URL('../public/requestReviewPanel.js', import.meta.url)
};

test('Request review panel owns normalization, validation, rendering, and edit events', async () => {
  const [html, app, requestReviewPanel] = await Promise.all([
    readFile(files.html, 'utf8'),
    readFile(files.app, 'utf8'),
    readFile(files.requestReviewPanel, 'utf8')
  ]);

  for (const id of [
    'request-type-badge',
    'programme-review-block',
    'sop-review-block',
    'requester-name',
    'request-date-time',
    'student-name',
    'extraction-warnings',
    'programme-list',
    'add-programme-button'
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(app, /from '\.\/requestReviewPanel\.js'/u);
  assert.match(app, /const requestReviewPanel = initializeRequestReviewPanel/u);
  assert.match(app, /onRequestChange: handleRequestReviewChange/u);
  assert.match(app, /onSopReviewChange: handleSopReviewChange/u);
  assert.doesNotMatch(
    app,
    /function renderProgrammes|function updateProgrammeField|function addProgramme|function removeProgramme|function validateRequest|function normalizeRequest/u
  );

  assert.match(requestReviewPanel, /export function createEmptyRequest/u);
  assert.match(requestReviewPanel, /export function normalizeRequest/u);
  assert.match(requestReviewPanel, /export function validateRequest/u);
  assert.match(requestReviewPanel, /export function countUniqueRequestProgrammes/u);
  assert.match(requestReviewPanel, /export function initializeRequestReviewPanel/u);
  assert.match(requestReviewPanel, /programmeList: documentRef\.querySelector\('#programme-list'\)/u);
  assert.match(requestReviewPanel, /input\.addEventListener\('input', updateBaseFields\)/u);
  assert.match(requestReviewPanel, /input\.addEventListener\('input', updateProgrammeField\)/u);
  assert.match(requestReviewPanel, /onRequestChange\(\{/u);
  assert.match(requestReviewPanel, /onSopReviewChange\(\{ round, language \}\)/u);
});
