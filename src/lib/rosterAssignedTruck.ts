import type { DriverRosterEntry, DriverRosterStore } from "./driverRoster";
import { cleanAssignedTruck } from "./driverRoster";

/**
 * Assigned unit numbers live on the Full Roster card until a dispatcher
 * edits that field. Refresh / sheet seed / a cloud row with a missing
 * assigned_truck column must not blank a number that is already saved.
 */
export function preserveAssignedTrucks(
  previous: DriverRosterStore,
  incoming: DriverRosterStore,
): DriverRosterStore {
  const entries: Record<string, DriverRosterEntry> = { ...incoming.entries };
  for (const [id, row] of Object.entries(entries)) {
    if (row.kind !== "full") continue;
    if (cleanAssignedTruck(row.assignedTruck)) continue;
    const kept = cleanAssignedTruck(previous.entries[id]?.assignedTruck ?? null);
    if (!kept) continue;
    entries[id] = { ...row, assignedTruck: kept };
  }
  return { entries };
}

export function assignedTrucksNeedingUpload(
  store: DriverRosterStore,
  remote: DriverRosterStore,
): DriverRosterEntry[] {
  const out: DriverRosterEntry[] = [];
  for (const row of Object.values(store.entries)) {
    if (row.kind !== "full") continue;
    const localTruck = cleanAssignedTruck(row.assignedTruck);
    if (!localTruck) continue;
    const remoteTruck = cleanAssignedTruck(remote.entries[row.id]?.assignedTruck ?? null);
    if (localTruck !== remoteTruck) out.push(row);
  }
  return out;
}
