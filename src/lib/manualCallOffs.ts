import {
  callOffNameKey,
  isCallOffKind,
  type CallOffKind,
  type ManualCallOff,
} from "./driverAvailability";
import { isValidISODate } from "./chicagoDate";

export type ManualOffsStore = Record<string, ManualCallOff[]>;

export function deletedManualKey(date: string, name: string): string {
  return `${date}|${callOffNameKey(name)}`;
}

export function parseDeletedManualKey(
  key: string,
): { date: string; nameKey: string } | null {
  const split = key.indexOf("|");
  if (split <= 0) return null;
  const date = key.slice(0, split);
  const nameKey = key.slice(split + 1);
  if (!isValidISODate(date) || !nameKey) return null;
  return { date, nameKey };
}

export function cleanManualList(raw: unknown): ManualCallOff[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const list: ManualCallOff[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { name?: unknown; kind?: unknown };
    if (typeof rec.name !== "string" || !isCallOffKind(rec.kind)) continue;
    const name = rec.name.trim();
    if (!name) continue;
    const key = callOffNameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ name, kind: rec.kind as CallOffKind });
  }
  return list.sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

export function cleanManualOffs(raw: unknown): ManualOffsStore {
  if (!raw || typeof raw !== "object") return {};
  const out: ManualOffsStore = {};
  for (const [date, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidISODate(date)) continue;
    const cleaned = cleanManualList(list);
    if (cleaned.length) out[date] = cleaned;
  }
  return out;
}

export function cleanDeletedKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const parsed = parseDeletedManualKey(item);
    if (!parsed) continue;
    const key = deletedManualKey(parsed.date, parsed.nameKey);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export function manualsOn(
  store: ManualOffsStore,
  date: string,
): ManualCallOff[] {
  return store[date] ?? [];
}

export function hasManualName(
  store: ManualOffsStore,
  date: string,
  name: string,
): boolean {
  const key = callOffNameKey(name);
  if (!key) return false;
  return (store[date] ?? []).some((row) => callOffNameKey(row.name) === key);
}

export function addManualOff(
  store: ManualOffsStore,
  date: string,
  name: string,
  kind: CallOffKind,
  occupiedKeys: ReadonlySet<string>,
): { store: ManualOffsStore; added: ManualCallOff | null } {
  const trimmed = name.trim();
  if (!trimmed || !isCallOffKind(kind) || !isValidISODate(date)) {
    return { store, added: null };
  }
  const key = callOffNameKey(trimmed);
  if (occupiedKeys.has(key) || hasManualName(store, date, trimmed)) {
    return { store, added: null };
  }
  const nextList = cleanManualList([...(store[date] ?? []), { name: trimmed, kind }]);
  return {
    store: { ...store, [date]: nextList },
    added: nextList.find((row) => callOffNameKey(row.name) === key) ?? {
      name: trimmed,
      kind,
    },
  };
}

export function removeManualOff(
  store: ManualOffsStore,
  date: string,
  name: string,
): { store: ManualOffsStore; removed: ManualCallOff | null } {
  const key = callOffNameKey(name);
  const current = store[date] ?? [];
  const removed = current.find((row) => callOffNameKey(row.name) === key) ?? null;
  if (!removed) return { store, removed: null };
  const nextList = current.filter((row) => callOffNameKey(row.name) !== key);
  const next: ManualOffsStore = { ...store };
  if (nextList.length) next[date] = nextList;
  else delete next[date];
  return { store: next, removed };
}

/**
 * Union by date + lowercase name. Local kind wins on conflict.
 * `deletedKeys` (`date|namekey`) are stripped so a cloud pull cannot restore a local remove.
 */
export function mergeManualOffStores(
  local: ManualOffsStore,
  remote: ManualOffsStore,
  deletedKeys: readonly string[] = [],
): ManualOffsStore {
  const deleted = new Set(cleanDeletedKeys(deletedKeys));
  const dates = new Set([...Object.keys(local), ...Object.keys(remote)]);
  const out: ManualOffsStore = {};
  for (const date of dates) {
    const byKey = new Map<string, ManualCallOff>();
    for (const row of remote[date] ?? []) {
      const key = callOffNameKey(row.name);
      if (!key || deleted.has(deletedManualKey(date, key))) continue;
      byKey.set(key, row);
    }
    for (const row of local[date] ?? []) {
      const key = callOffNameKey(row.name);
      if (!key || deleted.has(deletedManualKey(date, key))) continue;
      byKey.set(key, row);
    }
    if (byKey.size) {
      out[date] = [...byKey.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
      );
    }
  }
  return out;
}

/** Drop tombstones whose names are no longer on the remote snapshot. */
export function gcDeletedManualKeys(
  deletedKeys: readonly string[],
  remote: ManualOffsStore,
): string[] {
  return cleanDeletedKeys(deletedKeys).filter((key) => {
    const parsed = parseDeletedManualKey(key);
    if (!parsed) return false;
    return (remote[parsed.date] ?? []).some(
      (row) => callOffNameKey(row.name) === parsed.nameKey,
    );
  });
}
