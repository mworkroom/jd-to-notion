export const GOOGLE_SHEETS_TIME_ZONE = 'Asia/Seoul';
export const EXPECTED_MONTHLY_HEADERS = Object.freeze([
  '소요시간(H)',
  'edm 담당자',
  '고객이름',
  '지원학교 / 전공',
  '비고'
]);

export function getKstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: GOOGLE_SHEETS_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  };
}

export function calculateTargetSheet(date = new Date()) {
  const kstDate = getKstDateParts(date);
  let targetYear = kstDate.year;
  let targetMonth = kstDate.month;

  if (kstDate.day >= 20) {
    targetMonth += 1;
    if (targetMonth === 13) {
      targetYear += 1;
      targetMonth = 1;
    }
  }

  return {
    timeZone: GOOGLE_SHEETS_TIME_ZONE,
    checkedDate: `${kstDate.year}-${String(kstDate.month).padStart(2, '0')}-${String(kstDate.day).padStart(2, '0')}`,
    year: targetYear,
    month: targetMonth,
    name: `${String(targetYear).slice(-2)}년 ${targetMonth}월`
  };
}

export function quoteSheetName(sheetName) {
  return `'${String(sheetName).replaceAll("'", "''")}'`;
}

export function normalizeHeaderRow(values = []) {
  return EXPECTED_MONTHLY_HEADERS.map((_, index) => String(values[index] ?? '').trim());
}
