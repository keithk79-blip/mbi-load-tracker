import { DRIVER_HIRE_DATES, type DriverHireDateRow } from "../data/driverHireDates";
import { isValidISODate, parseISODate } from "./chicagoDate";
import {
  cleanDriverName,
  cleanTruckNumber,
  type DriverRosterEntry,
  type DriverRosterStore,
} from "./driverRoster";
import { rosterNamesMatch } from "./rosterVacation";

function parseHireDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isValidISODate(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += year >= 80 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1950 || year > 2100) {
    return null;
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

export function cleanHireDate(raw: unknown): string | null {
  return parseHireDate(raw);
}

/** Whole years on the Chicago calendar since hire. Null when there is no start date. */
export function yearsOfService(hireDate: string | null | undefined, today: string): number | null {
  if (!hireDate || !isValidISODate(hireDate) || !isValidISODate(today)) return null;
  if (hireDate > today) return 0;
  const hired = parseISODate(hireDate);
  const now = parseISODate(today);
  let years = now.y - hired.y;
  if (now.m < hired.m || (now.m === hired.m && now.d < hired.d)) years -= 1;
  return Math.max(0, years);
}

export function yearsOfServiceLabel(years: number): string {
  if (years < 1) return "<1 yr";
  if (years === 1) return "1 yr";
  return `${years} yrs`;
}

function sheetKey(row: DriverHireDateRow): { emp: string | null; name: string } {
  return {
    emp: cleanTruckNumber(row.employeeNumber),
    name: cleanDriverName(row.name),
  };
}

/**
 * Stamp known start dates onto Full Roster rows that do not already have one.
 * Emp # first, then name. Never adds drivers. Never touches Sat rows.
 */
export function applyKnownHireDates(
  store: DriverRosterStore,
  rows: readonly DriverHireDateRow[] = DRIVER_HIRE_DATES,
  at?: string,
): { store: DriverRosterStore; updated: DriverRosterEntry[] } {
  const byEmp = new Map<string, string>();
  const byName: DriverHireDateRow[] = [];
  for (const row of rows) {
    const hireDate = cleanHireDate(row.hireDate);
    if (!hireDate) continue;
    const key = sheetKey(row);
    if (key.emp && !byEmp.has(key.emp)) byEmp.set(key.emp, hireDate);
    if (key.name) byName.push({ ...row, hireDate });
  }

  const entries = { ...store.entries };
  const updated: DriverRosterEntry[] = [];
  const usedEmp = new Set<string>();
  const stamp = at ?? new Date().toISOString();

  for (const [id, entry] of Object.entries(entries)) {
    if (entry.kind !== "full") continue;
    if (cleanHireDate(entry.hireDate)) continue;
    const emp = cleanTruckNumber(entry.truckNumber);
    let hireDate: string | null = null;
    if (emp && byEmp.has(emp)) {
      hireDate = byEmp.get(emp) ?? null;
      usedEmp.add(emp);
    } else {
      const hit = byName.find((row) => rosterNamesMatch(entry.name, row.name));
      hireDate = hit ? cleanHireDate(hit.hireDate) : null;
    }
    if (!hireDate) continue;
    const next = { ...entry, hireDate, updatedAt: stamp };
    entries[id] = next;
    updated.push(next);
  }

  return { store: { entries }, updated };
}

export function preserveHireDates(
  previous: DriverRosterStore,
  incoming: DriverRosterStore,
): DriverRosterStore {
  const entries: Record<string, DriverRosterEntry> = { ...incoming.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (row.kind !== "full") continue;
    if (cleanHireDate(row.hireDate)) continue;
    const kept = cleanHireDate(previous.entries[id]?.hireDate ?? null);
    if (!kept) continue;
    entries[id] = { ...row, hireDate: kept };
  }
  return { entries };
}

export function hireDatesNeedingUpload(
  store: DriverRosterStore,
  remote: DriverRosterStore,
): DriverRosterEntry[] {
  const out: DriverRosterEntry[] = [];
  for (const row of Object.values(store.entries)) {
    if (row.kind !== "full") continue;
    const local = cleanHireDate(row.hireDate);
    if (!local) continue;
    const remoteDate = cleanHireDate(remote.entries[row.id]?.hireDate ?? null);
    if (local !== remoteDate) out.push(row);
  }
  return out;
}
