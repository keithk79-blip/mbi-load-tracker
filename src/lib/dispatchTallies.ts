/**
 * Manual per-day dispatch tallies shown on Today next to "+ Log load":
 * - bataviaPreload: trailers preloaded at Batavia the night before,
 *   counted down by 1 each time one gets picked up.
 * - evanstonAsking: loads Evanston said the night before they need
 *   picked up the next day.
 * Local persist + Supabase, last-write-wins by updatedAt (mirrors dailyEod.ts).
 */

import { isValidISODate } from "./chicagoDate";
import { fetchAllPaged, pagedErrorMessage } from "./cloud";
import { getSupabase } from "./supabase";

export const DISPATCH_TALLIES_STORE_KEY = "chitrader.load-tracker.dispatch-tallies.v1";
export const DISPATCH_TALLIES_TABLE = "day_dispatch_tallies";

export type DispatchTallies = {
  date: string;
  bataviaPreload: number;
  evanstonAsking: number;
  updatedAt: string;
};

export type DispatchTalliesStore = Record<string, DispatchTallies>;

export type DispatchTalliesPersisted = {
  version: 1;
  byDate: DispatchTalliesStore;
  seenRemoteDates?: string[];
};

export type DispatchTalliesRow = {
  date: string;
  batavia_preload: number;
  evanston_asking: number;
  updated_at: string;
};

const EMPTY_PERSISTED: DispatchTalliesPersisted = { version: 1, byDate: {} };

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

export function normalizeDispatchTallies(
  raw:
    | (Partial<DispatchTallies> & { batavia_preload?: unknown; evanston_asking?: unknown })
    | null
    | undefined,
): DispatchTallies | null {
  if (!raw) return null;
  const date = chicagoDateKey(raw.date);
  const bataviaPreload = parseCount(raw.bataviaPreload ?? raw.batavia_preload) ?? 0;
  const evanstonAsking = parseCount(raw.evanstonAsking ?? raw.evanston_asking) ?? 0;
  const updatedAt = readIsoAt(raw.updatedAt) ?? new Date().toISOString();
  if (!date) return null;
  return { date, bataviaPreload, evanstonAsking, updatedAt };
}

export function rowToDispatchTallies(row: DispatchTalliesRow): DispatchTallies | null {
  return normalizeDispatchTallies({
    date: row.date,
    bataviaPreload: row.batavia_preload,
    evanstonAsking: row.evanston_asking,
    updatedAt: row.updated_at,
  });
}

export function dispatchTalliesToRow(
  row: DispatchTallies,
  userId: string | null,
): DispatchTalliesRow & { updated_by: string | null } {
  return {
    date: row.date,
    batavia_preload: row.bataviaPreload,
    evanston_asking: row.evanstonAsking,
    updated_at: row.updatedAt,
    updated_by: userId,
  };
}

export function storeFromRows(rows: DispatchTalliesRow[]): DispatchTalliesStore {
  const store: DispatchTalliesStore = {};
  for (const row of rows) {
    const parsed = rowToDispatchTallies(row);
    if (parsed) store[parsed.date] = parsed;
  }
  return store;
}

/** Always returns a usable record — zeros when nothing is set for that day. */
export function talliesOn(store: DispatchTalliesStore, date: string): DispatchTallies {
  return (
    store[date] ?? {
      date,
      bataviaPreload: 0,
      evanstonAsking: 0,
      updatedAt: new Date(0).toISOString(),
    }
  );
}

export function upsertDispatchTallies(
  store: DispatchTalliesStore,
  row: DispatchTallies,
): DispatchTalliesStore {
  const parsed = normalizeDispatchTallies(row);
  if (!parsed) return store;
  return { ...store, [parsed.date]: parsed };
}

export function stampDispatchTallies(
  date: string,
  patch: { bataviaPreload?: number; evanstonAsking?: number },
  prev: DispatchTallies | undefined,
  now = new Date().toISOString(),
): DispatchTallies | null {
  return normalizeDispatchTallies({
    date,
    bataviaPreload: patch.bataviaPreload ?? prev?.bataviaPreload ?? 0,
    evanstonAsking: patch.evanstonAsking ?? prev?.evanstonAsking ?? 0,
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

export function cleanDispatchTalliesStore(raw: unknown): DispatchTalliesStore {
  if (!raw || typeof raw !== "object") return {};
  const out: DispatchTalliesStore = {};
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const parsed = normalizeDispatchTallies(value as Partial<DispatchTallies>);
    if (parsed) out[parsed.date] = parsed;
  }
  return out;
}

export function readDispatchTalliesPersisted(): DispatchTalliesPersisted {
  try {
    const raw = localStorage.getItem(DISPATCH_TALLIES_STORE_KEY);
    if (!raw) return EMPTY_PERSISTED;
    const parsed = JSON.parse(raw) as DispatchTalliesPersisted;
    if (parsed?.version !== 1 || typeof parsed.byDate !== "object") {
      return EMPTY_PERSISTED;
    }
    const seenRemoteDates = parseSeenDates(parsed.seenRemoteDates);
    return seenRemoteDates.length
      ? { version: 1, byDate: cleanDispatchTalliesStore(parsed.byDate), seenRemoteDates }
      : { version: 1, byDate: cleanDispatchTalliesStore(parsed.byDate) };
  } catch {
    return EMPTY_PERSISTED;
  }
}

export function writeDispatchTalliesPersisted(store: DispatchTalliesPersisted): void {
  const seen = parseSeenDates(store.seenRemoteDates);
  const payload: DispatchTalliesPersisted = seen.length
    ? { version: 1, byDate: cleanDispatchTalliesStore(store.byDate), seenRemoteDates: seen }
    : { version: 1, byDate: cleanDispatchTalliesStore(store.byDate) };
  localStorage.setItem(DISPATCH_TALLIES_STORE_KEY, JSON.stringify(payload));
}

function describeDispatchTalliesCloudError(error: unknown): string {
  const message = pagedErrorMessage(error) ?? "";
  const missingTable = /day_dispatch_tallies/i.test(message);
  if (missingTable) return "Dispatch tallies table isn't set up in Supabase yet.";
  return message || "Could not reach the cloud.";
}

export async function fetchDispatchTalliesFromCloud(): Promise<{
  store: DispatchTalliesStore | null;
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) return { store: null, error: null };
  const { data, error } = await fetchAllPaged<DispatchTalliesRow>(async (from, to) => {
    const page = await supabase
      .from(DISPATCH_TALLIES_TABLE)
      .select("date, batavia_preload, evanston_asking, updated_at")
      .order("date", { ascending: true })
      .range(from, to);
    return { data: page.data as DispatchTalliesRow[] | null, error: page.error };
  });
  if (error || !data) {
    const message = describeDispatchTalliesCloudError(error);
    console.warn("day_dispatch_tallies pull failed", pagedErrorMessage(error) ?? message);
    return { store: null, error: message };
  }
  return { store: storeFromRows(data as DispatchTalliesRow[]), error: null };
}

export async function upsertDispatchTalliesRows(
  rows: DispatchTallies[],
  userId: string | null,
): Promise<string | null> {
  if (!rows.length) return null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase
    .from(DISPATCH_TALLIES_TABLE)
    .upsert(rows.map((row) => dispatchTalliesToRow(row, userId)));
  if (error) {
    const message = describeDispatchTalliesCloudError(error);
    console.warn("day_dispatch_tallies upsert failed", error.message ?? message);
    return message;
  }
  return null;
}

/**
 * Last-write-wins by `updatedAt`. Refresh never deletes cloud rows.
 * A date once seen on remote and now missing is treated as an intentional
 * SQL delete — dropped locally, never re-pushed. Local-only dates upload.
 */
export function reconcileDispatchTalliesCloud(opts: {
  local: DispatchTalliesStore;
  remote: DispatchTalliesStore;
  seenRemoteDates?: Iterable<string>;
}): {
  next: DispatchTalliesStore;
  toUpload: DispatchTallies[];
  seenRemoteDates: string[];
} {
  const seen = new Set(parseSeenDates([...(opts.seenRemoteDates ?? [])]));
  for (const date of Object.keys(opts.remote)) seen.add(date);

  const next: DispatchTalliesStore = {};
  const toUpload: DispatchTallies[] = [];
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
