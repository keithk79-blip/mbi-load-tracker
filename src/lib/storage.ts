import type { Load } from "../types";
import { chicagoToday } from "./chicagoDate";

/** Same key in the browser and the Tauri WebView — each environment keeps its own store. */
export const STORAGE_KEY = "chitrader.load-tracker.v1";

export type Persisted = {
  version: 1;
  /** Loads keyed by America/Chicago calendar date `YYYY-MM-DD`. */
  loadsByDate: Record<string, Load[]>;
};

const EMPTY: Persisted = { version: 1, loadsByDate: {} };

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
    return { version: 1, loadsByDate };
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

export function snapshotFromLoads(loads: Load[]): Persisted {
  const loadsByDate: Record<string, Load[]> = {};
  for (const load of loads) {
    const bucket = loadsByDate[load.date] ?? [];
    bucket.push(load);
    loadsByDate[load.date] = bucket;
  }
  return { version: 1, loadsByDate };
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
  const next: Persisted = { version: 1, loadsByDate: { ...store.loadsByDate } };

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
  const next: Persisted = { version: 1, loadsByDate: { ...store.loadsByDate } };
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
  const next: Persisted = { version: 1, loadsByDate: {} };
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
