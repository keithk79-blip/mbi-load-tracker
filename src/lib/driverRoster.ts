/** Chicago-area driver rosters — Full + Sat, per yard. Local persist + cloud merge.
 *
 * HARD CONSTRAINT: never auto-delete / wipe / prune hired or Sat rows.
 * Sheet import and Vacation VAC may add or update marks only. Remote DELETE
 * is an explicit UI × (`removeDriver`) or Sat **Reset to full roster**
 * (`resetSatRosterFromFull`) — never sync / refresh / import. See
 * `reconcileDriverRosterCloud`.
 */

import { isValidISODate } from "./chicagoDate";
import { isFullDayOff } from "./driverAvailability";
import { sanitizeTruck } from "./truck";

export const DRIVER_ROSTER_STORE_KEY = "chitrader.load-tracker.driver-roster.v1";
export const DRIVER_ROSTER_UI_KEY = "chitrader.load-tracker.driver-roster-ui.v1";

export const DRIVER_ROSTER_YARDS = [
  "burnham",
  "rockford",
  "pontiac",
  "arc",
  "zion",
] as const;
export type DriverRosterYard = (typeof DRIVER_ROSTER_YARDS)[number];
export const DEFAULT_DRIVER_ROSTER_YARD: DriverRosterYard = "burnham";

export const DRIVER_ROSTER_KINDS = ["full", "sat"] as const;
export type DriverRosterKind = (typeof DRIVER_ROSTER_KINDS)[number];
export const DEFAULT_DRIVER_ROSTER_KIND: DriverRosterKind = "full";

/** Driver tab flipper: hired list, Saturday planning, terminated archive. */
export const DRIVER_TAB_GROUPS = ["full", "sat", "gone"] as const;
export type DriverTabGroup = (typeof DRIVER_TAB_GROUPS)[number];
export const DEFAULT_DRIVER_TAB_GROUP: DriverTabGroup = "full";

export const DRIVER_ROSTER_YARD_LABELS: Record<DriverRosterYard, string> = {
  burnham: "Burnham",
  rockford: "Rockford",
  pontiac: "Pontiac",
  arc: "Arc",
  zion: "Zion",
};

/**
 * Optional Full Roster unavailability mark. The driver stays on the hired
 * roster. `status` stores the sheet abbreviation (oot, fmla, vac, wc, …).
 * A later Today tally can do hired − full-day status − Vacation VAC − day
 * offs without a rewrite: use `fullRosterTally` + `rosterVacation`
 * (`vacationNamesOnDate` / `rosterEntryOnVacation`). Vacation-driven VAC
 * is derived at read time — do not persist it onto `status`.
 */
export type DriverRosterEntry = {
  id: string;
  kind: DriverRosterKind;
  yard: DriverRosterYard;
  /** Employee number (EMP #). Column name stays truckNumber / truck_number. */
  truckNumber: string | null;
  /**
   * Full Roster only: unit / truck the driver is using. Separate from EMP #.
   * Sat rows leave this null.
   */
  assignedTruck: string | null;
  name: string;
  /** Full Roster only: unavailability abbreviation, or null if working. */
  status: string | null;
  /** Full Roster only: first day on the job (America/Chicago). Null until known. */
  hireDate: string | null;
  /** Full Roster only: optional contact. Sat rows stay null. */
  phone: string | null;
  sortOrder: number;
  forDate: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Sheet / UI abbreviations that mean full-day unavailable (still hired). */
export const ROSTER_UNAVAILABLE_REASONS = [
  { token: "oot", label: "OOT", reason: "OOT" },
  { token: "fmla", label: "FMLA", reason: "FMLA" },
  { token: "vac", label: "Vac", reason: "Vacation" },
  { token: "wc", label: "WC", reason: "Workmans Comp" },
  { token: "pto", label: "PTO", reason: "PTO" },
  { token: "loa", label: "LOA", reason: "LOA" },
  { token: "sick", label: "Sick", reason: "Sick" },
  { token: "injured", label: "Injured", reason: "Injured" },
  { token: "off", label: "Off", reason: "Off" },
] as const;

const UNAVAIL_BY_TOKEN = new Map<string, (typeof ROSTER_UNAVAILABLE_REASONS)[number]>(
  ROSTER_UNAVAILABLE_REASONS.map((row) => [row.token, row]),
);

export type FullRosterTally = {
  hired: number;
  unavailable: number;
  available: number;
};

export type FullRosterTallyOptions = {
  /** Extra hired drivers to treat as out (Vacation-tab auto-VAC). */
  treatAsUnavailable?: (entry: DriverRosterEntry) => boolean;
};

export type DriverRosterStore = {
  entries: Record<string, DriverRosterEntry>;
};

export type DriverRosterPersisted = {
  version: 1;
  entries: Record<string, DriverRosterEntry>;
  deletedEntryIds: string[];
  seenRemoteEntryIds: string[];
  importedAt: string | null;
  /**
   * Yards whose Sat list has been seeded or edited. Empty Sat on a yard
   * that is not listed still copies from Full; a yard listed here is left
   * empty after Keith ×'s everyone (use Reset to refill).
   */
  satInitializedYards: DriverRosterYard[];
};

export type DriverRosterUi = {
  kind: DriverRosterKind;
  group: DriverTabGroup;
  yard: DriverRosterYard;
};

export type DriverRosterInput = {
  kind: DriverRosterKind;
  yard: DriverRosterYard;
  truckNumber?: string | null;
  assignedTruck?: string | null;
  name: string;
  status?: string | null;
  hireDate?: string | null;
  phone?: string | null;
  sortOrder?: number;
  forDate?: string | null;
};

const YARD_SET = new Set<string>(DRIVER_ROSTER_YARDS);
const KIND_SET = new Set<string>(DRIVER_ROSTER_KINDS);

const TAB_TO_YARD: Record<string, DriverRosterYard> = {
  burnham: "burnham",
  rockford: "rockford",
  pontiac: "pontiac",
  zion: "zion",
  arc: "arc",
  "arc drivers": "arc",
  "arc driver": "arc",
  "sat-burnham": "burnham",
  "sat-rockford": "rockford",
  "sat-pontiac": "pontiac",
  "sat-arc": "arc",
  "sat-zion": "zion",
};

export function isDriverRosterYard(value: unknown): value is DriverRosterYard {
  return typeof value === "string" && YARD_SET.has(value);
}

export function isDriverRosterKind(value: unknown): value is DriverRosterKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function cleanDriverRosterYard(value: unknown): DriverRosterYard {
  return isDriverRosterYard(value) ? value : DEFAULT_DRIVER_ROSTER_YARD;
}

export function cleanDriverRosterKind(value: unknown): DriverRosterKind {
  return isDriverRosterKind(value) ? value : DEFAULT_DRIVER_ROSTER_KIND;
}

export function isDriverTabGroup(value: unknown): value is DriverTabGroup {
  return value === "full" || value === "sat" || value === "gone";
}

export function cleanDriverTabGroup(
  value: unknown,
  fallbackKind: DriverRosterKind = DEFAULT_DRIVER_ROSTER_KIND,
): DriverTabGroup {
  if (value === "gone") return "gone";
  if (isDriverRosterKind(value)) return value;
  return fallbackKind;
}

export function driverRosterYardLabel(yard: DriverRosterYard): string {
  return DRIVER_ROSTER_YARD_LABELS[yard];
}

/** Map a sheet tab title (Burnham, ARC Drivers, Sat-Arc, …) to a yard key. */
export function yardFromSheetTab(tab: string): DriverRosterYard | null {
  const key = tab.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
  if (TAB_TO_YARD[key]) return TAB_TO_YARD[key];
  const compact = key.replace(/\s+/g, "-");
  if (TAB_TO_YARD[compact]) return TAB_TO_YARD[compact];
  const noSat = key.replace(/^sat[\s-]+/, "");
  if (TAB_TO_YARD[noSat]) return TAB_TO_YARD[noSat];
  if (noSat.startsWith("arc")) return "arc";
  return null;
}

export function cleanTruckNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d{1,8}$/.test(trimmed)) return null;
  return trimmed.replace(/^0+(?=\d)/, "") || "0";
}

/** Unit / truck assignment (digits or broker code). Not the employee number. */
export function cleanAssignedTruck(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = sanitizeTruck(raw);
  return cleaned || null;
}

export function cleanDriverName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

export function cleanPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 24);
}

function normalizeRosterPersonName(name: string): string {
  return cleanDriverName(name)
    .toLowerCase()
    .replace(/\s*-\s*t\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanDriverStatus(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const known = UNAVAIL_BY_TOKEN.get(trimmed.toLowerCase());
  return known ? known.token : trimmed;
}

export function isRosterUnavailableToken(raw: string): boolean {
  return UNAVAIL_BY_TOKEN.has(raw.trim().toLowerCase());
}

/** Dispatcher label for a stored abbreviation (`oot` → `OOT`). */
export function rosterStatusLabel(status: string | null | undefined): string {
  const cleaned = cleanDriverStatus(status ?? null);
  if (!cleaned) return "";
  return UNAVAIL_BY_TOKEN.get(cleaned.toLowerCase())?.label ?? cleaned.toUpperCase();
}

/**
 * True when this hired-roster mark should drop the driver from an available
 * tally. Same idea as Today's `isFullDayOff`: full-day reasons subtract;
 * Late/Early and operational notes do not. Known sheet abbreviations
 * (oot / fmla / vac / wc / …) are full-day. Unknown short status-column
 * tokens also subtract — that column is only used for out marks.
 */
export function rosterStatusRemovesFromAvailable(status: string | null | undefined): boolean {
  const cleaned = cleanDriverStatus(status ?? null);
  if (!cleaned) return false;
  if (isRosterUnavailableToken(cleaned)) return true;
  if (isFullDayOff(cleaned)) return true;
  const reason = UNAVAIL_BY_TOKEN.get(cleaned.toLowerCase())?.reason;
  if (reason && isFullDayOff(reason)) return true;
  if (/late[\s/-]*early/i.test(cleaned)) return false;
  return /^[a-z]{2,8}$/i.test(cleaned);
}

export function fullRosterTally(
  entries: readonly DriverRosterEntry[],
  options?: FullRosterTallyOptions,
): FullRosterTally {
  let hired = 0;
  let unavailable = 0;
  for (const entry of entries) {
    if (entry.kind !== "full") continue;
    hired += 1;
    const out =
      rosterStatusRemovesFromAvailable(entry.status) ||
      Boolean(options?.treatAsUnavailable?.(entry));
    if (out) unavailable += 1;
  }
  return {
    hired,
    unavailable,
    available: Math.max(0, hired - unavailable),
  };
}

export function cleanForDate(raw: unknown): string | null {
  return typeof raw === "string" && isValidISODate(raw) ? raw : null;
}

/** Deterministic UUID so two devices import the same sheet row as one id. */
export function driverRosterSeedId(key: string): string {
  const bytes = new Uint8Array(16);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    bytes[i % 16] ^= h & 0xff;
    bytes[(i + 5) % 16] ^= (h >>> 8) & 0xff;
    bytes[(i + 11) % 16] ^= (h >>> 16) & 0xff;
  }
  for (let i = 0; i < 16; i++) {
    h = Math.imul(h ^ bytes[i], 0x01000193);
    bytes[i] ^= (h >>> (i % 24)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newDriverRosterId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return driverRosterSeedId(`local-${Date.now()}-${Math.random()}`);
}

export function importEntryId(input: {
  kind: DriverRosterKind;
  yard: DriverRosterYard;
  truckNumber: string | null;
  name: string;
  index: number;
}): string {
  const nameKey = cleanDriverName(input.name).toLowerCase();
  const truck = input.truckNumber ?? "";
  return driverRosterSeedId(`${input.kind}|${input.yard}|${truck}|${nameKey}|${input.index}`);
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

export function emptyDriverRosterStore(): DriverRosterStore {
  return { entries: {} };
}

export function emptyDriverRosterPersisted(): DriverRosterPersisted {
  return {
    version: 1,
    entries: {},
    deletedEntryIds: [],
    seenRemoteEntryIds: [],
    importedAt: null,
    satInitializedYards: [],
  };
}

function parseYardList(raw: unknown): DriverRosterYard[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((yard): yard is DriverRosterYard => isDriverRosterYard(yard)))];
}

function inferSatInitializedYards(entries: Record<string, DriverRosterEntry>): DriverRosterYard[] {
  const yards = new Set<DriverRosterYard>();
  for (const entry of Object.values(entries)) {
    if (entry.kind === "sat") yards.add(entry.yard);
  }
  return [...yards];
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export function cleanDriverRosterEntry(raw: unknown): DriverRosterEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const name = cleanDriverName(rec.name);
  if (!name) return null;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : null;
  if (!id) return null;
  const kind = cleanDriverRosterKind(rec.kind);
  const yard = cleanDriverRosterYard(rec.yard);
  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt ? rec.createdAt : nowIso();
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : createdAt;
  const sortOrder =
    typeof rec.sortOrder === "number" && Number.isFinite(rec.sortOrder)
      ? Math.floor(rec.sortOrder)
      : 0;
  return {
    id,
    kind,
    yard,
    truckNumber: cleanTruckNumber(rec.truckNumber),
    assignedTruck:
      kind === "full"
        ? cleanAssignedTruck(rec.assignedTruck ?? rec.assigned_truck)
        : null,
    name,
    status: kind === "full" ? cleanDriverStatus(rec.status) : null,
    hireDate: kind === "full" ? cleanForDate(rec.hireDate ?? rec.hire_date) : null,
    phone: kind === "full" ? cleanPhone(rec.phone) : null,
    sortOrder,
    forDate: kind === "sat" ? cleanForDate(rec.forDate) : null,
    createdAt,
    updatedAt,
  };
}

export function readDriverRosterPersisted(): DriverRosterPersisted {
  try {
    const raw = localStorage.getItem(DRIVER_ROSTER_STORE_KEY);
    if (!raw) return emptyDriverRosterPersisted();
    const parsed = JSON.parse(raw) as Partial<DriverRosterPersisted>;
    const entries: Record<string, DriverRosterEntry> = {};
    if (parsed.entries && typeof parsed.entries === "object") {
      for (const value of Object.values(parsed.entries)) {
        const cleaned = cleanDriverRosterEntry(value);
        if (cleaned) entries[cleaned.id] = cleaned;
      }
    }
    return {
      version: 1,
      entries,
      deletedEntryIds: parseIdList(parsed.deletedEntryIds),
      seenRemoteEntryIds: parseIdList(parsed.seenRemoteEntryIds),
      importedAt: typeof parsed.importedAt === "string" ? parsed.importedAt : null,
      satInitializedYards: Array.isArray(parsed.satInitializedYards)
        ? parseYardList(parsed.satInitializedYards)
        : inferSatInitializedYards(entries),
    };
  } catch {
    return emptyDriverRosterPersisted();
  }
}

export function writeDriverRosterPersisted(next: DriverRosterPersisted): void {
  const payload: DriverRosterPersisted = {
    version: 1,
    entries: next.entries,
    deletedEntryIds: parseIdList(next.deletedEntryIds),
    seenRemoteEntryIds: parseIdList(next.seenRemoteEntryIds),
    importedAt: next.importedAt ?? null,
    satInitializedYards: parseYardList(next.satInitializedYards),
  };
  localStorage.setItem(DRIVER_ROSTER_STORE_KEY, JSON.stringify(payload));
}

export function readDriverRosterUi(): DriverRosterUi {
  const fallback = {
    kind: DEFAULT_DRIVER_ROSTER_KIND,
    group: DEFAULT_DRIVER_TAB_GROUP,
    yard: DEFAULT_DRIVER_ROSTER_YARD,
  };
  try {
    const raw = localStorage.getItem(DRIVER_ROSTER_UI_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DriverRosterUi> & { kind?: unknown };
    const kind = cleanDriverRosterKind(parsed.kind);
    return {
      kind,
      group: cleanDriverTabGroup(parsed.group ?? parsed.kind, kind),
      yard: cleanDriverRosterYard(parsed.yard),
    };
  } catch {
    return fallback;
  }
}

export function writeDriverRosterUi(ui: DriverRosterUi): void {
  const kind = cleanDriverRosterKind(ui.kind);
  localStorage.setItem(
    DRIVER_ROSTER_UI_KEY,
    JSON.stringify({
      kind,
      group: cleanDriverTabGroup(ui.group, kind),
      yard: cleanDriverRosterYard(ui.yard),
    }),
  );
}

/** Local hide after an explicit UI ×. Sync must not invent these ids. */
export function applyRosterTombstones(
  store: DriverRosterStore,
  deletedIds: Iterable<string>,
): DriverRosterStore {
  const deleted = new Set(
    [...deletedIds].filter((id) => typeof id === "string" && id.length > 0),
  );
  if (!deleted.size) return store;
  const entries = { ...store.entries };
  for (const id of deleted) delete entries[id];
  return { entries };
}

export function rosterEntryCount(
  store: DriverRosterStore,
  kind: DriverRosterKind,
  yard: DriverRosterYard,
): number {
  return entriesForRoster(store, kind, yard).length;
}

function preferRosterDuplicate(a: DriverRosterEntry, b: DriverRosterEntry): DriverRosterEntry {
  const aEmp = Boolean(cleanTruckNumber(a.truckNumber));
  const bEmp = Boolean(cleanTruckNumber(b.truckNumber));
  if (aEmp !== bEmp) return aEmp ? a : b;
  if (Boolean(a.hireDate) !== Boolean(b.hireDate)) return a.hireDate ? a : b;
  if (Boolean(a.assignedTruck) !== Boolean(b.assignedTruck)) {
    return a.assignedTruck ? a : b;
  }
  if (a.updatedAt !== b.updatedAt) return a.updatedAt >= b.updatedAt ? a : b;
  if (a.createdAt !== b.createdAt) return a.createdAt <= b.createdAt ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * One hired / Sat row per person at a yard. Emp # wins; a name-only copy of
 * the same person is dropped. Trainer `-T` suffixes do not make a second row.
 */
export function collapseDuplicateRosterEntries(store: DriverRosterStore): {
  store: DriverRosterStore;
  droppedIds: string[];
} {
  const buckets = new Map<string, DriverRosterEntry[]>();
  for (const entry of Object.values(store.entries)) {
    const group = `${entry.kind}:${entry.yard}`;
    const list = buckets.get(group);
    if (list) list.push(entry);
    else buckets.set(group, [entry]);
  }

  const keep = new Map<string, DriverRosterEntry>();
  const droppedIds: string[] = [];

  for (const list of buckets.values()) {
    const byEmp = new Map<string, DriverRosterEntry>();
    for (const entry of list) {
      const emp = cleanTruckNumber(entry.truckNumber);
      if (!emp) continue;
      const existing = byEmp.get(emp);
      if (!existing) {
        byEmp.set(emp, entry);
        continue;
      }
      const winner = preferRosterDuplicate(existing, entry);
      droppedIds.push(winner.id === existing.id ? entry.id : existing.id);
      byEmp.set(emp, winner);
    }
    const namesHeld = new Set(
      [...byEmp.values()].map((entry) => normalizeRosterPersonName(entry.name)),
    );
    const byName = new Map<string, DriverRosterEntry>();
    for (const entry of list) {
      if (cleanTruckNumber(entry.truckNumber)) continue;
      const name = normalizeRosterPersonName(entry.name);
      if (!name) {
        droppedIds.push(entry.id);
        continue;
      }
      if (namesHeld.has(name)) {
        droppedIds.push(entry.id);
        continue;
      }
      const existing = byName.get(name);
      if (!existing) {
        byName.set(name, entry);
        continue;
      }
      const winner = preferRosterDuplicate(existing, entry);
      droppedIds.push(winner.id === existing.id ? entry.id : existing.id);
      byName.set(name, winner);
    }
    for (const entry of [...byEmp.values(), ...byName.values()]) {
      keep.set(entry.id, entry);
    }
  }

  if (!droppedIds.length) return { store, droppedIds: [] };
  const entries: Record<string, DriverRosterEntry> = {};
  for (const [id, entry] of keep) entries[id] = entry;
  return { store: { entries }, droppedIds: [...new Set(droppedIds)] };
}

export function entriesForRoster(
  store: DriverRosterStore,
  kind: DriverRosterKind,
  yard: DriverRosterYard,
): DriverRosterEntry[] {
  const collapsed = collapseDuplicateRosterEntries(store).store;
  return Object.values(collapsed.entries)
    .filter((entry) => entry.kind === kind && entry.yard === yard)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const truck = (a.truckNumber ?? "").localeCompare(b.truckNumber ?? "", "en", {
        numeric: true,
      });
      if (truck !== 0) return truck;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
}

/**
 * Unique hired Full Roster names across every yard (Burnham / Rockford /
 * Pontiac / Arc / Zion). Sat-only rows are ignored. This is the in-app
 * system of record for driver-name typeahead — not a live sheet pull.
 */
export function fullRosterHiredNames(store: DriverRosterStore): string[] {
  const map = new Map<string, string>();
  for (const entry of Object.values(store.entries)) {
    if (entry.kind !== "full") continue;
    const name = cleanDriverName(entry.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, name);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

/** Vacation-style typeahead: substring match, first `limit` hits. */
export function matchDriverNameSuggestions(
  names: readonly string[],
  query: string,
  limit = 8,
): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const out: string[] = [];
  for (const name of names) {
    if (!name.toLowerCase().includes(needle)) continue;
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export function satDateForYard(store: DriverRosterStore, yard: DriverRosterYard): string | null {
  for (const entry of entriesForRoster(store, "sat", yard)) {
    if (entry.forDate) return entry.forDate;
  }
  return null;
}

export function nextSortOrder(
  store: DriverRosterStore,
  kind: DriverRosterKind,
  yard: DriverRosterYard,
): number {
  let max = -1;
  for (const entry of Object.values(store.entries)) {
    if (entry.kind === kind && entry.yard === yard) {
      max = Math.max(max, entry.sortOrder);
    }
  }
  return max + 1;
}

export function formatRosterLine(entry: Pick<DriverRosterEntry, "truckNumber" | "name">): string {
  const truck = entry.truckNumber?.trim();
  const name = cleanDriverName(entry.name);
  return truck ? `${truck} ${name}` : name;
}

/** Newline-separated `emp# name` lines for email paste. Independent of Sat grid layout. */
export function formatRosterCopyList(entries: readonly DriverRosterEntry[]): string {
  return entries.map(formatRosterLine).filter(Boolean).join("\n");
}

/** Stable Sat id so two devices seeding the same Full hire land on one row. */
export function satEntryIdFromFull(
  yard: DriverRosterYard,
  truckNumber: string | null,
  name: string,
): string {
  const nameKey = cleanDriverName(name).toLowerCase();
  const truck = cleanTruckNumber(truckNumber) ?? "";
  return driverRosterSeedId(`sat-from-full|${cleanDriverRosterYard(yard)}|${truck}|${nameKey}`);
}

function rosterIdentityKey(entry: Pick<DriverRosterEntry, "truckNumber" | "name">): string {
  return `${entry.truckNumber ?? ""}\u0000${cleanDriverName(entry.name).toLowerCase()}`;
}

export function rosterPersonMatches(
  a: Pick<DriverRosterEntry, "truckNumber" | "name">,
  b: Pick<DriverRosterEntry, "truckNumber" | "name">,
): boolean {
  return rosterIdentityKey(a) === rosterIdentityKey(b);
}

/** Sat planning rows for the same emp# + name (any yard). */
export function matchingSatEntriesForPerson(
  store: DriverRosterStore,
  person: Pick<DriverRosterEntry, "truckNumber" | "name">,
): DriverRosterEntry[] {
  return Object.values(store.entries).filter(
    (entry) => entry.kind === "sat" && rosterPersonMatches(entry, person),
  );
}

/**
 * Explicit Full Roster × — drop the hired row and any Sat row for that person.
 * Sync may DELETE only these user-initiated ids.
 */
export function removeHiredAndMatchingSat(
  store: DriverRosterStore,
  id: string,
): { store: DriverRosterStore; removed: DriverRosterEntry[] } {
  const target = store.entries[id];
  if (!target) return { store, removed: [] };
  const ids = new Set<string>([id]);
  if (target.kind === "full") {
    for (const sat of matchingSatEntriesForPerson(store, target)) {
      ids.add(sat.id);
    }
  }
  let next = store;
  const removed: DriverRosterEntry[] = [];
  for (const removeId of ids) {
    const result = removeRosterEntry(next, removeId);
    next = result.store;
    if (result.removed) removed.push(result.removed);
  }
  return { store: next, removed };
}

/** True when Sat emp# + name + order match this yard's current Full hired list. */
export function satRosterMatchesFull(
  store: DriverRosterStore,
  yard: DriverRosterYard,
): boolean {
  const sat = entriesForRoster(store, "sat", yard);
  const full = entriesForRoster(store, "full", yard);
  if (sat.length !== full.length) return false;
  return sat.every((row, index) => rosterIdentityKey(row) === rosterIdentityKey(full[index]));
}

export type SeedEmptySatFromFullResult = {
  store: DriverRosterStore;
  added: number;
  seededYards: DriverRosterYard[];
};

/**
 * When Sat for a yard is empty and Full has hired drivers, copy emp# + name
 * into Sat. Does not overwrite a Sat list that already has rows, does not
 * copy Full status marks, and never touches other yards' existing Sat rows.
 */
export function seedEmptySatRostersFromFull(
  store: DriverRosterStore,
  opts?: { yards?: readonly DriverRosterYard[]; at?: string },
): SeedEmptySatFromFullResult {
  const yards = opts?.yards?.length ? opts.yards.map(cleanDriverRosterYard) : [...DRIVER_ROSTER_YARDS];
  const at = opts?.at;
  const collapsed = collapseDuplicateRosterEntries(store);
  let next = collapsed.store;
  let added = 0;
  const seededYards: DriverRosterYard[] = [];

  for (const yard of yards) {
    if (rosterEntryCount(next, "sat", yard) > 0) continue;
    const full = entriesForRoster(next, "full", yard);
    if (!full.length) continue;
    const forDate = satDateForYard(next, yard);
    let yardAdded = 0;
    for (let index = 0; index < full.length; index += 1) {
      const person = full[index];
      const result = addRosterEntry(
        next,
        {
          kind: "sat",
          yard,
          truckNumber: person.truckNumber,
          name: person.name,
          sortOrder: index,
          forDate,
        },
        {
          id: satEntryIdFromFull(yard, person.truckNumber, person.name),
          at,
        },
      );
      if (result.entry) {
        next = result.store;
        added += 1;
        yardAdded += 1;
      }
    }
    if (yardAdded) seededYards.push(yard);
  }

  return { store: next, added, seededYards };
}

export type ResetSatRosterFromFullResult = {
  store: DriverRosterStore;
  removedIds: string[];
  addedIds: string[];
};

/**
 * User-initiated rewrite of one yard's Sat list from that yard's current
 * Full Roster. Other yards and Full Roster are untouched. Caller persists
 * and may DELETE+upsert the replaced Sat rows — this is Reset, not sync prune.
 */
export function resetSatRosterFromFull(
  store: DriverRosterStore,
  yard: DriverRosterYard,
  opts?: { at?: string; forDate?: string | null },
): ResetSatRosterFromFullResult {
  const cleanedYard = cleanDriverRosterYard(yard);
  const collapsed = collapseDuplicateRosterEntries(store);
  let next = collapsed.store;
  const full = entriesForRoster(next, "full", cleanedYard);
  const existingSat = Object.values(next.entries).filter(
    (entry) => entry.kind === "sat" && entry.yard === cleanedYard,
  );
  const forDate =
    opts?.forDate !== undefined ? cleanForDate(opts.forDate) : satDateForYard(next, cleanedYard);
  const at = opts?.at;
  const nextIds = new Set(
    full.map((person) => satEntryIdFromFull(cleanedYard, person.truckNumber, person.name)),
  );
  const removedIds = [
    ...collapsed.droppedIds,
    ...existingSat.map((entry) => entry.id).filter((id) => !nextIds.has(id)),
  ];

  for (const id of removedIds) {
    next = removeRosterEntry(next, id).store;
  }

  const addedIds: string[] = [];
  for (let index = 0; index < full.length; index += 1) {
    const person = full[index];
    const id = satEntryIdFromFull(cleanedYard, person.truckNumber, person.name);
    const prev = next.entries[id];
    const result = addRosterEntry(
      next,
      {
        kind: "sat",
        yard: cleanedYard,
        truckNumber: person.truckNumber,
        name: person.name,
        sortOrder: index,
        forDate,
      },
      { id, at, createdAt: prev?.createdAt },
    );
    if (result.entry) {
      next = result.store;
      addedIds.push(id);
    }
  }

  return { store: next, removedIds, addedIds };
}

export function addRosterEntry(
  store: DriverRosterStore,
  input: DriverRosterInput,
  opts?: { id?: string; at?: string; createdAt?: string },
): { store: DriverRosterStore; entry: DriverRosterEntry | null } {
  const name = cleanDriverName(input.name);
  if (!name) return { store, entry: null };
  const at = nowIso(opts?.at);
  const kind = cleanDriverRosterKind(input.kind);
  const yard = cleanDriverRosterYard(input.yard);
  const entry: DriverRosterEntry = {
    id: opts?.id ?? newDriverRosterId(),
    kind,
    yard,
    truckNumber: cleanTruckNumber(input.truckNumber ?? null),
    assignedTruck: kind === "full" ? cleanAssignedTruck(input.assignedTruck ?? null) : null,
    name,
    status: kind === "full" ? cleanDriverStatus(input.status ?? null) : null,
    hireDate: kind === "full" ? cleanForDate(input.hireDate ?? null) : null,
    phone: kind === "full" ? cleanPhone(input.phone ?? null) : null,
    sortOrder:
      typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
        ? Math.floor(input.sortOrder)
        : nextSortOrder(store, kind, yard),
    forDate: kind === "sat" ? cleanForDate(input.forDate ?? null) : null,
    createdAt: opts?.createdAt ?? at,
    updatedAt: at,
  };
  return { store: { entries: { ...store.entries, [entry.id]: entry } }, entry };
}

export function updateRosterEntry(
  store: DriverRosterStore,
  id: string,
  patch: Partial<
    Pick<
      DriverRosterEntry,
      "truckNumber" | "assignedTruck" | "name" | "status" | "hireDate" | "phone" | "sortOrder" | "forDate"
    >
  >,
  at?: string,
): DriverRosterStore {
  const prev = store.entries[id];
  if (!prev) return store;
  const name = patch.name !== undefined ? cleanDriverName(patch.name) : prev.name;
  if (!name) return store;
  const next: DriverRosterEntry = {
    ...prev,
    truckNumber:
      patch.truckNumber !== undefined ? cleanTruckNumber(patch.truckNumber) : prev.truckNumber,
    assignedTruck:
      prev.kind === "full"
        ? patch.assignedTruck !== undefined
          ? cleanAssignedTruck(patch.assignedTruck)
          : prev.assignedTruck
        : null,
    name,
    status:
      prev.kind === "full"
        ? patch.status !== undefined
          ? cleanDriverStatus(patch.status)
          : prev.status
        : null,
    hireDate:
      prev.kind === "full"
        ? patch.hireDate !== undefined
          ? cleanForDate(patch.hireDate)
          : prev.hireDate
        : null,
    phone:
      prev.kind === "full"
        ? patch.phone !== undefined
          ? cleanPhone(patch.phone)
          : prev.phone
        : null,
    sortOrder:
      typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)
        ? Math.floor(patch.sortOrder)
        : prev.sortOrder,
    forDate:
      prev.kind === "sat"
        ? patch.forDate !== undefined
          ? cleanForDate(patch.forDate)
          : prev.forDate
        : null,
    updatedAt: nowIso(at),
  };
  return { entries: { ...store.entries, [id]: next } };
}

export function removeRosterEntry(
  store: DriverRosterStore,
  id: string,
): { store: DriverRosterStore; removed: DriverRosterEntry | null } {
  const removed = store.entries[id] ?? null;
  if (!removed) return { store, removed: null };
  const entries = { ...store.entries };
  delete entries[id];
  return { store: { entries }, removed };
}

export function moveRosterEntry(
  store: DriverRosterStore,
  id: string,
  delta: -1 | 1,
  at?: string,
): DriverRosterStore {
  const current = store.entries[id];
  if (!current) return store;
  const list = entriesForRoster(store, current.kind, current.yard);
  const index = list.findIndex((row) => row.id === id);
  const swap = list[index + delta];
  if (!swap || index < 0) return store;
  const stamp = nowIso(at);
  return {
    entries: {
      ...store.entries,
      [current.id]: { ...current, sortOrder: swap.sortOrder, updatedAt: stamp },
      [swap.id]: { ...swap, sortOrder: current.sortOrder, updatedAt: stamp },
    },
  };
}

export function setSatDateForYard(
  store: DriverRosterStore,
  yard: DriverRosterYard,
  forDate: string | null,
  at?: string,
): DriverRosterStore {
  const cleaned = cleanForDate(forDate);
  const stamp = nowIso(at);
  const entries = { ...store.entries };
  let changed = false;
  for (const entry of Object.values(store.entries)) {
    if (entry.kind !== "sat" || entry.yard !== yard) continue;
    if (entry.forDate === cleaned) continue;
    entries[entry.id] = { ...entry, forDate: cleaned, updatedAt: stamp };
    changed = true;
  }
  return changed ? { entries } : store;
}

export type ImportedRosterRow = {
  kind: DriverRosterKind;
  yard: DriverRosterYard;
  truckNumber: string | null;
  assignedTruck?: string | null;
  name: string;
  status: string | null;
  forDate: string | null;
};

/**
 * Fill empty kind+yard groups from the sheet. Never drops hired / Sat rows
 * that are already in the store — a thinner sheet must not prune the roster.
 */
export function mergeImportedRows(
  store: DriverRosterStore,
  rows: readonly ImportedRosterRow[],
  opts?: { at?: string },
): { store: DriverRosterStore; added: number; skippedGroups: string[] } {
  const at = nowIso(opts?.at);
  const occupied = new Set<string>();
  for (const entry of Object.values(store.entries)) {
    occupied.add(`${entry.kind}:${entry.yard}`);
  }
  const skippedGroups: string[] = [];
  const seenSkip = new Set<string>();
  let next = store;
  let added = 0;
  const counters = new Map<string, number>();

  for (const row of rows) {
    const group = `${row.kind}:${row.yard}`;
    if (occupied.has(group)) {
      if (!seenSkip.has(group)) {
        seenSkip.add(group);
        skippedGroups.push(group);
      }
      continue;
    }
    const index = counters.get(group) ?? 0;
    counters.set(group, index + 1);
    const result = addRosterEntry(
      next,
      {
        kind: row.kind,
        yard: row.yard,
        truckNumber: row.truckNumber,
        assignedTruck: row.assignedTruck ?? null,
        name: row.name,
        status: row.status,
        sortOrder: index,
        forDate: row.forDate,
      },
      {
        id: importEntryId({
          kind: row.kind,
          yard: row.yard,
          truckNumber: row.truckNumber,
          name: row.name,
          index,
        }),
        at,
      },
    );
    if (result.entry) {
      next = result.store;
      added += 1;
    }
  }

  return { store: next, added, skippedGroups };
}

export function rosterStoreIsEmpty(store: DriverRosterStore): boolean {
  return Object.keys(store.entries).length === 0;
}

/** Match .drv-sat-grid breakpoints: 3 cols default, 2 at <=1199, 1 at <=639. */
export const SAT_ROSTER_WIDE_MAX = 1199;
export const SAT_ROSTER_MID_MAX = 639;

export function satRosterColumnCount(viewportWidth: number): number {
  if (viewportWidth <= SAT_ROSTER_MID_MAX) return 1;
  if (viewportWidth <= SAT_ROSTER_WIDE_MAX) return 2;
  return 3;
}

/** Rows needed so CSS grid-auto-flow:column fills top-to-bottom, then next column. */
export function satRosterRowCount(entryCount: number, columnCount: number): number {
  if (entryCount <= 0) return 1;
  return Math.max(1, Math.ceil(entryCount / Math.max(1, columnCount)));
}

/** Full Roster uses the same multi-column density as Sat Roster. */
export const fullRosterColumnCount = satRosterColumnCount;
export const fullRosterRowCount = satRosterRowCount;

/**
 * Full Roster drivers assigned to this unit / truck (not EMP #).
 * Day/truck search uses this to show who is using the truck.
 */
export function fullRosterDriversForTruck(
  store: DriverRosterStore,
  truck: string,
): DriverRosterEntry[] {
  const needle = cleanAssignedTruck(truck);
  if (!needle) return [];
  return Object.values(store.entries)
    .filter(
      (entry) =>
        entry.kind === "full" && cleanAssignedTruck(entry.assignedTruck) === needle,
    )
    .sort((a, b) => {
      const yard = a.yard.localeCompare(b.yard);
      if (yard !== 0) return yard;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });
}

/**
 * A truck # can only sit on one Full Roster driver at a time. Returns the
 * other driver already holding it, or null when the number is free.
 * `excludeId` lets an existing card re-save its own unchanged number.
 */
export function findAssignedTruckConflict(
  store: DriverRosterStore,
  truck: string | null,
  excludeId?: string,
): DriverRosterEntry | null {
  const needle = cleanAssignedTruck(truck);
  if (!needle) return null;
  for (const entry of Object.values(store.entries)) {
    if (entry.kind !== "full") continue;
    if (entry.id === excludeId) continue;
    if (cleanAssignedTruck(entry.assignedTruck) === needle) return entry;
  }
  return null;
}

export type DriverRosterCloudReconcileInput = {

  local: DriverRosterStore;
  remote: DriverRosterStore;
  deletedEntryIds: Iterable<string>;
  seenRemoteEntryIds?: Iterable<string>;
};

export type DriverRosterCloudReconcileResult = {
  next: DriverRosterStore;
  deletedEntryIds: string[];
  seenRemoteEntryIds: string[];
  toDeleteRemoteEntries: string[];
  toUploadEntries: DriverRosterEntry[];
};

/**
 * HARD CONSTRAINT — same class as loads / vacation silent wipes:
 * Sync must never delete, wipe, or prune hired Full Roster or Sat Roster
 * rows unless Keith pressed × in the UI or Reset to full roster.
 *
 * - No subset-pull hides, no seen-missing tombstones, no wipe-then-reinsert.
 * - Empty / thin remote keeps every local row. Cloud-only remote rows upsert in.
 * - Explicit × / Reset tombstones stick even if remote still has the row, and
 *   those ids are retried on `toDeleteRemoteEntries`. Sync never invents deletes
 *   for ids Keith did not remove.
 * - Sheet import and Vacation auto-VAC may add or update marks; they never
 *   remove rows.
 */
export function reconcileDriverRosterCloud(
  input: DriverRosterCloudReconcileInput,
): DriverRosterCloudReconcileResult {
  const incomingDeleted = new Set(
    [...input.deletedEntryIds].filter((id) => typeof id === "string" && id.length > 0),
  );
  const seen = new Set(
    [...(input.seenRemoteEntryIds ?? [])].filter(
      (id) => typeof id === "string" && id.length > 0,
    ),
  );
  const remoteIds = new Set(Object.keys(input.remote.entries));
  const deleted = new Set(incomingDeleted);
  const toDeleteRemoteEntries = [...deleted].filter((id) => remoteIds.has(id));

  const next: DriverRosterStore = { entries: {} };
  const toUploadEntries: DriverRosterEntry[] = [];

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
    toDeleteRemoteEntries,
    toUploadEntries,
  };
}

export function preservePhones(
  previous: DriverRosterStore,
  incoming: DriverRosterStore,
): DriverRosterStore {
  const entries: Record<string, DriverRosterEntry> = { ...incoming.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (row.kind !== "full") continue;
    if (cleanPhone(row.phone)) continue;
    const kept = cleanPhone(previous.entries[id]?.phone ?? null);
    if (!kept) continue;
    entries[id] = { ...row, phone: kept };
  }
  return { entries };
}

export function phonesNeedingUpload(
  store: DriverRosterStore,
  remote: DriverRosterStore,
): DriverRosterEntry[] {
  const out: DriverRosterEntry[] = [];
  for (const row of Object.values(store.entries)) {
    if (row.kind !== "full") continue;
    const local = cleanPhone(row.phone);
    if (!local) continue;
    const remotePhone = cleanPhone(remote.entries[row.id]?.phone ?? null);
    if (local !== remotePhone) out.push(row);
  }
  return out;
}

