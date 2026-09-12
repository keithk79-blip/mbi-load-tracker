import { describe, expect, it } from "vitest";
import { VACATION_SEED_2026 } from "../data/vacationSeed";
import { addDays } from "./chicagoDate";
import {
  addVacationEntry,
  applySeedWeeks,
  applyVacationTombstones,
  buildEmptyYearWeeks,
  cleanVacationStore,
  cycleVacationEntryStatus,
  defaultCapacityForWeek,
  emptyVacationStore,
  entriesForWeek,
  formatWeekRange,
  holidayLabelForWeek,
  inferSeedStatus,
  laborDayISO,
  memorialDayISO,
  mergeVacationStores,
  nextVacationStatus,
  normalizeWeekOf,
  parseDriverCell,
  parseVacationWeekKey,
  parseWeekCapacityLabel,
  reconcileVacationCloud,
  removeVacationEntry,
  rosterNamesFromStore,
  statusTone,
  sundayOnOrBefore,
  vacationStatusLabel,
  sundaysForVacationYear,
  thanksgivingISO,
  updateVacationEntry,
  upsertWeek,
  vacationSeedId,
  vacationWeekKey,
  vacationYardLabel,
  weekBelongsToYear,
  weekFillLabel,
  weekIsOverCapacity,
  weeksForYear,
  yearHasWeeks,
  type VacationStore,
} from "./vacationBoard";

const AT = "2026-09-12T12:00:00.000Z";
const LATER = "2026-09-12T13:00:00.000Z";

function seeded2026(): VacationStore {
  return applySeedWeeks(emptyVacationStore(), 2026, VACATION_SEED_2026, AT);
}

function week(store: VacationStore, weekOf: string, yard: "rockford" | "chicago" = "rockford") {
  return store.weeks[vacationWeekKey(yard, weekOf)];
}

describe("week helpers", () => {
  it("normalizes sheet dates to the Sunday of that week", () => {
    expect(normalizeWeekOf("1/4/26")).toBe("2026-01-04");
    expect(normalizeWeekOf("12/29/25")).toBe("2025-12-28");
    expect(normalizeWeekOf("2026-01-07")).toBe("2026-01-04");
    expect(sundayOnOrBefore("2026-09-12")).toBe("2026-09-06");
  });

  it("lists Sundays from the week of Jan 1 through the week of Dec 31", () => {
    const weeks = sundaysForVacationYear(2026);
    expect(weeks[0]).toBe("2025-12-28");
    expect(weeks.at(-1)).toBe("2026-12-27");
    expect(weeks).toHaveLength(53);
    expect(weekBelongsToYear("2026-01-04", 2026)).toBe(true);
    expect(weekBelongsToYear("2025-12-21", 2026)).toBe(false);
  });

  it("computes 2026 US holidays on the expected Sundays", () => {
    expect(memorialDayISO(2026)).toBe("2026-05-25");
    expect(laborDayISO(2026)).toBe("2026-09-07");
    expect(thanksgivingISO(2026)).toBe("2026-11-26");
    expect(holidayLabelForWeek("2025-12-28", 2026)).toBe("New Years");
    expect(holidayLabelForWeek("2026-05-24", 2026)).toBe("Memorial Day");
    expect(holidayLabelForWeek("2026-06-28", 2026)).toBe("4th of July");
    expect(holidayLabelForWeek("2026-09-06", 2026)).toBe("Labor Day");
    expect(holidayLabelForWeek("2026-11-22", 2026)).toBe("Thanksgiving");
    expect(holidayLabelForWeek("2026-12-20", 2026)).toBe("Christmas");
    expect(holidayLabelForWeek("2026-12-27", 2026)).toBe("New Years");
    expect(holidayLabelForWeek("2026-01-04", 2026)).toBeNull();
  });

  it("uses sheet-like default capacities (8 then 4)", () => {
    expect(defaultCapacityForWeek("2026-01-04")).toBe(8);
    expect(defaultCapacityForWeek("2026-03-01")).toBe(8);
    expect(defaultCapacityForWeek("2026-03-08")).toBe(4);
    expect(defaultCapacityForWeek("2026-07-12")).toBe(4);
  });

  it("formats a week range", () => {
    expect(formatWeekRange("2026-03-08")).toBe("Mar 8–14");
    expect(formatWeekRange("2025-12-28")).toBe("Dec 28 – Jan 3");
  });
});

describe("status + cell parsers", () => {
  it("maps Pay/Payout wording to paid and everything else to approved", () => {
    expect(inferSeedStatus("Greg Cellarius")).toBe("approved");
    expect(inferSeedStatus("Greg Cellarius", "Pay")).toBe("paid");
    expect(inferSeedStatus("Ada Payout")).toBe("paid");
    expect(inferSeedStatus("Ada", "payout 2/11")).toBe("paid");
  });

  it("splits a trailing date-range note off the driver name", () => {
    expect(parseDriverCell("Terry Muzzarelli 2/11-2/24")).toEqual({
      name: "Terry Muzzarelli",
      note: "2/11–2/24",
      status: "approved",
    });
    expect(parseDriverCell("Mike Davy 2/11-2/17")).toEqual({
      name: "Mike Davy",
      note: "2/11–2/17",
      status: "approved",
    });
    expect(parseDriverCell("Francisco Ramirez")).toEqual({
      name: "Francisco Ramirez",
      note: "",
      status: "approved",
    });
    expect(parseDriverCell("Ada Payout")).toEqual({
      name: "Ada",
      note: "",
      status: "paid",
    });
  });

  it("parses column B as capacity or a holiday/blocked label", () => {
    expect(parseWeekCapacityLabel("8")).toEqual({
      kind: "open",
      capacity: 8,
      label: "",
    });
    expect(parseWeekCapacityLabel("Memorial Day")).toEqual({
      kind: "holiday",
      capacity: null,
      label: "Memorial Day",
    });
    expect(parseWeekCapacityLabel("Blocked")).toEqual({
      kind: "blocked",
      capacity: null,
      label: "Blocked",
    });
    expect(parseWeekCapacityLabel("do not approve")).toEqual({
      kind: "holiday",
      capacity: null,
      label: "do not approve",
    });
  });

  it("cycles pending (blue) → paid (green) via approved", () => {
    expect(nextVacationStatus("approved")).toBe("pending");
    expect(nextVacationStatus("pending")).toBe("paid");
    expect(nextVacationStatus("paid")).toBe("approved");
    expect(statusTone("pending")).toBe("blue");
    expect(statusTone("paid")).toBe("green");
    expect(statusTone("approved")).toBe("neutral");
  });

  it("maps status keys to display labels without renaming stored values", () => {
    expect(vacationStatusLabel("pending")).toBe("Approved");
    expect(vacationStatusLabel("approved")).toBe("Requested");
    expect(vacationStatusLabel("paid")).toBe("Paid");
  });
});

describe("seed + mutations", () => {
  it("seeds every 2026 week and the named January/February rows", () => {
    const store = seeded2026();
    expect(yearHasWeeks(store, 2026)).toBe(true);
    expect(weeksForYear(store, 2026)).toHaveLength(53);
    expect(week(store, "2026-01-04")?.capacity).toBe(8);
    expect(week(store, "2026-03-08")?.capacity).toBe(4);
    expect(week(store, "2025-12-28")?.kind).toBe("holiday");
    expect(week(store, "2025-12-28")?.label).toBe("New Years");
    expect(week(store, "2026-05-24")?.label).toBe("Memorial Day");
    expect(week(store, "2026-01-04")?.yard).toBe("rockford");
    expect(entriesForWeek(store, "2026-01-04").map((e) => e.name)).toEqual([
      "Greg Cellarius",
    ]);
    expect(entriesForWeek(store, "2026-01-11").map((e) => e.name)).toEqual([
      "Devell Nutall",
      "Josh Maciejewski",
      "Ryan Lollis",
    ]);
    const terry = entriesForWeek(store, "2026-02-08").find((e) =>
      e.name.startsWith("Terry"),
    );
    expect(terry?.note).toBe("2/11–2/24");
    expect(terry?.status).toBe("approved");
    expect(vacationSeedId("a")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(vacationSeedId("a")).toBe(vacationSeedId("a"));
  });

  it("does not overwrite an existing week or entry on re-seed", () => {
    let store = seeded2026();
    store = updateVacationEntry(
      store,
      entriesForWeek(store, "2026-01-04")[0].id,
      { status: "paid" },
      LATER,
    );
    const again = applySeedWeeks(store, 2026, VACATION_SEED_2026, AT);
    expect(entriesForWeek(again, "2026-01-04")[0].status).toBe("paid");
    expect(week(again, "2026-01-04")?.updatedAt).toBe(AT);
  });

  it("adds, updates, cycles, and removes driver entries", () => {
    let store = emptyVacationStore();
    store = upsertWeek(store, { weekOf: "2026-04-05", year: 2026, capacity: 4 }, AT);
    const added = addVacationEntry(store, "2026-04-05", "Ada Cole", {
      status: "pending",
      note: "Pay",
      at: AT,
      id: "ent-1",
    });
    expect(added.entry?.name).toBe("Ada Cole");
    store = added.store;
    store = updateVacationEntry(store, "ent-1", { note: "2/11–2/17" }, LATER);
    expect(store.entries["ent-1"]?.note).toBe("2/11–2/17");
    store = cycleVacationEntryStatus(store, "ent-1", LATER);
    expect(store.entries["ent-1"]?.status).toBe("paid");
    const removed = removeVacationEntry(store, "ent-1");
    expect(removed.removed?.id).toBe("ent-1");
    expect(removed.store.entries["ent-1"]).toBeUndefined();
  });

  it("builds an empty future year with holidays and default capacities", () => {
    const weeks = buildEmptyYearWeeks(2027, AT);
    expect(weeks[0]?.weekOf).toBe("2026-12-27");
    expect(weeks[0]?.kind).toBe("holiday");
    const labor = weeks.find((w) => w.weekOf === "2027-09-05");
    expect(labor?.label).toBe("Labor Day");
    const open = weeks.find((w) => w.weekOf === "2027-01-03");
    expect(open?.kind).toBe("open");
    expect(open?.capacity).toBe(8);
  });

  it("labels capacity chips and over-fill", () => {
    const openWeek = {
      yard: "rockford" as const,
      weekOf: "2026-03-08",
      year: 2026,
      capacity: 4,
      label: "",
      kind: "open" as const,
      createdAt: AT,
      updatedAt: AT,
    };
    expect(weekFillLabel(openWeek, 2)).toBe("2 of 4 filled");
    expect(weekIsOverCapacity(openWeek, 6)).toBe(true);
    expect(
      weekFillLabel({ ...openWeek, kind: "holiday", capacity: null, label: "Labor Day" }, 0),
    ).toBe("Labor Day");
  });

  it("collects unique roster names for typeahead", () => {
    const store = seeded2026();
    const names = rosterNamesFromStore(store, ["Zed Extra"]);
    expect(names).toContain("Greg Cellarius");
    expect(names).toContain("Zed Extra");
    expect(names[0] < names[1]).toBe(true);
  });
});

describe("cloud merge", () => {
  it("last-writer-wins on the same week and entry", () => {
    const local = seeded2026();
    const remote = updateVacationEntry(
      seeded2026(),
      entriesForWeek(local, "2026-01-04")[0].id,
      { status: "pending" },
      LATER,
    );
    const merged = mergeVacationStores(local, remote);
    expect(entriesForWeek(merged, "2026-01-04")[0].status).toBe("pending");
  });

  it("tombstones strip local and remote copies", () => {
    const store = seeded2026();
    const greg = entriesForWeek(store, "2026-01-04")[0];
    const stripped = applyVacationTombstones(store, [], [greg.id]);
    expect(stripped.entries[greg.id]).toBeUndefined();
    const merged = mergeVacationStores(store, store, [], [greg.id]);
    expect(merged.entries[greg.id]).toBeUndefined();
  });

  it("does not wipe local when remote is empty and never synced", () => {
    const local = seeded2026();
    const result = reconcileVacationCloud({
      local,
      remote: emptyVacationStore(),
      deletedWeekOfs: [],
      deletedEntryIds: [],
    });
    expect(weeksForYear(result.next, 2026).length).toBe(53);
    expect(result.toUploadWeeks.length).toBeGreaterThan(40);
    expect(result.toDeleteRemoteWeeks).toEqual([]);
  });

  it("does not re-upload a previously seen entry that remote deleted", () => {
    const local = seeded2026();
    const greg = entriesForWeek(local, "2026-01-04")[0];
    const remoteWeeks = { ...local.weeks };
    const remoteEntries = { ...local.entries };
    delete remoteEntries[greg.id];
    const result = reconcileVacationCloud({
      local,
      remote: { weeks: remoteWeeks, entries: remoteEntries },
      deletedWeekOfs: [],
      deletedEntryIds: [],
      seenRemoteWeekOfs: Object.keys(local.weeks),
      seenRemoteEntryIds: Object.keys(local.entries),
    });
    expect(result.next.entries[greg.id]).toBeUndefined();
    expect(result.toUploadEntries.some((e) => e.id === greg.id)).toBe(false);
    expect(result.deletedEntryIds).toContain(greg.id);
  });

  it("uploads a never-seen local add and pushes a newer local edit", () => {
    const remote = seeded2026();
    let local = addVacationEntry(remote, "2026-04-05", "New Driver", {
      id: "new-1",
      at: LATER,
      status: "pending",
    }).store;
    const greg = entriesForWeek(remote, "2026-01-04")[0];
    local = updateVacationEntry(local, greg.id, { status: "paid" }, LATER);
    const result = reconcileVacationCloud({
      local,
      remote,
      deletedWeekOfs: [],
      deletedEntryIds: [],
      seenRemoteWeekOfs: Object.keys(remote.weeks),
      seenRemoteEntryIds: Object.keys(remote.entries),
    });
    expect(result.toUploadEntries.some((e) => e.id === "new-1")).toBe(true);
    expect(result.toUploadEntries.some((e) => e.id === greg.id && e.status === "paid")).toBe(
      true,
    );
    expect(result.next.entries["new-1"]?.name).toBe("New Driver");
  });

  it("deletes a tombstoned row still present on remote", () => {
    const remote = seeded2026();
    const greg = entriesForWeek(remote, "2026-01-04")[0];
    const local = removeVacationEntry(remote, greg.id).store;
    const result = reconcileVacationCloud({
      local,
      remote,
      deletedWeekOfs: [],
      deletedEntryIds: [greg.id],
      seenRemoteWeekOfs: Object.keys(remote.weeks),
      seenRemoteEntryIds: Object.keys(remote.entries),
    });
    expect(result.toDeleteRemoteEntries).toContain(greg.id);
    expect(result.next.entries[greg.id]).toBeUndefined();
  });
});

describe("empty year create", () => {
  it("2027 seed weeks do not require 2027 named data", () => {
    const twentySix = applySeedWeeks(emptyVacationStore(), 2026, VACATION_SEED_2026, AT);
    expect(yearHasWeeks(twentySix, 2027)).toBe(false);
    const store = applySeedWeeks(twentySix, 2027, [], AT);
    expect(yearHasWeeks(store, 2027)).toBe(true);
    expect(weeksForYear(store, 2027).every((w) => entriesForWeek(store, w.weekOf).length === 0)).toBe(
      true,
    );
    expect(addDays(weeksForYear(store, 2027)[0].weekOf, 0)).toBe("2026-12-27");
  });
});

describe("yard isolation", () => {
  it("keys weeks per yard and labels the sheet tabs", () => {
    expect(vacationWeekKey("rockford", "2026-01-04")).toBe("rockford:2026-01-04");
    expect(parseVacationWeekKey("2026-01-04")).toEqual({
      yard: "rockford",
      weekOf: "2026-01-04",
    });
    expect(parseVacationWeekKey("chicago:1/11/26")).toEqual({
      yard: "chicago",
      weekOf: "2026-01-11",
    });
    expect(vacationYardLabel("rockford", 2026)).toBe("Rockford 2026");
    expect(vacationYardLabel("chicago", 2026)).toBe("Chicago 2026");
  });

  it("defaults missing yard on v1 rows to rockford without blending Chicago", () => {
    const cleaned = cleanVacationStore({
      weeks: {
        "2026-01-04": {
          weekOf: "2026-01-04",
          year: 2026,
          capacity: 8,
          label: "",
          kind: "open",
          createdAt: AT,
          updatedAt: AT,
        },
      },
      entries: {
        "ent-rf": {
          id: "ent-rf",
          weekOf: "2026-01-04",
          name: "Greg Cellarius",
          note: "",
          status: "approved",
          createdAt: AT,
          updatedAt: AT,
        },
      },
    });
    expect(week(cleaned, "2026-01-04")?.yard).toBe("rockford");
    expect(cleaned.entries["ent-rf"]?.yard).toBe("rockford");
    expect(entriesForWeek(cleaned, "2026-01-04", "chicago")).toEqual([]);
  });

  it("keeps Rockford names off the Chicago 2026 empty grid", () => {
    const rockford = seeded2026();
    const both = applySeedWeeks(rockford, 2026, [], AT, "chicago");
    expect(yearHasWeeks(both, 2026, "chicago")).toBe(true);
    expect(weeksForYear(both, 2026, "chicago")).toHaveLength(53);
    expect(entriesForWeek(both, "2026-01-04", "chicago")).toEqual([]);
    expect(entriesForWeek(both, "2026-01-04", "rockford").map((e) => e.name)).toEqual([
      "Greg Cellarius",
    ]);
    expect(week(both, "2026-01-04", "chicago")?.capacity).toBe(8);
    expect(rosterNamesFromStore(both, [], "chicago")).toEqual([]);
  });

  it("does not merge the same Sunday across yards", () => {
    let store = seeded2026();
    store = applySeedWeeks(store, 2026, [], AT, "chicago");
    store = addVacationEntry(store, "2026-01-04", "Chicago Only", {
      id: "chi-1",
      at: AT,
      yard: "chicago",
    }).store;
    const merged = mergeVacationStores(store, emptyVacationStore());
    expect(entriesForWeek(merged, "2026-01-04", "rockford").some((e) => e.name === "Chicago Only")).toBe(
      false,
    );
    expect(entriesForWeek(merged, "2026-01-04", "chicago").map((e) => e.name)).toEqual([
      "Chicago Only",
    ]);
  });

  it("tombstones a Rockford week without dropping Chicago", () => {
    let store = seeded2026();
    store = applySeedWeeks(store, 2026, [], AT, "chicago");
    const stripped = applyVacationTombstones(store, ["rockford:2026-01-04"], []);
    expect(week(stripped, "2026-01-04", "rockford")).toBeUndefined();
    expect(week(stripped, "2026-01-04", "chicago")).toBeDefined();
    expect(entriesForWeek(stripped, "2026-01-04", "rockford")).toEqual([]);
  });
});
