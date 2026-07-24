import { splitProgrammeName } from './normalization.js';
import { WORK_LOG_TITLE_PREFIX } from './workLog.js';

const WORD_EXTENSION = '.docx';
const INVALID_WINDOWS_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const MIN_SHARED_PHRASE_WORDS = 2;

export function generateProgrammeLabel(programmeNames = []) {
  const names = programmeNames.map((name) => String(name ?? '').trim()).filter(Boolean);
  if (names.length === 0) {
    return '';
  }

  const subjects = names.map((name) => splitProgrammeName(name).subject || name);
  const tokenizedSubjects = subjects.map(tokenizeWords);
  let best = null;

  for (let subjectIndex = 0; subjectIndex < tokenizedSubjects.length; subjectIndex += 1) {
    const tokens = tokenizedSubjects[subjectIndex];

    for (let size = tokens.length; size >= MIN_SHARED_PHRASE_WORDS; size -= 1) {
      for (let start = 0; start <= tokens.length - size; start += 1) {
        const phraseTokens = tokens.slice(start, start + size);
        const phraseKey = phraseTokens.map((token) => token.normalized).join(' ');
        const matchCount = tokenizedSubjects.filter((subjectTokens) => containsPhrase(subjectTokens, phraseKey)).length;

        if (matchCount >= 2 && (!best || size > best.size)) {
          best = {
            size,
            label: phraseTokens.map((token) => token.original).join(' ')
          };
        }
      }
    }
  }

  return best?.label ?? names[0];
}

export function generateWordFilename({
  studentName,
  programmeNames,
  year = '2026',
  category = WORK_LOG_TITLE_PREFIX
}) {
  const cleanStudentName = String(studentName ?? '').trim();
  const label = sanitizeFilenamePart(generateProgrammeLabel(programmeNames));

  if (!cleanStudentName || !label) {
    return '';
  }

  return `[${year}${category}] ${cleanStudentName}님_${label}${WORD_EXTENSION}`;
}

export function sanitizeFilenamePart(value) {
  return String(value ?? '')
    .replace(INVALID_WINDOWS_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
}

function tokenizeWords(value) {
  const matches = String(value ?? '').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? [];
  return matches.map((word) => ({
    original: word,
    normalized: word.toLowerCase()
  }));
}

function containsPhrase(tokens, phraseKey) {
  const normalized = tokens.map((token) => token.normalized);
  const phrase = phraseKey.split(' ');

  for (let index = 0; index <= normalized.length - phrase.length; index += 1) {
    if (phrase.every((word, offset) => normalized[index + offset] === word)) {
      return true;
    }
  }

  return false;
}
