import {
  AMBIGUOUS_DEGREE_PATTERNS,
  DEGREE_LABELS,
  DEGREE_LABEL_TYPOS,
  canonicalDegreeLabel
} from './degreeLabels.js';

const SORTED_LABELS = [...DEGREE_LABELS, ...DEGREE_LABEL_TYPOS].sort((a, b) => b.length - a.length);
const DEGREE_PATTERN = SORTED_LABELS.map(escapeRegExp).join('|');

export function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeForComparison(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizeUniversityName(value) {
  return normalizeForComparison(value);
}

export function splitProgrammeName(programmeName) {
  const normalized = normalizeProgrammeNameForMatching(programmeName);
  const ambiguous = AMBIGUOUS_DEGREE_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!normalized) {
    return {
      subject: '',
      degreeLabel: null,
      degreePosition: 'none',
      ambiguous
    };
  }

  const atStart = normalized.match(new RegExp(`^(${DEGREE_PATTERN})\\b\\s+(.+)$`, 'i'));
  if (atStart) {
    return {
      subject: normalizeWhitespace(atStart[2]),
      degreeLabel: canonicalDegreeLabel(atStart[1]),
      degreePosition: 'start',
      ambiguous
    };
  }

  const inParenthesesAtEnd = normalized.match(new RegExp(`^(.+?)\\s*\\((${DEGREE_PATTERN})\\)\\s*$`, 'i'));
  if (inParenthesesAtEnd) {
    return {
      subject: normalizeWhitespace(inParenthesesAtEnd[1]),
      degreeLabel: canonicalDegreeLabel(inParenthesesAtEnd[2]),
      degreePosition: 'end-parentheses',
      ambiguous
    };
  }

  const atEnd = normalized.match(new RegExp(`^(.+?)\\s+(${DEGREE_PATTERN})\\s*$`, 'i'));
  if (atEnd) {
    return {
      subject: normalizeWhitespace(atEnd[1]),
      degreeLabel: canonicalDegreeLabel(atEnd[2]),
      degreePosition: 'end',
      ambiguous
    };
  }

  return {
    subject: normalized,
    degreeLabel: null,
    degreePosition: 'none',
    ambiguous
  };
}

function normalizeProgrammeNameForMatching(value) {
  return normalizeWhitespace(value).replace(/\s*\([^)]*[\p{Script=Hangul}][^)]*\)/gu, '');
}

export function getMajorSearchKey(programmeName) {
  return normalizeForComparison(splitProgrammeName(programmeName).subject);
}

export function getProposedMajorName(programmeName) {
  const normalized = normalizeWhitespace(programmeName);
  const parsed = splitProgrammeName(normalized);

  if (!parsed.degreeLabel || !parsed.subject) {
    return normalized;
  }

  // Creation names keep the degree label, but normalize leading and parenthesized labels to the preferred end position.
  return normalizeWhitespace(`${parsed.subject} ${parsed.degreeLabel}`);
}

export function deriveProgrammeFields(programme) {
  const programmeNameOriginal = programme.programmeNameOriginal ?? '';
  const parsed = splitProgrammeName(programmeNameOriginal);

  return {
    ...programme,
    majorSearchKey: getMajorSearchKey(programmeNameOriginal),
    notionMajorNameProposed: getProposedMajorName(programmeNameOriginal),
    needsMajorNameReview: parsed.ambiguous
  };
}

export function suggestNextStudentName(baseName, existingNames = []) {
  const cleanBase = normalizeWhitespace(baseName);
  if (!cleanBase) {
    return '';
  }

  const familyPattern = new RegExp(`^${escapeRegExp(cleanBase)}(?:\\s+([A-Z]+))?$`);
  let highest = 0;

  for (const name of existingNames) {
    const match = normalizeWhitespace(name).match(familyPattern);
    if (!match) {
      continue;
    }

    const suffixValue = match[1] ? suffixToNumber(match[1]) : 1;
    highest = Math.max(highest, suffixValue);
  }

  if (highest === 0) {
    return cleanBase;
  }

  return `${cleanBase} ${numberToSuffix(highest + 1)}`;
}

export function suffixToNumber(suffix) {
  return String(suffix)
    .toUpperCase()
    .split('')
    .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

export function numberToSuffix(value) {
  let remaining = value;
  let suffix = '';

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    suffix = String.fromCharCode(65 + offset) + suffix;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return suffix;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
