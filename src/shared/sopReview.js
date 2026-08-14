import { normalizeWhitespace } from './normalization.js';

export const SOP_REQUEST_TYPE = 'sop_review';
export const ADMISSIONS_REQUEST_TYPE = 'admissions';
export const SOP_LANGUAGES = Object.freeze(['영문', '국문']);
export const SOP_REVIEW_ROUNDS = Object.freeze([1, 2, 3]);
export const SOP_CATEGORIES = Object.freeze({
  영문: 'SOP 감수(영문)',
  국문: 'SOP 감수(국문)'
});

export function detectRequestType(message) {
  const value = String(message ?? '');
  return /sop/i.test(value) && /감수/u.test(value)
    ? SOP_REQUEST_TYPE
    : ADMISSIONS_REQUEST_TYPE;
}

export function extractSopReviewRound(message) {
  const rounds = [...String(message ?? '').matchAll(/([1-9]\d*)\s*차/gu)]
    .map((match) => Number(match[1]));
  const uniqueRounds = [...new Set(rounds)];

  if (uniqueRounds.length === 0) {
    return { value: 1, valid: true, explicit: false };
  }

  if (uniqueRounds.length !== 1 || !SOP_REVIEW_ROUNDS.includes(uniqueRounds[0])) {
    return { value: null, valid: false, explicit: true };
  }

  return { value: uniqueRounds[0], valid: true, explicit: true };
}

export function extractSopLanguage(message) {
  const value = String(message ?? '');
  return /국문|한글|한국어/u.test(value) ? '국문' : '영문';
}

export function getSopWorkLogTitle(round, language) {
  const normalizedRound = Number(round);
  const normalizedLanguage = normalizeWhitespace(language);
  if (!SOP_REVIEW_ROUNDS.includes(normalizedRound) || !SOP_LANGUAGES.includes(normalizedLanguage)) {
    return '';
  }
  return `SOP ${normalizedRound}차 감수(${normalizedLanguage})`;
}

export function getSopCategory(language) {
  return SOP_CATEGORIES[normalizeWhitespace(language)] ?? '';
}

