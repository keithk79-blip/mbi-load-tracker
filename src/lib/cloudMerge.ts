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

/**
 * Union remote + cloud-cache + local STORAGE_KEY + pending queue.
 * Never drops a cache-only or local-only load unless a pending delete says so.
 */
export function mergeCloudLoads(input: CloudMergeInput): CloudMergeResult {
  const deleted = new Set<string>();
  const pendingUpserts: Load[] = [];
  for (const op of input.pending) {
    if (op.kind === "delete") deleted.add(op.loadId);
    else pendingUpserts.push(op.load);
  }

  const map = new Map<string, Load>();
  for (const load of input.remote) {
    if (!deleted.has(load.id)) map.set(load.id, load);
  }
  putUnseeded(map, allLoads(input.cache));
  putUnseeded(map, allLoads(input.local));
  putUnseeded(map, pendingUpserts);

  for (const id of deleted) map.delete(id);

  const remoteById = new Map(input.remote.map((load) => [load.id, load]));
  const merged = [...map.values()];
  const toUpsert = merged.filter((load) => {
    const remote = remoteById.get(load.id);
    if (!remote) return true;
    return load.updatedAt > remote.updatedAt;
  });

  return { merged, toUpsert };
}
