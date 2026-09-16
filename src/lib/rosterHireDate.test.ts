import { describe, expect, it } from "vitest";
import { DRIVER_HIRE_DATES } from "../data/driverHireDates";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import {
  applyKnownHireDates,
  yearsOfService,
  yearsOfServiceLabel,
} from "./rosterHireDate";

describe("yearsOfService", () => {
  it("counts whole years from a 1991 start", () => {
    expect(yearsOfService("1991-12-02", "2026-09-15")).toBe(34);
    expect(yearsOfService("1991-12-02", "2026-12-02")).toBe(35);
    expect(yearsOfService("2026-03-01", "2026-09-15")).toBe(0);
    expect(yearsOfServiceLabel(0)).toBe("<1 yr");
    expect(yearsOfServiceLabel(1)).toBe("1 yr");
    expect(yearsOfServiceLabel(34)).toBe("34 yrs");
  });
});

describe("applyKnownHireDates", () => {
  it("stamps Full Roster by emp # and does not invent drivers", () => {
    let store = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      truckNumber: "99999",
      name: "Nobody On The Sheet",
    }).store;
    const result = applyKnownHireDates(store, DRIVER_HIRE_DATES, "2026-09-16T00:00:00.000Z");
    const dave = Object.values(result.store.entries).find(
      (row) => row.kind === "full" && row.truckNumber === "56",
    );
    const sat = Object.values(result.store.entries).find((row) => row.kind === "sat");
    const nobody = Object.values(result.store.entries).find((row) => row.truckNumber === "99999");
    expect(dave?.hireDate).toBe("1991-12-02");
    expect(sat?.hireDate).toBeNull();
    expect(nobody?.hireDate).toBeNull();
    expect(result.updated).toHaveLength(1);
  });

  it("does not overwrite a start date already on the card", () => {
    const added = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
      hireDate: "1990-01-01",
    });
    const result = applyKnownHireDates(added.store);
    expect(result.store.entries[added.entry!.id].hireDate).toBe("1990-01-01");
    expect(result.updated).toEqual([]);
  });

  it("matches by name when emp # is missing on the roster row", () => {
    const added = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "rockford",
      truckNumber: null,
      name: "James Lawson",
    });
    const result = applyKnownHireDates(added.store);
    expect(result.store.entries[added.entry!.id].hireDate).toBe("2017-05-12");
  });
});
