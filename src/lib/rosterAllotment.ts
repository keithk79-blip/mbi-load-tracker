import { addDays, isValidISODate, yearOfISO } from "./chicagoDate";
import type { CallOffLogEntry } from "./callOffLog";
import type { ManualOffsStore } from "./manualCallOffs";
import { rosterNameKey, rosterNamesMatch } from "./rosterVacation";

export const P_DAY_ALLOTMENT = 5;
export const CALL_OFF_ALLOTMENT = 6;

export type AllotmentKind = "p-day" | "call-off";

export type AllotmentUse = {
  name: string;
  date: string;
  kind: AllotmentKind;
};

export type DriverAllotment = {
  pDayUsed: number;
  callOffUsed: number;
  pDayLeft: number;
  callOffLeft: number;
};

/** Only explicit P-Day / Call Off. Vacation, FMLA, Ok'd Off, NCNS do not spend the bank. */
export function allotmentKindFromReason(reason: string): AllotmentKind | null {
  const n = reason
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\bp\s*days?\b/.test(n) || n === "p day" || n === "pday") return "p-day";
  if (/\bcall\s*offs?\b/.test(n) || n === "co") return "call-off";
  return null;
}

function daysInRange(start: string, end: string | null, year: number): string[] {
  if (!isValidISODate(start)) return [];
  const last = end && isValidISODate(end) && end > start ? end : start;
  const out: string[] = [];
  let day = start;
  while (day <= last) {
    if (yearOfISO(day) === year) out.push(day);
    day = addDays(day, 1);
    if (out.length > 370) break;
  }
  return out;
}

export function allotmentUsesFromLog(
  rows: readonly CallOffLogEntry[],
  year: number,
): AllotmentUse[] {
  const uses: AllotmentUse[] = [];
  for (const row of rows) {
    const kind = allotmentKindFromReason(row.reason);
    if (!kind) continue;
    const name = row.name.trim();
    if (!name) continue;
    for (const date of daysInRange(row.start, row.end, year)) {
      uses.push({ name, date, kind });
    }
  }
  return uses;
}

export function allotmentUsesFromManuals(
  manuals: ManualOffsStore,
  year: number,
): AllotmentUse[] {
  const uses: AllotmentUse[] = [];
  for (const [date, list] of Object.entries(manuals)) {
    if (!isValidISODate(date) || yearOfISO(date) !== year) continue;
    for (const off of list) {
      if (off.kind !== "p-day" && off.kind !== "call-off") continue;
      const name = off.name.trim();
      if (!name) continue;
      uses.push({ name, date, kind: off.kind });
    }
  }
  return uses;
}

export function mergeAllotmentUses(lists: readonly AllotmentUse[][]): AllotmentUse[] {
  const seen = new Set<string>();
  const out: AllotmentUse[] = [];
  for (const list of lists) {
    for (const use of list) {
      const key = `${rosterNameKey(use.name)}|${use.date}|${use.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(use);
    }
  }
  return out;
}

function emptyAllotment(): DriverAllotment {
  return {
    pDayUsed: 0,
    callOffUsed: 0,
    pDayLeft: P_DAY_ALLOTMENT,
    callOffLeft: CALL_OFF_ALLOTMENT,
  };
}

export function allotmentForName(
  name: string,
  uses: readonly AllotmentUse[],
): DriverAllotment {
  const next = emptyAllotment();
  if (!name.trim()) return next;
  for (const use of uses) {
    if (!rosterNamesMatch(name, use.name)) continue;
    if (use.kind === "p-day") next.pDayUsed += 1;
    else next.callOffUsed += 1;
  }
  next.pDayLeft = Math.max(0, P_DAY_ALLOTMENT - next.pDayUsed);
  next.callOffLeft = Math.max(0, CALL_OFF_ALLOTMENT - next.callOffUsed);
  return next;
}

export function yearlyAllotmentUses(
  logRows: readonly CallOffLogEntry[],
  manuals: ManualOffsStore,
  year: number,
): AllotmentUse[] {
  return mergeAllotmentUses([
    allotmentUsesFromLog(logRows, year),
    allotmentUsesFromManuals(manuals, year),
  ]);
}
