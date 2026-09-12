import { afterEach, describe, expect, it, vi } from "vitest";
import type { Load } from "../types";
import {
  applyDailyEodToCards,
  applyDailyEodToSummary,
  cleanDailyEodStore,
  dailyEodToRow,
  describeDailyEodCloudError,
  displayLoadCount,
  normalizeDailyEod,
  reconcileDailyEodCloud,
  rowToDailyEod,
  sheetTotalsLabel,
  stampDailyEod,
  storeFromRows,
  totalsOn,
  upsertDailyEod,
  type DailyEodRow,
  type DailyEodTotals,
} from "./dailyEod";
import { emptyBoard } from "./stationCalls";
import { daySummaryCards, endOfDaySummary } from "./totals";

function snap(partial: Partial<DailyEodTotals> = {}): DailyEodTotals {
  return {
    date: "2026-01-05",
    trash: 142,
    leachate: 18,
    walkingFloor: 24,
    loads: 184,
    subs: 12,
    source: "sheet-import",
    createdAt: "2026-01-05T18:00:00.000Z",
    updatedAt: "2026-01-05T18:00:00.000Z",
    ...partial,
  };
}

function load(partial: Partial<Load> = {}): Load {
  return {
    id: "live-1",
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date: "2026-01-05",
    createdAt: "2026-01-05T12:00:00.000Z",
    updatedAt: "2026-01-05T12:00:00.000Z",
    ...partial,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeDailyEod", () => {
  it("keeps a valid Chicago-date snapshot", () => {
    expect(normalizeDailyEod(snap())).toEqual(snap());
  });

  it("floors counts and defaults an unknown source to sheet-import", () => {
    expect(
      normalizeDailyEod({
        ...snap(),
        trash: 12.9,
        source: "dispatch-board" as DailyEodTotals["source"],
      }),
    ).toEqual(snap({ trash: 12 }));
  });

  it("rejects a bad date or negative count instead of inventing a row", () => {
    expect(normalizeDailyEod(snap({ date: "01/05/2026" }))).toBeNull();
    expect(normalizeDailyEod(snap({ leachate: -1 }))).toBeNull();
  });
});

describe("row mapping", () => {
  const row: DailyEodRow = {
    date: "2026-01-05",
    trash: 142,
    leachate: 18,
    walking_floor: 24,
    loads: 184,
    subs: 12,
    source: "sheet-import",
    created_at: "2026-01-05T18:00:00.000Z",
    updated_at: "2026-01-05T18:00:00.000Z",
  };

  it("round-trips snake_case cloud columns without extra load fields", () => {
    const parsed = rowToDailyEod(row);
    expect(parsed).toEqual(snap());
    expect(dailyEodToRow(parsed!, "user-1")).toEqual({
      ...row,
      updated_by: "user-1",
    });
    expect(parsed).not.toHaveProperty("truck");
    expect(parsed).not.toHaveProperty("pickup");
  });

  it("strips a date timestamp from PostgREST down to the Chicago calendar day", () => {
    expect(rowToDailyEod({ ...row, date: "2026-01-05T00:00:00+00:00" })).toEqual(
      snap(),
    );
  });

  it("still reads a first-cut total_loads row and defaults missing subs to 0", () => {
    const legacy = { ...row };
    delete legacy.loads;
    delete legacy.subs;
    legacy.total_loads = 184;
    expect(rowToDailyEod(legacy)).toEqual(snap({ loads: 184, subs: 0 }));
  });
});

describe("store helpers", () => {
  it("upserts by date and looks up a day", () => {
    const next = upsertDailyEod({}, snap());
    expect(totalsOn(next, "2026-01-05")).toEqual(snap());
    expect(totalsOn(next, "2026-01-06")).toBeNull();
  });

  it("drops junk keys from a persisted store", () => {
    expect(
      cleanDailyEodStore({
        bad: { date: "nope", trash: 1 },
        "2026-01-05": snap(),
      }),
    ).toEqual({ "2026-01-05": snap() });
  });

  it("stamps a sheet-import row without touching previous createdAt", () => {
    const prev = snap({ createdAt: "2026-01-05T12:00:00.000Z" });
    const stamped = stampDailyEod(
      { date: "2026-01-05", trash: 10, leachate: 2, walkingFloor: 3, loads: 15, subs: 1 },
      prev,
      "2026-01-06T12:00:00.000Z",
    );
    expect(stamped).toEqual(
      snap({
        trash: 10,
        leachate: 2,
        walkingFloor: 3,
        loads: 15,
        subs: 1,
        createdAt: "2026-01-05T12:00:00.000Z",
        updatedAt: "2026-01-06T12:00:00.000Z",
      }),
    );
  });
});

describe("reconcileDailyEodCloud", () => {
  it("uploads local-only dates and keeps remote-only dates", () => {
    const localOnly = snap({ date: "2026-01-02", trash: 9, loads: 9, subs: 0 });
    const remoteOnly = snap({ date: "2026-01-03", trash: 4, loads: 4, subs: 0 });
    const result = reconcileDailyEodCloud({
      local: { "2026-01-02": localOnly },
      remote: { "2026-01-03": remoteOnly },
    });
    expect(result.next).toEqual({
      "2026-01-02": localOnly,
      "2026-01-03": remoteOnly,
    });
    expect(result.toUpload).toEqual([localOnly]);
    expect(result.seenRemoteDates).toEqual(["2026-01-03"]);
  });

  it("prefers the newer updatedAt and only pushes when local wins", () => {
    const older = snap({ trash: 1, updatedAt: "2026-01-05T10:00:00.000Z" });
    const newer = snap({ trash: 99, updatedAt: "2026-01-05T20:00:00.000Z" });
    const localWins = reconcileDailyEodCloud({
      local: { "2026-01-05": newer },
      remote: { "2026-01-05": older },
    });
    expect(localWins.next["2026-01-05"]?.trash).toBe(99);
    expect(localWins.toUpload).toEqual([newer]);

    const remoteWins = reconcileDailyEodCloud({
      local: { "2026-01-05": older },
      remote: { "2026-01-05": newer },
    });
    expect(remoteWins.next["2026-01-05"]?.trash).toBe(99);
    expect(remoteWins.toUpload).toEqual([]);
  });

  it("does not resurrect a date that disappeared from a previously seen remote", () => {
    const stale = snap({ date: "2026-02-01" });
    const result = reconcileDailyEodCloud({
      local: { "2026-02-01": stale },
      remote: {},
      seenRemoteDates: ["2026-02-01"],
    });
    expect(result.next).toEqual({});
    expect(result.toUpload).toEqual([]);
  });

  it("never asks the loads table to delete or upsert anything", () => {
    const result = reconcileDailyEodCloud({
      local: { "2026-01-05": snap() },
      remote: { "2026-01-06": snap({ date: "2026-01-06" }) },
    });
    expect(result).not.toHaveProperty("toDelete");
    expect(JSON.stringify(result)).not.toMatch(/"truck"/);
    expect(result.toUpload.every((row) => row.date !== undefined)).toBe(true);
  });
});

describe("EOD / Today override", () => {
  it("prefers all five snapshot bubbles and leaves station pickups live-derived", () => {
    const loads = [
      load({ id: "1", truck: "418" }),
      load({ id: "2", truck: "VZ", commodity: "Leachate (tanker)" }),
    ];
    const live = endOfDaySummary(loads, emptyBoard());
    expect(live.trash).toBe(1);
    expect(live.leachate).toBe(1);
    expect(live.loads).toBe(2);
    expect(live.subs).toBe(1);

    const overridden = applyDailyEodToSummary(live, snap());
    expect(overridden.trash).toBe(142);
    expect(overridden.leachate).toBe(18);
    expect(overridden.walkingFloor).toBe(24);
    expect(overridden.loads).toBe(184);
    expect(overridden.subs).toBe(12);
    expect(overridden.stations).toBe(live.stations);
    expect(overridden.stations.find((row) => row.id === "melrose")?.pickedUp).toBe(2);
  });

  it("overrides Today TRASH / LEACHATE / WF / LOADS / SUBS from the snapshot", () => {
    const cards = applyDailyEodToCards(daySummaryCards([load()]), snap());
    expect(cards.map((card) => [card.key, card.count])).toEqual([
      ["trash", 142],
      ["leachate", 18],
      ["loads", 184],
      ["subs", 12],
      ["walking-floor", 24],
    ]);
  });

  it("uses the 9/8 sheet footer even when partial truck rows exist", () => {
    const snapshot = snap({
      date: "2026-09-08",
      trash: 334,
      leachate: 39,
      walkingFloor: 31,
      loads: 404,
      subs: 15,
    });
    expect(snapshot.trash + snapshot.leachate + snapshot.walkingFloor).toBe(404);
    const live = endOfDaySummary(
      [
        load({ id: "1", date: "2026-09-08", truck: "418" }),
        load({
          id: "2",
          date: "2026-09-08",
          truck: "VZ",
          commodity: "Leachate (tanker)",
        }),
      ],
      emptyBoard(),
    );
    expect(live.loads).toBe(2);
    expect(live.subs).toBe(1);
    const overridden = applyDailyEodToSummary(live, snapshot);
    expect(overridden).toMatchObject({
      trash: 334,
      leachate: 39,
      walkingFloor: 31,
      loads: 404,
      subs: 15,
    });
    expect(overridden.stations.find((row) => row.id === "melrose")?.pickedUp).toBe(2);
  });

  it("keeps live-derived cards when no snapshot exists", () => {
    const live = daySummaryCards([load(), load({ id: "2", commodity: "Leachate (tanker)" })]);
    expect(applyDailyEodToCards(live, null)).toBe(live);
    expect(displayLoadCount(7, null)).toBe(7);
    expect(displayLoadCount(7, snap())).toBe(184);
    expect(sheetTotalsLabel(null)).toBeNull();
    expect(sheetTotalsLabel(snap())).toBe("Sheet totals");
    expect(sheetTotalsLabel(snap({ source: "manual" }))).toBe("Saved totals");
  });

  it("does not invent truck load rows from a snapshot", () => {
    const live = endOfDaySummary([], emptyBoard());
    const overridden = applyDailyEodToSummary(live, snap());
    expect(overridden.loads).toBe(184);
    expect(overridden.stations.every((row) => row.pickedUp === 0)).toBe(true);
    expect(storeFromRows([])).toEqual({});
  });
});

describe("describeDailyEodCloudError", () => {
  it("points at the paste-ready SQL when PostgREST has no table", () => {
    expect(
      describeDailyEodCloudError({
        code: "PGRST205",
        message: "Could not find the table 'public.daily_eod_totals' in the schema cache",
      }),
    ).toBe(
      "EOD totals did not reach the cloud — run Load-Tracker-daily-eod-totals.sql in Supabase once.",
    );
  });
});
