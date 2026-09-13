import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addGoneEntry,
  applyFullRosterDelete,
  DRIVER_GONE_STORE_KEY,
  emptyDriverGoneStore,
  entriesForGone,
  entriesForGoneYear,
  goneArchiveYears,
  goneEntryCount,
  goneYearLabel,
  goneYearOf,
  mergeImportedGoneRows,
  parseGoneDate,
  reconcileDriverGoneCloud,
  scrubPrivacyFromNotes,
} from "./driverGone";
import { parseGoneSheetCsv } from "./driverGoneSheet";
import {
  addRosterEntry,
  emptyDriverRosterStore,
  entriesForRoster,
  fullRosterTally,
  matchingSatEntriesForPerson,
  removeHiredAndMatchingSat,
  rosterEntryCount,
} from "./driverRoster";

const GONE_FIXTURE = `"Emp #","Name","Phone","Email","Hire date","Termination date","Notes"
"39963","Habeeb Bello","555-010-0001","fake1@example.com","8/4/25","1/2/2026","Laid Off. ok driver."
"86","Garry Prince","555-010-0002","fake2@example.com","5/5/1995","2/27/26","Retired, 30+ years with MBI. Congrats!"
"36664","Jeremiah Richardson ","555-010-0003","fake3@example.com","7/29/2022","1/9/2026","Quit. Call 555-010-9999 or write leak@example.com after."
"","", "555-010-0004","skip@example.com","","",""`;

function hired(
  store = emptyDriverRosterStore(),
  yard: "burnham" | "rockford" = "burnham",
  truck = "56",
  name = "Dave Vanderbilt",
) {
  return addRosterEntry(store, {
    kind: "full",
    yard,
    truckNumber: truck,
    name,
  });
}

describe("parseGoneDate", () => {
  it("reads US sheet dates including pre-2000 hire years", () => {
    expect(parseGoneDate("8/4/25")).toBe("2025-08-04");
    expect(parseGoneDate("1/2/2026")).toBe("2026-01-02");
    expect(parseGoneDate("5/5/1995")).toBe("1995-05-05");
    expect(parseGoneDate("4/30/01")).toBe("2001-04-30");
    expect(parseGoneDate("2026-09-12")).toBe("2026-09-12");
    expect(parseGoneDate("")).toBeNull();
  });
});

describe("Gone seed parse", () => {
  it("imports only emp #, name, hire, termination, notes — never contact fields", () => {
    const rows = parseGoneSheetCsv(GONE_FIXTURE);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([
      ["employeeNumber", "hireDate", "name", "notes", "terminationDate", "yard"],
      ["employeeNumber", "hireDate", "name", "notes", "terminationDate", "yard"],
      ["employeeNumber", "hireDate", "name", "notes", "terminationDate", "yard"],
    ]);
    expect(rows[0]).toEqual({
      employeeNumber: "39963",
      name: "Habeeb Bello",
      hireDate: "2025-08-04",
      terminationDate: "2026-01-02",
      notes: "Laid Off. ok driver.",
      yard: null,
    });
    expect(rows[1]).toEqual({
      employeeNumber: "86",
      name: "Garry Prince",
      hireDate: "1995-05-05",
      terminationDate: "2026-02-27",
      notes: "Retired, 30+ years with MBI. Congrats!",
      yard: null,
    });
    const blob = JSON.stringify(rows);
    expect(blob).not.toContain("555-010-0001");
    expect(blob).not.toContain("555-010-0002");
    expect(blob).not.toContain("555-010-0003");
    expect(blob).not.toContain("fake1@example.com");
    expect(blob).not.toContain("fake2@example.com");
    expect(blob).not.toContain("fake3@example.com");
    expect(blob).not.toMatch(/"phone"/i);
    expect(blob).not.toMatch(/"email"/i);
  });

  it("scrubs contact-looking tokens that leaked into notes", () => {
    const rows = parseGoneSheetCsv(GONE_FIXTURE);
    const jeremiah = rows.find((row) => row.name === "Jeremiah Richardson");
    expect(jeremiah?.notes).toBe("Quit. Call or write after.");
    expect(jeremiah?.notes).not.toContain("@");
    expect(jeremiah?.notes).not.toMatch(/\d{3}/);
    expect(scrubPrivacyFromNotes("Term. 555-010-1111 ok")).toBe("Term. ok");
  });

  it("parser source never reads contact columns", () => {
    const src = readFileSync(new URL("./driverGoneSheet.ts", import.meta.url), "utf8");
    expect(src).toContain("COL_EMP = 0");
    expect(src).toContain("COL_NAME = 1");
    expect(src).toContain("COL_HIRE = 4");
    expect(src).toContain("COL_TERM = 5");
    expect(src).toContain("COL_NOTES = 6");
    expect(src).not.toMatch(/row\s*\[\s*2\s*\]/);
    expect(src).not.toMatch(/row\s*\[\s*3\s*\]/);
  });

  it("SQL and store have no contact fields", () => {
    const sql = readFileSync(new URL("../../Load-Tracker-driver-gone.sql", import.meta.url), "utf8");
    expect(sql).toContain("driver_gone_entries");
    expect(sql).toContain("employee_number");
    expect(sql).toContain("hire_date");
    expect(sql).toContain("termination_date");
    expect(sql).toContain("driver_gone_deletes_allowed");
    expect(sql).not.toMatch(/phone_number|\bemail\b/i);
    expect(sql).toMatch(/create table[\s\S]*driver_gone_entries \([\s\S]*employee_number[\s\S]*hire_date[\s\S]*termination_date[\s\S]*notes/);
    expect(sql).not.toMatch(
      /crew_delete_driver_gone_entries[\s\S]*for delete[\s\S]*using \(true\)/,
    );
    const storeSrc = readFileSync(new URL("./driverGone.ts", import.meta.url), "utf8");
    expect(storeSrc).toMatch(
      /export type DriverGoneEntry = \{[\s\S]*employeeNumber[\s\S]*hireDate[\s\S]*terminationDate[\s\S]*notes/,
    );
    expect(storeSrc).not.toContain("phoneNumber");
    expect(storeSrc).not.toContain("emailAddress");
  });
});

describe("Full Roster × dialog paths", () => {
  it("Edit removes Full + matching Sat and does not write Gone", () => {
    let roster = hired().store;
    roster = addRosterEntry(roster, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    roster = addRosterEntry(roster, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "102",
      name: "Dan Kasprzycki -T",
    }).store;
    const fullId = entriesForRoster(roster, "full", "burnham")[0].id;
    const goneBefore = addGoneEntry(emptyDriverGoneStore(), {
      name: "Already Gone",
      employeeNumber: "1",
      notes: "prior",
    }).store;

    const result = applyFullRosterDelete(roster, goneBefore, fullId, { intent: "edit" });
    expect(result.goneEntry).toBeNull();
    expect(rosterEntryCount(result.roster, "full", "burnham")).toBe(0);
    expect(entriesForRoster(result.roster, "sat", "burnham").map((row) => row.name)).toEqual([
      "Dan Kasprzycki -T",
    ]);
    expect(goneEntryCount(result.gone)).toBe(1);
    expect(result.gone.entries).toEqual(goneBefore.entries);
    expect(fullRosterTally(Object.values(result.roster.entries)).hired).toBe(0);
  });

  it("Termination archives on Gone, drops Full + Sat, and leaves hired count", () => {
    let roster = hired().store;
    roster = addRosterEntry(roster, {
      kind: "sat",
      yard: "rockford",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    const extra = hired(roster, "burnham", "102", "Dan Kasprzycki -T");
    roster = extra.store;
    const fullId = entriesForRoster(roster, "full", "burnham").find(
      (row) => row.name === "Dave Vanderbilt",
    )!.id;

    const result = applyFullRosterDelete(roster, emptyDriverGoneStore(), fullId, {
      intent: "termination",
      hireDate: "2020-01-15",
      terminationDate: "2026-09-12",
      notes: "Quit, gave notice.",
    });

    expect(result.goneEntry).toMatchObject({
      employeeNumber: "56",
      name: "Dave Vanderbilt",
      hireDate: "2020-01-15",
      terminationDate: "2026-09-12",
      notes: "Quit, gave notice.",
      yard: "burnham",
    });
    expect(rosterEntryCount(result.roster, "full", "burnham")).toBe(1);
    expect(entriesForRoster(result.roster, "full", "burnham")[0].name).toBe("Dan Kasprzycki -T");
    expect(matchingSatEntriesForPerson(result.roster, { truckNumber: "56", name: "Dave Vanderbilt" })).toEqual(
      [],
    );
    expect(fullRosterTally(Object.values(result.roster.entries)).hired).toBe(1);
    expect(entriesForGone(result.gone)).toHaveLength(1);
  });

  it("termination notes are scrubbed and hire date may stay blank", () => {
    const roster = hired().store;
    const fullId = entriesForRoster(roster, "full", "burnham")[0].id;
    const result = applyFullRosterDelete(roster, emptyDriverGoneStore(), fullId, {
      intent: "termination",
      hireDate: "",
      terminationDate: "2026-09-12",
      notes: "Term. Call 555-010-2222 or boss@example.com",
    });
    expect(result.goneEntry?.hireDate).toBeNull();
    expect(result.goneEntry?.notes).toBe("Term. Call or");
    expect(result.goneEntry?.notes).not.toContain("@");
  });

  it("DriverScreen asks Termination vs Edit (remove only) before dropping a hire", () => {
    const src = readFileSync(new URL("../screens/DriverScreen.tsx", import.meta.url), "utf8");
    expect(src).toContain("Termination");
    expect(src).toContain("Edit (remove only)");
    expect(src).toContain("Cancel");
    expect(src).toContain("removeHiredAndSat");
    expect(src).toContain("addGone");
    expect(src).toContain("terminationDate");
    expect(src).not.toMatch(/<th[^>]*>\s*Phone\s*</);
    expect(src).not.toMatch(/<th[^>]*>\s*Email\s*</);
    expect(src).toContain("Gone");
    expect(src).toContain("Hire date");
    expect(src).toContain("Termination date");
    expect(src).not.toContain("Everyone listed is hired at this yard");
    expect(src).not.toContain("it does not keep reading the workbook");
    expect(src).not.toContain("Starts as this yard");
    expect(src).not.toContain("aria-label=\"Roster help\"");
    expect(src).toContain("goneYearLabel");
    expect(src).not.toContain("Import empty lists");
    expect(src).toContain("drv-full-grid");
    expect(src).toContain("Truck #");
  });
});

describe("Gone YYYY year buckets", () => {
  it("always includes the current year and groups by termination year", () => {
    let store = emptyDriverGoneStore();
    store = addGoneEntry(store, {
      name: "Left In 2026",
      terminationDate: "2026-03-01",
    }).store;
    store = addGoneEntry(store, {
      name: "Left In 2025",
      terminationDate: "2025-12-20",
    }).store;
    store = addGoneEntry(store, {
      name: "No Date Yet",
    }).store;
    expect(goneYearLabel(2026)).toBe("Gone 2026");
    expect(goneArchiveYears(store, 2026)).toEqual([2026, 2025]);
    expect(goneArchiveYears(store, 2027)).toEqual([2027, 2026, 2025]);
    expect(goneYearOf({ terminationDate: "2026-09-12" }, 2027)).toBe(2026);
    expect(goneYearOf({ terminationDate: null }, 2027)).toBe(2027);
    expect(entriesForGoneYear(store, 2026, 2026).map((row) => row.name)).toEqual([
      "Left In 2026",
      "No Date Yet",
    ]);
    expect(entriesForGoneYear(store, 2025, 2026).map((row) => row.name)).toEqual([
      "Left In 2025",
    ]);
    expect(entriesForGoneYear(store, 2027, 2026)).toEqual([]);
  });
});

describe("removeHiredAndMatchingSat", () => {
  it("keeps other Sat names", () => {
    let store = hired().store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "102",
      name: "Other Driver",
    }).store;
    const id = entriesForRoster(store, "full", "burnham")[0].id;
    const result = removeHiredAndMatchingSat(store, id);
    expect(result.removed.map((row) => row.kind).sort()).toEqual(["full", "sat"]);
    expect(entriesForRoster(result.store, "sat", "burnham").map((row) => row.name)).toEqual([
      "Other Driver",
    ]);
  });
});

describe("Gone cloud delete posture", () => {
  it("uses a dedicated persist key", () => {
    expect(DRIVER_GONE_STORE_KEY).toBe("chitrader.load-tracker.driver-gone.v1");
  });

  it("does not wipe or remotely delete on an empty pull", () => {
    const local = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "86",
      name: "Garry Prince",
      notes: "Retired",
    });
    const result = reconcileDriverGoneCloud({
      local: local.store,
      remote: emptyDriverGoneStore(),
      deletedEntryIds: [],
      seenRemoteEntryIds: [],
    });
    expect(Object.keys(result.next.entries)).toHaveLength(1);
    expect(result.toUploadEntries).toHaveLength(1);
    expect(result.toDeleteRemoteEntries).toEqual([]);
  });

  it("keeps local rows missing from a subset pull and does not remote-delete them", () => {
    const a = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "86",
      name: "Garry Prince",
    });
    const b = addGoneEntry(a.store, {
      employeeNumber: "514",
      name: "David Garkey",
    });
    const keepId = a.entry!.id;
    const missingId = b.entry!.id;
    const result = reconcileDriverGoneCloud({
      local: b.store,
      remote: { entries: { [keepId]: a.store.entries[keepId] } },
      deletedEntryIds: [],
      seenRemoteEntryIds: [keepId, missingId],
    });
    expect(result.next.entries[keepId]).toBeDefined();
    expect(result.next.entries[missingId]).toBeDefined();
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(result.toUploadEntries).toEqual([]);
  });

  it("adopts a live remote row over a stale tombstone and never schedules a remote delete", () => {
    const added = addGoneEntry(emptyDriverGoneStore(), {
      employeeNumber: "39963",
      name: "Habeeb Bello",
      notes: "Laid Off",
    });
    const id = added.entry!.id;
    const result = reconcileDriverGoneCloud({
      local: emptyDriverGoneStore(),
      remote: added.store,
      deletedEntryIds: [id],
      seenRemoteEntryIds: [id],
    });
    expect(result.next.entries[id]).toEqual(added.store.entries[id]);
    expect(result.deletedEntryIds).toEqual([]);
    expect(result.toDeleteRemoteEntries).toEqual([]);
  });

  it("does not drop Gone names when a later sheet import runs", () => {
    const first = mergeImportedGoneRows(emptyDriverGoneStore(), [
      {
        employeeNumber: "86",
        name: "Garry Prince",
        hireDate: "1995-05-05",
        terminationDate: "2026-02-27",
        notes: "Retired",
        yard: null,
      },
    ]);
    expect(first.added).toBe(1);
    const thinner = mergeImportedGoneRows(first.store, []);
    expect(thinner.added).toBe(0);
    expect(thinner.skipped).toBe(true);
    expect(goneEntryCount(thinner.store)).toBe(1);
  });

  it("never issues an unscoped driver_gone_entries delete", () => {
    const src = readFileSync(new URL("../store/DriverGoneContext.tsx", import.meta.url), "utf8");
    expect(src).toContain('.from("driver_gone_entries").delete().in("id", ids)');
    expect(src).not.toContain("toDeleteRemoteEntries");
    expect(src).toContain("the only path that may DELETE a cloud Gone row");
  });
});
