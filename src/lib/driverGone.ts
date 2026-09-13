/** Terminated / left drivers — Driver tab Gone grouping.
 *
 * HARD CONSTRAINT: never auto-delete / wipe / prune Gone rows.
 * Sheet seed may add only when the local store is empty. Remote DELETE
 * is an explicit UI × (`removeGoneEntry`). See `reconcileDriverGoneCloud`.
 *
 * Contact columns from the sheet are discarded and are never persisted.
 */

import { isValidISODate, yearOfISO } from "./chicagoDate";
import {
  cleanDriverName,
  cleanTruckNumber,
  driverRosterSeedId,
  isDriverRosterYard,
  removeHiredAndMatchingSat,
  type DriverRosterEntry,
  type DriverRosterStore,
  type DriverRosterYard,
} from "./driverRoster";

export const DRIVER_GONE_STORE_KEY = "chitrader.load-tracker.driver-gone.v1";

export type DriverGoneEntry = {
  id: string;
  employeeNumber: string | null;
  name: string;
  hireDate: string | null;
  terminationDate: string | null;
  notes: string;
  yard: DriverRosterYard | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverGoneStore = {
  entries: Record<string, DriverGoneEntry>;
};

export type DriverGonePersisted = {
  version: 1;
  entries: Record<string, DriverGoneEntry>;
  deletedEntryIds: string[];
  seenRemoteEntryIds: string[];
  importedAt: string | null;
};

export type DriverGoneInput = {
  employeeNumber?: string | null;
  name: string;
  hireDate?: string | null;
  terminationDate?: string | null;
  notes?: string;
  yard?: DriverRosterYard | null;
};

export type ImportedGoneRow = {
  employeeNumber: string | null;
  name: string;
  hireDate: string | null;
  terminationDate: string | null;
  notes: string;
  yard: DriverRosterYard | null;
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE =
  /(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}\b/g;

export function scrubPrivacyFromNotes(raw: string): string {
  return raw
    .replace(EMAIL_RE, " ")
    .replace(PHONE_RE, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function cleanGoneNotes(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return scrubPrivacyFromNotes(raw);
}

/** Hire / termination dates. Two-digit years: 00–79 → 2000s, 80–99 → 1900s. */
export function parseGoneDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isValidISODate(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (match[3].length === 2) year += year >= 80 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1950 || year > 2100) {
    return null;
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const check = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return iso;
}

export function cleanGoneYard(raw: unknown): DriverRosterYard | null {
  return isDriverRosterYard(raw) ? raw : null;
}

export function cleanEmployeeNumber(raw: unknown): string | null {
  return cleanTruckNumber(raw);
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

export function newDriverGoneId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return driverRosterSeedId(`gone-local-${Date.now()}-${Math.random()}`);
}

export function importGoneEntryId(input: {
  employeeNumber: string | null;
  name: string;
  terminationDate: string | null;
  index: number;
}): string {
  const nameKey = cleanDriverName(input.name).toLowerCase();
  const emp = input.employeeNumber ?? "";
  const term = input.terminationDate ?? "";
  return driverRosterSeedId(`gone|${emp}|${nameKey}|${term}|${input.index}`);
}

export function emptyDriverGoneStore(): DriverGoneStore {
  return { entries: {} };
}

export function emptyDriverGonePersisted(): DriverGonePersisted {
  return {
    version: 1,
    entries: {},
    deletedEntryIds: [],
    seenRemoteEntryIds: [],
    importedAt: null,
  };
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export function cleanDriverGoneEntry(raw: unknown): DriverGoneEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const name = cleanDriverName(rec.name);
  if (!name) return null;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : null;
  if (!id) return null;
  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt ? rec.createdAt : nowIso();
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : createdAt;
  return {
    id,
    employeeNumber: cleanEmployeeNumber(rec.employeeNumber ?? rec.truckNumber),
    name,
    hireDate: parseGoneDate(rec.hireDate),
    terminationDate: parseGoneDate(rec.terminationDate),
    notes: cleanGoneNotes(rec.notes),
    yard: cleanGoneYard(rec.yard),
    createdAt,
    updatedAt,
  };
}

export function readDriverGonePersisted(): DriverGonePersisted {
  try {
    const raw = localStorage.getItem(DRIVER_GONE_STORE_KEY);
    if (!raw) return emptyDriverGonePersisted();
    const parsed = JSON.parse(raw) as Partial<DriverGonePersisted>;
    const entries: Record<string, DriverGoneEntry> = {};
    if (parsed.entries && typeof parsed.entries === "object") {
      for (const value of Object.values(parsed.entries)) {
        const cleaned = cleanDriverGoneEntry(value);
        if (cleaned) entries[cleaned.id] = cleaned;
      }
    }
    return {
      version: 1,
      entries,
      deletedEntryIds: parseIdList(parsed.deletedEntryIds),
      seenRemoteEntryIds: parseIdList(parsed.seenRemoteEntryIds),
      importedAt: typeof parsed.importedAt === "string" ? parsed.importedAt : null,
    };
  } catch {
    return emptyDriverGonePersisted();
  }
}

export function writeDriverGonePersisted(next: DriverGonePersisted): void {
  const payload: DriverGonePersisted = {
    version: 1,
    entries: next.entries,
    deletedEntryIds: parseIdList(next.deletedEntryIds),
    seenRemoteEntryIds: parseIdList(next.seenRemoteEntryIds),
    importedAt: next.importedAt ?? null,
  };
  localStorage.setItem(DRIVER_GONE_STORE_KEY, JSON.stringify(payload));
}

export function applyGoneTombstones(
  store: DriverGoneStore,
  deletedIds: Iterable<string>,
): DriverGoneStore {
  const deleted = new Set(
    [...deletedIds].filter((id) => typeof id === "string" && id.length > 0),
  );
  if (!deleted.size) return store;
  const entries = { ...store.entries };
  for (const id of deleted) delete entries[id];
  return { entries };
}

export function goneStoreIsEmpty(store: DriverGoneStore): boolean {
  return Object.keys(store.entries).length === 0;
}

export function goneEntryCount(store: DriverGoneStore): number {
  return Object.keys(store.entries).length;
}

export function goneYearLabel(year: number): string {
  return `Gone ${year}`;
}

/** Termination-year bucket. Undated rows land in `fallbackYear` (usually this Chicago year). */
export function goneYearOf(entry: Pick<DriverGoneEntry, "terminationDate">, fallbackYear: number): number {
  const term = entry.terminationDate;
  if (term && isValidISODate(term)) return yearOfISO(term);
  return fallbackYear;
}

/**
 * Years Keith can open on the Driver tab. Always includes the current Chicago
 * year so a new year creates Gone YYYY even before anyone is terminated.
 */
export function goneArchiveYears(store: DriverGoneStore, currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const entry of Object.values(store.entries)) {
    years.add(goneYearOf(entry, currentYear));
  }
  return [...years].sort((a, b) => b - a);
}

export function entriesForGoneYear(
  store: DriverGoneStore,
  year: number,
  fallbackYear: number,
): DriverGoneEntry[] {
  return entriesForGone(store).filter((entry) => goneYearOf(entry, fallbackYear) === year);
}

export function entriesForGone(store: DriverGoneStore): DriverGoneEntry[] {
  return Object.values(store.entries).sort((a, b) => {
    const term = (b.terminationDate ?? "").localeCompare(a.terminationDate ?? "");
    if (term !== 0) return term;
    const emp = (a.employeeNumber ?? "").localeCompare(b.employeeNumber ?? "", "en", {
      numeric: true,
    });
    if (emp !== 0) return emp;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}

export function addGoneEntry(
  store: DriverGoneStore,
  input: DriverGoneInput,
  opts?: { id?: string; at?: string; createdAt?: string },
): { store: DriverGoneStore; entry: DriverGoneEntry | null } {
  const name = cleanDriverName(input.name);
  if (!name) return { store, entry: null };
  const at = nowIso(opts?.at);
  const entry: DriverGoneEntry = {
    id: opts?.id ?? newDriverGoneId(),
    employeeNumber: cleanEmployeeNumber(input.employeeNumber ?? null),
    name,
    hireDate: parseGoneDate(input.hireDate ?? null),
    terminationDate: parseGoneDate(input.terminationDate ?? null),
    notes: cleanGoneNotes(input.notes ?? ""),
    yard: cleanGoneYard(input.yard),
    createdAt: opts?.createdAt ?? at,
    updatedAt: at,
  };
  return { store: { entries: { ...store.entries, [entry.id]: entry } }, entry };
}

export function updateGoneEntry(
  store: DriverGoneStore,
  id: string,
  patch: Partial<
    Pick<DriverGoneEntry, "employeeNumber" | "name" | "hireDate" | "terminationDate" | "notes" | "yard">
  >,
  at?: string,
): DriverGoneStore {
  const prev = store.entries[id];
  if (!prev) return store;
  const name = patch.name !== undefined ? cleanDriverName(patch.name) : prev.name;
  if (!name) return store;
  const next: DriverGoneEntry = {
    ...prev,
    employeeNumber:
      patch.employeeNumber !== undefined
        ? cleanEmployeeNumber(patch.employeeNumber)
        : prev.employeeNumber,
    name,
    hireDate: patch.hireDate !== undefined ? parseGoneDate(patch.hireDate) : prev.hireDate,
    terminationDate:
      patch.terminationDate !== undefined
        ? parseGoneDate(patch.terminationDate)
        : prev.terminationDate,
    notes: patch.notes !== undefined ? cleanGoneNotes(patch.notes) : prev.notes,
    yard: patch.yard !== undefined ? cleanGoneYard(patch.yard) : prev.yard,
    updatedAt: nowIso(at),
  };
  return { entries: { ...store.entries, [id]: next } };
}

export function removeGoneEntry(
  store: DriverGoneStore,
  id: string,
): { store: DriverGoneStore; removed: DriverGoneEntry | null } {
  const removed = store.entries[id] ?? null;
  if (!removed) return { store, removed: null };
  const entries = { ...store.entries };
  delete entries[id];
  return { store: { entries }, removed };
}

/**
 * Fill Gone only when the archive is empty. A thinner sheet must never
 * prune existing terminated rows.
 */
export function mergeImportedGoneRows(
  store: DriverGoneStore,
  rows: readonly ImportedGoneRow[],
  opts?: { at?: string },
): { store: DriverGoneStore; added: number; skipped: boolean } {
  if (!goneStoreIsEmpty(store)) {
    return { store, added: 0, skipped: true };
  }
  const at = nowIso(opts?.at);
  let next = store;
  let added = 0;
  rows.forEach((row, index) => {
    const result = addGoneEntry(
      next,
      {
        employeeNumber: row.employeeNumber,
        name: row.name,
        hireDate: row.hireDate,
        terminationDate: row.terminationDate,
        notes: row.notes,
        yard: row.yard,
      },
      {
        id: importGoneEntryId({
          employeeNumber: row.employeeNumber,
          name: row.name,
          terminationDate: row.terminationDate,
          index,
        }),
        at,
      },
    );
    if (result.entry) {
      next = result.store;
      added += 1;
    }
  });
  return { store: next, added, skipped: false };
}

export type FullRosterDeleteDecision =
  | { intent: "edit" }
  | {
      intent: "termination";
      hireDate?: string | null;
      terminationDate?: string | null;
      notes?: string;
    };

export type FullRosterDeleteResult = {
  roster: DriverRosterStore;
  gone: DriverGoneStore;
  removed: DriverRosterEntry[];
  goneEntry: DriverGoneEntry | null;
};

/**
 * Full Roster × outcomes:
 * - Edit = remove hired (+ matching Sat). Do not write Gone.
 * - Termination = remove hired (+ matching Sat) and archive on Gone.
 */
export function applyFullRosterDelete(
  roster: DriverRosterStore,
  gone: DriverGoneStore,
  fullId: string,
  decision: FullRosterDeleteDecision,
  opts?: { at?: string; goneId?: string },
): FullRosterDeleteResult {
  const target = roster.entries[fullId];
  if (!target || target.kind !== "full") {
    return { roster, gone, removed: [], goneEntry: null };
  }
  const removedResult = removeHiredAndMatchingSat(roster, fullId);
  if (decision.intent === "edit") {
    return {
      roster: removedResult.store,
      gone,
      removed: removedResult.removed,
      goneEntry: null,
    };
  }
  const added = addGoneEntry(
    gone,
    {
      employeeNumber: target.truckNumber,
      name: target.name,
      hireDate: decision.hireDate ?? null,
      terminationDate: decision.terminationDate ?? null,
      notes: decision.notes ?? "",
      yard: target.yard,
    },
    { at: opts?.at, id: opts?.goneId },
  );
  return {
    roster: removedResult.store,
    gone: added.store,
    removed: removedResult.removed,
    goneEntry: added.entry,
  };
}

export type DriverGoneCloudReconcileInput = {
  local: DriverGoneStore;
  remote: DriverGoneStore;
  deletedEntryIds: Iterable<string>;
  seenRemoteEntryIds?: Iterable<string>;
};

export type DriverGoneCloudReconcileResult = {
  next: DriverGoneStore;
  deletedEntryIds: string[];
  seenRemoteEntryIds: string[];
  toDeleteRemoteEntries: string[];
  toUploadEntries: DriverGoneEntry[];
};

/**
 * HARD CONSTRAINT — same class as roster / vacation silent wipes:
 * Sync must never delete, wipe, or prune Gone rows unless Keith pressed ×.
 *
 * - No subset-pull hides, no seen-missing tombstones, no wipe-then-reinsert.
 * - Empty / thin remote keeps every local row. Cloud-only remote rows upsert in.
 * - Live remote beats a stale local tombstone (do not re-DELETE that row).
 * - `toDeleteRemoteEntries` is always empty. The only remote DELETE is
 *   DriverGoneContext.removeGone (the × button).
 * - Sheet seed may add when Gone is empty; it never removes rows.
 */
export function reconcileDriverGoneCloud(
  input: DriverGoneCloudReconcileInput,
): DriverGoneCloudReconcileResult {
  const incomingDeleted = new Set(
    [...input.deletedEntryIds].filter((id) => typeof id === "string" && id.length > 0),
  );
  const seen = new Set(
    [...(input.seenRemoteEntryIds ?? [])].filter(
      (id) => typeof id === "string" && id.length > 0,
    ),
  );
  const remoteIds = new Set(Object.keys(input.remote.entries));

  const deleted = new Set<string>();
  for (const id of incomingDeleted) {
    if (!remoteIds.has(id)) deleted.add(id);
  }

  const next: DriverGoneStore = { entries: {} };
  const toUploadEntries: DriverGoneEntry[] = [];

  const ids = new Set([
    ...Object.keys(input.local.entries),
    ...Object.keys(input.remote.entries),
  ]);
  for (const id of ids) {
    if (deleted.has(id)) continue;
    const local = input.local.entries[id];
    const remote = input.remote.entries[id];
    if (remote && !local) {
      next.entries[id] = remote;
      continue;
    }
    if (local && !remote) {
      next.entries[id] = local;
      if (!seen.has(id)) toUploadEntries.push(local);
      continue;
    }
    if (local && remote) {
      if (local.updatedAt > remote.updatedAt) {
        next.entries[id] = local;
        toUploadEntries.push(local);
      } else {
        next.entries[id] = remote;
      }
    }
  }

  const nextSeen = new Set(seen);
  for (const id of remoteIds) nextSeen.add(id);

  return {
    next,
    deletedEntryIds: [...deleted],
    seenRemoteEntryIds: [...nextSeen],
    toDeleteRemoteEntries: [],
    toUploadEntries,
  };
}
