import { parseSheetDate } from "./chicagoDate.ts";

export type DispatchBoardTotals = {
  date: string | null;
  trash: number;
  leachate: number;
  walkingFloor: number;
  loads: number;
  subs: number;
};

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function firstNumber(cells: readonly string[]): number | null {
  for (const raw of cells.slice(1)) {
    const trimmed = raw.replace(/,/g, "").trim();
    if (!trimmed) continue;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

function labelKey(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Loads footer: Total MSW + Total Tank + Total Walking-Floor = Total Loads.
 * Total Loads is always that sum.
 */
export function parseDispatchBoardLoadsCsv(csv: string): DispatchBoardTotals {
  const rows = parseCsvRows(csv);
  let date: string | null = null;
  let trash: number | null = null;
  let leachate: number | null = null;
  let walkingFloor: number | null = null;
  let subs: number | null = null;
  for (const row of rows) {
    if (!row.length) continue;
    if (!date) date = parseSheetDate(row[0] ?? "");
    const label = labelKey(row[0] ?? "");
    if (label === "total msw") trash = firstNumber(row);
    else if (label === "total tank loads") leachate = firstNumber(row);
    else if (label === "total walking-floor loads" || label === "total walking floor loads") {
      walkingFloor = firstNumber(row);
    } else if (label === "total sub loads") subs = firstNumber(row);
  }
  if (trash === null || leachate === null || walkingFloor === null) {
    throw new Error("Loads footer is missing Total MSW / Tank / Walking-Floor.");
  }
  return {
    date,
    trash,
    leachate,
    walkingFloor,
    loads: trash + leachate + walkingFloor,
    subs: subs ?? 0,
  };
}
