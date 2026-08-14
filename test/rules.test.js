import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWeekdayDeadline } from '../src/shared/deadline.js';
import { generateProgrammeLabel, generateWordFilename, sanitizeFilenamePart } from '../src/shared/filename.js';
import { getMajorSearchKey, getProposedMajorName, suggestNextStudentName } from '../src/shared/normalization.js';
import {
  ADMISSIONS_CATEGORY,
  WORK_LOG_TITLE_PREFIX,
  getNextWorkLogTitle
} from '../src/shared/workLog.js';

test('suggestNextStudentName creates the base name when no family exists', () => {
  assert.equal(suggestNextStudentName('중복학생', []), '중복학생');
});

test('suggestNextStudentName advances to B when the base exists', () => {
  assert.equal(suggestNextStudentName('중복학생', ['중복학생']), '중복학생 B');
});

test('suggestNextStudentName advances past suffix gaps', () => {
  assert.equal(suggestNextStudentName('중복학생', ['중복학생', '중복학생 B', '중복학생 D']), '중복학생 E');
});

test('calculateWeekdayDeadline adds two weekdays and skips weekends', () => {
  assert.equal(calculateWeekdayDeadline('2026-06-15T17:04:00+09:00'), '2026-06-17');
  assert.equal(calculateWeekdayDeadline('2026-06-18T17:04:00+09:00'), '2026-06-22');
  assert.equal(calculateWeekdayDeadline('2026-06-19T17:04:00+09:00'), '2026-06-23');
});

test('getMajorSearchKey removes degree labels from supported positions', () => {
  const expected = 'medical biotechnology and business management';

  assert.equal(getMajorSearchKey('MSc Medical Biotechnology and Business Management'), expected);
  assert.equal(getMajorSearchKey('Medical Biotechnology and Business Management MSc'), expected);
  assert.equal(getMajorSearchKey('Medical Biotechnology and Business Management (MSc)'), expected);
  assert.equal(getMajorSearchKey(' Medical   Biotechnology and Business Management '), expected);
});

test('getProposedMajorName moves recognized leading and parenthesized degree labels to the end', () => {
  assert.equal(
    getProposedMajorName('MSc Biomedical Sciences with Bioenterprise'),
    'Biomedical Sciences with Bioenterprise MSc'
  );
  assert.equal(
    getProposedMajorName('Medical Biotechnology and Business Management (MSc)'),
    'Medical Biotechnology and Business Management MSc'
  );
});

test('major normalization treats standalone MCs variants as MSc while preserving the subject', () => {
  const expectedKey = 'advanced materials science and engineering';
  const variants = [
    'MCs Advanced Materials Science and Engineering',
    'MCS Advanced Materials Science and Engineering',
    'Advanced Materials Science and Engineering Mcs',
    'Advanced Materials Science and Engineering (mcs)'
  ];

  for (const value of variants) {
    assert.equal(getMajorSearchKey(value), expectedKey);
    assert.equal(
      getProposedMajorName(value),
      'Advanced Materials Science and Engineering MSc'
    );
  }
});

test('generateProgrammeLabel uses the longest meaningful phrase when coverage is tied', () => {
  assert.equal(
    generateProgrammeLabel([
      'Biomedical Sciences with Bioenterprise MSc',
      'Biomedical Sciences with Management MSc',
      'MA Educational Leadership'
    ]),
    'Biomedical Sciences'
  );
});

test('generateProgrammeLabel permits a repeated leading single word when no longer core phrase wins', () => {
  assert.equal(
    generateProgrammeLabel([
      'MSc Nutrition',
      'MSc Nutrition, Physical Activity and Public Health',
      'MSc Nutrition',
      'MSc Nutritional Sciences',
      'MSc Crinical and public Health Nutrition'
    ]),
    'Nutrition'
  );
});

test('generateProgrammeLabel keeps a repeated specific phrase over a more frequent generic word', () => {
  assert.equal(
    generateProgrammeLabel([
      'Sport Business, Management and Policy MSc',
      'Sport Management MSc',
      'Sports Management MSc',
      'Sport Management MSc',
      'Sport Management MSc'
    ]),
    'Sport Management'
  );
});

test('generateProgrammeLabel falls back to the first programme when no phrase is shared', () => {
  assert.equal(
    generateProgrammeLabel([
      'Medical Biotechnology and Business Management (MSc)',
      'Immunology and Immunotherapeutics MSc'
    ]),
    'Medical Biotechnology and Business Management (MSc)'
  );
});

test('generateWordFilename follows the required Korean filename format', () => {
  assert.equal(
    generateWordFilename({
      studentName: '중복학생 D',
      programmeNames: ['Biomedical Sciences MSc', 'Biomedical Sciences with Bioenterprise MSc']
    }),
    '[2026입학요강] 중복학생 D님_Biomedical Sciences.docx'
  );
});

test('sanitizeFilenamePart removes Windows-invalid filename characters', () => {
  assert.equal(sanitizeFilenamePart('MSc: Policy / Law * Track'), 'MSc Policy Law Track');
});

test('getNextWorkLogTitle counts old plain titles and numbered titles', () => {
  assert.equal(
    getNextWorkLogTitle([
      { title: WORK_LOG_TITLE_PREFIX, category: ADMISSIONS_CATEGORY },
      { title: `${WORK_LOG_TITLE_PREFIX} 2`, category: ADMISSIONS_CATEGORY },
      { title: '비자', category: '비자' }
    ]),
    `${WORK_LOG_TITLE_PREFIX} 3`
  );
});
