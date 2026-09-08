import type { Load } from "../types";
import type { QueueOp } from "./queue";
import { allLoads, type Persisted } from "./storage";

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

export function pendingDeleteIds(pending: QueueOp[]): Set<string> {
  const deleted = new Set<string>();
  for (const op of pending) {
    if (op.kind === "delete") deleted.add(op.loadId);
  }
  return deleted;
}

/** Non-seeded loads from cloud-cache and the device STORAGE_KEY store. */
export function collectDeviceLoads(cache: Persisted, local: Persisted): Load[] {
  const map = new Map<string, Load>();
  putUnseeded(map, allLoads(cache));
  putUnseeded(map, allLoads(local));
  return [...map.values()];
}

export type CloudMergeInput = {
  remote: Load[];
  cache: Persisted;
  local: Persisted;
  pending: QueueOp[];
};

export type CloudMergeResult = {
  merged: Load[];
  /** Cache/local/pending rows that remote is missing or that are newer than remote. */
  toUpsert: Load[];
};

function realDeviceLoads(cache: Persisted, local: Persisted, deleted: Set<string>): Load[] {
  return collectDeviceLoads(cache, local).filter((load) => !deleted.has(load.id));
}

/**
 * True when `snapshot` would drop every real load on a date that cache/local
 * still has. Empty remote must never produce that wipe.
 */
export function snapshotLosesDeviceDates(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
): boolean {
  const deleted = pendingDeleteIds(pending);
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

/** Put back any real cache/local rows the snapshot dropped (except pending deletes). */
export function restoreDeviceLoads(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
): Load[] {
  const deleted = pendingDeleteIds(pending);
  const map = new Map<string, Load>();
  putUnseeded(map, snapshot);
  putUnseeded(map, realDeviceLoads(cache, local, deleted));
  for (const id of deleted) map.delete(id);
  return [...map.values()];
}

/**
 * Union remote + cloud-cache + local STORAGE_KEY + pending queue.
 * Never drops a cache-only or local-only load unless a pending delete says so.
 * An empty remote array is not a delete of device dates.
 */
export function mergeCloudLoads(input: CloudMergeInput): CloudMergeResult {
  const deleted = pendingDeleteIds(input.pending);
  const pendingUpserts: Load[] = [];
  for (const op of input.pending) {
    if (op.kind === "upsert") pendingUpserts.push(op.load);
  }

  const map = new Map<string, Load>();
  for (const load of input.remote) {
    if (!deleted.has(load.id)) map.set(load.id, load);
  }
  putUnseeded(map, allLoads(input.cache));
  putUnseeded(map, allLoads(input.local));
  putUnseeded(map, pendingUpserts);

  for (const id of deleted) map.delete(id);

  const restored = restoreDeviceLoads(
    [...map.values()],
    input.cache,
    input.local,
    input.pending,
  );

  const remoteById = new Map(input.remote.map((load) => [load.id, load]));
  const toUpsert = restored.filter((load) => {
    const remote = remoteById.get(load.id);
    if (!remote) return true;
    return load.updatedAt > remote.updatedAt;
  });

  return { merged: restored, toUpsert };
}
