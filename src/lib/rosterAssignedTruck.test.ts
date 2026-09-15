import { describe, expect, it } from "vitest";
import {
  addRosterEntry,
  emptyDriverRosterStore,
} from "./driverRoster";
import { assignedTrucksNeedingUpload, preserveAssignedTrucks } from "./rosterAssignedTruck";

function hired(name: string, truck: string | null) {
  return addRosterEntry(emptyDriverRosterStore(), {
    kind: "full",
    yard: "burnham",
    truckNumber: "185",
    assignedTruck: truck,
    name,
  }).store;
}

describe("preserveAssignedTrucks", () => {
  it("keeps a saved unit when the incoming row has none", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(preserveAssignedTrucks(local, incoming).entries[id]?.assignedTruck).toBe("418");
  });

  it("lets a dispatcher clear the unit", () => {
    const local = hired("Alice Smith", null);
    const id = Object.keys(local.entries)[0]!;
    const incoming = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(preserveAssignedTrucks(local, incoming).entries[id]?.assignedTruck).toBeNull();
  });

  it("queues a local unit for upload when cloud is blank", () => {
    const local = hired("Alice Smith", "418");
    const id = Object.keys(local.entries)[0]!;
    const remote = {
      entries: {
        [id]: { ...local.entries[id]!, assignedTruck: null },
      },
    };
    expect(assignedTrucksNeedingUpload(local, remote).map((row) => row.assignedTruck)).toEqual([
      "418",
    ]);
  });
});
