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

/** Hour map: missing key = never set; `null` = explicit clear (tombstone). */
export type StationHourMap = Partial<Record<StationHourKey, StationCellValue | null>>;
export type StationHourAtMap = Partial<Record<StationHourKey, string>>;

export type StationDayRow = {
  /** Blank until the dispatcher types a value. `null` is an explicit clear. */
  hours: StationHourMap;
  /** Blank until set; otherwise carries to next day's Start when numeric. */
  close: StationCellValue | null;
  /** Last local/remote write per hour (ISO). Newer wins on merge, including clears. */
  hoursAt?: StationHourAtMap;
  /**
   * Last Close write (ISO). Required to tell default `close: null` (never set)
   * from an explicit Close clear.
   */
  closeAt?: string;
};

export type StationCellInput = string | number | null;

export type StationDayBoard = Record<string, StationDayRow>;
export type StationCallStore = Record<string, StationDayBoard>;

const STORE_KEY = "chitrader.load-tracker.station-calls.v1";

/** In-memory clear tombstones: `${date}|${stationId}|${hour|close}`. */
const memoryCleared = new Set<string>();

function emptyRow(): StationDayRow {
  return { hours: {}, close: null };
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

export function stationCallClearKey(
  date: string,
  stationId: string,
  col: StationHourKey | "close",
): string {
  return `${date}|${stationId}|${col}`;
}

export function rememberStationCellWrite(
  date: string,
  stationId: string,
  col: StationHourKey | "close",
  empty: boolean,
): void {
  const key = stationCallClearKey(date, stationId, col);
  if (empty) memoryCleared.add(key);
  else memoryCleared.delete(key);
}

export function resetStationCallTombstones(): void {
  memoryCleared.clear();
}

function parseClearedKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === "string" && k.includes("|"));
}

function parseClearKey(
  key: string,
): { date: string; stationId: string; col: StationHourKey | "close" } | null {
  const parts = key.split("|");
  if (parts.length !== 3) return null;
  const [date, stationId, col] = parts;
  if (!date || !stationId || !col) return null;
  if (col === "close") return { date, stationId, col };
  if (STATION_CALL_HOURS.some((h) => h.key === col)) {
    return { date, stationId, col: col as StationHourKey };
  }
  return null;
}

/** Force tombstoned hour/Close cells blank — same role as specialty deletedIds. */
export function applyStationCallTombstones(
  store: StationCallStore,
  keys: Iterable<string> = memoryCleared,
): StationCallStore {
  const drop = [...keys];
  if (drop.length === 0) return store;
  const out: StationCallStore = { ...store };
  for (const key of drop) {
    const parsed = parseClearKey(key);
    if (!parsed) continue;
    const { date, stationId, col } = parsed;
    const board = { ...(out[date] ?? emptyBoard()) };
    const row = cloneRow(board[stationId] ?? emptyRow());
    if (col === "close") {
      row.close = null;
      row.closeAt = row.closeAt ?? nowIso();
    } else {
      row.hours[col] = null;
      row.hoursAt = { ...row.hoursAt, [col]: row.hoursAt?.[col] ?? nowIso() };
    }
    board[stationId] = row;
    out[date] = board;
  }
  return out;
}

/** Drop tombstones once remote is also blank so they cannot linger forever. */
export function gcStationCallTombstones(remote: StationCallStore): void {
  for (const key of [...memoryCleared]) {
    const parsed = parseClearKey(key);
    if (!parsed) {
      memoryCleared.delete(key);
      continue;
    }
    const row = remote[parsed.date]?.[parsed.stationId];
    if (!row) continue;
    const filled =
      parsed.col === "close"
        ? stationCellFilled(row.close)
        : stationCellFilled(row.hours[parsed.col]);
    if (!filled) memoryCleared.delete(key);
  }
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

/** True when the cell shows a value (not blank / tombstone). */
export function stationCellFilled(
  raw: StationCellValue | null | undefined,
): raw is StationCellValue {
  return raw != null && String(raw).trim() !== "";
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

/** Hour storage: missing = never set, `null` = explicit clear, string = value. */
function readHourCell(raw: unknown): StationCellValue | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  return normalizeStationCell(raw);
}

function readIsoAt(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function cloneRow(row: StationDayRow): StationDayRow {
  return {
    hours: { ...row.hours },
    close: row.close,
    hoursAt: row.hoursAt ? { ...row.hoursAt } : undefined,
    closeAt: row.closeAt,
  };
}

function cleanRow(raw: unknown): StationDayRow {
  const row = emptyRow();
  if (!raw || typeof raw !== "object") return row;
  const obj = raw as {
    hours?: Record<string, unknown>;
    close?: unknown;
    hoursAt?: Record<string, unknown>;
    closeAt?: unknown;
  };
  if (obj.hours && typeof obj.hours === "object") {
    for (const hour of STATION_CALL_HOURS) {
      const cell = readHourCell(obj.hours[hour.key]);
      if (cell !== undefined) row.hours[hour.key] = cell;
    }
  }
  row.close = normalizeStationCell(obj.close) ?? null;
  if (obj.hoursAt && typeof obj.hoursAt === "object") {
    const hoursAt: StationHourAtMap = {};
    for (const hour of STATION_CALL_HOURS) {
      const at = readIsoAt(obj.hoursAt[hour.key]);
      if (at) hoursAt[hour.key] = at;
    }
    if (Object.keys(hoursAt).length) row.hoursAt = hoursAt;
  }
  const closeAt = readIsoAt(obj.closeAt);
  if (closeAt) row.closeAt = closeAt;
  return row;
}

export function readStationCallStore(): StationCallStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      version?: number;
      days?: StationCallStore;
      cleared?: unknown;
    };
    if (parsed?.version !== 1 || !parsed.days || typeof parsed.days !== "object") return {};
    for (const k of parseClearedKeys(parsed.cleared)) memoryCleared.add(k);
    const out: StationCallStore = {};
    for (const [date, board] of Object.entries(parsed.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !board || typeof board !== "object") continue;
      const day = emptyBoard();
      for (const yard of STATION_CALL_YARDS) {
        day[yard.id] = cleanRow((board as StationDayBoard)[yard.id]);
      }
      out[date] = day;
    }
    return applyStationCallTombstones(out);
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
  const days = applyStationCallTombstones(store);
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ version: 1, days, cleared: [...memoryCleared] }),
  );
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
  at?: string,
): StationCallStore {
  const board = { ...(store[date] ?? emptyBoard()) };
  const row = cloneRow(board[stationId] ?? emptyRow());
  const stamp = nowIso(at);
  const cell = value === null ? null : (normalizeStationCell(value) ?? null);
  row.hours[hour] = cell;
  row.hoursAt = { ...row.hoursAt, [hour]: stamp };
  rememberStationCellWrite(date, stationId, hour, cell === null);
  board[stationId] = row;
  return { ...store, [date]: board };
}

export function setStationClose(
  store: StationCallStore,
  date: string,
  stationId: string,
  value: StationCellInput,
  at?: string,
): StationCallStore {
  const board = { ...(store[date] ?? emptyBoard()) };
  const prev = cloneRow(board[stationId] ?? emptyRow());
  const stamp = nowIso(at);
  const close = value === null ? null : (normalizeStationCell(value) ?? null);
  rememberStationCellWrite(date, stationId, "close", close === null);
  board[stationId] = {
    ...prev,
    close,
    closeAt: stamp,
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

type CellPick = {
  value: StationCellValue | null | undefined;
  at?: string;
};

/**
 * Last-write-wins by ISO timestamp. Missing timestamps sort as oldest.
 * When tied: a local `null` tombstone beats a stale remote fill (the hour-grid
 * bounce after PR #18). Close uses the same picker after mapping "never set"
 * (`close: null` without `closeAt`) to undefined so default blanks don't look
 * like clears.
 */
export function pickMergedCell(
  lv: StationCellValue | null | undefined,
  rv: StationCellValue | null | undefined,
  lAt?: string,
  rAt?: string,
): CellPick {
  const lt = lAt ?? "";
  const rt = rAt ?? "";
  if (lt > rt) return { value: lv, at: lAt };
  if (rt > lt) return { value: rv, at: rAt };
  if (lv === null) return { value: null, at: lAt || rAt };
  if (lv !== undefined && lv !== null) {
    if (rv !== undefined && rv !== null) return { value: rv, at: rAt };
    return { value: lv, at: lAt };
  }
  if (rv === null) return { value: null, at: rAt };
  if (rv !== undefined) return { value: rv, at: rAt };
  return { value: undefined };
}

function closeMergeInput(row: StationDayRow): CellPick {
  if (row.close === null && !row.closeAt) return { value: undefined };
  return { value: row.close, at: row.closeAt };
}

function cellsVisuallyEqual(
  a: StationCellValue | null | undefined,
  b: StationCellValue | null | undefined,
): boolean {
  return (normalizeStationCell(a) ?? null) === (normalizeStationCell(b) ?? null);
}

/** True when two boards show the same hour/Close values (null and missing both blank). */
export function boardsEquivalent(a: StationDayBoard, b: StationDayBoard): boolean {
  for (const yard of STATION_CALL_YARDS) {
    const la = a[yard.id] ?? emptyRow();
    const lb = b[yard.id] ?? emptyRow();
    if (!cellsVisuallyEqual(la.close, lb.close)) return false;
    for (const hour of STATION_CALL_HOURS) {
      if (!cellsVisuallyEqual(la.hours[hour.key], lb.hours[hour.key])) return false;
    }
  }
  return true;
}

export function hasExplicitClears(board: StationDayBoard): boolean {
  for (const yard of STATION_CALL_YARDS) {
    const row = board[yard.id] ?? emptyRow();
    if (row.close === null && row.closeAt) return true;
    for (const hour of STATION_CALL_HOURS) {
      if (row.hours[hour.key] === null) return true;
    }
  }
  return false;
}

function applyPickToHours(
  hours: StationHourMap,
  hoursAt: StationHourAtMap,
  hour: StationHourKey,
  picked: CellPick,
): void {
  if (picked.value === undefined) return;
  hours[hour] = picked.value;
  if (picked.at) hoursAt[hour] = picked.at;
}

/** Per yard/hour: newer timestamp wins (clears included). Tied: local null tombstone wins. */
export function mergeBoardCells(
  local: StationDayBoard,
  remote: StationDayBoard,
): StationDayBoard {
  const out = emptyBoard();
  for (const yard of STATION_CALL_YARDS) {
    const l = local[yard.id] ?? emptyRow();
    const r = remote[yard.id] ?? emptyRow();
    const hours: StationHourMap = {};
    const hoursAt: StationHourAtMap = {};
    for (const hour of STATION_CALL_HOURS) {
      const picked = pickMergedCell(
        l.hours[hour.key],
        r.hours[hour.key],
        l.hoursAt?.[hour.key],
        r.hoursAt?.[hour.key],
      );
      applyPickToHours(hours, hoursAt, hour.key, picked);
    }
    const lClose = closeMergeInput(l);
    const rClose = closeMergeInput(r);
    const closePick = pickMergedCell(lClose.value, rClose.value, lClose.at, rClose.at);
    const row: StationDayRow = {
      hours,
      close: closePick.value === undefined ? null : closePick.value,
    };
    if (Object.keys(hoursAt).length) row.hoursAt = hoursAt;
    if (closePick.at) row.closeAt = closePick.at;
    out[yard.id] = row;
  }
  return out;
}

/** Filled hour cells + non-null closes — used to decide which board to push. */
export function boardFillScore(board: StationDayBoard): number {
  let score = 0;
  for (const yard of STATION_CALL_YARDS) {
    const row = board[yard.id] ?? emptyRow();
    for (const hour of STATION_CALL_HOURS) {
      if (stationCellFilled(row.hours[hour.key])) score += 1;
    }
    if (stationCellFilled(row.close)) score += 1;
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

export type StationCallReconcile = {
  merged: StationCallStore;
  toPush: { date: string; board: StationDayBoard }[];
};

/**
 * Union local + remote, then list dates that must be pushed so a local clear
 * (or local-only fills) lands in cloud instead of bouncing on the next hydrate.
 */
export function reconcileStationCallCloud(
  local: StationCallStore,
  remote: StationCallStore,
): StationCallReconcile {
  const merged = applyStationCallTombstones(mergeStationCallStores(local, remote));
  const toPush: { date: string; board: StationDayBoard }[] = [];
  for (const [date, board] of Object.entries(merged)) {
    const remoteBoard = remote[date];
    if (!remoteBoard) {
      if (boardFillScore(board) === 0 && !hasExplicitClears(board)) continue;
      toPush.push({ date, board });
      continue;
    }
    if (!boardsEquivalent(board, remoteBoard)) toPush.push({ date, board });
  }
  gcStationCallTombstones(remote);
  return { merged, toPush };
}
