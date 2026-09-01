export const DEFAULT_ADMISSIONS_CYCLE = '2026/27';

const ADMISSIONS_CYCLE_PATTERN = /^(\d{4})\/(\d{2})$/u;

export function readAdmissionsCycle(env = globalThis.process?.env) {
  return normalizeAdmissionsCycle(env?.ADMISSIONS_CYCLE || DEFAULT_ADMISSIONS_CYCLE);
}

export function normalizeAdmissionsCycle(value) {
  const cycle = String(value ?? '').trim();
  const match = cycle.match(ADMISSIONS_CYCLE_PATTERN);
  if (!match) {
    throw new Error('ADMISSIONS_CYCLE은 YYYY/YY 형식이어야 합니다.');
  }

  const startYear = Number(match[1]);
  const expectedEndYear = String((startYear + 1) % 100).padStart(2, '0');
  if (match[2] !== expectedEndYear) {
    throw new Error(`ADMISSIONS_CYCLE 종료 연도는 ${expectedEndYear}이어야 합니다.`);
  }

  return cycle;
}

export function getAdmissionsCycleStartYear(cycle = readAdmissionsCycle()) {
  return normalizeAdmissionsCycle(cycle).slice(0, 4);
}

export function getAdmissionsFilenamePrefix(cycle = readAdmissionsCycle()) {
  return `[${getAdmissionsCycleStartYear(cycle)}입학요강]`;
}
