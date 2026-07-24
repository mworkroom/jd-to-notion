export const DEGREE_LABELS = [
  'MSc',
  'MA',
  'MRes',
  'MBA',
  'MPA',
  'MPH',
  'MEd',
  'LLM',
  'MEng',
  'MArch',
  'MFA',
  'MMus',
  'MPhil',
  'PGDip',
  'PGCert'
];

export const DEGREE_LABEL_TYPOS = ['MCs'];

export const AMBIGUOUS_DEGREE_PATTERNS = [
  /\bMSc\s+by\s+Research\b/i,
  /\b(?:MSc|MA|MRes|MBA|MPH|MEd|LLM|MEng|MArch|MFA|MMus|MPhil|PGDip|PGCert)\s*\/\s*(?:MSc|MA|MRes|MBA|MPH|MEd|LLM|MEng|MArch|MFA|MMus|MPhil|PGDip|PGCert)\b/i,
  /\bIntegrated\s+Masters\b/i
];

export function canonicalDegreeLabel(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'mcs') {
    return 'MSc';
  }

  return DEGREE_LABELS.find((label) => label.toLowerCase() === normalized) ?? null;
}
