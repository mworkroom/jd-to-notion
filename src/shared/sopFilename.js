import path from 'node:path';

const DOCX_EXTENSION = '.docx';
const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const WINDOWS_INVALID_FILENAME_CHAR = /[<>:"/\\|?*\u0000-\u001F]/;
const HONORIFIC_SUFFIX = /님$/u;
const STUDENT_NAME_TOKEN_PATTERN = /^[가-힣]{2,5}$/u;
const NON_NAME_FILENAME_TOKENS = new Set([
  '감수',
  '개정',
  '수정',
  '수정본',
  '에세이',
  '자기소개',
  '자기소개서',
  '지원동기',
  '초고',
  '초안',
  '최종',
  '최종본',
  '최최종',
  '최최종본'
]);

export function extractDocxAttachmentNames(message) {
  const names = [];

  for (const rawLine of String(message ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/[\u200B-\u200D\uFEFF]/gu, '').trim();
    if (!/\.docx(?:\s|$)/iu.test(line)) {
      continue;
    }

    const extensionEnd = line.toLowerCase().lastIndexOf(DOCX_EXTENSION) + DOCX_EXTENSION.length;
    let candidate = line.slice(0, extensionEnd).trim();
    candidate = candidate
      .replace(/^[•*·]\s*/u, '')
      .replace(/^첨부(?:파일)?\s*[:：-]\s*/u, '')
      .replace(/^file\s*[:：-]\s*/iu, '')
      .trim();

    const tabSegments = candidate.split(/\t+/u).map((part) => part.trim()).filter(Boolean);
    candidate = tabSegments.at(-1) ?? candidate;

    if (isSafeDocxBasename(candidate)) {
      names.push(candidate);
    }
  }

  return [...new Set(names)];
}

export function extractPotentialStudentNameTokens(filenames, authoritativeStudentName = '') {
  const authoritative = normalizeStudentName(authoritativeStudentName);
  const tokens = new Set();

  for (const filename of filenames ?? []) {
    const stem = path.parse(String(filename ?? '')).name;
    const bracketed = [...stem.matchAll(/[([{]\s*([가-힣]{2,5})\s*[)\]}]/gu)]
      .map((match) => match[1]);
    const separated = stem
      .split(/[\s_\-()[\]{}]+/u)
      .map((part) => part.trim());

    for (const token of [...bracketed, ...separated]) {
      if (!STUDENT_NAME_TOKEN_PATTERN.test(token)
        || token === authoritative
        || NON_NAME_FILENAME_TOKENS.has(token)) {
        continue;
      }
      tokens.add(token);
    }
  }

  return [...tokens];
}

export function normalizeSopFilename({
  studentName,
  originalFilename,
  knownStudentNames = []
}) {
  const authoritative = normalizeStudentName(studentName);
  const safeOriginalFilename = path.basename(String(originalFilename ?? '').trim());

  if (!authoritative) {
    return invalidResult('student_name_missing', safeOriginalFilename);
  }
  if (!isSafeDocxBasename(safeOriginalFilename)) {
    return invalidResult('invalid_docx_filename', safeOriginalFilename);
  }

  const conflictingStudentNames = findConflictingStudentNames({
    authoritativeStudentName: authoritative,
    filename: safeOriginalFilename,
    knownStudentNames
  });
  if (conflictingStudentNames.length > 0) {
    return {
      status: 'conflict',
      originalFilename: safeOriginalFilename,
      filename: safeOriginalFilename,
      studentName: authoritative,
      changed: false,
      conflictingStudentNames
    };
  }

  const parsed = path.parse(safeOriginalFilename);
  const studentPattern = escapeRegExp(authoritative);
  const wrappedStudentPattern = new RegExp(
    `[([{]\\s*${studentPattern}(?:님)?\\s*[)\\]}]`,
    'giu'
  );
  const plainStudentPattern = new RegExp(`${studentPattern}(?:님)?`, 'giu');

  const remainder = cleanFilenameRemainder(
    parsed.name
      .replace(wrappedStudentPattern, '')
      .replace(plainStudentPattern, '')
  );
  const prefix = sanitizeFilenamePart(authoritative);
  const filename = `${remainder ? `${prefix}_${remainder}` : prefix}${parsed.ext}`;

  return {
    status: 'ready',
    originalFilename: safeOriginalFilename,
    filename,
    studentName: authoritative,
    changed: filename !== safeOriginalFilename,
    conflictingStudentNames: []
  };
}

export function matchesExpectedDownloadName(actualFilename, expectedFilename) {
  const actual = path.parse(String(actualFilename ?? ''));
  const expected = path.parse(String(expectedFilename ?? ''));
  if (actual.ext.toLowerCase() !== DOCX_EXTENSION || expected.ext.toLowerCase() !== DOCX_EXTENSION) {
    return false;
  }

  if (actual.base.localeCompare(expected.base, undefined, { sensitivity: 'accent' }) === 0) {
    return true;
  }

  const collisionSuffix = actual.name.match(/^(.*) \((\d+)\)$/u);
  return Boolean(collisionSuffix
    && collisionSuffix[1].localeCompare(expected.name, undefined, { sensitivity: 'accent' }) === 0);
}

function findConflictingStudentNames({ authoritativeStudentName, filename, knownStudentNames }) {
  const stem = path.parse(filename).name;
  const authoritativeBase = studentBaseName(authoritativeStudentName);
  const conflicts = new Set();

  for (const knownName of knownStudentNames ?? []) {
    const baseName = studentBaseName(knownName);
    if (!baseName || baseName === authoritativeBase) {
      continue;
    }

    if (stem.includes(baseName)) {
      conflicts.add(baseName);
    }
  }

  return [...conflicts];
}

function cleanFilenameRemainder(value) {
  return String(value ?? '')
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/gu, '')
    .replace(/_{2,}/gu, '_')
    .replace(/-{2,}/gu, '-')
    .replace(/([_-])(?:\s*[_-])+/gu, '$1')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s_-]+|[\s_-]+$/gu, '')
    .trim();
}

function normalizeStudentName(value) {
  return sanitizeFilenamePart(String(value ?? '').replace(HONORIFIC_SUFFIX, '').trim());
}

function studentBaseName(value) {
  return normalizeStudentName(value).replace(/ [A-Z]+$/u, '').trim();
}

function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .replace(WINDOWS_INVALID_FILENAME_CHARS, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim();
}

function isSafeDocxBasename(value) {
  const filename = String(value ?? '');
  return Boolean(filename
    && path.basename(filename) === filename
    && path.extname(filename).toLowerCase() === DOCX_EXTENSION
    && !WINDOWS_INVALID_FILENAME_CHAR.test(filename));
}

function invalidResult(reason, originalFilename) {
  return {
    status: 'invalid',
    reason,
    originalFilename,
    filename: originalFilename,
    studentName: '',
    changed: false,
    conflictingStudentNames: []
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
