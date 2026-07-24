export const WORK_LOG_TITLE_PREFIX = '입학 요강';
export const ADMISSIONS_CATEGORY = '입학 요강';
export const REQUEST_SEASON = '2026/27';

export function countExistingWorkLogTasks(entries = [], category = ADMISSIONS_CATEGORY) {
  return entries.filter((entry) => isAdmissionsTask(entry, category)).length;
}

export function getNextWorkLogTitle(entries = []) {
  return `${WORK_LOG_TITLE_PREFIX} ${countExistingWorkLogTasks(entries) + 1}`;
}

export function getNextWorkLogTitles(entries = [], count = 1) {
  const start = countExistingWorkLogTasks(entries) + 1;
  const safeCount = Math.max(0, Number.isInteger(count) ? count : 0);
  return Array.from(
    { length: safeCount },
    (_, index) => `${WORK_LOG_TITLE_PREFIX} ${start + index}`
  );
}

function isAdmissionsTask(entry, category) {
  if (typeof entry === 'string') {
    return entry === WORK_LOG_TITLE_PREFIX
      || entry.startsWith(`${WORK_LOG_TITLE_PREFIX} `);
  }

  if (!entry || typeof entry !== 'object') {
    return false;
  }

  if (entry.category) {
    return entry.category === category;
  }

  return entry.title === WORK_LOG_TITLE_PREFIX
    || String(entry.title ?? '').startsWith(`${WORK_LOG_TITLE_PREFIX} `);
}
