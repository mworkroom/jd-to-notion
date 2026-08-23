import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTargetSheet,
  normalizeHeaderRow,
  quoteSheetName
} from '../src/server/googleSheets/targetSheet.js';

test('selects the current monthly tab through the 19th in Korea', () => {
  const result = calculateTargetSheet(new Date('2026-08-19T14:59:59.000Z'));
  assert.equal(result.checkedDate, '2026-08-19');
  assert.equal(result.name, '26년 8월');
});

test('selects the next monthly tab from the 20th in Korea', () => {
  const result = calculateTargetSheet(new Date('2026-08-19T15:00:00.000Z'));
  assert.equal(result.checkedDate, '2026-08-20');
  assert.equal(result.name, '26년 9월');
});

test('rolls December 20 over to January of the next year', () => {
  const result = calculateTargetSheet(new Date('2026-12-19T15:00:00.000Z'));
  assert.equal(result.name, '27년 1월');
});

test('normalizes a short header row and safely quotes sheet names', () => {
  assert.deepEqual(normalizeHeaderRow([' 소요시간(H) ', 'edm 담당자']), [
    '소요시간(H)',
    'edm 담당자',
    '',
    '',
    ''
  ]);
  assert.equal(quoteSheetName("O'Reilly"), "'O''Reilly'");
});
