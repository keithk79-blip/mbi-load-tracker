import type { Load } from "../types";
import type { QueueOp } from "./queue";
import {
  allLoads,
  persistedDeletedIds,
  snapshotFromLoads,
  type Persisted,
} from "./storage";

function newerWins(a: Load, b: Load): Load {
  return a.updatedAt >= b.updatedAt ? a : b;
}

function putUnseeded(map: Map<string, Load>, loads: Load[]): void {
  for (const load of loads) {
    if (load.seeded) continue;
    const existing = map.get(load.id);
    map.set(load.id, existing ? newerWins(existing, load) : load);
  }
}

function pendingUpsertLoads(pending: QueueOp[], deleted: Set<string>): Load[] {
  const loads: Load[] = [];
  for (const op of pending) {
    if (op.kind === "upsert" && !deleted.has(op.load.id)) loads.push(op.load);
  }
  return loads;
}

export function pendingDeleteIds(pending: QueueOp[]): Set<string> {
  const deleted = new Set<string>();
  for (const op of pending) {
    if (op.kind === "delete") deleted.add(op.loadId);
  }
  return deleted;
}

/** Pending deletes plus durable tombstones from cache/local (and extras). */
export function deletedLoadIds(
  pending: QueueOp[],
  ...tombstones: Array<Persisted | Iterable<string> | null | undefined>
): Set<string> {
  const deleted = pendingDeleteIds(pending);
  for (const extra of tombstones) {
    if (!extra) continue;
    if (typeof extra === "object" && "loadsByDate" in extra) {
      for (const id of persistedDeletedIds(extra)) deleted.add(id);
      continue;
    }
    for (const id of extra) deleted.add(id);
  }
  return deleted;
}

/** Non-seeded loads from cloud-cache and the device STORAGE_KEY store. */
export function collectDeviceLoads(
  cache: Persisted,
  local: Persisted,
  tombstones: Iterable<string> = [],
): Load[] {
  const deleted = deletedLoadIds([], cache, local, tombstones);
  const map = new Map<string, Load>();
  putUnseeded(map, allLoads(cache));
  putUnseeded(map, allLoads(local));
  for (const id of deleted) map.delete(id);
  return [...map.values()];
}

/**
 * Loads Push all / upload should enqueue. Tombstones and pending deletes win
 * over a leftover STORAGE_KEY copy of the same id.
 */
export function deviceLoadsForPush(
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[] = [],
): Load[] {
  const deleted = deletedLoadIds(pending, cache, local);
  return collectDeviceLoads(cache, local, deleted).filter((load) => !load.seeded);
}

/**
 * What `backupLocalStore` should write to STORAGE_KEY.
 * Excludes tombstoned ids even if the previous backup still has the row.
 * Returns null only for the empty-cloud wipe case: union is empty but
 * non-deleted local rows still exist (should be unreachable if union includes local).
 */
export function snapshotForDeviceBackup(
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[] = [],
): Persisted | null {
  const deleted = deletedLoadIds(pending, cache, local);
  const union = collectDeviceLoads(cache, local, deleted).filter((load) => !load.seeded);
  const existingReal = allLoads(local).filter(
    (load) => !load.seeded && !deleted.has(load.id),
  );
  if (union.length === 0 && existingReal.length > 0) return null;
  return snapshotFromLoads(union, deleted);
}

export type CloudMergeInput = {
  remote: Load[];
  cache: Persisted;
  local: Persisted;
  pending: QueueOp[];
  /** Extra on-device snapshots (live storeRef, lastGood) merged the same as cache/local. */
  extra?: Persisted[];
};

export type CloudMergeResult = {
  merged: Load[];
  /** Cache/local/pending rows that remote is missing or that are newer than remote. */
  toUpsert: Load[];
};

function realDeviceLoads(
  cache: Persisted,
  local: Persisted,
  deleted: Set<string>,
): Load[] {
  return collectDeviceLoads(cache, local, deleted).filter((load) => !deleted.has(load.id));
}

/**
 * True when `snapshot` would drop every real load on a date that cache/local
 * still has. Empty remote must never produce that wipe.
 * Tombstoned / pending-deleted ids are not "real" — deleting every load on a
 * day must be allowed to stick.
 *
 * This does **not** catch partial same-day loss (local 324, snapshot 306).
 * Use `snapshotLosesDeviceLoads` / `snapshotDropsDeviceLoads` for that.
 */
export function snapshotLosesDeviceDates(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
  tombstones: Iterable<string> = [],
): boolean {
  const deleted = deletedLoadIds(pending, cache, local, tombstones);
  const device = realDeviceLoads(cache, local, deleted);
  if (device.length === 0) return false;

  const snapIds = new Set(
    snapshot.filter((load) => !load.seeded && !deleted.has(load.id)).map((load) => load.id),
  );
  if (snapIds.size === 0) return true;

  const byDate = new Map<string, Load[]>();
  for (const load of device) {
    const bucket = byDate.get(load.date) ?? [];
    bucket.push(load);
    byDate.set(load.date, bucket);
  }
  for (const loads of byDate.values()) {
    if (loads.length > 0 && loads.every((load) => !snapIds.has(load.id))) return true;
  }
  return false;
}

/** Put back any real cache/local rows the snapshot dropped (except deletes). */
export function restoreDeviceLoads(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
  tombstones: Iterable<string> = [],
): Load[] {
  const deleted = deletedLoadIds(pending, cache, local, tombstones);
  const map = new Map<string, Load>();
  // Device first so equal updatedAt keeps the on-device copy over a stale refresh.
  putUnseeded(map, realDeviceLoads(cache, local, deleted));
  putUnseeded(map, snapshot);
  for (const id of deleted) map.delete(id);
  return [...map.values()];
}

/**
 * Ids present on cache/local (and extras) that `snapshot` dropped.
 * Unlike `snapshotLosesDeviceDates`, this catches a busy day shrinking
 * (e.g. 324 → 306 on 2026-09-09) rather than only a full-date wipe.
 */
export function snapshotDropsDeviceLoads(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
  tombstones: Iterable<string> = [],
  extra: Persisted[] = [],
): Load[] {
  const deleted = deletedLoadIds(pending, cache, local, tombstones, ...extra);
  const snapIds = new Set(
    snapshot.filter((load) => !load.seeded && !deleted.has(load.id)).map((load) => load.id),
  );
  const device = new Map<string, Load>();
  putUnseeded(device, realDeviceLoads(cache, local, deleted));
  for (const store of extra) putUnseeded(device, realDeviceLoads(store, { version: 1, loadsByDate: {} }, deleted));
  for (const id of deleted) device.delete(id);
  return [...device.values()].filter((load) => !snapIds.has(load.id));
}

/** True when any non-tombstoned device load is missing from `snapshot`. */
export function snapshotLosesDeviceLoads(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
  tombstones: Iterable<string> = [],
  extra: Persisted[] = [],
): boolean {
  return snapshotDropsDeviceLoads(snapshot, cache, local, pending, tombstones, extra).length > 0;
}

export type PersistReconcileInput = {
  incoming: Persisted;
  live: Persisted;
  cache: Persisted;
  local: Persisted;
  lastGood: Persisted;
  pending: QueueOp[];
};

/**
 * What cloud-cache / React store should become after save, delete, refresh, or
 * realtime. Last-writer-wins by updatedAt; on-device rows and durable
 * tombstones are never discarded because remote (or a stale in-flight merge)
 * was missing them.
 *
 * Returns null only for the empty-cloud wipe case: every device source still
 * has real loads, incoming is empty, and nothing is tombstoned.
 */
export function reconcilePersistedSnapshot(
  input: PersistReconcileInput,
): Persisted | null {
  const tombstones = deletedLoadIds(
    input.pending,
    input.incoming,
    input.live,
    input.cache,
    input.local,
    input.lastGood,
  );
  const map = new Map<string, Load>();
  putUnseeded(map, allLoads(input.lastGood));
  putUnseeded(map, allLoads(input.cache));
  putUnseeded(map, allLoads(input.local));
  putUnseeded(map, allLoads(input.live));
  putUnseeded(map, allLoads(input.incoming));
  putUnseeded(map, pendingUpsertLoads(input.pending, tombstones));
  for (const id of tombstones) map.delete(id);

  const merged = [...map.values()];
  if (
    merged.length === 0 &&
    snapshotLosesDeviceDates([], input.cache, input.local, input.pending, tombstones)
  ) {
    return null;
  }
  if (
    merged.length === 0 &&
    snapshotLosesDeviceDates([], input.lastGood, input.live, input.pending, tombstones)
  ) {
    return null;
  }
  return snapshotFromLoads(merged, tombstones);
}

/** Ignore stale/own upsert echoes and anything already tombstoned or in-flight. */
export function shouldApplyRealtimeUpsert(
  incoming: Load,
  store: Persisted,
  pending: ReadonlySet<string>,
): boolean {
  if (!incoming.id) return false;
  if (pending.has(incoming.id)) return false;
  const tombstoned = deletedLoadIds([], store);
  if (tombstoned.has(incoming.id)) return false;
  const existing = allLoads(store).find((item) => item.id === incoming.id);
  if (existing && existing.updatedAt >= incoming.updatedAt) return false;
  return true;
}

/** Apply another device's delete unless this device has a newer in-flight upsert. */
export function shouldApplyRealtimeDelete(
  id: string | undefined,
  pending: QueueOp[],
): id is string {
  if (!id) return false;
  return !pending.some((op) => op.kind === "upsert" && op.load.id === id);
}

/**
 * Union remote + cloud-cache + local STORAGE_KEY + pending queue.
 * Never drops a cache-only or local-only load unless a pending delete or
 * durable tombstone says so.
 * An empty remote array is not a delete of device dates.
 */
export function mergeCloudLoads(input: CloudMergeInput): CloudMergeResult {
  const extras = input.extra ?? [];
  const deleted = deletedLoadIds(
    input.pending,
    input.cache,
    input.local,
    ...extras,
  );
  const pendingUpserts = pendingUpsertLoads(input.pending, deleted);

  const map = new Map<string, Load>();
  // Device copies first so a partial remote (306 of 324 same-day rows) cannot
  // drop local-only loads the cloud has not caught up with yet. Newer
  // updatedAt still wins when remote actually has a newer copy of that id.
  putUnseeded(map, allLoads(input.cache));
  putUnseeded(map, allLoads(input.local));
  for (const extra of extras) putUnseeded(map, allLoads(extra));
  putUnseeded(map, pendingUpserts);
  putUnseeded(
    map,
    input.remote.filter((load) => !deleted.has(load.id)),
  );

  for (const id of deleted) map.delete(id);

  let restored = [...map.values()];
  restored = restoreDeviceLoads(
    restored,
    input.cache,
    input.local,
    input.pending,
    deleted,
  );
  for (const extra of extras) {
    restored = restoreDeviceLoads(
      restored,
      extra,
      { version: 1, loadsByDate: {} },
      input.pending,
      deleted,
    );
  }

  const remoteById = new Map(input.remote.map((load) => [load.id, load]));
  const toUpsert = restored.filter((load) => {
    if (deleted.has(load.id)) return false;
    const remote = remoteById.get(load.id);
    if (!remote) return true;
    return load.updatedAt > remote.updatedAt;
  });

  return { merged: restored, toUpsert };
}
