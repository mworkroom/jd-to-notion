import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  getAdmissionsCycleStartYear,
  getAdmissionsFilenamePrefix,
  normalizeAdmissionsCycle,
  readAdmissionsCycle
} from '../src/shared/admissionsCycle.js';
import { readWordConfig } from '../src/server/word/config.js';

test('a single admissions cycle derives the Notion season and filename year', () => {
  const cycle = readAdmissionsCycle({ ADMISSIONS_CYCLE: ' 2027/28 ' });

  assert.equal(cycle, '2027/28');
  assert.equal(getAdmissionsCycleStartYear(cycle), '2027');
  assert.equal(getAdmissionsFilenamePrefix(cycle), '[2027입학요강]');
});

test('admissions cycle rejects malformed or non-consecutive years', () => {
  assert.throws(
    () => normalizeAdmissionsCycle('2027'),
    /YYYY\/YY/u
  );
  assert.throws(
    () => normalizeAdmissionsCycle('2027/29'),
    /28/u
  );
});

test('Word defaults follow the configured admissions cycle', () => {
  const config = readWordConfig({
    ADMISSIONS_CYCLE: '2027/28',
    WORD_GENERATION_ENABLED: 'false'
  });

  assert.equal(config.admissionsCycle, '2027/28');
  assert.equal(config.filenamePrefix, '[2027입학요강]');
  assert.equal(path.basename(config.templatePath), '[2027입학요강] 자동생성용.docx');
});
