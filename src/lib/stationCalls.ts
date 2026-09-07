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

export type StationDayRow = {
  /** Blank until the dispatcher types a count. */
  hours: Partial<Record<StationHourKey, number>>;
  /** Blank until set; otherwise carries to next day's Start. */
  close: number | null;
};

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

function cleanCount(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function cleanRow(raw: unknown): StationDayRow {
  const row = emptyRow();
  if (!raw || typeof raw !== "object") return row;
  const obj = raw as { hours?: Record<string, unknown>; close?: unknown };
  if (obj.hours && typeof obj.hours === "object") {
    for (const hour of STATION_CALL_HOURS) {
      const n = cleanCount(obj.hours[hour.key]);
      if (n !== undefined) row.hours[hour.key] = n;
    }
  }
  const close = cleanCount(obj.close);
  row.close = close === undefined ? null : close;
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

export function writeStationCallStore(store: StationCallStore): void {
  localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, days: store }));
}

export function boardForDate(store: StationCallStore, date: string): StationDayBoard {
  return store[date] ?? emptyBoard();
}

/** Effective Close for carry-over: explicit Close, else last filled hour, else Start. */
export function effectiveClose(row: StationDayRow, start: number): number {
  if (row.close !== null && row.close !== undefined) return row.close;
  for (let i = STATION_CALL_HOURS.length - 1; i >= 0; i--) {
    const key = STATION_CALL_HOURS[i].key;
    const n = row.hours[key];
    if (n !== undefined) return n;
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
  value: number | null,
): StationCallStore {
  const board = { ...(store[date] ?? emptyBoard()) };
  const row = { ...(board[stationId] ?? emptyRow()), hours: { ...(board[stationId] ?? emptyRow()).hours } };
  if (value === null) delete row.hours[hour];
  else row.hours[hour] = value;
  board[stationId] = row;
  return { ...store, [date]: board };
}

export function setStationClose(
  store: StationCallStore,
  date: string,
  stationId: string,
  value: number | null,
): StationCallStore {
  const board = { ...(store[date] ?? emptyBoard()) };
  const prev = board[stationId] ?? emptyRow();
  board[stationId] = { ...prev, hours: { ...prev.hours }, close: value };
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
    out[row.date] = row.board ?? emptyBoard();
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
    const hours: Partial<Record<StationHourKey, number>> = {};
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
