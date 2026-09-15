import {
  callOffKindFromReason,
  isFullDayOff,
  parseCallOffCsv,
  type CallOffKind,
  type CallOffRow,
} from "./driverAvailability";
import { isValidISODate } from "./chicagoDate";

export const CALL_OFF_LOG_KEY = "chitrader.load-tracker.call-off-log.v1";

export type CallOffLogEntry = {
  id: string;
  name: string;
  start: string;
  end: string | null;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type CallOffLogPersisted = {
  version: 1;
  rows: CallOffLogEntry[];
  deletedIds: string[];
  seenIds: string[];
  seeded: boolean;
};

export const CALL_OFF_REASON_PRESETS = [
  "P-Day",
  "ok'd off",
  "Call Off",
  "Vacation Day",
  "FMLA Day",
  "Late/Early",
] as const;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function seedIdForRow(row: Pick<CallOffRow, "name" | "start" | "end" | "reason">): string {
  const name = row.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const reason = row.reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const end = row.end ?? "";
  return `seed-${row.start}-${end}-${name}-${reason}`.replace(/-+$/g, "");
}

export function cleanCallOffLogEntry(raw: unknown): CallOffLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  if (typeof rec.name !== "string" || !rec.name.trim()) return null;
  if (typeof rec.start !== "string" || !isValidISODate(rec.start)) return null;
  const end =
    typeof rec.end === "string" && isValidISODate(rec.end) && rec.end !== rec.start
      ? rec.end
      : null;
  const reason = typeof rec.reason === "string" ? rec.reason.trim() : "";
  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt ? rec.createdAt : new Date().toISOString();
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : createdAt;
  return {
    id: rec.id.trim(),
    name: rec.name.trim(),
    start: rec.start,
    end,
    reason,
    createdAt,
    updatedAt,
  };
}

export function cleanCallOffLogRows(raw: unknown): CallOffLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const rows: CallOffLogEntry[] = [];
  for (const item of raw) {
    const row = cleanCallOffLogEntry(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return sortCallOffLog(rows);
}

export function sortCallOffLog(rows: readonly CallOffLogEntry[]): CallOffLogEntry[] {
  return [...rows].sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    const aEnd = a.end ?? a.start;
    const bEnd = b.end ?? b.start;
    if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);
    const names = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    if (names) return names;
    return a.id.localeCompare(b.id);
  });
}

export function emptyCallOffLogPersisted(): CallOffLogPersisted {
  return { version: 1, rows: [], deletedIds: [], seenIds: [], seeded: false };
}

export function readCallOffLogPersisted(): CallOffLogPersisted {
  try {
    const raw = localStorage.getItem(CALL_OFF_LOG_KEY);
    if (!raw) return emptyCallOffLogPersisted();
    const parsed = JSON.parse(raw) as Partial<CallOffLogPersisted>;
    if (parsed?.version !== 1) return emptyCallOffLogPersisted();
    return {
      version: 1,
      rows: cleanCallOffLogRows(parsed.rows),
      deletedIds: Array.isArray(parsed.deletedIds)
        ? parsed.deletedIds.filter((id): id is string => typeof id === "string" && !!id)
        : [],
      seenIds: Array.isArray(parsed.seenIds)
        ? parsed.seenIds.filter((id): id is string => typeof id === "string" && !!id)
        : [],
      seeded: Boolean(parsed.seeded),
    };
  } catch {
    return emptyCallOffLogPersisted();
  }
}

export function writeCallOffLogPersisted(next: CallOffLogPersisted): void {
  localStorage.setItem(
    CALL_OFF_LOG_KEY,
    JSON.stringify({
      version: 1,
      rows: cleanCallOffLogRows(next.rows),
      deletedIds: [...new Set(next.deletedIds)],
      seenIds: [...new Set(next.seenIds)],
      seeded: next.seeded,
    } satisfies CallOffLogPersisted),
  );
}

export function logEntriesToRows(rows: readonly CallOffLogEntry[]): CallOffRow[] {
  return rows.map((row) => ({
    name: row.name,
    start: row.start,
    end: row.end,
    reason: row.reason,
  }));
}

export function kindForLogEntry(row: Pick<CallOffLogEntry, "reason">): CallOffKind {
  return callOffKindFromReason(row.reason);
}

export function logEntrySubtracts(row: Pick<CallOffLogEntry, "reason">): boolean {
  return isFullDayOff(row.reason);
}

export function formatSheetStyleDate(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

export function addCallOffLogEntry(
  rows: readonly CallOffLogEntry[],
  input: { name: string; start: string; end?: string | null; reason: string },
  now = new Date().toISOString(),
): { rows: CallOffLogEntry[]; entry: CallOffLogEntry | null } {
  const name = input.name.trim();
  const reason = input.reason.trim();
  if (!name || !isValidISODate(input.start)) return { rows: [...rows], entry: null };
  const end =
    input.end && isValidISODate(input.end) && input.end !== input.start ? input.end : null;
  const entry: CallOffLogEntry = {
    id: newId(),
    name,
    start: input.start,
    end,
    reason,
    createdAt: now,
    updatedAt: now,
  };
  return { rows: sortCallOffLog([...rows, entry]), entry };
}

export function updateCallOffLogEntry(
  rows: readonly CallOffLogEntry[],
  id: string,
  patch: Partial<Pick<CallOffLogEntry, "name" | "start" | "end" | "reason">>,
  now = new Date().toISOString(),
): CallOffLogEntry[] {
  return sortCallOffLog(
    rows.map((row) => {
      if (row.id !== id) return row;
      const name = patch.name !== undefined ? patch.name.trim() : row.name;
      const start =
        patch.start !== undefined && isValidISODate(patch.start) ? patch.start : row.start;
      let end = row.end;
      if (patch.end !== undefined) {
        end =
          patch.end && isValidISODate(patch.end) && patch.end !== start ? patch.end : null;
      } else if (end === start) {
        end = null;
      }
      const reason = patch.reason !== undefined ? patch.reason.trim() : row.reason;
      if (!name || !isValidISODate(start)) return row;
      return { ...row, name, start, end, reason, updatedAt: now };
    }),
  );
}

export function removeCallOffLogEntry(
  rows: readonly CallOffLogEntry[],
  id: string,
): { rows: CallOffLogEntry[]; removed: CallOffLogEntry | null } {
  const removed = rows.find((row) => row.id === id) ?? null;
  if (!removed) return { rows: [...rows], removed: null };
  return { rows: rows.filter((row) => row.id !== id), removed };
}

export function rowsFromSeedCsv(csv: string, now = "2026-08-14T12:00:00.000Z"): CallOffLogEntry[] {
  return parseCallOffCsv(csv).map((row) => ({
    id: seedIdForRow(row),
    name: row.name,
    start: row.start,
    end: row.end,
    reason: row.reason,
    createdAt: now,
    updatedAt: now,
  }));
}

export function mergeCallOffLog(
  local: CallOffLogEntry[],
  remote: CallOffLogEntry[],
  deletedIds: readonly string[],
): CallOffLogEntry[] {
  const deleted = new Set(deletedIds);
  const byId = new Map<string, CallOffLogEntry>();
  for (const row of remote) {
    if (deleted.has(row.id)) continue;
    byId.set(row.id, row);
  }
  for (const row of local) {
    if (deleted.has(row.id)) continue;
    const current = byId.get(row.id);
    if (!current || row.updatedAt >= current.updatedAt) byId.set(row.id, row);
  }
  return sortCallOffLog([...byId.values()]);
}

export type CallOffLogReconcileResult = {
  next: CallOffLogEntry[];
  deletedIds: string[];
  seenIds: string[];
  toUpload: CallOffLogEntry[];
  toDeleteRemote: string[];
};

export function reconcileCallOffLogCloud(input: {
  local: CallOffLogEntry[];
  remote: CallOffLogEntry[];
  deletedIds: readonly string[];
  seenIds: readonly string[];
}): CallOffLogReconcileResult {
  const deleted = new Set(input.deletedIds);
  const seen = new Set(input.seenIds);
  const remoteIds = new Set(input.remote.map((row) => row.id));
  for (const id of seen) {
    if (!remoteIds.has(id)) deleted.add(id);
  }
  const next = mergeCallOffLog(input.local, input.remote, [...deleted]);
  const nextIds = new Set(next.map((row) => row.id));
  const toDeleteRemote = [...deleted].filter((id) => remoteIds.has(id));
  const toUpload = next.filter((row) => {
    if (deleted.has(row.id)) return false;
    const remoteRow = input.remote.find((item) => item.id === row.id);
    if (!remoteRow) return true;
    return row.updatedAt > remoteRow.updatedAt;
  });
  const seenNext = new Set(seen);
  for (const id of remoteIds) seenNext.add(id);
  for (const id of nextIds) seenNext.add(id);
  for (const id of deleted) seenNext.add(id);
  return {
    next,
    deletedIds: [...deleted].filter((id) => !nextIds.has(id)),
    seenIds: [...seenNext],
    toUpload,
    toDeleteRemote,
  };
}
