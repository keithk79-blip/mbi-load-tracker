import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addRosterEntry,
  DEFAULT_DRIVER_ROSTER_YARD,
  driverRosterSeedId,
  DRIVER_ROSTER_STORE_KEY,
  emptyDriverRosterStore,
  entriesForRoster,
  fullRosterHiredNames,
  formatRosterCopyList,
  formatRosterLine,
  fullRosterDriversForTruck,
  fullRosterTally,
  matchDriverNameSuggestions,
  cleanAssignedTruck,
  cleanTruckNumber,
  importEntryId,
  rosterStatusLabel,
  rosterStatusRemovesFromAvailable,
  mergeImportedRows,
  moveRosterEntry,
  reconcileDriverRosterCloud,
  removeRosterEntry,
  resetSatRosterFromFull,
  rosterEntryCount,
  satEntryIdFromFull,
  satRosterColumnCount,
  satRosterMatchesFull,
  satRosterRowCount,
  seedEmptySatRostersFromFull,
  setSatDateForYard,
  updateRosterEntry,
  yardFromSheetTab,
} from "./driverRoster";
import {
  isRosterPersonName,
  isRosterStatusToken,
  isRosterSummaryLabel,
  parseRosterPeople,
  parseRosterTabCsv,
} from "./driverRosterSheet";

const BURNHAM_FULL = `"56","Dave Vanderbilt       ","","30765","Bill Vrtis-T","","37422","John Maxedon","","","","",""
"102","Dan Kasprzycki -T","","31559","Robert Mickelson","","37429","Kyle Odekirk","","","","",""
"184","James Carter   ","","32423","Johnnie Owens","","37817","Marvin Alvarez","","","Total Burnham Drivers","74",""
"231","Kevin Bray","","32742","Ryan Lollis","","33707","Zachary Valadez","oot","","","",""
"575","Devell Nutall","","32962","Wayne Smith","","37818","Jeffrey Haynes","oot","","Unavailable Drivers","11",""
"699","Paul Tiemens-T      ","","33000","Steve Skiniotes -T","","37930","Britton McKay -T","","","Available Drivers","63",""
"2521","Glen Barker","oot","34600","Herbert Hill - T","","39321","Kamaree Marshall","","","","",""
"21859","John Wegner","wc","36640","Nick Zafra","","40467","Crandall Wells","","","","",""
"21846","Paris Cochran","","22681","Josh Maciejewski","vac","40232","Zavier Alexander","OOT","","","",""
"","","","","","","40676","Wayne Varnado","","","","",""`;

const ROCKFORD_FULL = `"185","Christopher Oleson","","32246","Arthur Williams","","","k","","Total Rockford Drivers ","47"
"1495","Jamie Bugarin","","33573","Jason Ackerman","","","","","",""
"1055","Corey Daggert","","34519","Terrance Wyatt","fmla","","","","Drivers Available","44"
"2510","Robert Jones","","35479","Nathan Van Vlerah","","Dekalb Reload","","","",""
"2709","Ken Bryant","wc","36371","David Jurs","","Elgin","","","",""
"31160","James Kmilek     Elgin","","","","","","","","",""
"13","Hank Kingpavong","","","","","","","","",""`;

const PONTIAC_FULL = `"","","","Pit Time","","","","","",""
"95","Frank Ragano","","","Joliet","","","Total Pontiac Drivers ","","10"
"2382","Mike Davy","","6:15","Morris","","","","",""
"2568","Randy Mesarchik","vac","6:30","Pontiac","","","Unavailable Drivers","","1"
"40478","Margarito Hernandez","","","Lrs","","","","",""`;

const ARC_FULL = `"100","Francisco Ramirez","","","ARC","","","","","",""
"366","Roberto Gonzalez","","","ARC","","","","","Total Arc Drivers","16"
"31742","Ariel Sanchez","","4:30 AM","Northlake  WF","","","","","Available Drivers","16"`;

const ZION_FULL = `"22041","Marcelo Aldana","","Grayslake","","","","","",""
"31800","Anthony Goebel","","Lincolnshire","","Total Zion Drivers","","12","",""
"37303","Sergio Valadez","Wc","Lincolnshire","","","","","",""`;

const SAT_BURNHAM = `"","","","","","9/12/26","","","","","","",""
"56","Dave Vanderbilt       ","30765","Bill Vrtis-T","37422","John Maxedon","","","","","","",""
"102","Dan Kasprzycki -T","31559","Robert Mickelson","37429","Kyle Odekirk","","Total Drivers ","50","","","",""
"","","","","40676","Wayne Varnado","","","","","","",""`;

const SAT_ROCKFORD = `"","","","","","9/12/26","","","","","","","",""
"185","Christopher Oleson","","32246","Arthur Williams","","","","","","","","",""
"1495","Jamie Bugarin","","33573","Jason Ackerman","","","Total Drivers","47","","","","",""
"13","Hank Kingpavong","","","","","","","","","","","",""`;

describe("yardFromSheetTab", () => {
  it("maps full and sat tab titles to yard keys", () => {
    expect(yardFromSheetTab("Burnham")).toBe("burnham");
    expect(yardFromSheetTab("Rockford")).toBe("rockford");
    expect(yardFromSheetTab("Pontiac")).toBe("pontiac");
    expect(yardFromSheetTab("Zion")).toBe("zion");
    expect(yardFromSheetTab("Arc Drivers")).toBe("arc");
    expect(yardFromSheetTab("ARC Drivers")).toBe("arc");
    expect(yardFromSheetTab("Sat-Burnham")).toBe("burnham");
    expect(yardFromSheetTab("Sat-Rockford")).toBe("rockford");
    expect(yardFromSheetTab("Sat-Pontiac")).toBe("pontiac");
    expect(yardFromSheetTab("Sat-Arc")).toBe("arc");
    expect(yardFromSheetTab("Sat-Zion")).toBe("zion");
    expect(yardFromSheetTab("unknown tab")).toBeNull();
  });
});

describe("roster cell classifiers", () => {
  it("treats workbook totals as labels, not people", () => {
    expect(isRosterSummaryLabel("Total Burnham Drivers")).toBe(true);
    expect(isRosterSummaryLabel("Available Drivers")).toBe(true);
    expect(isRosterSummaryLabel("Total Drivers")).toBe(true);
    expect(isRosterSummaryLabel("All Chicago Drivers")).toBe(true);
    expect(isRosterSummaryLabel("Drivers Unavailable")).toBe(true);
    expect(isRosterSummaryLabel("Dave Vanderbilt")).toBe(false);
  });

  it("accepts status markers and rejects them as names", () => {
    expect(isRosterStatusToken("oot")).toBe(true);
    expect(isRosterStatusToken("OOT")).toBe(true);
    expect(isRosterStatusToken("fmla")).toBe(true);
    expect(isRosterStatusToken("vac")).toBe(true);
    expect(isRosterStatusToken("Wc")).toBe(true);
    expect(isRosterPersonName("vac")).toBe(false);
    expect(isRosterPersonName("Dave Vanderbilt")).toBe(true);
    expect(isRosterPersonName("Elgin")).toBe(false);
    expect(isRosterPersonName("6:15")).toBe(false);
  });
});

describe("parseRosterPeople", () => {
  it("reads Burnham's three truck|name|status groups and skips totals", () => {
    const { people } = parseRosterPeople(BURNHAM_FULL);
    expect(people[0]).toEqual({
      truckNumber: "56",
      name: "Dave Vanderbilt",
      status: null,
    });
    expect(people.find((row) => row.name === "Dave Vanderbilt")).toEqual({
      truckNumber: "56",
      name: "Dave Vanderbilt",
      status: null,
    });
    expect(people.map((row) => row.truckNumber).slice(0, 3)).toEqual(["56", "102", "184"]);
    expect(people.find((row) => row.name === "Zachary Valadez")?.status).toBe("oot");
    expect(people.find((row) => row.name === "John Wegner")?.status).toBe("wc");
    expect(people.find((row) => row.name === "Josh Maciejewski")?.status).toBe("vac");
    expect(people.find((row) => row.name === "Zavier Alexander")?.status).toBe("oot");
    expect(people.some((row) => /total|available/i.test(row.name))).toBe(false);
    expect(people.map((row) => row.truckNumber)).toContain("40676");
    expect(people).toHaveLength(28);
  });

  it("reads Rockford's two name columns and ignores location leftovers", () => {
    const { people } = parseRosterPeople(ROCKFORD_FULL);
    expect(people.find((row) => row.name === "Christopher Oleson")?.truckNumber).toBe("185");
    expect(people.find((row) => row.name === "Terrance Wyatt")?.status).toBe("fmla");
    expect(people.find((row) => row.name === "Ken Bryant")?.status).toBe("wc");
    expect(people.some((row) => row.name === "Dekalb Reload")).toBe(false);
    expect(people.some((row) => row.name === "Elgin")).toBe(false);
    expect(people.some((row) => row.name === "k")).toBe(false);
    expect(people.find((row) => row.truckNumber === "13")?.name).toBe("Hank Kingpavong");
    expect(people.find((row) => row.truckNumber === "31160")?.name).toBe("James Kmilek Elgin");
  });

  it("reads single-column Pontiac / Arc / Zion lists", () => {
    const pontiac = parseRosterPeople(PONTIAC_FULL).people;
    expect(pontiac.map((row) => row.name)).toEqual([
      "Frank Ragano",
      "Mike Davy",
      "Randy Mesarchik",
      "Margarito Hernandez",
    ]);
    expect(pontiac.find((row) => row.name === "Randy Mesarchik")?.status).toBe("vac");
    expect(pontiac.some((row) => row.name === "Joliet" || row.name === "Morris")).toBe(false);

    const arc = parseRosterPeople(ARC_FULL).people;
    expect(arc.map((row) => `${row.truckNumber} ${row.name}`)).toEqual([
      "100 Francisco Ramirez",
      "366 Roberto Gonzalez",
      "31742 Ariel Sanchez",
    ]);

    const zion = parseRosterPeople(ZION_FULL).people;
    expect(zion).toHaveLength(3);
    expect(zion.find((row) => row.name === "Sergio Valadez")?.status).toBe("wc");
  });

  it("parses Sat tabs without status columns and captures the planning date", () => {
    const sat = parseRosterTabCsv(SAT_BURNHAM, "sat", "burnham", "Sat-Burnham");
    expect(sat.forDate).toBe("2026-09-12");
    expect(sat.people).toHaveLength(7);
    expect(sat.people[0]).toEqual({
      truckNumber: "56",
      name: "Dave Vanderbilt",
      status: null,
    });
    expect(sat.people.some((row) => /total/i.test(row.name))).toBe(false);

    const rock = parseRosterTabCsv(SAT_ROCKFORD, "sat", "rockford", "Sat-Rockford");
    expect(rock.forDate).toBe("2026-09-12");
    expect(rock.people.map((row) => row.truckNumber)).toEqual(["185", "1495", "13", "32246", "33573"]);
  });
});

describe("full roster unavailability tally", () => {
  it("treats sheet abbreviations as hired-but-out, not a separate list", () => {
    expect(rosterStatusRemovesFromAvailable("oot")).toBe(true);
    expect(rosterStatusRemovesFromAvailable("OOT")).toBe(true);
    expect(rosterStatusRemovesFromAvailable("fmla")).toBe(true);
    expect(rosterStatusRemovesFromAvailable("vac")).toBe(true);
    expect(rosterStatusRemovesFromAvailable("Wc")).toBe(true);
    expect(rosterStatusRemovesFromAvailable("late/early")).toBe(false);
    expect(rosterStatusRemovesFromAvailable(null)).toBe(false);
    expect(rosterStatusLabel("oot")).toBe("OOT");
    expect(rosterStatusLabel("vac")).toBe("Vac");
    expect(rosterStatusLabel("wc")).toBe("WC");
  });

  it("counts hired minus full-day status for a later Today tally", () => {
    const { people } = parseRosterPeople(BURNHAM_FULL);
    let store = emptyDriverRosterStore();
    for (const person of people) {
      store = addRosterEntry(store, {
        kind: "full",
        yard: "burnham",
        truckNumber: person.truckNumber,
        name: person.name,
        status: person.status,
      }).store;
    }
    const tally = fullRosterTally(entriesForRoster(store, "full", "burnham"));
    expect(tally.hired).toBe(28);
    expect(tally.unavailable).toBe(6);
    expect(tally.available).toBe(22);
    expect(tally.hired).toBe(rosterEntryCount(store, "full", "burnham"));
  });
});

describe("full roster name typeahead", () => {
  it("lists unique hired names from every yard and ignores Sat-only rows", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "zion",
      name: "dave vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "pontiac",
      name: "Frank Ragano",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      name: "Sat Only Person",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "arc",
      name: "  ",
    }).store;

    expect(fullRosterHiredNames(store)).toEqual(["Dave Vanderbilt", "Frank Ragano"]);
  });

  it("filters names the same way Vacation typeahead does", () => {
    const names = ["Dave Vanderbilt", "Dan Kasprzycki", "Frank Ragano", "Marcelo Aldana"];
    expect(matchDriverNameSuggestions(names, "")).toEqual([]);
    expect(matchDriverNameSuggestions(names, "  da")).toEqual([
      "Dave Vanderbilt",
      "Dan Kasprzycki",
      "Marcelo Aldana",
    ]);
    expect(matchDriverNameSuggestions(names, "rag")).toEqual(["Frank Ragano"]);
    expect(matchDriverNameSuggestions(names, "a", 2)).toEqual([
      "Dave Vanderbilt",
      "Dan Kasprzycki",
    ]);
  });
});

describe("roster add/remove helpers", () => {
  it("adds, counts, copies, and removes a yard list", () => {
    let store = emptyDriverRosterStore();
    const first = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    });
    expect(first.entry?.name).toBe("Dave Vanderbilt");
    store = first.store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "102",
      name: "Dan Kasprzycki -T",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      truckNumber: "185",
      name: "Christopher Oleson",
    }).store;

    expect(rosterEntryCount(store, "full", "burnham")).toBe(2);
    expect(rosterEntryCount(store, "full", "rockford")).toBe(1);
    expect(fullRosterHiredNames(store)).toEqual([
      "Christopher Oleson",
      "Dan Kasprzycki -T",
      "Dave Vanderbilt",
    ]);
    const burnham = entriesForRoster(store, "full", "burnham");
    expect(formatRosterLine(burnham[0])).toBe("56 Dave Vanderbilt");
    expect(formatRosterCopyList(burnham)).toBe("56 Dave Vanderbilt\n102 Dan Kasprzycki -T");

    const removed = removeRosterEntry(store, burnham[0].id);
    expect(removed.removed?.name).toBe("Dave Vanderbilt");
    expect(rosterEntryCount(removed.store, "full", "burnham")).toBe(1);
  });

  it("reorders Sat rows and stamps a shared planning date", () => {
    let store = emptyDriverRosterStore();
    const a = addRosterEntry(store, {
      kind: "sat",
      yard: "pontiac",
      truckNumber: "95",
      name: "Frank Ragano",
    });
    store = a.store;
    const b = addRosterEntry(store, {
      kind: "sat",
      yard: "pontiac",
      truckNumber: "2382",
      name: "Mike Davy",
    });
    store = b.store;
    store = moveRosterEntry(store, b.entry!.id, -1);
    expect(entriesForRoster(store, "sat", "pontiac").map((row) => row.name)).toEqual([
      "Mike Davy",
      "Frank Ragano",
    ]);
    store = setSatDateForYard(store, "pontiac", "2026-09-12");
    expect(entriesForRoster(store, "sat", "pontiac").every((row) => row.forDate === "2026-09-12")).toBe(
      true,
    );
  });

  it("imports only into empty kind/yard groups", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Existing",
    }).store;
    const result = mergeImportedRows(store, [
      {
        kind: "full",
        yard: "burnham",
        truckNumber: "99",
        name: "Should Skip",
        status: null,
        forDate: null,
      },
      {
        kind: "sat",
        yard: "burnham",
        truckNumber: "56",
        name: "Dave Vanderbilt",
        status: null,
        forDate: "2026-09-12",
      },
    ]);
    expect(result.added).toBe(1);
    expect(result.skippedGroups).toEqual(["full:burnham"]);
    expect(rosterEntryCount(result.store, "full", "burnham")).toBe(1);
    expect(rosterEntryCount(result.store, "sat", "burnham")).toBe(1);
    expect(
      importEntryId({
        kind: "sat",
        yard: "burnham",
        truckNumber: "56",
        name: "Dave Vanderbilt",
        index: 0,
      }),
    ).toBe(
      driverRosterSeedId("sat|burnham|56|dave vanderbilt|0"),
    );
  });
});

describe("sat roster seeds and resets from full", () => {
  function addHired(
    store: ReturnType<typeof emptyDriverRosterStore>,
    yard: "burnham" | "rockford",
    truckNumber: string,
    name: string,
    status?: string | null,
  ) {
    return addRosterEntry(store, { kind: "full", yard, truckNumber, name, status }).store;
  }

  it("seeds empty Sat from that yard's Full Roster hired emp# + name", () => {
    let store = emptyDriverRosterStore();
    store = addHired(store, "burnham", "56", "Dave Vanderbilt", "oot");
    store = addHired(store, "burnham", "102", "Dan Kasprzycki -T");
    store = addHired(store, "rockford", "185", "Christopher Oleson");

    const result = seedEmptySatRostersFromFull(store);
    expect(result.added).toBe(3);
    expect(result.seededYards).toEqual(["burnham", "rockford"]);
    expect(entriesForRoster(result.store, "sat", "burnham").map((row) => ({
      emp: row.truckNumber,
      name: row.name,
      status: row.status,
    }))).toEqual([
      { emp: "56", name: "Dave Vanderbilt", status: null },
      { emp: "102", name: "Dan Kasprzycki -T", status: null },
    ]);
    expect(entriesForRoster(result.store, "sat", "rockford").map((row) => row.name)).toEqual([
      "Christopher Oleson",
    ]);
    expect(rosterEntryCount(result.store, "full", "burnham")).toBe(2);
    expect(entriesForRoster(result.store, "full", "burnham")[0].status).toBe("oot");
    expect(satRosterMatchesFull(result.store, "burnham")).toBe(true);
    expect(
      result.store.entries[satEntryIdFromFull("burnham", "56", "Dave Vanderbilt")]?.kind,
    ).toBe("sat");
  });

  it("does not leave Sat empty when Full has people, and does not overwrite a Sat list", () => {
    let store = emptyDriverRosterStore();
    store = addHired(store, "burnham", "56", "Dave Vanderbilt");
    store = addHired(store, "burnham", "102", "Dan Kasprzycki -T");
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;

    const result = seedEmptySatRostersFromFull(store);
    expect(result.added).toBe(0);
    expect(result.seededYards).toEqual([]);
    expect(rosterEntryCount(result.store, "sat", "burnham")).toBe(1);
    expect(entriesForRoster(result.store, "sat", "burnham").map((row) => row.name)).toEqual([
      "Dave Vanderbilt",
    ]);
  });

  it("does not invent Sat rows when Full is empty", () => {
    const result = seedEmptySatRostersFromFull(emptyDriverRosterStore(), { yards: ["pontiac"] });
    expect(result.added).toBe(0);
    expect(result.seededYards).toEqual([]);
    expect(rosterEntryCount(result.store, "sat", "pontiac")).toBe(0);
  });

  it("Reset copies Full → Sat for one yard only and replaces existing Sat rows", () => {
    let store = emptyDriverRosterStore();
    store = addHired(store, "burnham", "56", "Dave Vanderbilt", "vac");
    store = addHired(store, "burnham", "102", "Dan Kasprzycki -T");
    store = addHired(store, "rockford", "185", "Christopher Oleson");
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "999",
      name: "Only On Sat",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "rockford",
      truckNumber: "13",
      name: "Hank Kingpavong",
    }).store;
    const rockfordSatId = entriesForRoster(store, "sat", "rockford")[0].id;
    const leftoverSatId = entriesForRoster(store, "sat", "burnham").find(
      (row) => row.name === "Only On Sat",
    )!.id;

    const result = resetSatRosterFromFull(store, "burnham");
    expect(result.removedIds).toContain(leftoverSatId);
    expect(entriesForRoster(result.store, "sat", "burnham").map((row) => ({
      emp: row.truckNumber,
      name: row.name,
      status: row.status,
    }))).toEqual([
      { emp: "56", name: "Dave Vanderbilt", status: null },
      { emp: "102", name: "Dan Kasprzycki -T", status: null },
    ]);
    expect(satRosterMatchesFull(result.store, "burnham")).toBe(true);
    expect(entriesForRoster(result.store, "sat", "rockford").map((row) => row.id)).toEqual([
      rockfordSatId,
    ]);
    expect(entriesForRoster(result.store, "full", "burnham").map((row) => row.name)).toEqual([
      "Dave Vanderbilt",
      "Dan Kasprzycki -T",
    ]);
    expect(result.store.entries[rockfordSatId]?.name).toBe("Hank Kingpavong");
  });

  it("copy list stays plain emp# name lines after seed and Reset (layout-independent)", () => {
    let store = emptyDriverRosterStore();
    store = addHired(store, "burnham", "56", "Dave Vanderbilt");
    store = addHired(store, "burnham", "102", "Dan Kasprzycki -T");
    const seeded = seedEmptySatRostersFromFull(store, { yards: ["burnham"] });
    const satLines = formatRosterCopyList(entriesForRoster(seeded.store, "sat", "burnham"));
    const fullLines = formatRosterCopyList(entriesForRoster(seeded.store, "full", "burnham"));
    expect(satLines).toBe("56 Dave Vanderbilt\n102 Dan Kasprzycki -T");
    expect(satLines).toBe(fullLines);
    expect(satLines.includes("\t")).toBe(false);

    store = addRosterEntry(seeded.store, {
      kind: "sat",
      yard: "burnham",
      truckNumber: "231",
      name: "Kevin Bray",
    }).store;
    const reset = resetSatRosterFromFull(store, "burnham");
    expect(formatRosterCopyList(entriesForRoster(reset.store, "sat", "burnham"))).toBe(
      "56 Dave Vanderbilt\n102 Dan Kasprzycki -T",
    );
  });

  it("Driver Sat grid still feeds copy list from formatRosterCopyList, not the cell layout", () => {
    const src = readFileSync(new URL("../screens/DriverScreen.tsx", import.meta.url), "utf8");
    expect(src).toContain("formatRosterCopyList(entries)");
    expect(src).toContain('className="drv-copy-block"');
    expect(src).toContain("value={copyTextValue}");
    expect(src).toContain("drv-sat-grid");
    expect(src).toContain("Reset to full roster");
    expect(src).toContain("Delete selected");
    expect(src).toContain("--drv-sat-rows");
    expect(src).toContain("toggleSelected");
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    expect(css).toContain("grid-auto-flow: column");
  });

  it("Sat Roster columns are top-to-bottom then next column", () => {
    expect(satRosterColumnCount(1400)).toBe(3);
    expect(satRosterColumnCount(1199)).toBe(2);
    expect(satRosterColumnCount(800)).toBe(2);
    expect(satRosterColumnCount(639)).toBe(1);
    expect(satRosterRowCount(7, 3)).toBe(3);
    expect(satRosterRowCount(6, 3)).toBe(2);
    expect(satRosterRowCount(0, 3)).toBe(1);
  });
});

describe("driver roster cloud delete posture", () => {
  it("uses a dedicated persist key", () => {
    expect(DRIVER_ROSTER_STORE_KEY).toBe("chitrader.load-tracker.driver-roster.v1");
    expect(DEFAULT_DRIVER_ROSTER_YARD).toBe("burnham");
  });

  it("does not wipe or remotely delete on an empty pull", () => {
    const local = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "zion",
      truckNumber: "22041",
      name: "Marcelo Aldana",
    });
    const result = reconcileDriverRosterCloud({
      local: local.store,
      remote: emptyDriverRosterStore(),
      deletedEntryIds: [],
      seenRemoteEntryIds: [],
    });
    expect(Object.keys(result.next.entries)).toHaveLength(1);
    expect(result.toUploadEntries).toHaveLength(1);
    expect(result.toDeleteRemoteEntries).toEqual([]);
  });

  it("keeps local rows missing from a subset pull and does not remote-delete them", () => {
    const a = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "arc",
      truckNumber: "100",
      name: "Francisco Ramirez",
    });
    const b = addRosterEntry(a.store, {
      kind: "full",
      yard: "arc",
      truckNumber: "366",
      name: "Roberto Gonzalez",
    });
    const keepId = a.entry!.id;
    const missingId = b.entry!.id;
    const remote = {
      entries: { [keepId]: a.store.entries[keepId] },
    };
    const result = reconcileDriverRosterCloud({
      local: b.store,
      remote,
      deletedEntryIds: [],
      seenRemoteEntryIds: [keepId, missingId],
    });
    expect(result.next.entries[keepId]).toBeDefined();
    expect(result.next.entries[missingId]).toBeDefined();
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(result.toUploadEntries).toEqual([]);
  });

  it("never issues an unscoped driver_roster_entries delete", () => {
    const src = readFileSync(new URL("../store/DriverRosterContext.tsx", import.meta.url), "utf8");
    expect(src).toContain('.from("driver_roster_entries").delete().in("id", ids)');
    expect(src).not.toMatch(/\.from\(["']driver_roster_entries["']\)\s*\.delete\(\)\s*(?!.*\.in)/);
    expect(src).not.toContain("toDeleteRemoteEntries");
    expect(src).toContain("the only paths that may DELETE a cloud roster row");
    const sql = readFileSync(new URL("../../Load-Tracker-driver-roster.sql", import.meta.url), "utf8");
    expect(sql).toContain("driver_roster_deletes_allowed");
    expect(sql).not.toMatch(
      /crew_delete_driver_roster_entries[\s\S]*for delete[\s\S]*using \(true\)/,
    );
  });

  it("adopts a live remote row over a stale tombstone and never schedules a remote delete", () => {
    const added = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "burnham",
      truckNumber: "56",
      name: "Dave Vanderbilt",
    });
    const id = added.entry!.id;
    const result = reconcileDriverRosterCloud({
      local: emptyDriverRosterStore(),
      remote: added.store,
      deletedEntryIds: [id],
      seenRemoteEntryIds: [id],
    });
    expect(result.next.entries[id]).toEqual(added.store.entries[id]);
    expect(result.deletedEntryIds).toEqual([]);
    expect(result.toDeleteRemoteEntries).toEqual([]);
    expect(result.toUploadEntries).toEqual([]);
  });

  it("does not drop hired names when a later sheet import is thinner", () => {
    const first = mergeImportedRows(emptyDriverRosterStore(), [
      {
        kind: "full",
        yard: "burnham",
        truckNumber: "56",
        name: "Dave Vanderbilt",
        status: null,
        forDate: null,
      },
      {
        kind: "full",
        yard: "burnham",
        truckNumber: "102",
        name: "Dan Kasprzycki",
        status: null,
        forDate: null,
      },
    ]);
    expect(first.added).toBe(2);
    const thinner = mergeImportedRows(first.store, [
      {
        kind: "full",
        yard: "burnham",
        truckNumber: "56",
        name: "Dave Vanderbilt",
        status: "oot",
        forDate: null,
      },
    ]);
    expect(thinner.added).toBe(0);
    expect(thinner.skippedGroups).toEqual(["full:burnham"]);
    expect(rosterEntryCount(thinner.store, "full", "burnham")).toBe(2);
    expect(
      entriesForRoster(thinner.store, "full", "burnham").map((row) => row.name),
    ).toEqual(["Dave Vanderbilt", "Dan Kasprzycki"]);
  });
});

describe("assigned truck (not EMP #)", () => {
  it("cleans unit numbers and broker codes without touching emp #", () => {
    expect(cleanAssignedTruck(" 418 ")).toBe("418");
    expect(cleanAssignedTruck("vz")).toBe("VZ");
    expect(cleanAssignedTruck("")).toBeNull();
    expect(cleanTruckNumber("185")).toBe("185");
    expect(cleanTruckNumber("VZ")).toBeNull();
  });

  it("looks up Full Roster drivers by assigned truck, not emp #", () => {
    let store = emptyDriverRosterStore();
    store = addRosterEntry(store, {
      kind: "full",
      yard: "rockford",
      truckNumber: "185",
      assignedTruck: "418",
      name: "Christopher Oleson",
    }).store;
    store = addRosterEntry(store, {
      kind: "full",
      yard: "burnham",
      truckNumber: "418",
      assignedTruck: null,
      name: "Emp Looks Like Truck",
    }).store;
    store = addRosterEntry(store, {
      kind: "sat",
      yard: "rockford",
      truckNumber: "185",
      assignedTruck: "418",
      name: "Christopher Oleson",
    }).store;
    const hits = fullRosterDriversForTruck(store, "418");
    expect(hits.map((row) => row.name)).toEqual(["Christopher Oleson"]);
    expect(hits[0].truckNumber).toBe("185");
    expect(fullRosterDriversForTruck(store, "185")).toEqual([]);
    const search = readFileSync(new URL("../screens/SearchScreen.tsx", import.meta.url), "utf8");
    expect(search).toContain("loggedDriverNamesForTruck");
    expect(search).not.toContain("fullRosterDriversForTruck");
  });

  it("SQL keeps emp # on truck_number and adds assigned_truck", () => {
    const sql = readFileSync(new URL("../../Load-Tracker-driver-roster.sql", import.meta.url), "utf8");
    expect(sql).toContain("assigned_truck");
    expect(sql).toContain("Not the unit / truck");
    expect(sql).toContain("truck_number");
  });

  it("persists assigned truck on update without rewriting emp #", () => {
    const added = addRosterEntry(emptyDriverRosterStore(), {
      kind: "full",
      yard: "rockford",
      truckNumber: "185",
      name: "Christopher Oleson",
    });
    const next = updateRosterEntry(added.store, added.entry!.id, { assignedTruck: "55" });
    expect(next.entries[added.entry!.id].truckNumber).toBe("185");
    expect(next.entries[added.entry!.id].assignedTruck).toBe("55");
  });
});
