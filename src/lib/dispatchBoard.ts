import { parseSheetDate } from "./chicagoDate.ts";

export const DISPATCH_BOARD_URL_KEY = "chitrader.load-tracker.dispatch-board-url.v1";
export const DISPATCH_BOARD_PAGES_PATH = "/api/dispatch-board";

const SPREADSHEET_ID_RE = /^[a-zA-Z0-9_-]{20,80}$/;

export type DispatchBoardTotals = {
  date: string | null;
  trash: number;
  leachate: number;
  walkingFloor: number;
  loads: number;
  subs: number;
};

/** Spreadsheet id from a full Docs URL or a bare id. */
export function extractSpreadsheetId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  const id = fromUrl?.[1] ?? trimmed;
  return SPREADSHEET_ID_RE.test(id) ? id : null;
}

export function dispatchBoardLoadsCsvUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=Loads`;
}

export function readDispatchBoardUrl(): string {
  try {
    return localStorage.getItem(DISPATCH_BOARD_URL_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function writeDispatchBoardUrl(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed) localStorage.setItem(DISPATCH_BOARD_URL_KEY, trimmed);
    else localStorage.removeItem(DISPATCH_BOARD_URL_KEY);
  } catch {
    /* private mode */
  }
}

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
 * Loads-tab footer: Total MSW + Total Tank + Total Walking-Floor = Total Loads.
 * Total Loads is always that sum so the app matches the Dispatch Board formula.
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
    throw new Error("Loads tab is missing Total MSW / Tank / Walking-Floor.");
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

export function dispatchBoardToEodInput(
  date: string,
  totals: DispatchBoardTotals,
): {
  date: string;
  trash: number;
  leachate: number;
  walkingFloor: number;
  loads: number;
  subs: number;
  source: "sheet-import";
} {
  return {
    date,
    trash: totals.trash,
    leachate: totals.leachate,
    walkingFloor: totals.walkingFloor,
    loads: totals.loads,
    subs: totals.subs,
    source: "sheet-import",
  };
}
