import type { Load } from "../types";
import { chicagoToday } from "./chicagoDate";
import { sortLoads } from "./sortLoads";

/** Same key in the browser and the Tauri WebView — each environment keeps its own store. */
export const STORAGE_KEY = "chitrader.load-tracker.v1";

/** ISO time of the last successful non-empty paged cloud refresh on this device. */
export const LAST_CLOUD_SYNC_KEY = "chitrader.load-tracker.last-cloud-sync.v1";

export function readLastSuccessfulSyncAt(): string | null {
  try {
    const raw = localStorage.getItem(LAST_CLOUD_SYNC_KEY);
    if (!raw || typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (Number.isNaN(Date.parse(trimmed))) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export function writeLastSuccessfulSyncAt(iso: string): void {
  localStorage.setItem(LAST_CLOUD_SYNC_KEY, iso);
}

export type Persisted = {
  version: 1;
  /** Loads keyed by America/Chicago calendar date `YYYY-MM-DD`. */
  loadsByDate: Record<string, Load[]>;
  /**
   * Durable tombstones for intentional deletes. Survive queue flush so a
   * STORAGE_KEY backup or Push all cannot resurrect the id.
   */
  deletedIds?: string[];
};

const EMPTY: Persisted = { version: 1, loadsByDate: {} };

export function parseDeletedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
}

export function persistedDeletedIds(
  ...stores: Array<Persisted | null | undefined>
): string[] {
  const ids = new Set<string>();
  for (const store of stores) {
    for (const id of parseDeletedIds(store?.deletedIds)) ids.add(id);
  }
  return [...ids];
}

function withDeletedIds(
  loadsByDate: Record<string, Load[]>,
  deletedIds?: Iterable<string>,
): Persisted {
  const ids = parseDeletedIds(deletedIds ? [...deletedIds] : undefined);
  return ids.length ? { version: 1, loadsByDate, deletedIds: ids } : { version: 1, loadsByDate };
}

function copyMeta(store: Persisted, loadsByDate: Record<string, Load[]>): Persisted {
  return withDeletedIds(loadsByDate, store.deletedIds);
}

function isLoad(value: unknown): value is Load {
  if (!value || typeof value !== "object") return false;
  const load = value as Load;
  return (
    typeof load.id === "string" &&
    typeof load.truck === "string" &&
    typeof load.pickup === "string" &&
    typeof load.commodity === "string" &&
    typeof load.destination === "string" &&
    typeof load.stationId === "string" &&
    typeof load.date === "string" &&
    typeof load.createdAt === "string" &&
    typeof load.updatedAt === "string"
  );
}

export function readStore(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.version !== 1 || typeof parsed.loadsByDate !== "object") {
      return EMPTY;
    }
    const loadsByDate: Record<string, Load[]> = {};
    for (const [date, loads] of Object.entries(parsed.loadsByDate)) {
      if (!Array.isArray(loads)) continue;
      loadsByDate[date] = loads.filter(isLoad).map((load) => ({
        ...load,
        date,
      }));
    }
    return withDeletedIds(loadsByDate, parsed.deletedIds);
  } catch {
    return EMPTY;
  }
}

export function writeStore(store: Persisted): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function allLoads(store: Persisted): Load[] {
  return Object.values(store.loadsByDate).flat();
}

export function snapshotFromLoads(
  loads: Load[],
  deletedIds?: Iterable<string>,
): Persisted {
  const loadsByDate: Record<string, Load[]> = {};
  for (const load of sortLoads(loads)) {
    const bucket = loadsByDate[load.date] ?? [];
    bucket.push(load);
    loadsByDate[load.date] = bucket;
  }
  return withDeletedIds(loadsByDate, deletedIds);
}

/** Remove ids from the store and record durable tombstones. */
export function rememberDeletedIds(
  store: Persisted,
  ids: Iterable<string>,
): Persisted {
  const deleted = new Set(parseDeletedIds(store.deletedIds));
  let next = store;
  for (const id of ids) {
    if (!id) continue;
    deleted.add(id);
    next = removeLoad(next, id);
  }
  return withDeletedIds(next.loadsByDate, deleted);
}

/** Drop a tombstone when the same id is saved again. */
export function forgetDeletedId(store: Persisted, id: string): Persisted {
  const deleted = parseDeletedIds(store.deletedIds).filter((item) => item !== id);
  return withDeletedIds(store.loadsByDate, deleted);
}

/**
 * Load UUID tombstones are never GC'd. Dropping them after the remote row is
 * gone lets a stale backup, Push all, or realtime echo resurrect the id —
 * the same class of bounce specialty had before UUID tombstones stuck.
 */
export function gcLoadDeletedIds(
  deletedIds: Iterable<string>,
  _remote?: Load[],
  _cache?: Persisted,
  _local?: Persisted,
): string[] {
  return parseDeletedIds([...deletedIds]);
}

export function loadsForDate(store: Persisted, date: string): Load[] {
  return store.loadsByDate[date] ?? [];
}

/** Keep the live store pointer in sync so back-to-back writes see prior results. */
export function commitStoreRef<T>(storeRef: { current: T }, next: T): T {
  storeRef.current = next;
  return next;
}

/** `saveLoad` qty loops call this so each upsert includes the previous row. */
export function upsertLoadIntoRef(
  storeRef: { current: Persisted },
  load: Load,
): Persisted {
  return commitStoreRef(storeRef, upsertLoad(storeRef.current, load));
}

export function upsertLoad(store: Persisted, load: Load): Persisted {
  const cleared = forgetDeletedId(store, load.id);
  const next: Persisted = copyMeta(cleared, { ...cleared.loadsByDate });

  for (const [date, loads] of Object.entries(next.loadsByDate)) {
    const filtered = loads.filter((item) => item.id !== load.id);
    if (filtered.length !== loads.length) {
      if (filtered.length === 0) delete next.loadsByDate[date];
      else next.loadsByDate[date] = filtered;
    }
  }

  const bucket = next.loadsByDate[load.date] ?? [];
  next.loadsByDate[load.date] = [...bucket, load];
  return next;
}

export function removeLoad(store: Persisted, id: string): Persisted {
  const next: Persisted = copyMeta(store, { ...store.loadsByDate });
  for (const [date, loads] of Object.entries(next.loadsByDate)) {
    const filtered = loads.filter((item) => item.id !== id);
    if (filtered.length !== loads.length) {
      if (filtered.length === 0) delete next.loadsByDate[date];
      else next.loadsByDate[date] = filtered;
    }
  }
  return next;
}

export function clearSeeded(store: Persisted): Persisted {
  const next: Persisted = copyMeta(store, {});
  for (const [date, loads] of Object.entries(store.loadsByDate)) {
    const kept = loads.filter((load) => !load.seeded);
    if (kept.length) next.loadsByDate[date] = kept;
  }
  return next;
}

export function newLoadId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `load-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export { chicagoToday };
