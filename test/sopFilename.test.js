import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractDocxAttachmentNames,
  extractPotentialStudentNameTokens,
  matchesExpectedDownloadName,
  normalizeSopFilename
} from '../src/shared/sopFilename.js';

test('extracts unique DOCX attachment names from JANDI message text', () => {
  const names = extractDocxAttachmentNames([
    '첨부: SOP_1차_0731.docx',
    'Personal essay 최종(은주하).docx',
    'Personal essay 최종(은주하).docx',
    '참고자료.pdf'
  ].join('\n'));

  assert.deepEqual(names, [
    'SOP_1차_0731.docx',
    'Personal essay 최종(은주하).docx'
  ]);
});

test('normalizes missing, trailing, wrapped, and middle student names', () => {
  const examples = [
    ['은주하', 'SOP_1차_0731.docx', '은주하_SOP_1차_0731.docx'],
    ['은주하', 'Personal essay 최최종본_은주하.docx', '은주하_Personal essay 최최종본.docx'],
    ['은주하', 'Personal essay 최종(은주하).docx', '은주하_Personal essay 최종.docx'],
    ['오지석', 'SOP_오지석_초안.docx', '오지석_SOP_초안.docx'],
    ['은주하', 'SOP-[은주하]-초안.docx', '은주하_SOP-초안.docx']
  ];

  for (const [studentName, originalFilename, filename] of examples) {
    const result = normalizeSopFilename({ studentName, originalFilename });
    assert.equal(result.status, 'ready');
    assert.equal(result.filename, filename);
  }
});

test('filename normalization is idempotent', () => {
  const first = normalizeSopFilename({
    studentName: '은주하',
    originalFilename: 'Personal essay 최종(은주하).docx'
  });
  const second = normalizeSopFilename({
    studentName: '은주하',
    originalFilename: first.filename
  });

  assert.equal(second.filename, first.filename);
  assert.equal(second.changed, false);
});

test('blocks a filename containing another registered Student name', () => {
  const result = normalizeSopFilename({
    studentName: '은주하',
    originalFilename: 'SOP_김철수_초안.docx',
    knownStudentNames: ['김철수 B', '은주하']
  });

  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.conflictingStudentNames, ['김철수']);
});

test('extracts only plausible filename Student tokens for roster lookup', () => {
  assert.deepEqual(
    extractPotentialStudentNameTokens([
      'SOP_오지석_초안.docx',
      'Personal essay 최종(은주하).docx'
    ], '은주하'),
    ['오지석']
  );
});

test('matches browser collision suffixes to the expected JANDI filename', () => {
  assert.equal(matchesExpectedDownloadName('SOP_초안.docx', 'SOP_초안.docx'), true);
  assert.equal(matchesExpectedDownloadName('SOP_초안 (1).docx', 'SOP_초안.docx'), true);
  assert.equal(matchesExpectedDownloadName('다른파일.docx', 'SOP_초안.docx'), false);
});
