import type { Load } from "../types";

export const QUEUE_KEY = "chitrader.load-tracker.queue.v1";

export const NON_EXPLICIT_REMOTE_DELETE_WARN =
  "[load-sync] BLOCKED non-explicit remote DELETE";

export type QueueOp =
  | { opId: string; kind: "upsert"; load: Load; queuedAt: string }
  | {
      opId: string;
      kind: "delete";
      loadId: string;
      queuedAt: string;
      /** Set only by `deleteLoad`. Implicit/legacy deletes must never hit Supabase. */
      explicit?: boolean;
    };

export function warnNonExplicitRemoteDelete(id: string, reason: string): void {
  console.warn(
    `${NON_EXPLICIT_REMOTE_DELETE_WARN} id=${id} reason=${reason}. Remote load deletion is opt-in (UI deleteLoad) only.`,
  );
}

export function isExplicitDeleteOp(
  op: QueueOp,
): op is Extract<QueueOp, { kind: "delete" }> & { explicit: true } {
  return op.kind === "delete" && op.explicit === true;
}

export function readQueue(): QueueOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeQueue(ops: QueueOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

export function enqueueUpsert(load: Load): QueueOp[] {
  const next = readQueue().filter((op) => {
    if (op.kind === "upsert") return op.load.id !== load.id;
    if (op.kind === "delete") return op.loadId !== load.id;
    return true;
  });
  next.push({
    opId: crypto.randomUUID(),
    kind: "upsert",
    load,
    queuedAt: new Date().toISOString(),
  });
  writeQueue(next);
  return next;
}

/**
 * Queue a remote `loads` DELETE. Requires `{ explicit: true }` from the UI
 * delete action. Auto-prune / refresh / tombstone replay must not enqueue.
 */
export function enqueueDelete(
  loadId: string,
  opts?: { explicit?: boolean },
): QueueOp[] {
  if (opts?.explicit !== true) {
    warnNonExplicitRemoteDelete(loadId, "enqueueDelete without explicit:true");
    return readQueue();
  }
  const next = readQueue().filter((op) => {
    if (op.kind === "upsert") return op.load.id !== loadId;
    if (op.kind === "delete") return op.loadId !== loadId;
    return true;
  });
  next.push({
    opId: crypto.randomUUID(),
    kind: "delete",
    loadId,
    queuedAt: new Date().toISOString(),
    explicit: true,
  });
  writeQueue(next);
  return next;
}

/** Drop leftover auto-prune / pre-opt-in delete ops. They must not flush. */
export function dropImplicitDeletes(): QueueOp[] {
  const ops = readQueue();
  const kept: QueueOp[] = [];
  for (const op of ops) {
    if (op.kind === "delete" && !isExplicitDeleteOp(op)) {
      warnNonExplicitRemoteDelete(op.loadId, "dropImplicitDeletes (legacy or auto-prune queue)");
      continue;
    }
    kept.push(op);
  }
  if (kept.length !== ops.length) writeQueue(kept);
  return kept;
}

export function pendingIds(ops = readQueue()): Set<string> {
  const ids = new Set<string>();
  for (const op of ops) {
    if (op.kind === "upsert") ids.add(op.load.id);
    else ids.add(op.loadId);
  }
  return ids;
}

export function removeQueueOp(opId: string): QueueOp[] {
  const ops = readQueue();
  const next = ops.filter((op) => op.opId !== opId);
  if (next.length !== ops.length) writeQueue(next);
  return next;
}
