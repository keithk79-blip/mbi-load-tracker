import {
  CUSTOM_ID,
  FREQUENT_STATION_IDS,
  STATION_BY_NAME,
  getStation,
  type Station,
} from "../data/stations";

export type PickupCountLoad = {
  stationId: string;
  pickup: string;
};

function catalogStationId(load: PickupCountLoad): string | null {
  if (load.stationId && load.stationId !== CUSTOM_ID) {
    const byId = getStation(load.stationId);
    if (byId) return byId.id;
  }
  const byName = STATION_BY_NAME[load.pickup.trim().toLowerCase()];
  return byName?.id ?? null;
}

/** How often each catalog station appears in logged loads (unmatched custom sites skipped). */
export function countPickupsByStationId(
  loads: PickupCountLoad[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const load of loads) {
    const id = catalogStationId(load);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Catalog stations, most-logged first. Ties: frequent-chip set, then catalog order.
 * Does not drop stations — callers split visible vs “+ N more”.
 */
export function rankPickupStations(
  stations: readonly Station[],
  loads: PickupCountLoad[],
  frequentIds: readonly string[] = FREQUENT_STATION_IDS,
): Station[] {
  const counts = countPickupsByStationId(loads);
  const frequent = new Set(frequentIds);
  const catalogIndex = new Map(stations.map((station, index) => [station.id, index]));
  return [...stations].sort((a, b) => {
    const byCount = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
    if (byCount !== 0) return byCount;
    const byFrequent = Number(frequent.has(b.id)) - Number(frequent.has(a.id));
    if (byFrequent !== 0) return byFrequent;
    return (catalogIndex.get(a.id) ?? 0) - (catalogIndex.get(b.id) ?? 0);
  });
}
