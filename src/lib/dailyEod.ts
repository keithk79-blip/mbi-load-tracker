import { isValidISODate } from "./chicagoDate";
import { fetchAllPaged, pagedErrorMessage } from "./cloud";
import { getSupabase } from "./supabase";
import type { DaySummaryCard, EndOfDaySummary } from "./totals";

export const DAILY_EOD_STORE_KEY = "chitrader.load-tracker.daily-eod-totals.v1";
export const DAILY_EOD_TABLE = "daily_eod_totals";

export const DAILY_EOD_SOURCES = ["sheet-import", "manual", "computed"] as const;
export type DailyEodSource = (typeof DAILY_EOD_SOURCES)[number];

export type DailyEodTotals = {
  date: string;
  trash: number;
  leachate: number;
  walkingFloor: number;
  loads: number;
  subs: number;
  source: DailyEodSource;
  createdAt: string;
  updatedAt: string;
};

export type DailyEodStore = Record<string, DailyEodTotals>;

export type DailyEodPersisted = {
  version: 1;
  byDate: DailyEodStore;
  seenRemoteDates?: string[];
};

export type DailyEodRow = {
  date: string;
  trash: number;
  leachate: number;
  walking_floor: number;
  loads?: number;
  /** Legacy first-cut column; still accepted on pull. */
  total_loads?: number;
  subs?: number;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyEodInput = {
  date: string;
  trash: number;
  leachate: number;
  walkingFloor: number;
  loads: number;
  subs: number;
  source?: DailyEodSource;
};

const EMPTY_PERSISTED: DailyEodPersisted = { version: 1, byDate: {} };

function parseCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

export function parseDailyEodSource(raw: unknown): DailyEodSource {
  if (raw === "manual" || raw === "computed" || raw === "sheet-import") {
    return raw;
  }
  return "sheet-import";
}

export function isDailyEodSource(raw: unknown): raw is DailyEodSource {
  return raw === "sheet-import" || raw === "manual" || raw === "computed";
}

function readIsoAt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) return null;
  return trimmed;
}

function chicagoDateKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const day = trimmed.slice(0, 10);
  return isValidISODate(day) ? day : null;
}

export function normalizeDailyEod(
  raw: Partial<DailyEodTotals> & {
    totalLoads?: unknown;
    total_loads?: unknown;
    walking_floor?: unknown;
  } | null | undefined,
): DailyEodTotals | null {
  if (!raw) return null;
  const date = chicagoDateKey(raw.date);
  const trash = parseCount(raw.trash);
  const leachate = parseCount(raw.leachate);
  const walkingFloor = parseCount(raw.walkingFloor ?? raw.walking_floor);
  const loads = parseCount(raw.loads ?? raw.totalLoads ?? raw.total_loads);
  const subs = parseCount(raw.subs) ?? 0;
  const createdAt = readIsoAt(raw.createdAt);
  const updatedAt = readIsoAt(raw.updatedAt);
  if (
    !date ||
    trash === null ||
    leachate === null ||
    walkingFloor === null ||
    loads === null ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    date,
    trash,
    leachate,
    walkingFloor,
    loads,
    subs,
    source: parseDailyEodSource(raw.source),
    createdAt,
    updatedAt,
  };
}

export function rowToDailyEod(row: DailyEodRow): DailyEodTotals | null {
  return normalizeDailyEod({
    date: row.date,
    trash: row.trash,
    leachate: row.leachate,
    walkingFloor: row.walking_floor,
    loads: row.loads,
    total_loads: row.total_loads,
    subs: row.subs,
    source: parseDailyEodSource(row.source),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function dailyEodToRow(
  row: DailyEodTotals,
  userId: string | null,
): DailyEodRow & { updated_by: string | null } {
  return {
    date: row.date,
    trash: row.trash,
    leachate: row.leachate,
    walking_floor: row.walkingFloor,
    loads: row.loads,
    subs: row.subs,
    source: row.source,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    updated_by: userId,
  };
}

export function storeFromRows(rows: DailyEodRow[]): DailyEodStore {
  const store: DailyEodStore = {};
  for (const row of rows) {
    const parsed = rowToDailyEod(row);
    if (parsed) store[parsed.date] = parsed;
  }
  return store;
}

export function totalsOn(
  store: DailyEodStore,
  date: string,
): DailyEodTotals | null {
  return store[date] ?? null;
}

export function upsertDailyEod(
  store: DailyEodStore,
  row: DailyEodTotals,
): DailyEodStore {
  const parsed = normalizeDailyEod(row);
  if (!parsed) return store;
  return { ...store, [parsed.date]: parsed };
}

export function removeDailyEod(store: DailyEodStore, date: string): DailyEodStore {
  if (!store[date]) return store;
  const next = { ...store };
  delete next[date];
  return next;
}

export function stampDailyEod(
  input: DailyEodInput,
  prev?: DailyEodTotals | null,
  now = new Date().toISOString(),
): DailyEodTotals | null {
  return normalizeDailyEod({
    date: input.date,
    trash: input.trash,
    leachate: input.leachate,
    walkingFloor: input.walkingFloor,
    loads: input.loads,
    subs: input.subs,
    source: input.source ?? prev?.source ?? "sheet-import",
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  });
}

function parseSeenDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((date): date is string => typeof date === "string" && isValidISODate(date)),
    ),
  ];
}

export function cleanDailyEodStore(raw: unknown): DailyEodStore {
  if (!raw || typeof raw !== "object") return {};
  const out: DailyEodStore = {};
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const parsed = normalizeDailyEod(value as Partial<DailyEodTotals>);
    if (parsed) out[parsed.date] = parsed;
  }
  return out;
}

export function readDailyEodPersisted(): DailyEodPersisted {
  try {
    const raw = localStorage.getItem(DAILY_EOD_STORE_KEY);
    if (!raw) return EMPTY_PERSISTED;
    const parsed = JSON.parse(raw) as DailyEodPersisted;
    if (parsed?.version !== 1 || typeof parsed.byDate !== "object") {
      return EMPTY_PERSISTED;
    }
    const seenRemoteDates = parseSeenDates(parsed.seenRemoteDates);
    return seenRemoteDates.length
      ? { version: 1, byDate: cleanDailyEodStore(parsed.byDate), seenRemoteDates }
      : { version: 1, byDate: cleanDailyEodStore(parsed.byDate) };
  } catch {
    return EMPTY_PERSISTED;
  }
}

export function writeDailyEodPersisted(store: DailyEodPersisted): void {
  const seen = parseSeenDates(store.seenRemoteDates);
  const payload: DailyEodPersisted = seen.length
    ? { version: 1, byDate: cleanDailyEodStore(store.byDate), seenRemoteDates: seen }
    : { version: 1, byDate: cleanDailyEodStore(store.byDate) };
  localStorage.setItem(DAILY_EOD_STORE_KEY, JSON.stringify(payload));
}

/**
 * Last-write-wins by `updatedAt`. Refresh never deletes cloud rows.
 * A date once seen on remote and now missing is treated as an intentional
 * SQL delete — dropped locally, never re-pushed. Local-only dates upload.
 */
export function reconcileDailyEodCloud(opts: {
  local: DailyEodStore;
  remote: DailyEodStore;
  seenRemoteDates?: Iterable<string>;
}): {
  next: DailyEodStore;
  toUpload: DailyEodTotals[];
  seenRemoteDates: string[];
} {
  const seen = new Set(parseSeenDates([...(opts.seenRemoteDates ?? [])]));
  for (const date of Object.keys(opts.remote)) seen.add(date);

  const next: DailyEodStore = {};
  const toUpload: DailyEodTotals[] = [];
  const dates = new Set([...Object.keys(opts.local), ...Object.keys(opts.remote)]);

  for (const date of dates) {
    const local = opts.local[date];
    const remote = opts.remote[date];
    if (remote && !local) {
      next[date] = remote;
      continue;
    }
    if (local && !remote) {
      if (seen.has(date)) continue;
      next[date] = local;
      toUpload.push(local);
      continue;
    }
    if (local && remote) {
      if (local.updatedAt > remote.updatedAt) {
        next[date] = local;
        toUpload.push(local);
      } else {
        next[date] = remote;
      }
    }
  }

  return { next, toUpload, seenRemoteDates: [...seen].sort() };
}

export function applyDailyEodToSummary(
  summary: EndOfDaySummary,
  snapshot: DailyEodTotals | null | undefined,
): EndOfDaySummary {
  if (!snapshot) return summary;
  return {
    ...summary,
    trash: snapshot.trash,
    leachate: snapshot.leachate,
    walkingFloor: snapshot.walkingFloor,
    loads: snapshot.loads,
    subs: snapshot.subs,
  };
}

const SNAPSHOT_CARD_COUNTS: Record<
  string,
  keyof Pick<DailyEodTotals, "trash" | "leachate" | "walkingFloor" | "loads" | "subs">
> = {
  trash: "trash",
  leachate: "leachate",
  "walking-floor": "walkingFloor",
  loads: "loads",
  subs: "subs",
};

export function isSheetEodCard(key: string): boolean {
  return key in SNAPSHOT_CARD_COUNTS;
}

export function applyDailyEodToCards(
  cards: DaySummaryCard[],
  snapshot: DailyEodTotals | null | undefined,
): DaySummaryCard[] {
  if (!snapshot) return cards;
  return cards.map((card) => {
    const field = SNAPSHOT_CARD_COUNTS[card.key];
    return field ? { ...card, count: snapshot[field] } : card;
  });
}

export function displayLoadCount(
  liveCount: number,
  snapshot: DailyEodTotals | null | undefined,
): number {
  return snapshot ? snapshot.loads : liveCount;
}

export type CloudErrorLike = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

function asCloudError(error: unknown): CloudErrorLike {
  if (!error || typeof error !== "object") return null;
  const rec = error as { code?: unknown; message?: unknown };
  return {
    code: typeof rec.code === "string" ? rec.code : null,
    message: typeof rec.message === "string" ? rec.message : null,
  };
}

export function describeDailyEodCloudError(error: unknown): string {
  const parsed = asCloudError(error);
  const raw = parsed?.message?.trim() ?? "";
  const code = parsed?.code ?? "";
  const missingTable =
    code === "PGRST205" ||
    /schema cache/i.test(raw) ||
    (/daily_eod_totals/i.test(raw) &&
      (/does not exist/i.test(raw) || /could not find the table/i.test(raw)));
  if (missingTable) {
    return "EOD totals did not reach the cloud — run Load-Tracker-daily-eod-totals.sql in Supabase once.";
  }
  return raw
    ? `EOD totals did not reach the cloud — ${raw}`
    : "EOD totals did not reach the cloud.";
}

export async function fetchDailyEodFromCloud(): Promise<{
  store: DailyEodStore | null;
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) return { store: null, error: null };
  const { data, error } = await fetchAllPaged<DailyEodRow>(async (from, to) => {
    const page = await supabase
      .from(DAILY_EOD_TABLE)
      .select("date, trash, leachate, walking_floor, loads, subs, source, created_at, updated_at")
      .order("date", { ascending: true })
      .range(from, to);
    return { data: page.data as DailyEodRow[] | null, error: page.error };
  });
  if (error || !data) {
    const message = describeDailyEodCloudError(error);
    console.warn("daily_eod_totals pull failed", pagedErrorMessage(error) ?? message);
    return { store: null, error: message };
  }
  return { store: storeFromRows(data as DailyEodRow[]), error: null };
}

export async function upsertDailyEodRows(
  rows: DailyEodTotals[],
  userId: string | null,
): Promise<string | null> {
  if (!rows.length) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase
    .from(DAILY_EOD_TABLE)
    .upsert(rows.map((row) => dailyEodToRow(row, userId)));
  if (error) {
    const message = describeDailyEodCloudError(error);
    console.warn("daily_eod_totals upsert failed", error.message ?? message);
    return message;
  }
  return null;
}
