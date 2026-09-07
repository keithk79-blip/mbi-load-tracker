/** Walking-floor / specialty load board (day-scoped open slots). */

import { destinationsFor } from "../data/stations";
import { isValidISODate } from "./chicagoDate";

export type SpecialtyStation = {
  id: string;
  name: string;
};

/** Stations from the Specialty Load Board sheet (skip empty X columns). */
export const SPECIALTY_STATIONS: SpecialtyStation[] = [
  { id: "elgin", name: "Elgin" },
  { id: "apollo", name: "Apollo" },
  { id: "melrose", name: "Melrose" },
  { id: "batavia", name: "Batavia" },
  { id: "northlake", name: "N. Lake" },
  { id: "arc", name: "Arc" },
  { id: "citiwaste", name: "Citi Waste" },
  { id: "schererville", name: "Schererville" },
  { id: "mccook", name: "McCook" },
  { id: "dekalb-reload", name: "Dekalb Reload" },
  { id: "wheeling", name: "Wheeling" },
  { id: "rockdale", name: "Rockdale" },
  { id: "dekalb", name: "Dekalb" },
  { id: "roscoe", name: "Roscoe" },
  { id: "ford", name: "Ford" },
  { id: "prairie-hill", name: "PrairieHill" },
  { id: "hodgkins", name: "Hodgkins" },
  { id: "gray-tank", name: "Gray Tank" },
  { id: "liberty-tank", name: "Liberty" },
  { id: "herthside", name: "Hearthside" },
];

/** Quick destinations for specialty / walking-floor opens. */
export const SPECIALTY_DESTINATIONS = [
  "RSI",
  "Hodgkins",
  "Homewood",
  "Groot",
  "DeKalb",
  "CID",
  "Kankakee",
  "Rockford",
  "Prairie Hill",
  "Pontiac",
  "Liberty",
  "Newton County",
  "Covanta",
  "Loop",
  "Willow Ranch",
  "Organix",
] as const;

/** Stations whose dest chips follow the pickup catalog instead of the global list. */
const SPECIALTY_CATALOG_DEST_IDS = new Set(["gray-tank", "herthside", "hodgkins"]);

/** Apollo specialty dests are a subset of log-load dests (no Newton County). */
const SPECIALTY_DEST_OVERRIDES: Record<string, readonly string[]> = {
  apollo: ["Pontiac", "Christianson Farms", "Organix", "Homewood"],
  elgin: [
    "Hodgkins",
    "DeKalb",
    "Covanta",
    "RSI",
    "Prairie Hill",
    "Lake Co MRF",
    "DuPage",
  ],
  melrose: ["Hodgkins", "RSI", "Willow Ranch", "Homewood"],
  batavia: ["Hodgkins", "Lake Co MRF", "RSI"],
  northlake: ["Hodgkins", "Thelens", "Organix"],
  arc: ["Organix", "Hodgkins", "Thelens", "Resource MGT"],
  citiwaste: [
    "Joyce Farms",
    "Hodgkins",
    "WCN MRF",
    "Homewood",
    "Pontiac",
    "Loop",
  ],
  schererville: ["Homewood"],
  mccook: ["Christianson Farms"],
  "dekalb-reload": ["Hodgkins", "RSI"],
};

/** Per-station dest chips; restricted yards match (or subset) log-load dests. */
export function specialtyDestinationsFor(stationId: string): readonly string[] {
  if (SPECIALTY_DEST_OVERRIDES[stationId]) return SPECIALTY_DEST_OVERRIDES[stationId];
  if (SPECIALTY_CATALOG_DEST_IDS.has(stationId)) return destinationsFor(stationId);
  return SPECIALTY_DESTINATIONS;
}

export function specialtyDestHint(stationId: string): string {
  if (stationId === "gray-tank") return "Leachate destination for new open load";
  if (stationId === "herthside") return "Trash destination for new open load";
  if (stationId === "hodgkins") {
    return "Residual · Pontiac/Liberty · Glass · Strategic/Resource MGT";
  }
  if (stationId === "apollo") {
    return "Pontiac · Christianson Farms · Organix · Homewood";
  }
  if (stationId === "elgin") {
    return "Hodgkins · DeKalb · Covanta · RSI · Prairie Hill · Lake Co MRF · DuPage";
  }
  if (stationId === "melrose") {
    return "Hodgkins · RSI · Willow Ranch · Homewood";
  }
  if (stationId === "batavia") {
    return "Hodgkins · Lake Co MRF · RSI";
  }
  if (stationId === "northlake") {
    return "Hodgkins · Thelens · Organix";
  }
  if (stationId === "arc") {
    return "Organix · Hodgkins · Thelens · Resource MGT";
  }
  if (stationId === "citiwaste") {
    return "Joyce Farms · Hodgkins · WCN MRF · Homewood · Pontiac · Loop";
  }
  if (stationId === "schererville") {
    return "Homewood destination for new open load";
  }
  if (stationId === "mccook") {
    return "Christianson Farms destination for new open load";
  }
  if (stationId === "dekalb-reload") {
    return "Hodgkins · RSI";
  }
  return "Destination for new open load";
}

export type SpecialtySlot = {
  id: string;
  stationId: string;
  destination: string;
  createdAt: string;
};

export type SpecialtyDayBoard = SpecialtySlot[];
export type SpecialtyStore = Record<string, SpecialtyDayBoard>;

/**
 * After − / dest-chip tap / consume, remaining local ids for that dest are source of
 * truth. Remote copies with a different UUID (e.g. station_id `liberty` vs `liberty-tank`)
 * must not reappear on merge.
 */
export type SpecialtyDestKeep = {
  date: string;
  stationId: string;
  destination: string;
  keepIds: string[];
};

const STORE_KEY = "chitrader.load-tracker.specialty-board.v1";

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readSpecialtyStore(): SpecialtyStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      version?: number;
      days?: SpecialtyStore;
      deletedIds?: unknown;
      destKeeps?: unknown;
    };
    if (parsed?.version !== 1 || typeof parsed.days !== "object" || !parsed.days) {
      return {};
    }
    const out: SpecialtyStore = {};
    for (const [date, slots] of Object.entries(parsed.days)) {
      if (!Array.isArray(slots)) continue;
      const mapped = slots
        .filter(
          (s) =>
            s &&
            typeof s.id === "string" &&
            typeof s.stationId === "string" &&
            typeof s.destination === "string",
        )
        .map((s) => ({
          id: s.id,
          stationId:
            resolveSpecialtyStationId(s.stationId, s.stationId) ?? s.stationId,
          destination: s.destination,
          createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
        }));
      const key = specialtyDateKey(date);
      const byId = new Map((out[key] ?? []).map((s) => [s.id, s]));
      for (const slot of mapped) byId.set(slot.id, slot);
      out[key] = [...byId.values()];
    }
    return applySpecialtyTombstones(
      out,
      parseDeletedIds(parsed.deletedIds),
      parseDestKeeps(parsed.destKeeps),
    );
  } catch {
    return {};
  }
}

function parseDeletedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function parseDestKeeps(raw: unknown): SpecialtyDestKeep[] {
  if (!Array.isArray(raw)) return [];
  const out: SpecialtyDestKeep[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (
      typeof rec.date !== "string" ||
      typeof rec.stationId !== "string" ||
      typeof rec.destination !== "string" ||
      !Array.isArray(rec.keepIds)
    ) {
      continue;
    }
    out.push({
      date: specialtyDateKey(rec.date),
      stationId: rec.stationId,
      destination: rec.destination,
      keepIds: rec.keepIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    });
  }
  return out;
}

export function readSpecialtyDeletedIds(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { deletedIds?: unknown };
    return parseDeletedIds(parsed.deletedIds);
  } catch {
    return [];
  }
}

export function readSpecialtyDestKeeps(): SpecialtyDestKeep[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { destKeeps?: unknown };
    return parseDestKeeps(parsed.destKeeps);
  } catch {
    return [];
  }
}

export function writeSpecialtyStore(
  store: SpecialtyStore,
  deletedIds?: string[],
  destKeeps?: SpecialtyDestKeep[],
): void {
  const ids = deletedIds ?? readSpecialtyDeletedIds();
  const keeps = destKeeps ?? readSpecialtyDestKeeps();
  // Tombstones always win at persist so a stale cloud merge cannot bounce − / consume.
  const days = applySpecialtyTombstones(store, ids, keeps);
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ version: 1, days, deletedIds: ids, destKeeps: keeps }),
  );
}

export function boardForDate(store: SpecialtyStore, date: string): SpecialtyDayBoard {
  return slotsOnDate(store, date);
}

export function slotsForStation(
  board: SpecialtyDayBoard,
  stationId: string,
): SpecialtySlot[] {
  return board.filter((s) => sameSpecialtyStation(s.stationId, stationId));
}

export function destSummary(
  slots: SpecialtySlot[],
): { destination: string; count: number }[] {
  const map = new Map<string, { destination: string; count: number }>();
  for (const s of slots) {
    const key = specialtyDestKey(s.destination) || s.destination;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { destination: s.destination, count: 1 });
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.destination.localeCompare(b.destination),
  );
}

export function addSpecialtySlot(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
): SpecialtyStore {
  const slot: SpecialtySlot = {
    id: newId(),
    stationId: resolveSpecialtyStationId(stationId, stationId) ?? stationId,
    destination: destination.trim(),
    createdAt: new Date().toISOString(),
  };
  return writeDay(store, date, [...slotsOnDate(store, date), slot]);
}

/** Remove one open slot: prefer matching destination, else most recent for station. */
export function removeSpecialtySlot(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination?: string,
): SpecialtyStore {
  const board = [...slotsOnDate(store, date)];
  let idx = -1;
  if (destination) {
    for (let i = board.length - 1; i >= 0; i--) {
      if (
        sameSpecialtyStation(board[i].stationId, stationId) &&
        sameSpecialtyDest(board[i].destination, destination)
      ) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) {
    for (let i = board.length - 1; i >= 0; i--) {
      if (sameSpecialtyStation(board[i].stationId, stationId)) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return store;
  board.splice(idx, 1);
  return writeDay(store, date, board);
}

export function isSpecialtyStationId(stationId: string): boolean {
  return SPECIALTY_STATIONS.some((s) => s.id === stationId);
}

export function countSpecialtyOpens(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
): number {
  if (!stationId || !specialtyDestKey(destination)) return 0;
  return boardForDate(store, date).filter(
    (s) =>
      sameSpecialtyStation(s.stationId, stationId) &&
      sameSpecialtyDest(s.destination, destination),
  ).length;
}

/** Newest-first ids for a station + destination on this calendar day. */
export function matchingSpecialtySlotIds(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
  limit: number,
): string[] {
  const max = Math.max(0, Math.floor(limit));
  if (!max || !stationId || !specialtyDestKey(destination)) return [];
  const ids: string[] = [];
  const board = boardForDate(store, date);
  for (let i = board.length - 1; i >= 0 && ids.length < max; i--) {
    if (
      sameSpecialtyStation(board[i].stationId, stationId) &&
      sameSpecialtyDest(board[i].destination, destination)
    ) {
      ids.push(board[i].id);
    }
  }
  return ids;
}

/** All current slot ids for a station + destination on this calendar day. */
export function remainingSpecialtySlotIds(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
): string[] {
  if (!stationId || !specialtyDestKey(destination)) return [];
  return boardForDate(store, date)
    .filter(
      (s) =>
        sameSpecialtyStation(s.stationId, stationId) &&
        sameSpecialtyDest(s.destination, destination),
    )
    .map((s) => s.id);
}

export function destKeepAfterChange(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
): SpecialtyDestKeep {
  return {
    date: specialtyDateKey(date),
    stationId: specialtyStationKey(stationId) || stationId,
    destination: specialtyDestKey(destination) || destination.trim(),
    keepIds: remainingSpecialtySlotIds(store, date, stationId, destination),
  };
}

export function upsertSpecialtyDestKeep(
  keeps: SpecialtyDestKeep[],
  keep: SpecialtyDestKeep,
): SpecialtyDestKeep[] {
  const next = keeps.filter(
    (row) =>
      !(
        specialtyDateKey(row.date) === specialtyDateKey(keep.date) &&
        sameSpecialtyStation(row.stationId, keep.stationId) &&
        sameSpecialtyDest(row.destination, keep.destination)
      ),
  );
  next.push(keep);
  return next;
}

/** Drop dest-keeps whose remote rows already match the kept ids (no extras). */
export function gcSpecialtyDestKeeps(
  remote: SpecialtyStore,
  keeps: Iterable<SpecialtyDestKeep>,
): SpecialtyDestKeep[] {
  return [...keeps].filter((keep) => {
    const extras = unkeptSpecialtyIds(
      remote,
      keep.date,
      keep.stationId,
      keep.destination,
      keep.keepIds,
    );
    return extras.length > 0;
  });
}

export function unkeptSpecialtyIds(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
  keepIds: Iterable<string>,
): string[] {
  const keep = new Set(keepIds);
  return boardForDate(store, date)
    .filter(
      (s) =>
        sameSpecialtyStation(s.stationId, stationId) &&
        sameSpecialtyDest(s.destination, destination) &&
        !keep.has(s.id),
    )
    .map((s) => s.id);
}

/** Burn up to `count` open specialty slots for this station + destination. */
export function consumeSpecialtyOpens(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
  count: number,
): SpecialtyStore {
  let next = store;
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i++) {
    const before = countSpecialtyOpens(next, date, stationId, destination);
    if (before === 0) break;
    next = removeSpecialtySlot(next, date, stationId, destination);
  }
  return next;
}

export function notifySpecialtyBoardChanged(): void {
  window.dispatchEvent(new Event("specialty-board-changed"));
}

/** Extra labels → specialty card id. Catalog `liberty` (leachate) still maps here for consume. */
const SPECIALTY_NAME_ALIASES: Record<string, string> = {
  "n lake": "northlake",
  "n. lake": "northlake",
  "north lake": "northlake",
  northlake: "northlake",
  "citi waste": "citiwaste",
  citiwaste: "citiwaste",
  "dekalb reload": "dekalb-reload",
  "dek reload": "dekalb-reload",
  prairiehill: "prairie-hill",
  "prairie hill": "prairie-hill",
  "gray tank": "gray-tank",
  hearthside: "herthside",
  herthside: "herthside",
  "liberty tank": "liberty-tank",
  liberty: "liberty-tank",
};

function normalizeSpecialtyLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

/** Log-load dest labels that should match a specialty dest chip. */
const SPECIALTY_DEST_ALIASES: Record<string, string> = {
  "groot recycling": "groot",
  "groot recycle": "groot",
  "groot mrf": "groot",
  "loop paper": "loop",
  resource: "resource mgt",
  "resource management": "resource mgt",
  prairiehill: "prairie hill",
};

function lookupSpecialtyIdByName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isSpecialtyStationId(trimmed)) return trimmed;
  const name = normalizeSpecialtyLabel(trimmed);
  if (!name) return null;
  if (isSpecialtyStationId(name)) return name;
  const aliased =
    SPECIALTY_NAME_ALIASES[name] ?? SPECIALTY_NAME_ALIASES[trimmed.toLowerCase()];
  if (aliased && isSpecialtyStationId(aliased)) return aliased;
  const hit = SPECIALTY_STATIONS.find(
    (s) =>
      normalizeSpecialtyLabel(s.name) === name ||
      normalizeSpecialtyLabel(s.id) === name,
  );
  return hit?.id ?? null;
}

/**
 * Map a logged pickup to a specialty board station id, if any.
 * Catalog `liberty` is not a card id (that's `liberty-tank`), but Liberty / Liberty Tank
 * logs still resolve to the Liberty card so consume-on-log matches.
 */
export function resolveSpecialtyStationId(
  stationId: string | undefined,
  pickupName?: string,
): string | null {
  if (stationId && isSpecialtyStationId(stationId)) return stationId;
  return (
    lookupSpecialtyIdByName(pickupName ?? "") ??
    lookupSpecialtyIdByName(stationId ?? "")
  );
}

/** Canonical YYYY-MM-DD day key (Postgres timestamps keep the calendar prefix). */
export function specialtyDateKey(date: string): string {
  const trimmed = date.trim();
  if (isValidISODate(trimmed)) return trimmed;
  const prefix = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  return prefix ? prefix[1] : trimmed;
}

export function specialtyStationKey(stationId: string): string {
  return resolveSpecialtyStationId(stationId, stationId) ?? stationId.trim().toLowerCase();
}

export function specialtyDestKey(destination: string): string {
  const dest = destination.trim().toLowerCase().replace(/\s+/g, " ");
  return SPECIALTY_DEST_ALIASES[dest] ?? dest;
}

export function sameSpecialtyStation(a: string, b: string): boolean {
  return specialtyStationKey(a) === specialtyStationKey(b);
}

export function sameSpecialtyDest(a: string, b: string): boolean {
  const left = specialtyDestKey(a);
  const right = specialtyDestKey(b);
  return Boolean(left) && left === right;
}

function slotsOnDate(store: SpecialtyStore, date: string): SpecialtySlot[] {
  const key = specialtyDateKey(date);
  const seen = new Set<string>();
  const out: SpecialtySlot[] = [];
  for (const [day, slots] of Object.entries(store)) {
    if (specialtyDateKey(day) !== key) continue;
    for (const slot of slots) {
      if (seen.has(slot.id)) continue;
      seen.add(slot.id);
      out.push(slot);
    }
  }
  return out;
}

function writeDay(
  store: SpecialtyStore,
  date: string,
  slots: SpecialtySlot[],
): SpecialtyStore {
  const key = specialtyDateKey(date);
  const next: SpecialtyStore = {};
  for (const [day, daySlots] of Object.entries(store)) {
    if (specialtyDateKey(day) === key) continue;
    next[day] = daySlots;
  }
  if (slots.length) next[key] = slots;
  return next;
}

export function omitSpecialtyIds(
  store: SpecialtyStore,
  ids: Iterable<string>,
): SpecialtyStore {
  const drop = new Set(ids);
  if (!drop.size) return store;
  const out: SpecialtyStore = {};
  for (const [date, slots] of Object.entries(store)) {
    const kept = slots.filter((s) => !drop.has(s.id));
    if (kept.length) out[date] = kept;
  }
  return out;
}

export function omitUnkeptDestSlots(
  store: SpecialtyStore,
  keeps: Iterable<SpecialtyDestKeep>,
): SpecialtyStore {
  const list = [...keeps];
  if (!list.length) return store;
  const out: SpecialtyStore = {};
  for (const [date, slots] of Object.entries(store)) {
    const kept = slots.filter((slot) => {
      const hit = list.find(
        (k) =>
          specialtyDateKey(k.date) === specialtyDateKey(date) &&
          sameSpecialtyStation(k.stationId, slot.stationId) &&
          sameSpecialtyDest(k.destination, slot.destination),
      );
      if (!hit) return true;
      return hit.keepIds.includes(slot.id);
    });
    if (kept.length) out[date] = kept;
  }
  return out;
}

export function applySpecialtyTombstones(
  store: SpecialtyStore,
  deletedIds?: Iterable<string>,
  destKeeps?: Iterable<SpecialtyDestKeep>,
): SpecialtyStore {
  return omitUnkeptDestSlots(omitSpecialtyIds(store, deletedIds ?? []), destKeeps ?? []);
}

/** Union slots by id (later arg wins). Optional ids/dest-keeps are treated as consumed/deleted. */
export function mergeSpecialtyStores(
  a: SpecialtyStore,
  b: SpecialtyStore,
  deletedIds?: Iterable<string>,
  destKeeps?: Iterable<SpecialtyDestKeep>,
): SpecialtyStore {
  const drop = new Set(deletedIds ?? []);
  const byId = new Map<string, { date: string; slot: SpecialtySlot }>();
  const ingest = (store: SpecialtyStore) => {
    for (const [date, slots] of Object.entries(store)) {
      const key = specialtyDateKey(date);
      for (const slot of slots) {
        if (drop.has(slot.id)) continue;
        byId.set(slot.id, { date: key, slot });
      }
    }
  };
  ingest(a);
  ingest(b);
  const out: SpecialtyStore = {};
  for (const { date, slot } of byId.values()) {
    if (!out[date]) out[date] = [];
    out[date].push(slot);
  }
  return omitUnkeptDestSlots(out, destKeeps ?? []);
}
