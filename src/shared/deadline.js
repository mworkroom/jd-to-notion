const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function calculateWeekdayDeadline(requestDateTime, weekdaysToAdd = 2) {
  const match = String(requestDateTime ?? '').match(ISO_DATE_PATTERN);
  if (!match) {
    return '';
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  let remaining = weekdaysToAdd;

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }

  return date.toISOString().slice(0, 10);
}
