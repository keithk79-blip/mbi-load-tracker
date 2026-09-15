import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import { enforceOneYardPerDriver } from "./rosterYardOwnership";

describe("enforceOneYardPerDriver", () => {
  it("keeps Jovan Morris on Zion and drops Arc copies", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "arc",
      truckNumber: "40100",
      name: "Jovan Morris",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "zion",
      truckNumber: "40100",
      name: "Jovan Morris",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "arc",
      truckNumber: "40100",
      name: "Jovan Morris",
    }).store;

    const result = enforceOneYardPerDriver(store);
    const leftover = Object.values(result.store.entries);
    expect(leftover).toHaveLength(1);
    expect(leftover[0]?.yard).toBe("zion");
    expect(leftover[0]?.kind).toBe("full");
    expect(result.removed.some((row) => row.yard === "arc")).toBe(true);
  });

  it("does not let the same employee number live on two yards", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      truckNumber: "56",
      name: "Different Name Same Emp",
    }).store;
    const result = enforceOneYardPerDriver(store);
    expect(Object.keys(result.store.entries)).toHaveLength(1);
  });
});
