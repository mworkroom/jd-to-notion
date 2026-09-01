import { constants as fsConstants } from 'node:fs';
import {
  access,
  link,
  mkdir,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { readWordConfig } from './config.js';
import { WordGenerationError } from './errors.js';

const HEADER_MARKERS = [
  '[[DEGREE_PREFIX]]',
  '[[PROGRAMME_LABEL]]',
  '[[STUDENT_NAME]]'
];
const BODY_MARKERS = [
  '[[UNIVERSITY]]',
  '[[PROGRAMME]]',
  '[[URL]]'
];
const FIXED_SOP_HEADING = 'SOP 글자 수 환산표';
const DEGREE_PREFIXES = new Set(['석사', '학사']);
const INVALID_WINDOWS_FILENAME_CHARS = /[<>:"|?*\u0000-\u001F]/g;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const ADMISSIONS_FILENAME_PREFIX_PATTERN = /^\[\d{4}입학요강\]/u;
const DOCX_MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const DOCUMENT_RELATIONSHIPS_PATH = 'word/_rels/document.xml.rels';
const OFFICE_RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HYPERLINK_RELATIONSHIP_TYPE = `${OFFICE_RELATIONSHIP_NAMESPACE}/hyperlink`;

export function createDefaultWordGenerationService({ config } = {}) {
  const resolvedConfig = {
    ...readWordConfig(),
    ...config
  };

  return {
    async getStatus() {
      return inspectWordEnvironment(resolvedConfig);
    },

    async generate(input) {
      if (!resolvedConfig.enabled) {
        throw new WordGenerationError(
          'WORD_GENERATION_DISABLED',
          'Word 자동 생성 기능이 아직 비활성화되어 있습니다.',
          { statusCode: 403 }
        );
      }

      const environment = await inspectWordEnvironment(resolvedConfig);
      if (!environment.template.valid) {
        throw new WordGenerationError(
          'WORD_TEMPLATE_INVALID',
          'Word 템플릿 검증을 통과하지 못했습니다.',
          {
            statusCode: 503,
            details: { issues: environment.template.issues }
          }
        );
      }
      if (!environment.output.writable) {
        throw new WordGenerationError(
          'WORD_OUTPUT_UNAVAILABLE',
          'Word 파일 저장 폴더를 사용할 수 없습니다.',
          {
            statusCode: 503,
            details: { issues: environment.output.issues }
          }
        );
      }

      const request = validateWordRequest(input);
      const requestedFilename = sanitizeOutputFilename(request.filename);
      assertAdmissionsFilenameCycle(requestedFilename, resolvedConfig.filenamePrefix);
      const templateBuffer = await readFile(resolvedConfig.templatePath);
      const generatedBuffer = buildWordDocument(templateBuffer, request);
      const folderName = buildOutputFolderName(
        request.studentName,
        request.programmeLabel
      );
      const folderPath = path.join(resolvedConfig.outputDir, folderName);
      const temporaryPath = path.join(
        resolvedConfig.outputDir,
        `.${requestedFilename}.${randomUUID()}.tmp`
      );
      let outputPath;
      let folderCreated = false;

      try {
        folderCreated = await ensureOutputFolder(folderPath);
        await writeFile(temporaryPath, generatedBuffer, { flag: 'wx' });
        outputPath = await publishUniqueOutputPath(
          temporaryPath,
          resolvedConfig.outputDir,
          requestedFilename
        );
      } catch (error) {
        await unlink(temporaryPath).catch(() => {});
        if (folderCreated) {
          await rmdir(folderPath).catch(() => {});
        }
        if (error instanceof WordGenerationError) {
          throw error;
        }
        throw new WordGenerationError(
          'WORD_OUTPUT_WRITE_FAILED',
          'Word 파일을 저장하지 못했습니다.',
          {
            statusCode: 500,
            details: { reason: error.code ?? error.message }
          }
        );
      }

      return {
        ok: true,
        filename: path.basename(outputPath),
        outputPath,
        folderName,
        folderPath,
        folderCreated,
        programmeCount: request.programmes.length,
        degreePrefix: `[${request.degree}]`,
        templateSha256: environment.template.sha256
      };
    }
  };
}

export async function inspectWordEnvironment(config) {
  const template = await inspectWordTemplate(config);
  const output = await inspectOutputDirectory(config.outputDir);

  return {
    ok: template.valid && output.writable,
    enabled: config.enabled === true,
    ready: config.enabled === true && template.valid && output.writable,
    admissionsCycle: config.admissionsCycle ?? '',
    filenamePrefix: config.filenamePrefix ?? '',
    template,
    output
  };
}

export async function inspectWordTemplate(config) {
  const issues = [];
  const templatePath = config.templatePath;

  if (!templatePath || path.extname(templatePath).toLowerCase() !== '.docx') {
    issues.push(issue(
      'WORD_TEMPLATE_FORMAT_INVALID',
      'Word 템플릿 경로는 .docx 파일이어야 합니다.'
    ));
  }

  const templateName = templatePath ? path.basename(templatePath) : '';
  if (hasAdmissionsCycleMismatch(templateName, config.filenamePrefix)) {
    issues.push(issue(
      'WORD_TEMPLATE_CYCLE_MISMATCH',
      `Word 템플릿 파일명이 현재 입학 사이클의 ${config.filenamePrefix}로 시작하지 않습니다.`,
      { actual: templateName, expectedPrefix: config.filenamePrefix }
    ));
  }

  let templateBuffer;
  try {
    templateBuffer = await readFile(templatePath);
  } catch (error) {
    issues.push(issue(
      'WORD_TEMPLATE_NOT_FOUND',
      'Word 템플릿 파일을 찾을 수 없습니다.',
      { reason: error.code ?? error.message }
    ));
    return {
      path: templatePath,
      exists: false,
      valid: false,
      sha256: '',
      configuredSha256: config.templateSha256 || '',
      issues
    };
  }

  const sha256 = hashBuffer(templateBuffer);
  if (!config.templateSha256) {
    issues.push(issue(
      'WORD_TEMPLATE_HASH_MISSING',
      'WORD_TEMPLATE_SHA256 설정이 비어 있습니다.'
    ));
  } else if (sha256 !== config.templateSha256.toLowerCase()) {
    issues.push(issue(
      'WORD_TEMPLATE_HASH_MISMATCH',
      '등록된 템플릿 SHA-256과 실제 파일이 일치하지 않습니다.',
      {
        expected: config.templateSha256.toLowerCase(),
        actual: sha256
      }
    ));
  }

  let structure = null;
  try {
    const zip = new AdmZip(templateBuffer);
    structure = inspectTemplateStructure(zip);
    issues.push(...structure.issues);
  } catch (error) {
    issues.push(issue(
      'WORD_TEMPLATE_PACKAGE_INVALID',
      'Word 템플릿의 DOCX 패키지를 읽을 수 없습니다.',
      { reason: error.message }
    ));
  }

  return {
    path: templatePath,
    exists: true,
    valid: issues.length === 0,
    sha256,
    configuredSha256: config.templateSha256 || '',
    structure: structure
      ? {
        headerMarkers: structure.headerMarkerCounts,
        bodyMarkers: structure.bodyMarkerCounts,
        prototypeTableCount: structure.prototypeTableCount,
        fixedSopCount: structure.fixedSopCount
      }
      : null,
    issues
  };
}

export function inspectTemplateStructure(zip) {
  const issues = [];
  const contentTypes = readZipText(zip, '[Content_Types].xml');
  const documentXml = readZipText(zip, 'word/document.xml');
  const headerXml = readZipText(zip, 'word/header1.xml');

  if (!contentTypes || !contentTypes.includes(DOCX_MAIN_CONTENT_TYPE)) {
    issues.push(issue(
      'WORD_TEMPLATE_FORMAT_INVALID',
      '템플릿이 허용된 DOCX 문서 형식이 아닙니다.'
    ));
  }
  if (!documentXml) {
    issues.push(issue(
      'WORD_TEMPLATE_DOCUMENT_MISSING',
      '템플릿에 word/document.xml이 없습니다.'
    ));
  }
  if (!headerXml) {
    issues.push(issue(
      'WORD_TEMPLATE_HEADER_MISSING',
      '템플릿에 word/header1.xml이 없습니다.'
    ));
  }

  const headerMarkerCounts = markerCounts(headerXml, HEADER_MARKERS);
  const bodyMarkerCounts = markerCounts(documentXml, BODY_MARKERS);
  validateMarkerCounts(headerMarkerCounts, '머리말', issues);
  validateMarkerCounts(bodyMarkerCounts, '본문', issues);
  validateMisplacedMarkers(
    markerCounts(documentXml, HEADER_MARKERS),
    '본문',
    issues
  );
  validateMisplacedMarkers(
    markerCounts(headerXml, BODY_MARKERS),
    '머리말',
    issues
  );

  let prototypeTableCount = 0;
  let fixedSopCount = 0;
  let prototype = null;
  if (documentXml) {
    try {
      prototype = locatePrototypeBlock(documentXml);
      prototypeTableCount = prototype.children
        .slice(prototype.startIndex, prototype.sopIndex)
        .filter((child) => child.name === 'tbl')
        .length;
      fixedSopCount = prototype.children
        .filter((child) => xmlText(child.xml) === FIXED_SOP_HEADING)
        .length;
    } catch (error) {
      issues.push(issue(
        'WORD_TEMPLATE_PROTOTYPE_INVALID',
        error.message
      ));
    }
  }

  if (prototype && prototypeTableCount !== 1) {
    issues.push(issue(
      'WORD_TEMPLATE_TABLE_INVALID',
      '복제할 입학요강 표가 프로토타입 블록에 정확히 1개 있어야 합니다.',
      { actual: prototypeTableCount }
    ));
  }
  if (prototype && fixedSopCount !== 1) {
    issues.push(issue(
      'WORD_TEMPLATE_SOP_INVALID',
      '고정 SOP·참고 영역이 정확히 1개 있어야 합니다.',
      { actual: fixedSopCount }
    ));
  }

  return {
    valid: issues.length === 0,
    headerMarkerCounts,
    bodyMarkerCounts,
    prototypeTableCount,
    fixedSopCount,
    prototype,
    issues
  };
}

export function buildWordDocument(templateBuffer, requestInput) {
  const request = validateWordRequest(requestInput);
  const zip = new AdmZip(templateBuffer);
  const structure = inspectTemplateStructure(zip);
  if (!structure.valid) {
    throw new WordGenerationError(
      'WORD_TEMPLATE_INVALID',
      'Word 템플릿 구조를 사용할 수 없습니다.',
      {
        statusCode: 503,
        details: { issues: structure.issues }
      }
    );
  }

  const headerXml = readZipText(zip, 'word/header1.xml');
  const documentXml = readZipText(zip, 'word/document.xml');
  const documentRelationshipsXml = readZipText(zip, DOCUMENT_RELATIONSHIPS_PATH);
  const replacements = {
    '[[DEGREE_PREFIX]]': `[${request.degree}]`,
    '[[PROGRAMME_LABEL]]': request.programmeLabel,
    '[[STUDENT_NAME]]': request.studentName
  };
  const generatedHeaderXml = replaceMarkers(headerXml, replacements);

  const prototype = structure.prototype;
  const prototypeXml = prototype.bodyContent.slice(
    prototype.startOffset,
    prototype.endOffset
  );
  const nextRelationshipId = createRelationshipIdAllocator(documentRelationshipsXml);
  const hyperlinkRelationships = [];
  const programmeBlocks = request.programmes.map((programme) => {
    const relationshipId = nextRelationshipId();
    hyperlinkRelationships.push({
      id: relationshipId,
      target: programme.url
    });
    return replaceProgrammeMarkers(prototypeXml, programme, relationshipId);
  });
  const generatedBodyContent = [
    prototype.bodyContent.slice(0, prototype.startOffset),
    programmeBlocks.join(''),
    prototype.bodyContent.slice(prototype.endOffset)
  ].join('');
  const generatedDocumentXml = ensureRelationshipNamespace([
    documentXml.slice(0, prototype.bodyStart),
    generatedBodyContent,
    documentXml.slice(prototype.bodyEnd)
  ].join(''));
  const generatedDocumentRelationshipsXml = appendHyperlinkRelationships(
    documentRelationshipsXml,
    hyperlinkRelationships
  );

  assertNoMarkers(generatedHeaderXml, HEADER_MARKERS);
  assertNoMarkers(generatedDocumentXml, BODY_MARKERS);
  zip.updateFile('word/header1.xml', Buffer.from(generatedHeaderXml, 'utf8'));
  zip.updateFile('word/document.xml', Buffer.from(generatedDocumentXml, 'utf8'));
  zip.updateFile(
    DOCUMENT_RELATIONSHIPS_PATH,
    Buffer.from(generatedDocumentRelationshipsXml, 'utf8')
  );

  return zip.toBuffer();
}

export function validateWordRequest(input = {}) {
  const errors = [];
  const studentName = normalizeText(input.studentName);
  const degree = normalizeText(input.degree || '석사');
  const filename = normalizeText(input.filename);
  const programmeLabel = normalizeText(input.programmeLabel);
  const programmes = Array.isArray(input.programmes)
    ? input.programmes.map((programme, index) => normalizeProgramme(programme, index, errors))
    : [];

  if (!studentName) {
    errors.push('studentName is required.');
  }
  if (!DEGREE_PREFIXES.has(degree)) {
    errors.push('degree must be 석사 or 학사.');
  }
  if (!filename) {
    errors.push('filename is required.');
  }
  if (!programmeLabel) {
    errors.push('programmeLabel is required.');
  }
  if (programmes.length === 0) {
    errors.push('At least one programme is required.');
  }

  if (errors.length) {
    throw new WordGenerationError(
      'WORD_REQUEST_INVALID',
      'Word 파일 생성에 필요한 검토값이 부족합니다.',
      {
        statusCode: 422,
        details: { errors }
      }
    );
  }

  return {
    studentName,
    degree,
    filename,
    programmeLabel,
    programmes
  };
}

export function sanitizeOutputFilename(value) {
  const raw = normalizeText(value);
  if (!raw || raw === '.' || raw === '..' || raw.includes('..')
    || raw.includes('/') || raw.includes('\\') || path.isAbsolute(raw)) {
    throw new WordGenerationError(
      'WORD_FILENAME_INVALID',
      'Word 파일명에는 폴더 경로나 상대 경로를 사용할 수 없습니다.',
      { statusCode: 422 }
    );
  }

  const stem = raw.replace(/\.docx$/i, '')
    .replace(INVALID_WINDOWS_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!stem || RESERVED_WINDOWS_NAMES.test(stem)) {
    throw new WordGenerationError(
      'WORD_FILENAME_INVALID',
      '사용할 수 없는 Word 파일명입니다.',
      { statusCode: 422 }
    );
  }

  return `${stem}.docx`;
}

function assertAdmissionsFilenameCycle(filename, expectedPrefix) {
  if (!hasAdmissionsCycleMismatch(filename, expectedPrefix)) {
    return;
  }

  throw new WordGenerationError(
    'WORD_FILENAME_CYCLE_MISMATCH',
    `Word 파일명이 현재 입학 사이클의 ${expectedPrefix}로 시작하지 않습니다.`,
    {
      statusCode: 422,
      details: { filename, expectedPrefix }
    }
  );
}

function hasAdmissionsCycleMismatch(filename, expectedPrefix) {
  return Boolean(expectedPrefix)
    && ADMISSIONS_FILENAME_PREFIX_PATTERN.test(String(filename ?? ''))
    && !String(filename).startsWith(expectedPrefix);
}

export function buildOutputFolderName(studentName, programmeLabel) {
  const cleanStudentName = sanitizeFolderPart(
    normalizeText(studentName).replace(/님$/u, '').trim()
  );
  const cleanProgrammeLabel = sanitizeFolderPart(programmeLabel);
  const folderName = `${cleanStudentName}_${cleanProgrammeLabel}`;

  if (!cleanStudentName || !cleanProgrammeLabel
    || folderName === '.' || folderName === '..'
    || RESERVED_WINDOWS_NAMES.test(folderName)) {
    throw new WordGenerationError(
      'WORD_FOLDER_NAME_INVALID',
      '학생명과 Programme Label로 안전한 폴더명을 만들 수 없습니다.',
      { statusCode: 422 }
    );
  }

  return folderName;
}

async function inspectOutputDirectory(outputDir) {
  const issues = [];
  let exists = false;
  let writable = false;

  try {
    const details = await stat(outputDir);
    exists = details.isDirectory();
    if (!exists) {
      issues.push(issue(
        'WORD_OUTPUT_NOT_DIRECTORY',
        'Word 출력 경로가 폴더가 아닙니다.'
      ));
    } else {
      await access(outputDir, fsConstants.W_OK);
      writable = true;
    }
  } catch (error) {
    issues.push(issue(
      'WORD_OUTPUT_UNAVAILABLE',
      'Word 출력 폴더를 사용할 수 없습니다.',
      { reason: error.code ?? error.message }
    ));
  }

  return {
    path: outputDir,
    exists,
    writable,
    issues
  };
}

async function ensureOutputFolder(folderPath) {
  try {
    await mkdir(folderPath);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      const details = await stat(folderPath).catch(() => null);
      if (details?.isDirectory()) {
        return false;
      }
    }

    throw new WordGenerationError(
      'WORD_FOLDER_CREATE_FAILED',
      '입학요강 작업 폴더를 만들지 못했습니다.',
      {
        statusCode: 500,
        details: { reason: error.code ?? error.message }
      }
    );
  }
}

function locatePrototypeBlock(documentXml) {
  const body = locateBody(documentXml);
  const children = splitTopLevelWordElements(body.content);
  const markerIndexes = BODY_MARKERS.map((marker) => (
    children.findIndex((child) => child.xml.includes(marker))
  ));
  if (markerIndexes.some((index) => index < 0)) {
    throw new Error('본문 프로토타입 마커를 모두 찾을 수 없습니다.');
  }
  if (!(markerIndexes[0] < markerIndexes[1] && markerIndexes[1] < markerIndexes[2])) {
    throw new Error('본문 프로토타입 마커 순서가 올바르지 않습니다.');
  }

  const startIndex = markerIndexes[0];
  const endIndex = children.findIndex(
    (child, index) => index > markerIndexes[2] && child.name === 'tbl'
  );
  if (endIndex < 0) {
    throw new Error('본문 프로토타입 뒤의 입학요강 표를 찾을 수 없습니다.');
  }

  const sopIndex = children.findIndex(
    (child) => xmlText(child.xml) === FIXED_SOP_HEADING
  );
  if (sopIndex < 0 || sopIndex <= endIndex) {
    throw new Error('입학요강 표 뒤의 고정 SOP·참고 영역을 찾을 수 없습니다.');
  }

  return {
    bodyContent: body.content,
    bodyStart: body.contentStart,
    bodyEnd: body.contentEnd,
    children,
    startIndex,
    endIndex,
    startOffset: children[startIndex].start,
    endOffset: children[endIndex].end,
    sopIndex
  };
}

function locateBody(documentXml) {
  const open = /<w:body\b[^>]*>/.exec(documentXml);
  if (!open) {
    throw new Error('word/document.xml에 w:body가 없습니다.');
  }
  const contentStart = open.index + open[0].length;
  const closingIndex = documentXml.lastIndexOf('</w:body>');
  if (closingIndex < contentStart) {
    throw new Error('word/document.xml의 w:body가 닫히지 않았습니다.');
  }
  return {
    contentStart,
    contentEnd: closingIndex,
    content: documentXml.slice(contentStart, closingIndex)
  };
}

function splitTopLevelWordElements(content) {
  const elements = [];
  const tagPattern = /<(\/?)w:([A-Za-z0-9]+)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = -1;
  let rootName = '';
  let match;

  while ((match = tagPattern.exec(content))) {
    const closing = match[1] === '/';
    const selfClosing = match[3] === '/' || match[0].endsWith('/>');

    if (!closing && depth === 0) {
      start = match.index;
      rootName = match[2];
    }

    if (closing) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        elements.push({
          name: rootName,
          start,
          end: tagPattern.lastIndex,
          xml: content.slice(start, tagPattern.lastIndex)
        });
        start = -1;
      }
    } else if (selfClosing) {
      if (depth === 0 && start >= 0) {
        elements.push({
          name: rootName,
          start,
          end: tagPattern.lastIndex,
          xml: content.slice(start, tagPattern.lastIndex)
        });
        start = -1;
      }
    } else {
      depth += 1;
    }
  }

  return elements;
}

function normalizeProgramme(programme, index, errors) {
  const universityName = normalizeText(
    programme?.rawUniversityName ?? programme?.universityName
  );
  const majorName = normalizeText(
    programme?.reviewedMajorName ?? programme?.majorName
  );
  const url = normalizeText(programme?.programmeUrl ?? programme?.url);

  if (!universityName) {
    errors.push(`programmes.${index}.universityName is required.`);
  }
  if (!majorName) {
    errors.push(`programmes.${index}.majorName is required.`);
  }
  if (!isHttpUrl(url)) {
    errors.push(`programmes.${index}.url must be an http or https URL.`);
  }

  return {
    universityName,
    majorName,
    url
  };
}

async function publishUniqueOutputPath(temporaryPath, outputDir, requestedFilename) {
  const extension = path.extname(requestedFilename);
  const stem = path.basename(requestedFilename, extension);

  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const filename = suffix === 1
      ? requestedFilename
      : `${stem} (${suffix})${extension}`;
    const candidate = path.join(outputDir, filename);
    try {
      await link(temporaryPath, candidate);
      await unlink(temporaryPath);
      return candidate;
    } catch (error) {
      if (error.code === 'EEXIST') {
        continue;
      }
      throw error;
    }
  }

  throw new WordGenerationError(
    'WORD_FILENAME_COLLISION_LIMIT',
    '같은 이름의 Word 파일이 너무 많아 새 파일명을 정할 수 없습니다.',
    { statusCode: 409 }
  );
}

function readZipText(zip, entryName) {
  const entry = zip.getEntry(entryName);
  return entry ? entry.getData().toString('utf8') : '';
}

function markerCounts(xml, markers) {
  return Object.fromEntries(
    markers.map((marker) => [marker, countOccurrences(xml, marker)])
  );
}

function validateMarkerCounts(counts, location, issues) {
  for (const [marker, count] of Object.entries(counts)) {
    if (count !== 1) {
      issues.push(issue(
        'WORD_TEMPLATE_MARKER_INVALID',
        `${location} 마커 ${marker}가 정확히 1개 있어야 합니다.`,
        { marker, location, actual: count }
      ));
    }
  }
}

function validateMisplacedMarkers(counts, location, issues) {
  for (const [marker, count] of Object.entries(counts)) {
    if (count > 0) {
      issues.push(issue(
        'WORD_TEMPLATE_MARKER_MISPLACED',
        `${marker} 마커가 허용되지 않은 ${location}에 있습니다.`,
        { marker, location, actual: count }
      ));
    }
  }
}

function replaceMarkers(xml, replacements) {
  let result = xml;
  for (const [marker, value] of Object.entries(replacements)) {
    result = result.replaceAll(marker, escapeXmlText(value));
  }
  return result;
}

function replaceProgrammeMarkers(prototypeXml, programme, relationshipId) {
  let result = replaceMarkers(prototypeXml, {
    '[[UNIVERSITY]]': programme.universityName
  });
  result = replaceMarkerRun(result, '[[PROGRAMME]]', programme.majorName, (runXml) => (
    addRunProperties(runXml, '<w:b/>')
  ));
  return replaceMarkerRun(result, '[[URL]]', programme.url, (runXml) => {
    const linkedRunXml = addRunProperties(
      runXml,
      '<w:color w:val="0563C1"/><w:u w:val="single"/>'
    );
    return `<w:hyperlink r:id="${relationshipId}" w:history="1">${linkedRunXml}</w:hyperlink>`;
  });
}

function replaceMarkerRun(xml, marker, value, transformRun) {
  let replacementCount = 0;
  const result = xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (runXml) => {
    if (!runXml.includes(marker)) {
      return runXml;
    }
    replacementCount += 1;
    const replacedRunXml = runXml.replaceAll(marker, escapeXmlText(value));
    return transformRun(replacedRunXml);
  });

  if (replacementCount !== 1) {
    throw new WordGenerationError(
      'WORD_TEMPLATE_MARKER_REPLACEMENT_FAILED',
      `Word 템플릿 마커 ${marker}의 글자 서식을 적용하지 못했습니다.`,
      {
        statusCode: 500,
        details: { marker, replacementCount }
      }
    );
  }

  return result;
}

function addRunProperties(runXml, propertiesXml) {
  if (/<w:rPr\b[^>]*\/>/.test(runXml)) {
    return runXml.replace(
      /<w:rPr\b[^>]*\/>/,
      (runPropertiesXml) => `${runPropertiesXml.slice(0, -2)}>${propertiesXml}</w:rPr>`
    );
  }
  if (/<w:rPr\b[^>]*>/.test(runXml)) {
    return runXml.replace('</w:rPr>', `${propertiesXml}</w:rPr>`);
  }
  return runXml.replace(
    /(<w:r\b[^>]*>)/,
    `$1<w:rPr>${propertiesXml}</w:rPr>`
  );
}

function createRelationshipIdAllocator(relationshipsXml) {
  const usedIds = new Set(
    [...relationshipsXml.matchAll(/\bId="([^"]+)"/g)].map((match) => match[1])
  );
  let sequence = 1;

  return () => {
    let candidate;
    do {
      candidate = `rIdGeneratedHyperlink${sequence}`;
      sequence += 1;
    } while (usedIds.has(candidate));
    usedIds.add(candidate);
    return candidate;
  };
}

function appendHyperlinkRelationships(relationshipsXml, relationships) {
  const closingTag = '</Relationships>';
  if (!relationshipsXml.includes(closingTag)) {
    throw new WordGenerationError(
      'WORD_TEMPLATE_RELATIONSHIPS_INVALID',
      'Word 템플릿의 문서 관계 파일을 사용할 수 없습니다.',
      { statusCode: 503 }
    );
  }

  const relationshipXml = relationships.map(({ id, target }) => (
    `<Relationship Id="${id}" Type="${HYPERLINK_RELATIONSHIP_TYPE}" `
      + `Target="${escapeXmlAttribute(target)}" TargetMode="External"/>`
  )).join('');
  return relationshipsXml.replace(closingTag, `${relationshipXml}${closingTag}`);
}

function ensureRelationshipNamespace(documentXml) {
  if (/\bxmlns:r=/.test(documentXml)) {
    return documentXml;
  }
  return documentXml.replace(
    /<w:document\b/,
    `<w:document xmlns:r="${OFFICE_RELATIONSHIP_NAMESPACE}"`
  );
}

function assertNoMarkers(xml, markers) {
  const remaining = markers.filter((marker) => xml.includes(marker));
  if (remaining.length) {
    throw new WordGenerationError(
      'WORD_TEMPLATE_MARKER_REPLACEMENT_FAILED',
      'Word 템플릿 마커 치환이 완료되지 않았습니다.',
      {
        statusCode: 500,
        details: { remaining }
      }
    );
  }
}

function xmlText(xml) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXmlText(match[1]))
    .join('');
}

function escapeXmlText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function decodeXmlText(value) {
  return String(value)
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function countOccurrences(value, search) {
  if (!value || !search) {
    return 0;
  }
  return value.split(search).length - 1;
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeFolderPart(value) {
  return normalizeText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/[. ]+$/g, '')
    .trim();
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function issue(code, message, details = {}) {
  return { code, message, details };
}
