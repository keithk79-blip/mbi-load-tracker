import { describe, expect, it } from "vitest";
import {
  addRosterEntry,
  emptyDriverRosterStore,
  entriesForRoster,
  fullRosterTally,
  updateRosterEntry,
} from "./driverRoster";
import {
  effectiveRosterStatus,
  fullRosterTallyForDate,
  rosterEntryOnVacation,
  rosterNameKey,
  rosterNamesMatch,
  vacationNamesOnDate,
  vacationYardForRosterYard,
  vacationYardsForRosterYard,
} from "./rosterVacation";
import { addVacationEntry, emptyVacationStore } from "./vacationBoard";

function roster(
  name: string,
  opts: { yard?: "burnham" | "rockford" | "pontiac" | "arc" | "zion"; status?: string | null } = {},
) {
  return addRosterEntry(emptyDriverRosterStore(), {
    kind: "full",
    yard: opts.yard ?? "burnham",
    truckNumber: "56",
    name,
    status: opts.status ?? null,
  }).entry!;
}

function vacationStore(
  rows: Array<{ yard?: "rockford" | "chicago"; weekOf: string; name: string }>,
) {
  let store = emptyVacationStore();
  for (const row of rows) {
    const next = addVacationEntry(store, row.weekOf, row.name, {
      yard: row.yard ?? "rockford",
      status: "approved",
    });
    store = next.store;
  }
  return store;
}

describe("vacation yard map", () => {
  it("maps Rockford roster to Rockford vacation; Chicago-area yards to Chicago", () => {
    expect(vacationYardForRosterYard("rockford")).toBe("rockford");
    expect(vacationYardForRosterYard("burnham")).toBe("chicago");
    expect(vacationYardForRosterYard("pontiac")).toBe("chicago");
    expect(vacationYardForRosterYard("arc")).toBe("chicago");
    expect(vacationYardForRosterYard("zion")).toBe("chicago");
    expect(vacationYardsForRosterYard("burnham")).toEqual(["chicago", "rockford"]);
    expect(vacationYardsForRosterYard("rockford")).toEqual(["rockford", "chicago"]);
  });
});

describe("roster name matching", () => {
  it("normalizes trainer suffixes, nicknames, and extra spaces", () => {
    expect(rosterNameKey("Bill Vrtis-T")).toBe("bill vrtis");
    expect(rosterNameKey("Herbert Hill - T")).toBe("herbert hill");
    expect(rosterNameKey("Dan Kasprzycki -T")).toBe("dan kasprzycki");
    expect(rosterNameKey("Greg (G) Cellarius")).toBe("greg cellarius");
  });

  it("matches exact, prefix, nickname, and one-letter last-name typos", () => {
    expect(rosterNamesMatch("Greg Cellarius", "Greg Celarius")).toBe(true);
    expect(rosterNamesMatch("Greg Celarius-T", "Greg Cellarius")).toBe(true);
    expect(rosterNamesMatch("James Carter", "Jim Carter")).toBe(true);
    expect(rosterNamesMatch("Jeffrey Haynes", "Jeff Haynes")).toBe(true);
    expect(rosterNamesMatch("Johnnie Owens", "Johnny Owens")).toBe(true);
    expect(rosterNamesMatch("Herbert Hill - T", "Herber Hill")).toBe(true);
    expect(rosterNamesMatch("Dave Rieck", "David Reick")).toBe(true);
    expect(rosterNamesMatch("James Kmilek     Elgin", "James Kmilek")).toBe(true);
    expect(rosterNamesMatch("Ryan Lollis", "Ryan Lollis")).toBe(true);
  });

  it("does not match unrelated drivers", () => {
    expect(rosterNamesMatch("Ryan Lollis", "Ryan Smith")).toBe(false);
    expect(rosterNamesMatch("Mike Davy", "Michael Alvarez")).toBe(false);
    expect(rosterNamesMatch("John", "John Maxedon")).toBe(false);
  });
});

describe("vacation → Full Roster auto-VAC", () => {
  const weekOf = "2026-01-04";
  const midweek = "2026-01-07";

  it("lists Vacation names for the week containing the as-of date", () => {
    const vacation = vacationStore([
      { yard: "rockford", weekOf, name: "Greg Cellarius" },
      { yard: "chicago", weekOf, name: "Ryan Lollis" },
      { yard: "rockford", weekOf: "2026-01-11", name: "Paul Finch" },
    ]);
    expect(vacationNamesOnDate(vacation, midweek, "rockford")).toEqual([
      "Greg Cellarius",
      "Ryan Lollis",
    ]);
    expect(vacationNamesOnDate(vacation, midweek, "burnham")).toEqual([
      "Ryan Lollis",
      "Greg Cellarius",
    ]);
    expect(vacationNamesOnDate(vacation, "2026-01-12", "rockford")).toEqual(["Paul Finch"]);
  });

  it("marks a roster row VAC without writing status", () => {
    const vacation = vacationStore([{ weekOf, name: "Greg Cellarius" }]);
    const names = vacationNamesOnDate(vacation, midweek, "burnham");
    const entry = roster("Greg Celarius-T");
    expect(rosterEntryOnVacation(entry, names)).toBe(true);
    expect(effectiveRosterStatus(entry, names)).toEqual({
      status: "vac",
      source: "vacation",
      storedStatus: null,
      onVacation: true,
    });
    expect(entry.status).toBeNull();
  });

  it("lets Vacation VAC win over a stored oot mark without dropping the stored mark", () => {
    const names = ["Devell Nutall"];
    const entry = roster("Devell Nutall", { status: "oot" });
    const effective = effectiveRosterStatus(entry, names);
    expect(effective).toEqual({
      status: "vac",
      source: "vacation",
      storedStatus: "oot",
      onVacation: true,
    });
    expect(entry.status).toBe("oot");
  });

  it("counts auto-VAC once even when stored status is already out", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Working Driver",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Devell Nutall",
      status: "oot",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Ryan Lollis",
    }).store;

    const vacation = vacationStore([
      { yard: "rockford", weekOf, name: "Devell Nutall" },
      { yard: "rockford", weekOf, name: "Ryan Lollis" },
    ]);
    const entries = entriesForRoster(store, "full", "burnham");
    const withoutVac = fullRosterTally(entries);
    expect(withoutVac).toEqual({ hired: 3, unavailable: 1, available: 2 });

    const withVac = fullRosterTallyForDate(entries, vacation, midweek, "burnham");
    expect(withVac).toEqual({ hired: 3, unavailable: 2, available: 1 });

    const afterWeek = fullRosterTallyForDate(entries, vacation, "2026-01-20", "burnham");
    expect(afterWeek).toEqual(withoutVac);
  });

  it("never removes hired roster rows when applying Vacation VAC", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Ryan Lollis",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Working Driver",
    }).store;
    const before = { ...store.entries };
    const vacation = vacationStore([{ weekOf, name: "Ryan Lollis" }]);
    const tally = fullRosterTallyForDate(
      entriesForRoster(store, "full", "burnham"),
      vacation,
      midweek,
      "burnham",
    );
    expect(tally).toEqual({ hired: 2, unavailable: 1, available: 1 });
    expect(store.entries).toEqual(before);
    expect(Object.keys(store.entries)).toHaveLength(2);
  });

  it("does not persist auto-VAC when a dispatcher later edits another field", () => {
    let store = emptyDriverRosterStore();
    const added = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Ryan Lollis",
    });
    store = added.store;
    const names = ["Ryan Lollis"];
    expect(effectiveRosterStatus(added.entry!, names).source).toBe("vacation");
    store = updateRosterEntry(store, added.entry!.id, { truckNumber: "184" });
    expect(store.entries[added.entry!.id].status).toBeNull();
  });
});
