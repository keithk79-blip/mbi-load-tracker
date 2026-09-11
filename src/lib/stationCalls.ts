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

/** Per-station note (all dates). `null` + `noteAt` is an explicit clear. */
export type StationNoteRow = {
  note: string | null;
  noteAt?: string;
};

export type StationNoteStore = Record<string, StationNoteRow>;

export type StationCellInput = string | number | null;

export type StationDayBoard = Record<string, StationDayRow>;
export type StationCallStore = Record<string, StationDayBoard>;

const STORE_KEY = "chitrader.load-tracker.station-calls.v1";
const NOTES_STORE_KEY = "chitrader.load-tracker.station-call-notes.v1";

/** In-memory clear tombstones: `${date}|${stationId}|${hour|close}`. */
const memoryCleared = new Set<string>();

function emptyRow(): StationDayRow {
  return { hours: {}, close: null };
}

function knownStationId(id: string): boolean {
  return STATION_CALL_YARDS.some((yard) => yard.id === id);
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

const NOTE_MAX_LEN = 2000;

/** Trimmed note for save: empty/whitespace → null so the marker stays quiet. */
export function commitStationNote(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  return t.length > NOTE_MAX_LEN ? t.slice(0, NOTE_MAX_LEN) : t;
}

function readNote(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return commitStationNote(String(raw));
  }
  return commitStationNote(String(raw));
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

/** Public parse for tests and any future import of a board row. */
export function cleanStationDayRow(raw: unknown): StationDayRow {
  return cleanRow(raw);
}

type LegacyNotePick = StationNoteRow & { date: string };

function considerLegacyNote(
  out: Record<string, LegacyNotePick>,
  stationId: string,
  date: string,
  rawRow: unknown,
): void {
  if (!knownStationId(stationId) || !rawRow || typeof rawRow !== "object") return;
  const obj = rawRow as { note?: unknown; noteAt?: unknown };
  const note = readNote(obj.note);
  if (!stationCellFilled(note)) return;
  const noteAt = readIsoAt(obj.noteAt);
  const prev = out[stationId];
  const prevAt = prev?.noteAt ?? "";
  const nextAt = noteAt ?? "";
  if (prev && stationCellFilled(prev.note)) {
    if (nextAt < prevAt) return;
    if (nextAt === prevAt && date < prev.date) return;
  }
  out[stationId] = { note, noteAt, date };
}

/**
 * Newest non-empty `note` per station from PR #36 per-date boards.
 * Used once to seed the global note store; empty/cleared date rows are skipped.
 */
export function extractStationNotesFromRawDays(days: unknown): StationNoteStore {
  const picked: Record<string, LegacyNotePick> = {};
  if (!days || typeof days !== "object") return {};
  for (const [date, board] of Object.entries(days as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !board || typeof board !== "object") continue;
    for (const [stationId, rawRow] of Object.entries(board as Record<string, unknown>)) {
      considerLegacyNote(picked, stationId, date, rawRow);
    }
  }
  const out: StationNoteStore = {};
  for (const [stationId, row] of Object.entries(picked)) {
    const next: StationNoteRow = { note: row.note };
    if (row.noteAt) next.noteAt = row.noteAt;
    out[stationId] = next;
  }
  return out;
}

/** True when this station already has a global note or an explicit clear. */
export function stationNoteInitialized(row: StationNoteRow | undefined): boolean {
  if (!row) return false;
  if (row.noteAt) return true;
  return stationCellFilled(row.note);
}

/**
 * Fill empty global slots from extracted per-date notes. Explicit clears
 * (`note: null` + `noteAt`) are left alone so a deleted note does not come back.
 */
export function seedStationNotes(
  notes: StationNoteStore,
  legacy: StationNoteStore,
): StationNoteStore {
  const out: StationNoteStore = { ...notes };
  for (const [stationId, row] of Object.entries(legacy)) {
    if (!knownStationId(stationId) || !stationCellFilled(row.note)) continue;
    if (stationNoteInitialized(out[stationId])) continue;
    out[stationId] = {
      note: row.note,
      noteAt: row.noteAt ?? nowIso(),
    };
  }
  return out;
}

function cleanNoteRow(raw: unknown): StationNoteRow | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { note?: unknown; noteAt?: unknown };
  const noteAt = readIsoAt(obj.noteAt);
  const note = obj.note === undefined && !noteAt ? null : readNote(obj.note);
  if (!noteAt && !stationCellFilled(note)) return null;
  const row: StationNoteRow = { note };
  if (noteAt) row.noteAt = noteAt;
  return row;
}

export function noteForStation(notes: StationNoteStore, stationId: string): string | null {
  return notes[stationId]?.note ?? null;
}

export function readLegacyNotesFromStationCallStorage(): StationNoteStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: number; days?: unknown };
    if (parsed?.version !== 1) return {};
    return extractStationNotesFromRawDays(parsed.days);
  } catch {
    return {};
  }
}

export function readStationNoteStore(): StationNoteStore {
  try {
    const raw = localStorage.getItem(NOTES_STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { version?: number; notes?: unknown };
    if (parsed?.version !== 1 || !parsed.notes || typeof parsed.notes !== "object") {
      return {};
    }
    const out: StationNoteStore = {};
    for (const [stationId, rawRow] of Object.entries(parsed.notes as Record<string, unknown>)) {
      if (!knownStationId(stationId)) continue;
      const row = cleanNoteRow(rawRow);
      if (row) out[stationId] = row;
    }
    return out;
  } catch {
    return {};
  }
}

type StationNoteListener = () => void;
const stationNoteListeners = new Set<StationNoteListener>();

export function subscribeStationNoteStore(listener: StationNoteListener): () => void {
  stationNoteListeners.add(listener);
  return () => {
    stationNoteListeners.delete(listener);
  };
}

export function writeStationNoteStore(notes: StationNoteStore): void {
  const cleaned: StationNoteStore = {};
  for (const yard of STATION_CALL_YARDS) {
    const row = cleanNoteRow(notes[yard.id]);
    if (row) cleaned[yard.id] = row;
  }
  localStorage.setItem(NOTES_STORE_KEY, JSON.stringify({ version: 1, notes: cleaned }));
  for (const listener of stationNoteListeners) listener();
}

export function loadStationNotes(): StationNoteStore {
  const seeded = seedStationNotes(
    readStationNoteStore(),
    readLegacyNotesFromStationCallStorage(),
  );
  writeStationNoteStore(seeded);
  return seeded;
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

export function setStationNote(
  notes: StationNoteStore,
  stationId: string,
  value: string | null,
  at?: string,
): StationNoteStore {
  if (!knownStationId(stationId)) return notes;
  const stamp = nowIso(at);
  const note = value === null ? null : commitStationNote(value);
  return {
    ...notes,
    [stationId]: { note, noteAt: stamp },
  };
}

export type StationCallCloudPull = {
  days: StationCallStore;
  legacyNotes: StationNoteStore;
};

export async function fetchStationCallStoreFromCloud(): Promise<StationCallCloudPull | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("station_call_days")
    .select("date, board, updated_at");
  if (error || !data) {
    console.warn("station_call_days pull failed", error?.message);
    return null;
  }
  const days: StationCallStore = {};
  const rawDays: Record<string, unknown> = {};
  for (const row of data as { date: string; board: unknown }[]) {
    const day = emptyBoard();
    const board = row.board;
    rawDays[row.date] = board;
    if (board && typeof board === "object") {
      for (const yard of STATION_CALL_YARDS) {
        day[yard.id] = cleanRow((board as StationDayBoard)[yard.id]);
      }
    }
    days[row.date] = day;
  }
  return { days, legacyNotes: extractStationNotesFromRawDays(rawDays) };
}

export async function fetchStationNotesFromCloud(): Promise<StationNoteStore | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("station_call_notes")
    .select("station_id, note, updated_at");
  if (error || !data) {
    console.warn("station_call_notes pull failed", error?.message);
    return null;
  }
  const out: StationNoteStore = {};
  for (const row of data as { station_id: string; note: unknown; updated_at: unknown }[]) {
    if (!knownStationId(row.station_id)) continue;
    const noteAt = readIsoAt(row.updated_at);
    const note = readNote(row.note);
    if (!noteAt && !stationCellFilled(note)) continue;
    const next: StationNoteRow = { note };
    if (noteAt) next.noteAt = noteAt;
    out[row.station_id] = next;
  }
  return out;
}

export async function pushStationNote(
  stationId: string,
  row: StationNoteRow,
  userId: string | null,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("station_call_notes").upsert({
    station_id: stationId,
    note: row.note,
    updated_at: row.noteAt ?? nowIso(),
    updated_by: userId,
  });
  if (error) console.warn("station_call_notes push failed", error.message);
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

function noteRowMergeInput(row: StationNoteRow | undefined): CellPick {
  if (!row) return { value: undefined };
  if ((row.note === null || row.note === undefined) && !row.noteAt) {
    return { value: undefined };
  }
  return { value: row.note ?? null, at: row.noteAt };
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

export function notesEquivalent(
  a: StationNoteRow | undefined,
  b: StationNoteRow | undefined,
): boolean {
  return cellsVisuallyEqual(a?.note, b?.note);
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

export function mergeStationNoteStores(
  local: StationNoteStore,
  remote: StationNoteStore,
): StationNoteStore {
  const ids = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: StationNoteStore = {};
  for (const id of ids) {
    if (!knownStationId(id)) continue;
    const l = noteRowMergeInput(local[id]);
    const r = noteRowMergeInput(remote[id]);
    const picked = pickMergedCell(l.value, r.value, l.at, r.at);
    if (picked.value === undefined) continue;
    const row: StationNoteRow = { note: picked.value };
    if (picked.at) row.noteAt = picked.at;
    out[id] = row;
  }
  return out;
}

export type StationNoteReconcile = {
  merged: StationNoteStore;
  toPush: { stationId: string; row: StationNoteRow }[];
};

export function reconcileStationNotesCloud(
  local: StationNoteStore,
  remote: StationNoteStore,
  legacy: StationNoteStore = {},
): StationNoteReconcile {
  const merged = seedStationNotes(mergeStationNoteStores(local, remote), legacy);
  const toPush: { stationId: string; row: StationNoteRow }[] = [];
  for (const yard of STATION_CALL_YARDS) {
    const row = merged[yard.id];
    if (!row || !stationNoteInitialized(row)) continue;
    const remoteRow = remote[yard.id];
    if (!remoteRow || !notesEquivalent(row, remoteRow)) {
      toPush.push({ stationId: yard.id, row });
    }
  }
  return { merged, toPush };
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
