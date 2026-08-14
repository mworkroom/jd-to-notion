import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWhitespace } from '../../shared/normalization.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..');
const aliasesPath = path.join(projectRoot, 'data', 'universityAliases.csv');

export function resolveUniversityName(rawUniversityName, programmeUrl = '') {
  const aliasRows = loadUniversityAliases(aliasesPath);
  const aliasIndex = buildAliasIndex(aliasRows);
  const rawName = normalizeWhitespace(rawUniversityName);
  const aliasMatch = findByAlias(aliasIndex, rawName);
  const domainMatch = findByDomain(aliasRows, programmeUrl);
  const match = domainMatch ?? aliasMatch;

  if (!match) {
    return {
      rawUniversityName: rawName,
      universityName: rawName,
      universityAliasMatched: false,
      universityAliasMatchSource: null
    };
  }

  return {
    rawUniversityName: rawName,
    universityName: match.notionName,
    universityAliasMatched: true,
    universityAliasMatchSource: domainMatch ? 'domain' : 'alias'
  };
}

export function isKnownUniversityAlias(value) {
  const aliasRows = loadUniversityAliases(aliasesPath);
  return Boolean(findByAlias(buildAliasIndex(aliasRows), value));
}

export function getUniversityAliases() {
  return loadUniversityAliases(aliasesPath);
}

function loadUniversityAliases(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const [headerLine, ...lines] = content.split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) {
    return [];
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim());

  return lines
    .map((line) => parseCsvLine(line))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, normalizeWhitespace(values[index] ?? '')])))
    .filter((row) => row.notionName)
    .map((row) => ({
      alias: row.alias,
      notionName: row.notionName,
      domain: normalizeDomain(row.domain)
    }));
}

function buildAliasIndex(rows) {
  const index = new Map();

  for (const row of rows) {
    for (const value of [row.alias, row.notionName]) {
      const key = canonicalUniversityKey(value);
      if (key && !index.has(key)) {
        index.set(key, row);
      }
    }
  }

  return index;
}

function findByAlias(aliasIndex, value) {
  return aliasIndex.get(canonicalUniversityKey(value)) ?? null;
}

function findByDomain(aliasRows, programmeUrl) {
  const host = extractHost(programmeUrl);
  if (!host) {
    return null;
  }

  return aliasRows.find((row) => row.domain && (host === row.domain || host.endsWith(`.${row.domain}`))) ?? null;
}

function canonicalUniversityKey(value) {
  let key = normalizeWhitespace(value).replace(/\u00a0/g, ' ').toLowerCase();
  key = key.replace(/\bcity st george[’']s\b/g, 'city st george');
  key = key.replace(/^[^\p{L}\p{N}]+/u, '');
  key = key.replace(/^the\s+university\s+of\s+/i, '');
  key = key.replace(/^university\s+of\s+/i, '');
  key = key.replace(/^the\s+/i, '');
  key = key.replace(/\s+university$/i, '');
  return normalizeWhitespace(key);
}

function extractHost(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeDomain(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/^https?:/, '')
    .replace(/^\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}
