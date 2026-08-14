import { splitProgrammeName } from './normalization.js';

const WORD_EXTENSION = '.docx';
const WORD_FILENAME_CATEGORY = '입학요강';
const INVALID_WINDOWS_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const PHRASE_EDGE_CONNECTORS = new Set([
  'and',
  'for',
  'in',
  'of',
  'or',
  'the',
  'to',
  'with'
]);

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

    for (let size = tokens.length; size >= 1; size -= 1) {
      for (let start = 0; start <= tokens.length - size; start += 1) {
        const phraseTokens = tokens.slice(start, start + size);
        if (!isMeaningfulPhrase(phraseTokens)) {
          continue;
        }

        const phraseKey = phraseTokens.map((token) => token.normalized).join(' ');
        const matchCount = tokenizedSubjects.filter((subjectTokens) => containsPhrase(
          subjectTokens,
          phraseKey,
          { requireStart: size === 1 }
        )).length;

        if (matchCount >= 2 && isBetterCandidate({ size, matchCount }, best)) {
          best = {
            size,
            matchCount,
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
  category = WORD_FILENAME_CATEGORY
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

function isBetterCandidate(candidate, best) {
  if (!best) {
    return true;
  }
  if (candidate.matchCount === best.matchCount) {
    return candidate.size > best.size;
  }
  if (candidate.matchCount < best.matchCount) {
    return candidate.size > 1
      && candidate.matchCount >= 3
      && best.size === 1
      && candidate.matchCount + 1 === best.matchCount;
  }

  const preservesStableSpecificPhrase = candidate.size === 1
    && best.size > 1
    && best.matchCount >= 3
    && candidate.matchCount === best.matchCount + 1;
  return !preservesStableSpecificPhrase;
}

function tokenizeWords(value) {
  const matches = String(value ?? '').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? [];
  return matches.map((word) => ({
    original: word,
    normalized: word.toLowerCase()
  }));
}

function containsPhrase(tokens, phraseKey, { requireStart = false } = {}) {
  const normalized = tokens.map((token) => token.normalized);
  const phrase = phraseKey.split(' ');
  const lastStart = requireStart ? 0 : normalized.length - phrase.length;

  for (let index = 0; index <= lastStart; index += 1) {
    if (phrase.every((word, offset) => normalized[index + offset] === word)) {
      return true;
    }
  }

  return false;
}

function isMeaningfulPhrase(tokens) {
  if (tokens.length === 0) {
    return false;
  }

  return !PHRASE_EDGE_CONNECTORS.has(tokens[0].normalized)
    && !PHRASE_EDGE_CONNECTORS.has(tokens[tokens.length - 1].normalized);
}
