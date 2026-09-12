import type { Load } from "../types";
import {
  isExplicitDeleteOp,
  warnNonExplicitRemoteDelete,
  type QueueOp,
} from "./queue";
import { sortLoads } from "./sortLoads";
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

/** Explicit UI deletes only. Legacy / auto-prune queue ops do not count. */
export function pendingDeleteIds(pending: QueueOp[]): Set<string> {
  const deleted = new Set<string>();
  for (const op of pending) {
    if (isExplicitDeleteOp(op)) deleted.add(op.loadId);
  }
  return deleted;
}

export const explicitPendingDeleteIds = pendingDeleteIds;

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
 * Reconciled cache minus tombstones / pending deletes.
 * Does not re-union STORAGE_KEY leftovers (those are Upload-local or ghosts).
 * Push all is refresh-first and must not re-upsert the whole cache.
 */
export function deviceLoadsForPush(
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[] = [],
): Load[] {
  const deleted = deletedLoadIds(pending, cache, local);
  // Cache is the reconciled crew snapshot. Do not re-union STORAGE_KEY
  // leftovers — that re-clouds stale local ghosts (and used to tombstone
  // them as if the user had deleted them).
  return collectDeviceLoads(cache, { version: 1, loadsByDate: {} }, deleted).filter(
    (load) => !load.seeded,
  );
}

/**
 * STORAGE_KEY rows that are not in the cloud cache and not tombstoned.
 * Matches the "Upload N local" button — never the already-synced cache.
 */
export function localOnlyLoadsForUpload(
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[] = [],
): Load[] {
  const deleted = deletedLoadIds(pending, cache, local);
  const cloudIds = new Set(
    allLoads(cache)
      .filter((load) => !load.seeded)
      .map((load) => load.id),
  );
  return allLoads(local).filter(
    (load) => !load.seeded && !cloudIds.has(load.id) && !deleted.has(load.id),
  );
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
  const deleted = deletedLoadIds(pending, cache);
  const union = allLoads(cache).filter((load) => !load.seeded && !deleted.has(load.id));
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
  /**
   * Extra on-device snapshots (live storeRef, lastGood). Used to protect
   * in-flight saves — not as an unbounded union against a complete remote.
   */
  extra?: Persisted[];
  /**
   * ISO time of the last successful non-empty cloud refresh on this device.
   * Local-only rows older than this are treated as stale ghosts.
   */
  lastSuccessfulSyncAt?: string | null;
  /** ISO time this refresh started; saves during the fetch stay protected. */
  refreshStartedAt?: string | null;
};

export type CloudMergeResult = {
  merged: Load[];
  /** Pending / in-flight rows remote is missing or that are newer than remote. */
  toUpsert: Load[];
  /**
   * Remote rows this device may DELETE: **explicit UI pending deletes only**.
   * Durable tombstones, subset last-good, and "missing locally" never qualify.
   */
  toDelete: Load[];
  /** Device ids to tombstone: local ghosts not on remote, plus explicit deletes. */
  toTombstone: string[];
};

function realDeviceLoads(
  cache: Persisted,
  local: Persisted,
  deleted: Set<string>,
): Load[] {
  return collectDeviceLoads(cache, local, deleted).filter((load) => !deleted.has(load.id));
}

function isoAtOrAfter(value: string, watermark: string): boolean {
  return value >= watermark;
}

function isoAfter(value: string, watermark: string): boolean {
  return value > watermark;
}

export type ProtectLoadOpts = {
  pending: QueueOp[];
  deleted: Set<string>;
  lastSuccessfulSyncAt?: string | null;
  refreshStartedAt?: string | null;
};

/**
 * Genuine in-flight work: queued upserts, or rows created/edited after the last
 * successful refresh / during this fetch. Stale STORAGE_KEY leftovers are not
 * protected — PR #28 unioned those forever and re-clouded ghosts.
 */
export function isProtectedDeviceLoad(load: Load, opts: ProtectLoadOpts): boolean {
  if (load.seeded) return false;
  if (opts.deleted.has(load.id)) return false;
  if (opts.pending.some((op) => op.kind === "upsert" && op.load.id === load.id)) {
    return true;
  }
  if (opts.refreshStartedAt && isoAtOrAfter(load.updatedAt, opts.refreshStartedAt)) {
    return true;
  }
  if (opts.lastSuccessfulSyncAt && isoAfter(load.updatedAt, opts.lastSuccessfulSyncAt)) {
    return true;
  }
  return false;
}

/**
 * Prefix for the diagnostic log when a subset last-good would have pruned
 * cloud-only rows. Grep this if Sep 11-style 408→404 repeats.
 */
export const SKIP_REMOTE_PRUNE_LOG_PREFIX = "[load-sync] skip remote prune";

/**
 * Shape of the old "device-win" prune (desktop 406 vs inflated 435). Kept
 * only to log that we refused to delete cloud extras — it must not enqueue
 * remote deletes. A 403-of-408 cache matches this shape and is a subset,
 * not a wipe.
 */
export const DEVICE_WIN_MIN_LOADS = 50;

/** Remote extras / remote size. 2026-09-10 was 29/435 ≈ 6.7%. */
export const DEVICE_WIN_MAX_REMOTE_EXTRA_RATIO = 0.15;

/**
 * True when this device already has a substantial overlap with remote for
 * `date`, and remote only has a small extra tail. Diagnostic only — do not
 * DELETE those extras. Missing locally ≠ deleted (Sep 11 408→404).
 *
 * Overlap (not a strict subset) is required so a pending local save that is
 * not on remote yet does not hide the log.
 */
export function deviceWinsDateAgainstRemote(
  deviceLoads: Load[],
  remoteLoads: Load[],
  date: string,
): boolean {
  const deviceIds = new Set(
    deviceLoads.filter((load) => load.date === date && !load.seeded).map((load) => load.id),
  );
  const remoteIds = new Set(
    remoteLoads.filter((load) => load.date === date && !load.seeded).map((load) => load.id),
  );
  let overlap = 0;
  for (const id of deviceIds) {
    if (remoteIds.has(id)) overlap += 1;
  }
  if (overlap < DEVICE_WIN_MIN_LOADS) return false;
  const extras = remoteIds.size - overlap;
  if (extras <= 0) return false;
  if (extras / remoteIds.size > DEVICE_WIN_MAX_REMOTE_EXTRA_RATIO) return false;
  return true;
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

/**
 * Persist must not refuse a complete remote snapshot merely because stale
 * STORAGE_KEY ghosts would be dropped. Only pending / in-flight rows block it.
 */
export function snapshotDropsProtectedDeviceLoads(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
  tombstones: Iterable<string> = [],
  extra: Persisted[] = [],
  lastSuccessfulSyncAt?: string | null,
  refreshStartedAt?: string | null,
): Load[] {
  const deleted = deletedLoadIds(pending, cache, local, tombstones, ...extra);
  const dropped = snapshotDropsDeviceLoads(
    snapshot,
    cache,
    local,
    pending,
    tombstones,
    extra,
  );
  const opts: ProtectLoadOpts = {
    pending,
    deleted,
    lastSuccessfulSyncAt,
    refreshStartedAt,
  };
  return dropped.filter((load) => isProtectedDeviceLoad(load, opts));
}

export function snapshotLosesProtectedDeviceLoads(
  snapshot: Load[],
  cache: Persisted,
  local: Persisted,
  pending: QueueOp[],
  tombstones: Iterable<string> = [],
  extra: Persisted[] = [],
  lastSuccessfulSyncAt?: string | null,
  refreshStartedAt?: string | null,
): boolean {
  return (
    snapshotDropsProtectedDeviceLoads(
      snapshot,
      cache,
      local,
      pending,
      tombstones,
      extra,
      lastSuccessfulSyncAt,
      refreshStartedAt,
    ).length > 0
  );
}

export type PersistReconcileInput = {
  incoming: Persisted;
  live: Persisted;
  cache: Persisted;
  local: Persisted;
  lastGood: Persisted;
  pending: QueueOp[];
  lastSuccessfulSyncAt?: string | null;
  refreshStartedAt?: string | null;
};

/**
 * What cloud-cache / React store should become after save, delete, refresh, or
 * realtime. Last-writer-wins by updatedAt. Durable tombstones always win.
 *
 * Incoming is the intended snapshot (full refresh merge, or incremental
 * save/delete/realtime already applied on live). Other device stores only
 * contribute **protected** rows (pending queue / newer than last sync) so a
 * stale STORAGE_KEY backup cannot inflate the UI after a complete refresh.
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
  // A complete incoming snapshot (cloud refresh) that includes an id wins
  // over a stale durable tombstone. Old device-win prune wrote those
  // tombstones; they must not hide live cloud rows. Explicit UI deletes
  // are not in incoming (deleteLoad already removed them).
  const explicitDeletes = explicitPendingDeleteIds(input.pending);
  for (const load of allLoads(input.incoming)) {
    if (load.seeded || explicitDeletes.has(load.id)) continue;
    tombstones.delete(load.id);
  }
  const opts: ProtectLoadOpts = {
    pending: input.pending,
    deleted: tombstones,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    refreshStartedAt: input.refreshStartedAt,
  };
  const map = new Map<string, Load>();
  putUnseeded(map, allLoads(input.incoming));
  putUnseeded(map, pendingUpsertLoads(input.pending, tombstones));
  for (const source of [input.lastGood, input.cache, input.local, input.live]) {
    for (const load of allLoads(source)) {
      if (!isProtectedDeviceLoad(load, opts)) continue;
      const existing = map.get(load.id);
      map.set(load.id, existing ? newerWins(existing, load) : load);
    }
  }
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

function collectAuthorityLoads(
  cache: Persisted,
  local: Persisted,
  deleted: Set<string>,
): Load[] {
  return realDeviceLoads(cache, local, deleted);
}

function collectInflightLoads(
  extra: Persisted[],
  deleted: Set<string>,
): Load[] {
  const map = new Map<string, Load>();
  for (const store of extra) {
    putUnseeded(map, allLoads(store));
  }
  for (const id of deleted) map.delete(id);
  return [...map.values()].filter((load) => !load.seeded);
}

/**
 * Merge a successful paged remote snapshot with this device.
 *
 * Empty remote still restores on-device dates (never a wipe).
 *
 * Non-empty remote is the crew source of truth except:
 * - pending queue upserts and in-flight saves (newer than lastSuccessfulSync /
 *   refreshStartedAt) stay and may `toUpsert`
 * - stale local-only STORAGE_KEY rows are dropped and tombstoned, not re-clouded
 * - same-day remote extras are adopted (union). A thinner last-good must
 *   never DELETE cloud-only rows — missing locally ≠ deleted
 *
 * Remote DELETE is opt-in: only an explicit UI pending delete may `toDelete`.
 * Durable tombstones still block Push-all / local-only resurrection; they
 * must not hide or delete a row that is live on a complete remote snapshot.
 */
export function mergeCloudLoads(input: CloudMergeInput): CloudMergeResult {
  const extras = input.extra ?? [];
  const explicitDeletes = explicitPendingDeleteIds(input.pending);
  const durableTombstones = deletedLoadIds([], input.cache, input.local, ...extras);
  const deleted = new Set<string>([...explicitDeletes, ...durableTombstones]);
  const pendingUpserts = pendingUpsertLoads(input.pending, deleted);
  const lastSync = input.lastSuccessfulSyncAt ?? null;
  const refreshStartedAt = input.refreshStartedAt ?? null;
  const protectOpts: ProtectLoadOpts = {
    pending: input.pending,
    deleted,
    lastSuccessfulSyncAt: lastSync,
    refreshStartedAt,
  };

  if (input.remote.length === 0) {
    let restored = restoreDeviceLoads(
      [],
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
    const toUpsert = restored.filter((load) => !deleted.has(load.id) && !load.seeded);
    return { merged: sortLoads(restored), toUpsert, toDelete: [], toTombstone: [] };
  }

  // Adopt live cloud rows unless this device has an explicit UI delete queued.
  // Stale prune tombstones (Sep 11 MSW restore) must not filter them out.
  const remoteKept = input.remote.filter(
    (load) => !load.seeded && !explicitDeletes.has(load.id),
  );
  const remoteById = new Map(remoteKept.map((load) => [load.id, load]));
  const authority = collectAuthorityLoads(input.cache, input.local, deleted);
  const inflight = collectInflightLoads(extras, deleted);

  const mergedMap = new Map<string, Load>();
  putUnseeded(mergedMap, remoteKept);

  const toDelete = input.remote.filter(
    (load) => !load.seeded && explicitDeletes.has(load.id),
  );
  const dates = new Set<string>();
  for (const load of authority) dates.add(load.date);
  for (const load of remoteKept) dates.add(load.date);
  for (const date of dates) {
    if (!deviceWinsDateAgainstRemote(authority, remoteKept, date)) continue;
    const deviceIds = new Set(
      authority.filter((load) => load.date === date).map((load) => load.id),
    );
    const extraIds: string[] = [];
    for (const load of remoteKept) {
      if (load.date !== date || deviceIds.has(load.id)) continue;
      extraIds.push(load.id);
    }
    if (extraIds.length === 0) continue;
    const preview =
      extraIds.length > 8
        ? `${extraIds.slice(0, 8).join(",")}…+${extraIds.length - 8}`
        : extraIds.join(",");
    console.info(
      `${SKIP_REMOTE_PRUNE_LOG_PREFIX} on ${date}: device has ${deviceIds.size}/${remoteKept.filter((load) => load.date === date).length}; missing locally ≠ deleted. Kept ${extraIds.length} cloud-only id(s): ${preview}`,
    );
  }

  const deviceCandidates = [...authority, ...inflight, ...pendingUpserts];
  for (const load of deviceCandidates) {
    const remote = remoteById.get(load.id);
    if (remote) {
      // Same id on both sides: last-writer-wins. Not a ghost.
      mergedMap.set(load.id, newerWins(remote, load));
      continue;
    }
    if (!isProtectedDeviceLoad(load, protectOpts)) continue;
    mergedMap.set(load.id, load);
  }
  putUnseeded(mergedMap, pendingUpserts);

  const toDeleteIds = new Set(toDelete.map((load) => load.id));
  const pendingIds = new Set(pendingUpserts.map((load) => load.id));
  for (const id of explicitDeletes) mergedMap.delete(id);
  for (const id of toDeleteIds) {
    if (pendingIds.has(id)) continue;
    mergedMap.delete(id);
  }

  const merged = sortLoads([...mergedMap.values()]);

  // deletedIds grow only from explicit UI deletes (and leftover durable
  // tombstones that are still absent from remote). Sync must not write
  // "local cache lacks this id" into deletedIds — that is how the Sep 11
  // MSW rows became poison tombstones.
  const toTombstoneSet = new Set<string>(toDeleteIds);
  for (const id of durableTombstones) {
    if (remoteById.has(id) && !explicitDeletes.has(id)) continue;
    toTombstoneSet.add(id);
  }

  const toUpsert = merged.filter((load) => {
    if (explicitDeletes.has(load.id) || toDeleteIds.has(load.id)) return false;
    if (durableTombstones.has(load.id) && !remoteById.has(load.id)) return false;
    const remote = remoteById.get(load.id);
    if (!remote) {
      return pendingIds.has(load.id) || isProtectedDeviceLoad(load, protectOpts);
    }
    return load.updatedAt > remote.updatedAt;
  });

  return {
    merged,
    toUpsert,
    toDelete,
    toTombstone: [...toTombstoneSet],
  };
}

/**
 * Refresh / Push-all must never enqueue Supabase DELETEs. Candidates that
 * are not already an explicit UI pending delete are logged and dropped.
 */
export function enqueueRemoteDeletesFromRefresh(
  candidates: Iterable<string>,
  pending: QueueOp[],
): string[] {
  const explicit = explicitPendingDeleteIds(pending);
  for (const id of candidates) {
    if (!id || explicit.has(id)) continue;
    warnNonExplicitRemoteDelete(id, "refresh/auto-prune candidate");
  }
  return [];
}
