/** Day-locked truck ↔ driver pairing on logged loads.
 *
 * Full Roster `assignedTruck` is live and can change. A load stores the
 * driver name as it was at log (or truck-edit) time so past days stay put.
 */

import type { Load } from "../types";
import {
  cleanAssignedTruck,
  cleanDriverName,
  fullRosterDriversForTruck,
  type DriverRosterStore,
} from "./driverRoster";
import { sanitizeTruck } from "./truck";

export function normalizeLoadTruck(truck: string): string {
  return cleanAssignedTruck(truck) ?? sanitizeTruck(truck);
}

export function loadTruckEquals(a: string, b: string): boolean {
  return normalizeLoadTruck(a) === normalizeLoadTruck(b);
}

/**
 * Current Full Roster name(s) for this unit. `null` when nobody is assigned
 * — callers persist that so the load does not pick up a later assignee.
 */
export function snapshotDriverNameForTruck(
  store: DriverRosterStore,
  truck: string,
): string | null {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of fullRosterDriversForTruck(store, truck)) {
    const name = cleanDriverName(entry.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.length ? names.join(" · ") : null;
}

export type TruckDriverGuess = {
  truck: string;
  name: string;
};

export type TruckDriverPreview = {
  exact: string | null;
  guesses: TruckDriverGuess[];
};

/** Live typeahead against Full Roster assignedTruck. Exact match first. */
export function previewDriversForTruckInput(
  store: DriverRosterStore,
  raw: string,
  limit = 5,
): TruckDriverPreview {
  const needle = normalizeLoadTruck(raw);
  if (!needle) return { exact: null, guesses: [] };
  const exact = snapshotDriverNameForTruck(store, needle);
  if (exact) return { exact, guesses: [] };

  const seen = new Set<string>();
  const guesses: TruckDriverGuess[] = [];
  const rows = Object.values(store.entries)
    .filter((entry) => entry.kind === "full" && entry.assignedTruck)
    .sort((a, b) =>
      (a.assignedTruck ?? "").localeCompare(b.assignedTruck ?? "", "en", {
        numeric: true,
      }),
    );
  for (const entry of rows) {
    const truck = entry.assignedTruck;
    const name = cleanDriverName(entry.name);
    if (!truck || !name) continue;
    if (!truck.toLowerCase().startsWith(needle.toLowerCase())) continue;
    const key = `${truck.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guesses.push({ truck, name });
    if (guesses.length >= limit) break;
  }
  return { exact: null, guesses };
}

export function formatTruckDriverPreview(preview: TruckDriverPreview): string {
  if (preview.exact) return preview.exact;
  if (!preview.guesses.length) return "";
  return preview.guesses
    .map((row) => `${row.truck} · ${row.name}`)
    .join("  ");
}

/** Distinct snapshotted names on this day's loads for the truck. */
export function loggedDriverNamesForTruck(
  loads: readonly Pick<Load, "truck" | "driverName">[],
  truck: string,
): string[] {
  const needle = normalizeLoadTruck(truck);
  if (!needle) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const load of loads) {
    if (normalizeLoadTruck(load.truck) !== needle) continue;
    const name = cleanDriverName(load.driverName ?? "");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * Last-writer-wins, but a side that never had `driverName` (legacy row or
 * remote without the column) must not wipe a snapshot on the other side.
 * Explicit `null` (logged unassigned / truck re-resolved empty) wins.
 */
export function keepLoadDriverName(winner: Load, loser: Load): Load {
  if (winner.driverName !== undefined) return winner;
  if (loser.driverName === undefined) return winner;
  return { ...winner, driverName: loser.driverName };
}

export function cleanLoggedDriverName(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const name = cleanDriverName(typeof raw === "string" ? raw : "");
  return name || null;
}
