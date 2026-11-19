const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const parseIsoDateParts = (
  date: string
): { year: number; month: number; day: number } | undefined => {
  if (!ISO_DATE_PATTERN.test(date)) {
    return undefined;
  }
  const [yearPart, monthPart, dayPart] = date.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { year, month, day };
};

export const isValidIsoDate = (value: unknown): value is string =>
  typeof value === "string" && parseIsoDateParts(value) !== undefined;

export const addCalendarDays = (date: string, deltaDays: number): string => {
  const parts = parseIsoDateParts(date);
  if (parts === undefined) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  const utc = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays)
  );
  const year = String(utc.getUTCFullYear()).padStart(4, "0");
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Returns ISO weekday: 1 = Monday through 7 = Sunday.
export const getIsoWeekday = (date: string): number => {
  const parts = parseIsoDateParts(date);
  if (parts === undefined) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
  const utcDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day)
  ).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
};
