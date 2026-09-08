import { CUSTOM_ID, getStation } from "../data/stations";
import { commodityRankLabel, tallyLabel } from "./commodity";
import { STATION_CALL_YARDS, type StationDayBoard } from "./stationCalls";
import { isBrokerTruck } from "./truck";
import type { Load } from "../types";

export type RankRow = {
  key: string;
  label: string;
  count: number;
  custom?: boolean;
};

function sortRanks(rows: RankRow[]): RankRow[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export function rankPickups(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.pickup.trim() || "—";
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.custom = existing.custom || load.stationId === CUSTOM_ID;
    } else {
      map.set(key, {
        key,
        label: key,
        count: 1,
        custom: load.stationId === CUSTOM_ID,
      });
    }
  }
  return sortRanks([...map.values()]);
}

export function rankDestinations(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = load.destination.trim() || "—";
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { key, label: key, count: 1 });
  }
  return sortRanks([...map.values()]);
}

export function rankCommodities(loads: Load[]): RankRow[] {
  const map = new Map<string, RankRow>();
  for (const load of loads) {
    const key = tallyLabel(load.commodity);
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else {
      map.set(key, {
        key,
        label: commodityRankLabel(load.commodity),
        count: 1,
      });
    }
  }
  return sortRanks([...map.values()]);
}

export type TotalsFilter =
  | { kind: "pickup"; key: string }
  | { kind: "destination"; key: string }
  | { kind: "commodity"; key: string };

export function filterLoads(loads: Load[], filter: TotalsFilter | null): Load[] {
  if (!filter) return loads;
  if (filter.kind === "pickup") {
    return loads.filter((load) => (load.pickup.trim() || "—") === filter.key);
  }
  if (filter.kind === "destination") {
    return loads.filter(
      (load) => (load.destination.trim() || "—") === filter.key,
    );
  }
  return loads.filter((load) => tallyLabel(load.commodity) === filter.key);
}

export function filterCaption(filter: TotalsFilter): string {
  if (filter.kind === "pickup") return `Pickup · ${filter.key}`;
  if (filter.kind === "destination") return `Delivery · ${filter.key}`;
  return `Commodity · ${commodityRankLabel(filter.key)}`;
}

export function countBrokerLoads(loads: Load[]): number {
  return loads.filter((load) => isBrokerTruck(load.truck)).length;
}

/** Yard waste, recycle, residual/residue, cardboard, or Groot-related hauls. */
export function isWalkingFloorLoad(load: Load): boolean {
  const commodityKey = tallyLabel(load.commodity);
  if (
    commodityKey === "YARD" ||
    commodityKey === "RECYCLE" ||
    commodityKey === "RESIDUAL" ||
    commodityKey === "CARDBOARD"
  ) {
    return true;
  }
  const fields = [load.commodity, load.destination, load.pickup];
  return fields.some((field) => field.toLowerCase().includes("groot"));
}

export function countWalkingFloorLoads(loads: Load[]): number {
  return loads.filter(isWalkingFloorLoad).length;
}

export type DaySummaryCard = {
  key: string;
  label: string;
  count: number;
  emphasis?: boolean;
};

export function countByTallyLabel(loads: Load[], label: string): number {
  return loads.filter((load) => tallyLabel(load.commodity) === label).length;
}

/** Today header: TRASH, LEACHATE, LOADS, SUBS, WALKING-FLOOR. Always these five. */
export function daySummaryCards(loads: Load[]): DaySummaryCard[] {
  return [
    {
      key: "trash",
      label: "TRASH",
      count: countByTallyLabel(loads, "TRASH"),
    },
    {
      key: "leachate",
      label: "LEACHATE",
      count: countByTallyLabel(loads, "LEACHATE"),
    },
    {
      key: "loads",
      label: "LOADS",
      count: loads.length,
      emphasis: true,
    },
    { key: "subs", label: "SUBS", count: countBrokerLoads(loads) },
    {
      key: "walking-floor",
      label: "WALKING-FLOOR",
      count: countWalkingFloorLoads(loads),
    },
  ];
}

/** Load Count By Hour yard ids that differ from the load-form station id. */
const CALL_YARD_STATION_ID: Record<string, string> = {
  "c-heights": "chicago-heights",
  hooker: "hooker-street",
};

function normKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
}

export function callYardStationId(yardId: string): string {
  return CALL_YARD_STATION_ID[yardId] ?? yardId;
}

export function callYardMatchKeys(yard: { id: string; label: string }): Set<string> {
  const keys = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    const key = normKey(value);
    if (key) keys.add(key);
  };
  add(yard.id);
  add(yard.label);
  const stationId = callYardStationId(yard.id);
  add(stationId);
  add(getStation(stationId)?.name);
  return keys;
}

/** True when this load was picked up from the given Load Count By Hour yard. */
export function loadMatchesCallYard(
  load: Load,
  yard: { id: string; label: string },
): boolean {
  const keys = callYardMatchKeys(yard);
  if (load.stationId && load.stationId !== CUSTOM_ID) {
    if (keys.has(normKey(load.stationId))) return true;
    const named = getStation(load.stationId);
    if (named && keys.has(normKey(named.name))) return true;
  }
  return keys.has(normKey(load.pickup));
}

export type StationEodRow = {
  id: string;
  label: string;
  pickedUp: number;
  /** Close column for that Chicago day; null when the dispatcher left it blank. */
  left: string | null;
};

export type EndOfDaySummary = {
  loads: number;
  subs: number;
  trash: number;
  leachate: number;
  walkingFloor: number;
  stations: StationEodRow[];
};

export type EndOfDayCard = {
  key: string;
  label: string;
  count: number;
  emphasis?: boolean;
};

/** TRASH, LEACHATE, WALKING-FLOOR, LOADS, SUBS — same counts as Today. */
export function endOfDayCards(summary: EndOfDaySummary): EndOfDayCard[] {
  return [
    { key: "trash", label: "TRASH", count: summary.trash },
    { key: "leachate", label: "LEACHATE", count: summary.leachate },
    { key: "walking-floor", label: "WALKING-FLOOR", count: summary.walkingFloor },
    { key: "loads", label: "LOADS", count: summary.loads, emphasis: true },
    { key: "subs", label: "SUBS", count: summary.subs },
  ];
}

/** Overall loads, trash, leachate, walking-floor, SUBS, per-station pickups, and Close/left. */
export function endOfDaySummary(
  loads: Load[],
  board: StationDayBoard,
): EndOfDaySummary {
  return {
    loads: loads.length,
    subs: countBrokerLoads(loads),
    trash: countByTallyLabel(loads, "TRASH"),
    leachate: countByTallyLabel(loads, "LEACHATE"),
    walkingFloor: countWalkingFloorLoads(loads),
    stations: STATION_CALL_YARDS.map((yard) => {
      const pickedUp = loads.filter((load) => loadMatchesCallYard(load, yard)).length;
      const close = board[yard.id]?.close;
      return {
        id: yard.id,
        label: yard.label,
        pickedUp,
        left: close === null || close === undefined || close === "" ? null : String(close),
      };
    }),
  };
}
