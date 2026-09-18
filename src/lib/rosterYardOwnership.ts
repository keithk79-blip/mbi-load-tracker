import {
  cleanDriverName,
  cleanTruckNumber,
  type DriverRosterEntry,
  type DriverRosterStore,
  type DriverRosterYard,
} from "./driverRoster";

/** Explicit home yards. A name listed here never stays on another Full/Sat list. */
export const ROSTER_HOME_YARD_BY_NAME: Record<string, DriverRosterYard> = {
  "jovan morris": "zion",
};

export function rosterNameKey(name: string): string {
  return cleanDriverName(name).toLowerCase();
}

export function homeYardForDriver(entry: Pick<DriverRosterEntry, "name">): DriverRosterYard | null {
  return ROSTER_HOME_YARD_BY_NAME[rosterNameKey(entry.name)] ?? null;
}

function empKey(entry: Pick<DriverRosterEntry, "truckNumber">): string | null {
  return cleanTruckNumber(entry.truckNumber ?? "") ?? null;
}

function betterHome(
  keep: DriverRosterEntry | undefined,
  candidate: DriverRosterEntry,
): DriverRosterEntry {
  if (!keep) return candidate;
  const pinned = homeYardForDriver(candidate);
  if (pinned && candidate.yard === pinned && keep.yard !== pinned) return candidate;
  if (pinned && keep.yard === pinned && candidate.yard !== pinned) return keep;
  if (candidate.assignedTruck && !keep.assignedTruck) return candidate;
  if (keep.assignedTruck && !candidate.assignedTruck) return keep;
  if (candidate.updatedAt > keep.updatedAt) return candidate;
  return keep;
}

export type YardOwnershipResult = {
  store: DriverRosterStore;
  removed: DriverRosterEntry[];
};

/**
 * Full Roster + Sat: the same person (name) or the same employee number
 * belongs on one yard only. Extra copies are dropped so they can be
 * tombstoned + cloud-deleted.
 */
export function enforceOneYardPerDriver(store: DriverRosterStore): YardOwnershipResult {
  const full = Object.values(store.entries).filter((row) => row.kind === "full");
  const keepByName = new Map<string, DriverRosterEntry>();
  const keepByEmp = new Map<string, DriverRosterEntry>();

  for (const row of full) {
    const name = rosterNameKey(row.name);
    if (name) keepByName.set(name, betterHome(keepByName.get(name), row));
    const emp = empKey(row);
    if (emp) keepByEmp.set(emp, betterHome(keepByEmp.get(emp), row));
  }

  const keepIds = new Set<string>();
  for (const row of keepByName.values()) keepIds.add(row.id);
  for (const row of keepByEmp.values()) keepIds.add(row.id);

  // A row that lost on name but won on emp (or vice versa) can pull two yards
  // back in. Re-resolve: if name home and emp home disagree, name home wins.
  const finalKeep = new Set<string>();
  const claimedName = new Set<string>();
  const claimedEmp = new Set<string>();
  const ranked = [...full].sort((a, b) => {
    const aHome = homeYardForDriver(a) === a.yard ? 1 : 0;
    const bHome = homeYardForDriver(b) === b.yard ? 1 : 0;
    if (aHome !== bHome) return bHome - aHome;
    if (Boolean(a.assignedTruck) !== Boolean(b.assignedTruck)) {
      return a.assignedTruck ? -1 : 1;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  for (const row of ranked) {
    const name = rosterNameKey(row.name);
    const emp = empKey(row);
    if ((name && claimedName.has(name)) || (emp && claimedEmp.has(emp))) continue;
    finalKeep.add(row.id);
    if (name) claimedName.add(name);
    if (emp) claimedEmp.add(emp);
  }

  const removed: DriverRosterEntry[] = [];
  const entries = { ...store.entries };
  for (const row of Object.values(store.entries)) {
    if (row.kind === "full") {
      if (finalKeep.has(row.id)) continue;
      removed.push(row);
      delete entries[row.id];
      continue;
    }
    if (row.kind !== "sat") continue;
    const name = rosterNameKey(row.name);
    const emp = empKey(row);
    const home =
      (name && [...finalKeep].map((id) => store.entries[id]).find((keep) => keep && rosterNameKey(keep.name) === name)) ||
      (emp && [...finalKeep].map((id) => store.entries[id]).find((keep) => keep && empKey(keep) === emp));
    if (!home) continue;
    if (home.yard === row.yard) continue;
    removed.push(row);
    delete entries[row.id];
  }

  return { store: { entries }, removed };
}
