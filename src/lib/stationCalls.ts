import { addDays } from "./chicagoDate";
import { getSupabase } from "./supabase";

export const STATION_CALL_YARDS = [
  { id: "c-heights", label: "C. Heights" },
  { id: "calumet", label: "Calumet" },
  { id: "apollo", label: "Apollo" },
  { id: "medill", label: "Medill" },
  { id: "lrs", label: "LRS" },
  { id: "schererville", label: "Schererville" },
  { id: "arc", label: "Arc" },
  { id: "northlake", label: "Northlake" },
  { id: "melrose", label: "Melrose" },
  { id: "batavia", label: "Batavia" },
  { id: "elgin", label: "Elgin" },
  { id: "evanston", label: "Evanston" },
  { id: "hooker", label: "Hooker" },
  { id: "wheeling", label: "Wheeling" },
  { id: "tri-state", label: "Tri-State" },
  { id: "citiwaste", label: "Citiwaste" },
  { id: "roscoe", label: "Roscoe" },
] as const;

export type StationCallId = (typeof STATION_CALL_YARDS)[number]["id"];

/** Next/previous yard in table order. Null at either end (Enter should blur). */
export function adjacentStationId(stationId: string, delta: 1 | -1): string | null {
  const i = STATION_CALL_YARDS.findIndex((y) => y.id === stationId);
  if (i < 0) return null;
  return STATION_CALL_YARDS[i + delta]?.id ?? null;
}

/** Hour slots after Start, before Close. */
export const STATION_CALL_HOURS = [
  { key: "6", label: "6am" },
  { key: "7", label: "7am" },
  { key: "8", label: "8am" },
  { key: "9", label: "9am" },
  { key: "10", label: "10am" },
  { key: "11", label: "11am" },
  { key: "12", label: "12pm" },
  { key: "13", label: "1pm" },
  { key: "14", label: "2pm" },
  { key: "15", label: "3pm" },
] as const;

export type StationHourKey = (typeof STATION_CALL_HOURS)[number]["key"];

/** Hour/Close cell: free text (empty, decimals, letters). Numeric summaries parse when possible. */
export type StationCellValue = string;

export type StationDayRow = {
  /** Blank until the dispatcher types a value. */
  hours: Partial<Record<StationHourKey, StationCellValue>>;
  /** Blank until set; otherwise carries to next day's Start when numeric. */
  close: StationCellValue | null;
};

export type StationCellInput = string | number | null;

export type StationDayBoard = Record<string, StationDayRow>;
export type StationCallStore = Record<string, StationDayBoard>;

const STORE_KEY = "chitrader.load-tracker.station-calls.v1";

function emptyRow(): StationDayRow {
  return { hours: {}, close: null };
}

export function emptyBoard(): StationDayBoard {
  const board: StationDayBoard = {};
  for (const yard of STATION_CALL_YARDS) board[yard.id] = emptyRow();
  return board;
}

/** Persist empty as blank; keep decimals and letters. Numbers from older stores become strings. */
export function normalizeStationCell(raw: unknown): StationCellValue | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return undefined;
    return String(raw);
  }
  const t = String(raw).trim();
  if (t === "") return undefined;
  return t;
}

/** Trimmed cell for save: empty/whitespace → null so the grid stays blank. */
export function commitStationCell(raw: string): StationCellValue | null {
  return normalizeStationCell(raw) ?? null;
}

/** Numeric Close/Start/summaries: parse when the whole value is a finite number. */
export function parseNumericCell(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const t = String(raw).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function cleanRow(raw: unknown): StationDayRow {
  const row = emptyRow();
  if (!raw || typeof raw !== "object") return row;
  const obj = raw as { hours?: Record<string, unknown>; close?: unknown };
  if (obj.hours && typeof obj.hours === "object") {
    for (const hour of STATION_CALL_HOURS) {
      const cell = normalizeStationCell(obj.hours[hour.key]);
      if (cell !== undefined) row.hours[hour.key] = cell;
    }
  }
  row.close = normalizeStationCell(obj.close) ?? null;
  return row;
}

export function readStationCallStore(): StationCallStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: number; days?: StationCallStore };
    if (parsed?.version !== 1 || !parsed.days || typeof parsed.days !== "object") return {};
    const out: StationCallStore = {};
    for (const [date, board] of Object.entries(parsed.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !board || typeof board !== "object") continue;
      const day = emptyBoard();
      for (const yard of STATION_CALL_YARDS) {
        day[yard.id] = cleanRow((board as StationDayBoard)[yard.id]);
      }
      out[date] = day;
    }
    return out;
  } catch {
    return {};
  }
}

type StationCallListener = () => void;
const stationCallListeners = new Set<StationCallListener>();

export function subscribeStationCallStore(listener: StationCallListener): () => void {
  stationCallListeners.add(listener);
  return () => {
    stationCallListeners.delete(listener);
  };
}

export function writeStationCallStore(store: StationCallStore): void {
  localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, days: store }));
  for (const listener of stationCallListeners) listener();
}

export function boardForDate(store: StationCallStore, date: string): StationDayBoard {
  return store[date] ?? emptyBoard();
}

/** Effective Close for carry-over: numeric Close, else last numeric hour, else Start. */
export function effectiveClose(row: StationDayRow, start: number): number {
  const closeN = parseNumericCell(row.close);
  if (closeN !== null) return closeN;
  for (let i = STATION_CALL_HOURS.length - 1; i >= 0; i--) {
    const n = parseNumericCell(row.hours[STATION_CALL_HOURS[i].key]);
    if (n !== null) return n;
  }
  return start;
}

/** Start for `date` = prior Chicago day's Close (or last hour that day). 0 if none. */
export function startForStation(
  store: StationCallStore,
  date: string,
  stationId: string,
): number {
  const prior = addDays(date, -1);
  const priorBoard = store[prior];
  if (!priorBoard) return 0;
  const priorRow = priorBoard[stationId] ?? emptyRow();
  return effectiveClose(priorRow, 0);
}

export function setStationHour(
  store: StationCallStore,
  date: string,
  stationId: string,
  hour: StationHourKey,
  value: StationCellInput,
): StationCallStore {
  const board = { ...(store[date] ?? emptyBoard()) };
  const row = { ...(board[stationId] ?? emptyRow()), hours: { ...(board[stationId] ?? emptyRow()).hours } };
  const cell = value === null ? undefined : normalizeStationCell(value);
  if (cell === undefined) delete row.hours[hour];
  else row.hours[hour] = cell;
  board[stationId] = row;
  return { ...store, [date]: board };
}

export function setStationClose(
  store: StationCallStore,
  date: string,
  stationId: string,
  value: StationCellInput,
): StationCallStore {
  const board = { ...(store[date] ?? emptyBoard()) };
  const prev = board[stationId] ?? emptyRow();
  board[stationId] = {
    ...prev,
    hours: { ...prev.hours },
    close: value === null ? null : (normalizeStationCell(value) ?? null),
  };
  return { ...store, [date]: board };
}

export async function fetchStationCallStoreFromCloud(): Promise<StationCallStore | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("station_call_days")
    .select("date, board, updated_at");
  if (error || !data) {
    console.warn("station_call_days pull failed", error?.message);
    return null;
  }
  const out: StationCallStore = {};
  for (const row of data as { date: string; board: StationDayBoard }[]) {
    const day = emptyBoard();
    const board = row.board;
    if (board && typeof board === "object") {
      for (const yard of STATION_CALL_YARDS) {
        day[yard.id] = cleanRow(board[yard.id]);
      }
    }
    out[row.date] = day;
  }
  return out;
}

export async function pushStationCallDay(
  date: string,
  board: StationDayBoard,
  userId: string | null,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("station_call_days").upsert({
    date,
    board,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
  if (error) console.warn("station_call_days push failed", error.message);
}

/** Per yard/hour: remote if defined, else local. Close: remote if not null else local. */
export function mergeBoardCells(
  local: StationDayBoard,
  remote: StationDayBoard,
): StationDayBoard {
  const out = emptyBoard();
  for (const yard of STATION_CALL_YARDS) {
    const l = local[yard.id] ?? emptyRow();
    const r = remote[yard.id] ?? emptyRow();
    const hours: Partial<Record<StationHourKey, StationCellValue>> = {};
    for (const hour of STATION_CALL_HOURS) {
      const rv = r.hours[hour.key];
      const lv = l.hours[hour.key];
      if (rv !== undefined) hours[hour.key] = rv;
      else if (lv !== undefined) hours[hour.key] = lv;
    }
    const close = r.close !== null && r.close !== undefined ? r.close : l.close;
    out[yard.id] = { hours, close };
  }
  return out;
}

/** Filled hour cells + non-null closes — used to decide which board to push. */
export function boardFillScore(board: StationDayBoard): number {
  let score = 0;
  for (const yard of STATION_CALL_YARDS) {
    const row = board[yard.id] ?? emptyRow();
    for (const hour of STATION_CALL_HOURS) {
      if (row.hours[hour.key] !== undefined) score += 1;
    }
    if (row.close !== null && row.close !== undefined) score += 1;
  }
  return score;
}

export function mergeStationCallStores(
  local: StationCallStore,
  remote: StationCallStore,
): StationCallStore {
  const dates = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: StationCallStore = {};
  for (const date of dates) {
    const l = local[date];
    const r = remote[date];
    if (l && r) out[date] = mergeBoardCells(l, r);
    else out[date] = r ?? l ?? emptyBoard();
  }
  return out;
}
