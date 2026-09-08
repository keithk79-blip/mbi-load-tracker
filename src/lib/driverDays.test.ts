import { describe, expect, it } from "vitest";
import { isChicagoSaturday, isChicagoSunday } from "./chicagoDate";
import type { CallOffRow } from "./driverAvailability";
import {
  applyLiveSheet,
  isDriverTallyDay,
  lockEndedDays,
  lookupDay,
  mergeDayStores,
  ytdWorkingAverage,
  type DayStore,
} from "./driverDays";

const offs: CallOffRow[] = [
  { name: "A", start: "2026-09-04", end: null, reason: "P-Day" },
  { name: "B", start: "2026-09-05", end: null, reason: "ok'd off" },
];

const live = {
  base: 143,
  saturdayBase: 33,
  offs,
};

describe("tally days", () => {
  it("counts Saturdays and skips Sundays", () => {
    expect(isChicagoSaturday("2026-09-05")).toBe(true);
    expect(isChicagoSunday("2026-09-06")).toBe(true);
    expect(isDriverTallyDay("2026-09-05")).toBe(true);
    expect(isDriverTallyDay("2026-09-06")).toBe(false);
    expect(isDriverTallyDay("2026-09-04")).toBe(true);
  });
});

describe("applyLiveSheet lock", () => {
  it("uses the Saturday yard sum, not L13 minus offs", () => {
    const first = applyLiveSheet({}, live, "2026-09-05", "t1");
    expect(first["2026-09-05"]).toMatchObject({
      available: 33,
      base: 33,
      offs: 0,
      locked: false,
      source: "saturday",
    });
    expect(first["2026-09-05"]?.ootNames).toEqual([]);
    expect(first["2026-09-06"]).toBeUndefined();
  });

  it("locks Friday's snapshot at midnight and does not invent Saturday from Monday's sheet", () => {
    const first = applyLiveSheet({}, live, "2026-09-04", "t1");
    expect(first["2026-09-04"]).toMatchObject({
      available: 142,
      base: 143,
      offs: 1,
      locked: false,
    });

    const later = applyLiveSheet(first, { base: 200, saturdayBase: 10, offs: [] }, "2026-09-07", "t2");
    expect(later["2026-09-04"]).toMatchObject({
      available: 142,
      base: 143,
      locked: true,
    });
    expect(later["2026-09-05"]).toBeUndefined();
    expect(later["2026-09-06"]).toBeUndefined();
    expect(later["2026-09-07"]).toMatchObject({
      available: 200,
      base: 200,
      locked: false,
    });
  });

  it("does not backfill missing past days from the live sheet", () => {
    const next = applyLiveSheet({}, { base: 200, saturdayBase: 10, offs: [] }, "2026-09-07", "t1");
    expect(next["2026-09-04"]).toBeUndefined();
    expect(next["2026-09-05"]).toBeUndefined();
    expect(next["2026-09-07"]?.available).toBe(200);
  });

  it("keeps Friday's locked 140 when Saturday's live sheet is a different number", () => {
    const friday: DayStore = {
      "2026-09-04": {
        date: "2026-09-04",
        base: 143,
        offs: 3,
        available: 140,
        locked: false,
        lockedAt: "fri",
        source: "weekday",
      },
    };
    const sat = applyLiveSheet(
      friday,
      { base: 99, saturdayBase: 33, offs: [] },
      "2026-09-05",
      "sat",
    );
    expect(sat["2026-09-04"]).toMatchObject({
      available: 140,
      locked: true,
    });
    expect(sat["2026-09-05"]).toMatchObject({
      available: 33,
      locked: false,
      source: "saturday",
    });
  });

  it("does not rewrite a locked day when L13 changes", () => {
    const store: DayStore = {
      "2026-09-03": {
        date: "2026-09-03",
        base: 143,
        offs: 4,
        available: 139,
        locked: true,
        lockedAt: "t0",
      },
    };
    const next = applyLiveSheet(store, { base: 99, saturdayBase: 1, offs: [] }, "2026-09-04", "t1");
    expect(next["2026-09-03"]).toEqual(store["2026-09-03"]);
  });

  it("subtracts manual weekday offs on top of the sheet list", () => {
    const next = applyLiveSheet(
      {},
      {
        base: 143,
        saturdayBase: 33,
        offs: [{ name: "A", start: "2026-09-08", end: null, reason: "Call Off" }],
        manualOffs: [
          { name: "B", kind: "p-day" },
          { name: "a", kind: "ncns" },
        ],
      },
      "2026-09-08",
      "t1",
    );
    expect(next["2026-09-08"]).toMatchObject({
      base: 143,
      offs: 2,
      available: 141,
      locked: false,
      source: "weekday",
    });
  });

  it("does not subtract manuals from the Saturday yard sum", () => {
    const next = applyLiveSheet(
      {},
      {
        base: 143,
        saturdayBase: 33,
        offs,
        manualOffs: [{ name: "Extra", kind: "ncns" }],
      },
      "2026-09-05",
      "t1",
    );
    expect(next["2026-09-05"]).toMatchObject({
      available: 33,
      offs: 0,
      source: "saturday",
    });
  });
});


describe("lockEndedDays", () => {
  it("freezes yesterday without touching today's unlocked snapshot", () => {
    const store: DayStore = {
      "2026-09-04": {
        date: "2026-09-04",
        base: 143,
        offs: 3,
        available: 140,
        locked: false,
        lockedAt: "fri",
      },
      "2026-09-05": {
        date: "2026-09-05",
        base: 33,
        offs: 0,
        available: 33,
        locked: false,
        lockedAt: "sat",
        source: "saturday",
      },
    };
    const next = lockEndedDays(store, "2026-09-05", "midnight");
    expect(next["2026-09-04"]).toMatchObject({ available: 140, locked: true });
    expect(next["2026-09-05"]).toMatchObject({ available: 33, locked: false });
  });
});

describe("lookup + YTD average", () => {
  it("includes Saturday snapshots and skips Sunday", () => {
    const store: DayStore = {
      "2026-09-04": {
        date: "2026-09-04",
        base: 100,
        offs: 0,
        available: 80,
        locked: true,
        lockedAt: "t",
      },
      "2026-09-05": {
        date: "2026-09-05",
        base: 33,
        offs: 0,
        available: 33,
        locked: true,
        lockedAt: "t",
      },
    };
    expect(lookupDay(store, "2026-09-05")?.available).toBe(33);
    expect(lookupDay(store, "2026-09-06")).toBeNull();
    expect(ytdWorkingAverage(store, "2026-09-05")).toBe((80 + 33) / 2);
  });
});

describe("mergeDayStores", () => {
  it("keeps the locked snapshot when the other side is live", () => {
    const locked: DayStore = {
      "2026-09-04": {
        date: "2026-09-04",
        base: 143,
        offs: 2,
        available: 141,
        locked: true,
        lockedAt: "t0",
      },
    };
    const unlocked: DayStore = {
      "2026-09-04": {
        date: "2026-09-04",
        base: 200,
        offs: 0,
        available: 200,
        locked: false,
        lockedAt: "t9",
      },
    };
    expect(mergeDayStores(unlocked, locked)["2026-09-04"]?.available).toBe(141);
  });
});

describe("ootNames day lock", () => {
  it("writes live ootNames onto today only", () => {
    const withOot = applyLiveSheet(
      {},
      { ...live, ootNames: ["Zachary Valadez", "Glen Barker"] },
      "2026-09-05",
      "t1",
    );
    expect(withOot["2026-09-05"]?.ootNames).toEqual([
      "Zachary Valadez",
      "Glen Barker",
    ]);
    expect(withOot["2026-09-04"]).toBeUndefined();
  });

  it("does not backfill ootNames onto prior dates when the sheet rolls", () => {
    const friday = applyLiveSheet(
      {},
      { ...live, ootNames: ["Old Name"] },
      "2026-09-04",
      "t1",
    );
    const saturday = applyLiveSheet(
      friday,
      { ...live, saturdayBase: 40, ootNames: ["New Saturday OOT"] },
      "2026-09-05",
      "t2",
    );
    expect(saturday["2026-09-04"]).toMatchObject({
      locked: true,
      ootNames: ["Old Name"],
    });
    expect(saturday["2026-09-05"]?.ootNames).toEqual(["New Saturday OOT"]);
  });

  it("leaves prior locked days without ootNames alone (no invented list)", () => {
    const prior: DayStore = {
      "2026-09-04": {
        date: "2026-09-04",
        base: 140,
        offs: 0,
        available: 140,
        locked: true,
        lockedAt: "t0",
        source: "weekday",
      },
    };
    const next = applyLiveSheet(
      prior,
      { ...live, ootNames: ["Should Not Appear On Friday"] },
      "2026-09-05",
      "t1",
    );
    expect(next["2026-09-04"]).not.toHaveProperty("ootNames");
    expect(next["2026-09-05"]?.ootNames).toEqual(["Should Not Appear On Friday"]);
  });
});
