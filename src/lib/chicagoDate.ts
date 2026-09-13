export const CHICAGO_TZ = "America/Chicago";

const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"] as const;
const WEEKDAY_MED = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function chicagoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** Weekday of a calendar date (timezone-independent). 0 = Sunday. */
export function weekdayOfISO(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/** Saturday on the America/Chicago calendar date (no TZ shift — ISO is already Chicago). */
export function isChicagoSaturday(iso: string): boolean {
  return weekdayOfISO(iso) === 6;
}

export function isChicagoSunday(iso: string): boolean {
  return weekdayOfISO(iso) === 0;
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function weekStartingMonday(iso: string): string[] {
  const dow = weekdayOfISO(iso);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = addDays(iso, mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Sunday through Saturday, matching the Vacation week. */
export function weekStartingSunday(iso: string): string[] {
  const sunday = addDays(iso, -weekdayOfISO(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export function formatHeaderDate(iso: string): string {
  const { m, d } = parseISODate(iso);
  const wd = WEEKDAY_MED[weekdayOfISO(iso)];
  return `${wd} ${MONTH_SHORT[m - 1]} ${d}`;
}

export function formatShortDate(iso: string): string {
  const { m, d } = parseISODate(iso);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

export function weekdayLetter(iso: string): string {
  return WEEKDAY_SHORT[weekdayOfISO(iso)];
}

export function dayNumber(iso: string): number {
  return parseISODate(iso).d;
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** US sheet dates like `8/3/26`, `9/1/2026`, `8/29/2026`. */
export function parseSheetDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isValidISODate(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;
  const iso = `${year}-${pad2(month)}-${pad2(day)}`;
  const check = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return iso;
}

export function dateInInclusiveRange(
  day: string,
  start: string,
  end: string | null,
): boolean {
  if (!isValidISODate(day) || !isValidISODate(start)) return false;
  if (!end) return day === start;
  if (!isValidISODate(end)) return day === start;
  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  return day >= lo && day <= hi;
}

export function yearOfISO(iso: string): number {
  return parseISODate(iso).y;
}

export function startOfYear(iso: string): string {
  return `${yearOfISO(iso)}-01-01`;
}

/** Inclusive window ending on `endIso`, oldest first. */
export function lastNDays(endIso: string, n: number): string[] {
  const count = Math.max(1, n);
  return Array.from({ length: count }, (_, i) => addDays(endIso, -(count - 1 - i)));
}

export function formatMonthDayYear(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return `${MONTH_SHORT[m - 1]} ${d}, ${y}`;
}

/** Compact created-at stamp in America/Chicago. Today: `2:14 PM`. Else: `9/4 2:14 PM`. */
export function formatCreatedStamp(createdAt: string, now = new Date()): string {
  const dt = new Date(createdAt);
  if (Number.isNaN(dt.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(dt);
  if (chicagoToday(dt) === chicagoToday(now)) return time;
  const { m, d } = parseISODate(chicagoToday(dt));
  return `${m}/${d} ${time}`;
}
