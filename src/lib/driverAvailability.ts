import {
  addDays,
  dateInInclusiveRange,
  parseSheetDate,
  startOfYear,
} from "./chicagoDate";

export type CallOffRow = {
  name: string;
  start: string;
  end: string | null;
  reason: string;
};

/** Dispatcher-facing type for a full-day off pill. Color only — no type text on the chip. */
export type CallOffKind =
  | "call-off"
  | "p-day"
  | "okd-off"
  | "ncns"
  | "late-early";

export const CALL_OFF_KIND_OPTIONS = [
  { kind: "call-off", label: "Call Off" },
  { kind: "p-day", label: "P-Day" },
  { kind: "okd-off", label: "Ok'd Off" },
  { kind: "ncns", label: "NCNS" },
  { kind: "late-early", label: "Late/Early" },
] as const;

/** Pill tone for each kind. CSS `.calloff-chip-*` / `.calloff-kind-*` follow these. */
export const CALL_OFF_KIND_TONES = {
  "call-off": "blue",
  "p-day": "green",
  "okd-off": "gold",
  "ncns": "red",
  "late-early": "orange",
} as const satisfies Record<CallOffKind, string>;

export type ManualCallOff = {
  name: string;
  kind: CallOffKind;
};

export type CallOffEntry = {
  name: string;
  kind: CallOffKind;
  source: "sheet" | "manual";
};

const CALL_OFF_KINDS = new Set<string>(
  CALL_OFF_KIND_OPTIONS.map((row) => row.kind),
);

export function isCallOffKind(value: unknown): value is CallOffKind {
  return typeof value === "string" && CALL_OFF_KINDS.has(value);
}

const CALL_OFF_SOURCES = new Set(["sheet", "manual"]);

export function cleanCallOffEntries(raw: unknown): CallOffEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const entries: CallOffEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { name?: unknown; kind?: unknown; source?: unknown };
    if (typeof rec.name !== "string" || !isCallOffKind(rec.kind)) continue;
    if (typeof rec.source !== "string" || !CALL_OFF_SOURCES.has(rec.source)) {
      continue;
    }
    const name = rec.name.trim();
    if (!name) continue;
    const key = callOffNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name,
      kind: rec.kind,
      source: rec.source as CallOffEntry["source"],
    });
  }
  return entries.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

/** Late/Early is orange status only — it does not reduce available / drv tallies. */
export function kindRemovesFromAvailable(kind: CallOffKind): boolean {
  return kind !== "late-early";
}

export function reasonForKind(kind: CallOffKind): string {
  switch (kind) {
    case "p-day":
      return "P-Day";
    case "okd-off":
      return "Ok'd Off";
    case "ncns":
      return "NCNS";
    case "late-early":
      return "Late/Early";
    default:
      return "Call Off";
  }
}

/** Sheet Reason → pill color. Unknown full-day reasons default to Call Off (blue). */
export function callOffKindFromReason(reason: string): CallOffKind {
  const n = normalizeReason(reason);
  if (/\bncns\b/.test(n) || /\bno[\s-]?call[\s-]?no[\s-]?show\b/.test(n)) {
    return "ncns";
  }
  if (/\bp[\s-]?days?\b/.test(n)) return "p-day";
  if (/\bok'?d (day )?off\b/.test(n)) return "okd-off";
  if (isLateEarlyReason(n)) return "late-early";
  return "call-off";
}

export function callOffNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function manualsToRows(
  manuals: readonly ManualCallOff[] | undefined,
  day: string,
): CallOffRow[] {
  if (!manuals?.length) return [];
  const rows: CallOffRow[] = [];
  for (const off of manuals) {
    const name = off.name.trim();
    if (!name || !isCallOffKind(off.kind)) continue;
    rows.push({
      name,
      start: day,
      end: null,
      reason: reasonForKind(off.kind),
    });
  }
  return rows;
}

export function withManualOffs(
  sheetRows: CallOffRow[],
  manuals: readonly ManualCallOff[] | undefined,
  day: string,
): CallOffRow[] {
  const extra = manualsToRows(manuals, day);
  return extra.length ? [...sheetRows, ...extra] : sheetRows;
}

export type DayAvailability = {
  date: string;
  /**
   * Working headcount after Full Roster status / OOT / Vacation VAC.
   * Used for available math (available = base − leftover full-day offs).
   * Not the “out of” display total.
   */
  base: number;
  offs: number;
  available: number;
  /**
   * Full Roster hired count across all yards (company drivers on the Driver
   * tab). Display denominator for “{available} out of {rosterTotal}”.
   */
  rosterTotal?: number;
  ootNames?: string[];
};

function normalizeReason(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\bok;d\b/g, "ok'd")
    .replace(/\bokd\b/g, "ok'd")
    .replace(/[^a-z0-9'/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const WORKING_RE = [
  /\bneeds? to be parked\b/,
  /\bneeds? to park\b/,
  /\bneeding to park\b/,
  /\bneed to park\b/,
  /\bparked by\b/,
  /\bparked at\b/,
  /\bto park (empty|early|by|at)\b/,
  /\bok'?d to park\b/,
  /\bok'?d to do\b/,
  /\bok'?d to come\b/,
  /\bcoming in\b/,
  /\bcome in (late|at|after)\b/,
  /\btrailer work\b/,
  /\bsign papers\b/,
];

const LATE_EARLY_RE = /\blate[\s/-]*early\b/;

const FULL_DAY_OFF_RE = [
  /\bp[\s-]?days?\b/,
  /\bcall[\s-]?offs?\b/,
  /\bfmla\b/,
  /\bok'?d (day )?off\b/,
  /\bjury\s+duty\b/,
  /\bcourt\b/,
  /\bvacation(\s+days?)?\b/,
  /\bbereavement\b/,
  /\blast\s+day\b/,
  /\bretir(?:e|ed|ing)\b/,
  /\bncns\b/,
  /\bno[\s-]?call[\s-]?no[\s-]?show\b/,
];

function isWorkingNote(normalized: string): boolean {
  return WORKING_RE.some((re) => re.test(normalized));
}

function isLateEarlyReason(normalized: string): boolean {
  return LATE_EARLY_RE.test(normalized);
}

/**
 * True when the reason should appear on the call-off list (full-day offs
 * plus Late/Early status chips). Operational notes stay off the list.
 */
export function isCallOffListReason(reason: string): boolean {
  const n = normalizeReason(reason);
  if (!n || isWorkingNote(n)) return false;
  return FULL_DAY_OFF_RE.some((re) => re.test(n)) || isLateEarlyReason(n);
}

/**
 * True only when the reason removes a driver from available / drv tallies.
 * Late/Early is orange status only and does not subtract.
 * Operational notes (park by noon, half loads, coming in late) stay on the
 * roster. Unsure reasons do not subtract.
 */
export function isFullDayOff(reason: string): boolean {
  const n = normalizeReason(reason);
  if (!n || isWorkingNote(n) || isLateEarlyReason(n)) return false;
  return FULL_DAY_OFF_RE.some((re) => re.test(n));
}

export function callOffAppliesToDay(row: CallOffRow, day: string): boolean {
  if (!isFullDayOff(row.reason)) return false;
  return dateInInclusiveRange(day, row.start, row.end);
}

function callOffListedOnDay(row: CallOffRow, day: string): boolean {
  if (!isCallOffListReason(row.reason)) return false;
  return dateInInclusiveRange(day, row.start, row.end);
}

export function fullDayOffCount(rows: CallOffRow[], day: string): number {
  const names = new Set<string>();
  for (const row of rows) {
    if (!callOffAppliesToDay(row, day)) continue;
    const key = row.name.trim().toLowerCase() || `${row.start}|${row.reason}`;
    names.add(key);
  }
  return names.size;
}

export function fullDayOffNames(rows: CallOffRow[], day: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of rows) {
    if (!callOffAppliesToDay(row, day)) continue;
    const name = row.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** Sheet full-day names plus manual adds. Sheet wins on the same name; manuals are additive. */
export function fullDayOffEntries(
  sheetRows: CallOffRow[],
  manuals: readonly ManualCallOff[] | undefined,
  day: string,
): CallOffEntry[] {
  const seen = new Set<string>();
  const entries: CallOffEntry[] = [];
  for (const row of sheetRows) {
    if (!callOffListedOnDay(row, day)) continue;
    const name = row.name.trim();
    if (!name) continue;
    const key = callOffNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      name,
      kind: callOffKindFromReason(row.reason),
      source: "sheet",
    });
  }
  for (const off of manuals ?? []) {
    const name = off.name.trim();
    if (!name || !isCallOffKind(off.kind)) continue;
    const key = callOffNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, kind: off.kind, source: "manual" });
  }
  return entries.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

export function availableDrivers(
  base: number,
  rows: CallOffRow[],
  day: string,
  rosterTotal?: number,
): DayAvailability {
  const offs = fullDayOffCount(rows, day);
  const dayAvail: DayAvailability = {
    date: day,
    base,
    offs,
    available: Math.max(0, Math.floor(base) - offs),
  };
  if (typeof rosterTotal === "number" && Number.isFinite(rosterTotal)) {
    dayAvail.rosterTotal = Math.max(0, Math.floor(rosterTotal));
  }
  return dayAvail;
}

/** Display denominator: Full Roster hired, never the reduced working base. */
export function availableOutOfTotal(
  day: Pick<DayAvailability, "base" | "rosterTotal">,
): number {
  if (typeof day.rosterTotal === "number" && Number.isFinite(day.rosterTotal)) {
    return Math.max(0, Math.floor(day.rosterTotal));
  }
  return Math.max(0, Math.floor(day.base));
}

export function formatAvailableOutOf(
  day: Pick<DayAvailability, "available" | "base" | "rosterTotal">,
  whenLabel?: string | null,
): string {
  const outOf = availableOutOfTotal(day);
  if (whenLabel === "drivers") {
    return `${day.available} out of ${outOf} drivers`;
  }
  if (whenLabel) return `${day.available} out of ${outOf} · ${whenLabel}`;
  return `${day.available} out of ${outOf}`;
}

export function averageAvailable(
  base: number,
  rows: CallOffRow[],
  start: string,
  end: string,
): number | null {
  if (base <= 0 || start > end) return null;
  let sum = 0;
  let days = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    sum += availableDrivers(base, rows, d).available;
    days += 1;
    if (days > 400) break;
  }
  return days === 0 ? null : sum / days;
}

export function ytdAverageAvailable(
  base: number,
  rows: CallOffRow[],
  today: string,
): number | null {
  return averageAvailable(base, rows, startOfYear(today), today);
}

export function parseBaseHeadcount(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function parseCallOffCsv(text: string): CallOffRow[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h === "name" || h.startsWith("name"));
  const startIdx = header.findIndex(
    (h) => h.startsWith("call off") || h === "calloff" || h === "date",
  );
  const throughIdx = header.findIndex((h) => h.includes("through"));
  const reasonIdx = header.findIndex((h) => h.startsWith("reason"));
  if (nameIdx < 0 || startIdx < 0 || reasonIdx < 0) return [];

  const rows: CallOffRow[] = [];
  for (const line of table.slice(1)) {
    const name = (line[nameIdx] ?? "").trim();
    const start = parseSheetDate(line[startIdx] ?? "");
    if (!name || !start) continue;
    const endRaw = throughIdx >= 0 ? (line[throughIdx] ?? "").trim() : "";
    const end = endRaw ? parseSheetDate(endRaw) : null;
    rows.push({
      name,
      start,
      end,
      reason: (line[reasonIdx] ?? "").trim(),
    });
  }
  return rows;
}

export function parseCsv(text: string): string[][] {
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
      } else {
        cell += ch;
      }
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
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** 0-based [name, status] columns. */
export type OotPair = readonly [nameIdx: number, statusIdx: number];

/** Burnham A:I â€” name/status pairs in B/C, E/F, H/I. */
export const BURNHAM_OOT_PAIRS: readonly OotPair[] = [
  [1, 2],
  [4, 5],
  [7, 8],
];

/** Rockford â€” B/C and E/F. */
export const ROCKFORD_OOT_PAIRS: readonly OotPair[] = [
  [1, 2],
  [4, 5],
];

/** Pontiac / ARC Drivers / Zion â€” B/C only. */
export const SINGLE_COL_OOT_PAIRS: readonly OotPair[] = [[1, 2]];

function cleanRosterName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function isOotStatus(raw: string): boolean {
  return raw.trim().toLowerCase() === "oot";
}

function sortOotNames(names: string[]): string[] {
  return names.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** Names whose matching status cell is OOT. Deduped, sorted. */
export function parseOotNames(
  csv: string,
  pairs: readonly OotPair[] = BURNHAM_OOT_PAIRS,
): string[] {
  const table = parseCsv(csv);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of table) {
    for (const [nameIdx, statusIdx] of pairs) {
      if (!isOotStatus(row[statusIdx] ?? "")) continue;
      const name = cleanRosterName(row[nameIdx] ?? "");
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return sortOotNames(names);
}

/** Merge yard lists, case-insensitive dedupe, sorted. */
export function combineOotNames(groups: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const name = cleanRosterName(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return sortOotNames(names);
}

