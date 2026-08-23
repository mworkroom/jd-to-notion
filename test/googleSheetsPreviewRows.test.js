import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleSheetsPreviewRows } from '../src/server/googleSheets/previewRows.js';

test('groups unsynced admissions logs, preserves zero Hours, sums safely, and sorts titles numerically', () => {
  const items = [
    item('work-10', '입학 요강 10', 0.33, 'Major 10', '2026-08-24T01:00:00.000Z'),
    item('work-plain', '입학 요강', 0, 'Major plain', '2026-08-24T00:59:00.000Z'),
    item('work-2', '입학 요강 2', 0.5, 'Major 2', '2026-08-24T01:01:00.000Z'),
    item('work-1', '입학 요강 1', 0.17, 'Major 1', '2026-08-24T01:02:00.000Z')
  ];

  const result = buildGoogleSheetsPreviewRows(items, { targetSheetId: 123 });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].values.C, 1);
  assert.equal(result.rows[0].values.G, '입학 요강');
  assert.equal(
    result.rows[0].values.F,
    'University - Major 1\nUniversity - Major 2\nUniversity - Major 10\nUniversity - Major plain'
  );
  assert.deepEqual(result.rows[0].pageIds, ['work-1', 'work-2', 'work-10', 'work-plain']);
  assert.equal(result.readyPageCount, 4);
  assert.equal(result.heldPageCount, 0);
});

test('holds the complete admissions group when one page has missing Hours', () => {
  const result = buildGoogleSheetsPreviewRows([
    item('work-1', '입학 요강 1', 0.5, 'Major 1'),
    item('work-2', '입학 요강 2', null, 'Major 2')
  ], { targetSheetId: 123 });

  assert.equal(result.rows.length, 0);
  assert.equal(result.held.length, 1);
  assert.equal(result.held[0].kind, 'admissions_group');
  assert.deepEqual(result.held[0].pageIds, ['work-1', 'work-2']);
  assert.equal(result.held[0].reasons[0].code, 'HOURS_INVALID');
});

test('keeps a non-admissions log as one row and holds only invalid relation items', () => {
  const sop = item('sop-1', 'SOP 1차 감수', 0, 'English Literature');
  sop.category = 'SOP 감수(영문)';
  const invalid = item('invalid-1', '추천서 감수', 0.5, 'Business');
  invalid.relations = null;
  invalid.relationIssue = { code: 'STUDENT_MISSING', message: 'Student 없음' };

  const result = buildGoogleSheetsPreviewRows([sop, invalid], { targetSheetId: 123 });

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].kind, 'single');
  assert.equal(result.rows[0].values.C, 0);
  assert.equal(result.rows[0].values.G, 'SOP 1차 감수');
  assert.equal(result.held.length, 1);
  assert.equal(result.held[0].reasons[0].code, 'STUDENT_MISSING');
});

function item(id, title, hours, majorName, createdTime = '2026-08-24T01:00:00.000Z') {
  return {
    id,
    title,
    category: '입학 요강',
    hours,
    createdTime,
    relations: {
      student: { id: 'student-1', name: 'Student' },
      agent: { id: 'agent-1', name: 'Agent' },
      major: { id: `major-${id}`, name: majorName },
      university: { id: 'university-1', name: 'University' }
    }
  };
}
