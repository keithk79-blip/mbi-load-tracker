/** Walking-floor / specialty load board (day-scoped open slots). */

import { destinationsFor } from "../data/stations";

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
    const parsed = JSON.parse(raw) as { version?: number; days?: SpecialtyStore };
    if (parsed?.version !== 1 || typeof parsed.days !== "object" || !parsed.days) {
      return {};
    }
    const out: SpecialtyStore = {};
    for (const [date, slots] of Object.entries(parsed.days)) {
      if (!Array.isArray(slots)) continue;
      out[date] = slots
        .filter(
          (s) =>
            s &&
            typeof s.id === "string" &&
            typeof s.stationId === "string" &&
            typeof s.destination === "string",
        )
        .map((s) => ({
          id: s.id,
          stationId: s.stationId,
          destination: s.destination,
          createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
        }));
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSpecialtyStore(store: SpecialtyStore): void {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({ version: 1, days: store }),
  );
}

export function boardForDate(store: SpecialtyStore, date: string): SpecialtyDayBoard {
  return store[date] ?? [];
}

export function slotsForStation(
  board: SpecialtyDayBoard,
  stationId: string,
): SpecialtySlot[] {
  return board.filter((s) => s.stationId === stationId);
}

export function destSummary(
  slots: SpecialtySlot[],
): { destination: string; count: number }[] {
  const map = new Map<string, number>();
  for (const s of slots) {
    map.set(s.destination, (map.get(s.destination) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([destination, count]) => ({ destination, count }))
    .sort((a, b) => b.count - a.count || a.destination.localeCompare(b.destination));
}

export function addSpecialtySlot(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination: string,
): SpecialtyStore {
  const slot: SpecialtySlot = {
    id: newId(),
    stationId,
    destination,
    createdAt: new Date().toISOString(),
  };
  const board = [...(store[date] ?? []), slot];
  return { ...store, [date]: board };
}

/** Remove one open slot: prefer matching destination, else most recent for station. */
export function removeSpecialtySlot(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  destination?: string,
): SpecialtyStore {
  const board = [...(store[date] ?? [])];
  let idx = -1;
  if (destination) {
    for (let i = board.length - 1; i >= 0; i--) {
      if (board[i].stationId === stationId && board[i].destination.trim().toLowerCase() === destination.trim().toLowerCase()) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) {
    for (let i = board.length - 1; i >= 0; i--) {
      if (board[i].stationId === stationId) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return store;
  board.splice(idx, 1);
  const next = { ...store };
  if (board.length === 0) delete next[date];
  else next[date] = board;
  return next;
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
  const dest = destination.trim().toLowerCase();
  if (!stationId || !dest) return 0;
  return boardForDate(store, date).filter(
    (s) => s.stationId === stationId && s.destination.trim().toLowerCase() === dest,
  ).length;
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

/** Map a logged pickup to a specialty board station id, if any. */
export function resolveSpecialtyStationId(
  stationId: string | undefined,
  pickupName?: string,
): string | null {
  if (stationId && isSpecialtyStationId(stationId)) return stationId;
  // Catalog "liberty" is the leachate pickup, not the walking-floor Liberty card.
  if (stationId === "liberty") return null;
  const name = (pickupName ?? "").trim().toLowerCase();
  if (!name) return null;
  const aliases: Record<string, string> = {
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
  const aliased = aliases[name];
  if (aliased && isSpecialtyStationId(aliased)) return aliased;
  const hit = SPECIALTY_STATIONS.find((s) => s.name.toLowerCase() === name);
  return hit?.id ?? null;
}
