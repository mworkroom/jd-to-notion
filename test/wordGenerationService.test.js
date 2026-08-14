import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  buildWordDocument,
  buildOutputFolderName,
  createDefaultWordGenerationService,
  inspectWordTemplate,
  sanitizeOutputFilename
} from '../src/server/word/wordGenerationService.js';
import { WordGenerationError } from '../src/server/word/errors.js';
import { createWordTemplateFixture, sha256 } from '../test-support/wordTestFixture.js';

const validRequest = {
  studentName: '김윤지 B',
  degree: '석사',
  filename: '[2026입학요강] 김윤지 B님_Nutrition.docx',
  programmeLabel: 'Nutrition',
  programmes: [
    {
      rawUniversityName: 'University & College <London>',
      reviewedMajorName: 'Clinical Nutrition MSc',
      programmeUrl: 'https://example.com/course?a=1&b=2'
    }
  ]
};

test('template inspection requires the registered SHA-256 and all structural markers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'word-template-'));
  const templatePath = path.join(directory, 'template.docx');
  const template = createWordTemplateFixture();
  await writeFile(templatePath, template);

  try {
    const missingHash = await inspectWordTemplate({
      templatePath,
      templateSha256: ''
    });
    assert.equal(missingHash.valid, false);
    assert.equal(missingHash.issues[0].code, 'WORD_TEMPLATE_HASH_MISSING');

    const valid = await inspectWordTemplate({
      templatePath,
      templateSha256: sha256(template)
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.structure.prototypeTableCount, 1);
    assert.equal(valid.structure.fixedSopCount, 1);

    const mismatch = await inspectWordTemplate({
      templatePath,
      templateSha256: '0'.repeat(64)
    });
    assert.equal(mismatch.valid, false);
    assert.ok(mismatch.issues.some((item) => item.code === 'WORD_TEMPLATE_HASH_MISMATCH'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('template inspection blocks duplicate, missing, and fixed-area marker defects', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'word-template-defect-'));

  try {
    for (const [name, options, expectedCode] of [
      ['duplicate.docx', { duplicateHeaderMarker: true }, 'WORD_TEMPLATE_MARKER_INVALID'],
      ['missing.docx', { omitBodyMarker: true }, 'WORD_TEMPLATE_MARKER_INVALID'],
      ['sop.docx', { omitSop: true }, 'WORD_TEMPLATE_PROTOTYPE_INVALID']
    ]) {
      const buffer = createWordTemplateFixture(options);
      const templatePath = path.join(directory, name);
      await writeFile(templatePath, buffer);
      const result = await inspectWordTemplate({
        templatePath,
        templateSha256: sha256(buffer)
      });
      assert.equal(result.valid, false);
      assert.ok(result.issues.some((item) => item.code === expectedCode));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('DOCX generation clones the full admissions block and preserves untouched package parts', () => {
  const template = createWordTemplateFixture();
  const sourceZip = new AdmZip(template);
  const result = buildWordDocument(template, {
    ...validRequest,
    degree: '학사',
    programmes: [
      validRequest.programmes[0],
      {
        rawUniversityName: 'University of York',
        reviewedMajorName: 'Nutrition & Policy MA',
        programmeUrl: 'https://example.com/york?x=1&y=2'
      },
      {
        rawUniversityName: 'King\'s College London',
        reviewedMajorName: 'Food <Systems> MSc',
        programmeUrl: 'https://example.com/kcl'
      }
    ]
  });
  const generatedZip = new AdmZip(result);
  const header = generatedZip.readAsText('word/header1.xml');
  const document = generatedZip.readAsText('word/document.xml');

  assert.match(header, /<w:t>\[학사\] <\/w:t>/);
  assert.match(header, /<w:t>Nutrition<\/w:t>/);
  assert.match(header, /김윤지 B/);
  assert.equal((document.match(/w:tblStyle w:val="TableGrid"/g) ?? []).length, 3);
  assert.equal((document.match(/w:tblStyle w:val="ReferenceTable"/g) ?? []).length, 1);
  assert.equal((document.match(/SOP 글자 수 환산표/g) ?? []).length, 1);
  assert.equal((document.match(/w:pStyle w:val="UniName"/g) ?? []).length, 3);
  assert.equal((document.match(/w:pStyle w:val="ListParagraph"/g) ?? []).length, 3);
  assert.equal((document.match(/<w:br\/>/g) ?? []).length, 3);
  assert.match(document, /University &amp; College &lt;London&gt;/);
  assert.match(document, /Nutrition &amp; Policy MA/);
  assert.match(document, /Food &lt;Systems&gt; MSc/);
  assert.match(document, /course\?a=1&amp;b=2/);
  assert.doesNotMatch(document, /\[\[(UNIVERSITY|PROGRAMME|URL)\]\]/);
  assert.doesNotMatch(header, /\[\[(DEGREE_PREFIX|PROGRAMME_LABEL|STUDENT_NAME)\]\]/);

  for (const entryName of [
    '[Content_Types].xml',
    'word/_rels/document.xml.rels',
    'word/styles.xml',
    'word/numbering.xml',
    'word/theme/theme1.xml'
  ]) {
    assert.deepEqual(
      generatedZip.getEntry(entryName).getData(),
      sourceZip.getEntry(entryName).getData()
    );
  }
});

test('service saves without overwriting and blocks generation while the flag is off', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'word-output-'));
  const templatePath = path.join(directory, 'template.docx');
  const template = createWordTemplateFixture();
  await writeFile(templatePath, template);
  await writeFile(path.join(directory, validRequest.filename), 'existing');

  try {
    const disabled = createDefaultWordGenerationService({
      config: {
        enabled: false,
        templatePath,
        templateSha256: sha256(template),
        outputDir: directory
      }
    });
    await assert.rejects(
      disabled.generate(validRequest),
      (error) => error instanceof WordGenerationError
        && error.code === 'WORD_GENERATION_DISABLED'
    );

    const enabled = createDefaultWordGenerationService({
      config: {
        enabled: true,
        templatePath,
        templateSha256: sha256(template),
        outputDir: directory
      }
    });
    const result = await enabled.generate(validRequest);
    assert.equal(result.filename, '[2026입학요강] 김윤지 B님_Nutrition (2).docx');
    assert.equal(await readFile(path.join(directory, validRequest.filename), 'utf8'), 'existing');
    assert.ok((await readFile(result.outputPath)).length > 0);
    assert.equal(result.folderName, '김윤지 B_Nutrition');
    assert.equal(result.folderPath, path.join(directory, '김윤지 B_Nutrition'));
    assert.equal(result.folderCreated, true);
    assert.equal((await stat(result.folderPath)).isDirectory(), true);

    const repeated = await enabled.generate(validRequest);
    assert.equal(repeated.filename, '[2026입학요강] 김윤지 B님_Nutrition (3).docx');
    assert.equal(repeated.folderPath, result.folderPath);
    assert.equal(repeated.folderCreated, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('output filename removes forbidden characters but rejects path traversal', () => {
  assert.equal(
    sanitizeOutputFilename('[2026] 학생님_Nutrition: Policy?.docx'),
    '[2026] 학생님_Nutrition Policy.docx'
  );
  assert.throws(
    () => sanitizeOutputFilename('../outside.docx'),
    (error) => error.code === 'WORD_FILENAME_INVALID'
  );
  assert.throws(
    () => sanitizeOutputFilename('folder\\outside.docx'),
    (error) => error.code === 'WORD_FILENAME_INVALID'
  );
});

test('output folder follows the macro student and programme naming rule', () => {
  assert.equal(
    buildOutputFolderName('김윤지 B님', 'Nutrition: Policy?'),
    '김윤지 B_Nutrition Policy'
  );
  assert.equal(
    buildOutputFolderName('김윤지 B', 'Nutrition / Policy'),
    '김윤지 B_Nutrition  Policy'
  );
  assert.throws(
    () => buildOutputFolderName('', 'Nutrition'),
    (error) => error.code === 'WORD_FOLDER_NAME_INVALID'
  );
});

test('generation stops safely when the work-folder path is occupied by a file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'word-folder-conflict-'));
  const templatePath = path.join(directory, 'template.docx');
  const template = createWordTemplateFixture();
  await writeFile(templatePath, template);
  await writeFile(path.join(directory, '김윤지 B_Nutrition'), 'not a directory');

  try {
    const service = createDefaultWordGenerationService({
      config: {
        enabled: true,
        templatePath,
        templateSha256: sha256(template),
        outputDir: directory
      }
    });

    await assert.rejects(
      service.generate(validRequest),
      (error) => error.code === 'WORD_FOLDER_CREATE_FAILED'
    );
    await assert.rejects(
      readFile(path.join(directory, validRequest.filename)),
      (error) => error.code === 'ENOENT'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
