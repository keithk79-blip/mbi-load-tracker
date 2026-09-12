import { describe, expect, it } from "vitest";
import { addRosterEntry, emptyDriverRosterStore } from "./driverRoster";
import { computeAvailability } from "./driverDays";
import {
  chicagoFullRosterTally,
  dropOffsAlreadyUnavailable,
  liveSheetFromRoster,
  rosterOotNames,
} from "./rosterAvailability";
import { addVacationEntry, emptyVacationStore } from "./vacationBoard";

function rosterWith(
  rows: Array<{
    yard?: "burnham" | "rockford" | "pontiac" | "arc" | "zion";
    name: string;
    status?: string | null;
  }>,
) {
  let store = emptyDriverRosterStore();
  for (const row of rows) {
    store = addRosterEntry(store, {
      kind: "full",
      yard: row.yard ?? "burnham",
      name: row.name,
      status: row.status ?? null,
    }).store;
  }
  return store;
}

describe("chicago Full Roster available base", () => {
  it("sums hired − status − Vacation VAC across all yards", () => {
    const roster = rosterWith([
      { yard: "burnham", name: "Working One" },
      { yard: "burnham", name: "Glen Barker", status: "oot" },
      { yard: "rockford", name: "Working Two" },
      { yard: "zion", name: "Sergio Valadez", status: "wc" },
    ]);
    let vacation = emptyVacationStore();
    vacation = addVacationEntry(vacation, "2026-01-04", "Working Two", {
      yard: "rockford",
    }).store;
    const tally = chicagoFullRosterTally(roster, vacation, "2026-01-07");
    expect(tally).toEqual({ hired: 4, unavailable: 3, available: 1 });
  });

  it("does not subtract a call-off already marked out on the roster", () => {
    const roster = rosterWith([
      { name: "Glen Barker", status: "oot" },
      { name: "Dave Vanderbilt" },
    ]);
    const live = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: "2026-09-04",
      offs: [
        { name: "Glen Barker", start: "2026-09-04", end: null, reason: "Call Off" },
        { name: "Dave Vanderbilt", start: "2026-09-04", end: null, reason: "P-Day" },
      ],
      saturdayUsesWeekdayBase: false,
    });
    expect(live.base).toBe(1);
    expect(live.offs.map((row) => row.name)).toEqual(["Dave Vanderbilt"]);
    expect(computeAvailability(live, "2026-09-04")).toMatchObject({
      base: 1,
      offs: 1,
      available: 0,
    });
  });

  it("lists OOT names from Full Roster status, not a sheet L13 pull", () => {
    const roster = rosterWith([
      { yard: "burnham", name: "Glen Barker", status: "oot" },
      { yard: "rockford", name: "Ken Bryant", status: "wc" },
      { yard: "pontiac", name: "Randy Mesarchik", status: "oot" },
    ]);
    expect(rosterOotNames(roster)).toEqual(["Glen Barker", "Randy Mesarchik"]);
  });

  it("uses the same Full Roster base on Saturday as on a weekday", () => {
    const roster = rosterWith([
      { name: "Working One" },
      { name: "Working Two" },
      { name: "Out", status: "vac" },
    ]);
    const live = liveSheetFromRoster({
      roster,
      vacation: emptyVacationStore(),
      date: "2026-09-12",
      offs: [],
      saturdayUsesWeekdayBase: false,
    });
    expect(live.base).toBe(2);
    expect(live.saturdayBase).toBe(2);
    expect(computeAvailability(live, "2026-09-12")).toMatchObject({
      base: 2,
      available: 2,
    });
    expect(computeAvailability({ ...live, saturdayUsesWeekdayBase: true }, "2026-09-12")).toMatchObject({
      base: 2,
      available: 2,
    });
  });

  it("dropOffsAlreadyUnavailable is a no-op when names do not match", () => {
    const leftover = dropOffsAlreadyUnavailable(
      [{ name: "Pablo Cruz", start: "2026-09-12", end: null, reason: "Call Off" }],
      [{ name: "Glen Barker" }],
    );
    expect(leftover).toHaveLength(1);
  });
});
