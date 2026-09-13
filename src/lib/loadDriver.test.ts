import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Load } from "../types";
import {
  addRosterEntry,
  emptyDriverRosterStore,
} from "./driverRoster";
import {
  keepLoadDriverName,
  loadTruckEquals,
  loggedDriverNamesForTruck,
  snapshotDriverNameForTruck,
} from "./loadDriver";

function load(
  partial: Partial<Load> & Pick<Load, "id" | "truck">,
): Load {
  return {
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date: "2026-09-13",
    createdAt: "2026-09-13T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
    ...partial,
  };
}

function rosterWith(name: string, assignedTruck: string | null) {
  return addRosterEntry(emptyDriverRosterStore(), {
    kind: "full",
    yard: "rockford",
    truckNumber: "185",
    assignedTruck,
    name,
  }).store;
}

describe("snapshotDriverNameForTruck", () => {
  it("returns the Full Roster assignee for that unit", () => {
    const store = rosterWith("Alice Smith", "418");
    expect(snapshotDriverNameForTruck(store, "418")).toBe("Alice Smith");
  });

  it("returns null when no Full Roster driver has that truck", () => {
    const store = rosterWith("Alice Smith", "418");
    expect(snapshotDriverNameForTruck(store, "207")).toBeNull();
    expect(snapshotDriverNameForTruck(emptyDriverRosterStore(), "418")).toBeNull();
  });

  it("does not match EMP # as a truck", () => {
    const store = rosterWith("Alice Smith", "418");
    expect(snapshotDriverNameForTruck(store, "185")).toBeNull();
  });

  it("joins multiple Full Roster names on the same truck instead of picking one", () => {
    let store = rosterWith("Alice Smith", "418");
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "90",
      assignedTruck: "418",
      name: "Bob Jones",
    }).store;
    expect(snapshotDriverNameForTruck(store, "418")).toBe("Bob Jones · Alice Smith");
  });
});

describe("loggedDriverNamesForTruck", () => {
  it("shows one snapshotted name once for the day's loads", () => {
    const names = loggedDriverNamesForTruck(
      [
        load({ id: "a", truck: "418", driverName: "Alice Smith" }),
        load({ id: "b", truck: "418", driverName: "Alice Smith" }),
        load({ id: "c", truck: "207", driverName: "Other" }),
      ],
      "418",
    );
    expect(names).toEqual(["Alice Smith"]);
  });

  it("does not invent a name when loads have none", () => {
    expect(
      loggedDriverNamesForTruck(
        [load({ id: "a", truck: "418" }), load({ id: "b", truck: "418", driverName: null })],
        "418",
      ),
    ).toEqual([]);
  });

  it("surfaces conflicting snapshot names instead of picking one", () => {
    expect(
      loggedDriverNamesForTruck(
        [
          load({ id: "a", truck: "418", driverName: "Alice Smith" }),
          load({ id: "b", truck: "418", driverName: "Bob Jones" }),
        ],
        "418",
      ),
    ).toEqual(["Alice Smith", "Bob Jones"]);
  });
});

describe("keepLoadDriverName", () => {
  it("keeps a snapshot when the newer side never had the field", () => {
    const local = load({
      id: "a",
      truck: "418",
      driverName: "Alice Smith",
      updatedAt: "2026-09-13T10:00:00.000Z",
    });
    const remote = load({
      id: "a",
      truck: "418",
      updatedAt: "2026-09-13T12:00:00.000Z",
    });
    expect(keepLoadDriverName(remote, local).driverName).toBe("Alice Smith");
  });

  it("lets an explicit empty snapshot win over an older name", () => {
    const newer = load({
      id: "a",
      truck: "207",
      driverName: null,
      updatedAt: "2026-09-13T12:00:00.000Z",
    });
    const older = load({
      id: "a",
      truck: "418",
      driverName: "Alice Smith",
      updatedAt: "2026-09-13T10:00:00.000Z",
    });
    expect(keepLoadDriverName(newer, older).driverName).toBeNull();
  });
});

describe("loadTruckEquals", () => {
  it("treats unit formatting as the same truck", () => {
    expect(loadTruckEquals("418", "418")).toBe(true);
    expect(loadTruckEquals("vz", "VZ")).toBe(true);
    expect(loadTruckEquals("418", "207")).toBe(false);
  });
});

describe("day-locked truck driver wiring", () => {
  it("snapshots on log/edit and shows names from loads, not live roster", () => {
    const log = readFileSync(new URL("../screens/LogLoadScreen.tsx", import.meta.url), "utf8");
    const edit = readFileSync(new URL("../screens/EditLoadScreen.tsx", import.meta.url), "utf8");
    const search = readFileSync(new URL("../screens/SearchScreen.tsx", import.meta.url), "utf8");
    const row = readFileSync(new URL("../components/LoadRow.tsx", import.meta.url), "utf8");
    expect(log).toContain("snapshotDriverNameForTruck");
    expect(log).toContain("driverName:");
    expect(edit).toContain("snapshotDriverNameForTruck");
    expect(edit).toContain("loadTruckEquals");
    expect(search).toContain("loggedDriverNamesForTruck");
    expect(search).not.toContain("fullRosterDriversForTruck");
    expect(row).toContain("load.driverName");
  });

  it("SQL adds driver_name without backfilling old loads", () => {
    const sql = readFileSync(
      new URL("../../Load-Tracker-loads-driver-name.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("driver_name");
    expect(sql).toContain("Does NOT backfill");
    expect(sql).toContain("add column if not exists");
  });
});
