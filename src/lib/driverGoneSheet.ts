/** Offline CSV parser only. Gone rows live in the app / Supabase.
 * No Google fetch.
 */

import { parseCsv } from "./driverAvailability";
import {
  cleanEmployeeNumber,
  cleanGoneNotes,
  parseGoneDate,
  type ImportedGoneRow,
} from "./driverGone";
import { cleanDriverName } from "./driverRoster";

const COL_EMP = 0;
const COL_NAME = 1;
const COL_HIRE = 4;
const COL_TERM = 5;
const COL_NOTES = 6;

function isGoneHeaderRow(empRaw: string, nameRaw: string): boolean {
  const emp = empRaw.trim().toLowerCase();
  const name = nameRaw.trim().toLowerCase();
  if (!name) return true;
  if (name === "name" && /^(emp|#|employee|emp\s*#|emp#)$/.test(emp)) return true;
  return false;
}

export function parseGoneSheetCsv(csv: string): ImportedGoneRow[] {
  const table = parseCsv(csv);
  const rows: ImportedGoneRow[] = [];
  const seen = new Set<string>();

  for (const row of table) {
    const empRaw = row[COL_EMP] ?? "";
    const nameRaw = row[COL_NAME] ?? "";
    if (isGoneHeaderRow(empRaw, nameRaw)) continue;
    const name = cleanDriverName(nameRaw);
    if (!name) continue;
    const employeeNumber = cleanEmployeeNumber(empRaw);
    const hireDate = parseGoneDate(row[COL_HIRE] ?? "");
    const terminationDate = parseGoneDate(row[COL_TERM] ?? "");
    const notes = cleanGoneNotes(row[COL_NOTES] ?? "");
    const key = `${employeeNumber ?? ""}|${name.toLowerCase()}|${terminationDate ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      employeeNumber,
      name,
      hireDate,
      terminationDate,
      notes,
      yard: null,
    });
  }

  return rows;
}

