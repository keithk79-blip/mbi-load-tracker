/** One-time Gone 2026 seed. Import emp #, name, hire, termination, notes only.
 * Sheet contact columns (C/D) are never read, stored, or displayed.
 */

import { parseCsv } from "./driverAvailability";
import {
  cleanEmployeeNumber,
  cleanGoneNotes,
  parseGoneDate,
  type ImportedGoneRow,
} from "./driverGone";
import { cleanDriverName } from "./driverRoster";
import { rosterGoneFetchUrl } from "./sheets";

/** A emp #, B name, E hire, F termination, G notes. Never C or D. */
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

/**
 * Parse the Gone 2026 grid. Only columns A, B, E, F, G are read.
 * Contact columns are ignored even if present in the CSV.
 */
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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`);
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    throw new Error("Sheets proxy returned HTML instead of CSV");
  }
  return text;
}

/** One-time seed / explicit Import when Gone is empty. */
export async function fetchGoneWorkbook(opts?: {
  fetchText?: (url: string) => Promise<string>;
}): Promise<{ rows: ImportedGoneRow[] }> {
  const load = opts?.fetchText ?? fetchText;
  const csv = await load(rosterGoneFetchUrl());
  return { rows: parseGoneSheetCsv(csv) };
}
