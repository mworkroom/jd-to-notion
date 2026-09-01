import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractSopAttachmentNames,
  normalizeSopFilename,
  selectSopAttachment
} from '../src/shared/sopFilename.js';

test('extracts DOCX and PDF attachment names without duplicates', () => {
  assert.deepEqual(extractSopAttachmentNames([
    '첨부: SOP_1차_0731.docx',
    'Personal Statement final.pdf',
    'Personal Statement final.pdf',
    '이미지.png'
  ].join('\n')), [
    'SOP_1차_0731.docx',
    'Personal Statement final.pdf'
  ]);
});

test('selects the only ordinary attachment regardless of DOCX or PDF', () => {
  assert.equal(selectSopAttachment(['final.docx']).filename, 'final.docx');
  assert.equal(selectSopAttachment(['final.pdf']).filename, 'final.pdf');
});

test('prefers one explicit SOP attachment over an admissions reference', () => {
  assert.deepEqual(
    selectSopAttachment(['입학요강.docx', 'Personal Statement final.pdf']),
    {
      status: 'selected',
      reason: 'sop_filename_hint',
      filename: 'Personal Statement final.pdf',
      candidateNames: ['Personal Statement final.pdf']
    }
  );
});

test('selects one neutral DOCX when the other attachment is a PDF reference', () => {
  assert.equal(
    selectSopAttachment(['final_v3.docx', 'Entry Requirements.pdf']).filename,
    'final_v3.docx'
  );
});

test('keeps multiple SOP candidates and reference-only attachments manual', () => {
  assert.equal(
    selectSopAttachment(['SOP old.docx', 'SOP final.docx']).reason,
    'multiple_sop_candidates'
  );
  assert.equal(
    selectSopAttachment(['입학요강.docx', 'Course Handbook.pdf']).reason,
    'reference_only'
  );
});

test('normalizes an SOP PDF filename with the same student-prefix rule', () => {
  const result = normalizeSopFilename({
    studentName: '은주하',
    originalFilename: 'Personal Statement final(은주하).pdf'
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.filename, '은주하_Personal Statement final.pdf');
});
