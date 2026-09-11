import { describe, expect, it } from "vitest";
import type { Load } from "../types";
import { SPECIALTY_STATIONS } from "./specialtyBoard";
import {
  emptyBoard,
  setStationClose,
  STATION_CALL_YARDS,
  type StationDayBoard,
} from "./stationCalls";
import {
  countBrokerLoads,
  countByTallyLabel,
  countTrashLoads,
  countWalkingFloorLoads,
  daySummaryCards,
  endOfDayCards,
  endOfDaySummary,
  isGraysLakePickup,
  isGraysLakeRecycleLane,
  isVanDrunenPickup,
  isWalkingFloorLoad,
  loadMatchesCallYard,
  rankCommodities,
} from "./totals";

function load(partial: Partial<Load>): Load {
  return {
    id: partial.id ?? "id",
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date: "2026-09-08",
    createdAt: "2026-09-08T12:00:00.000Z",
    updatedAt: "2026-09-08T12:00:00.000Z",
    ...partial,
  };
}

describe("countBrokerLoads", () => {
  it("counts letter broker codes and leaves numeric trucks out of SUBS", () => {
    const loads = [
      load({ id: "1", truck: "418" }),
      load({ id: "2", truck: "VZ", commodity: "Trash (MSW)" }),
      load({ id: "3", truck: "cgh" }),
      load({ id: "4", truck: "G2" }),
      load({ id: "5", truck: "ABC" }),
    ];
    expect(countBrokerLoads(loads)).toBe(4);
  });
});

describe("walking-floor tallies", () => {
  it("counts yard waste, recycle, residual/residue, and cardboard", () => {
    const loads = [
      load({ id: "1", commodity: "Trash (MSW)" }),
      load({ id: "2", commodity: "Yard Waste" }),
      load({ id: "3", commodity: "Recycle" }),
      load({ id: "4", commodity: "Residual" }),
      load({ id: "5", commodity: "Residue" }),
      load({ id: "6", commodity: "Cardboard" }),
      load({ id: "7", commodity: "Leachate (tanker)" }),
    ];
    expect(loads.filter(isWalkingFloorLoad).map((row) => row.id)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(countWalkingFloorLoads(loads)).toBe(5);
  });

  it("counts Groot-related hauls even when the commodity is trash", () => {
    expect(
      isWalkingFloorLoad(
        load({
          commodity: "Trash (MSW)",
          destination: "Groot Recycling",
        }),
      ),
    ).toBe(true);
    expect(
      isWalkingFloorLoad(load({ pickup: "Groot", commodity: "Trash (MSW)" })),
    ).toBe(true);
  });

  it("does not double-count a recycle load that also goes to Groot", () => {
    const loads = [
      load({
        id: "wheeling",
        pickup: "Wheeling",
        commodity: "Recycle",
        destination: "Groot",
      }),
    ];
    expect(countWalkingFloorLoads(loads)).toBe(1);
  });

  it("counts Van Drunen pickups as walking-floor even when the commodity is trash", () => {
    const vanDrunen = load({
      id: "vd",
      pickup: "Van Drunen",
      commodity: "Trash",
      destination: "Newton",
      stationId: "custom",
    });
    expect(isVanDrunenPickup(vanDrunen)).toBe(true);
    expect(isWalkingFloorLoad(vanDrunen)).toBe(true);
    expect(countTrashLoads([vanDrunen])).toBe(0);
    expect(countWalkingFloorLoads([vanDrunen])).toBe(1);
  });

  it("does not treat Melrose trash as walking-floor, even to Newton", () => {
    const melrose = load({
      pickup: "Melrose",
      commodity: "Trash (MSW)",
      destination: "Newton",
      stationId: "melrose",
    });
    expect(isVanDrunenPickup(melrose)).toBe(false);
    expect(isWalkingFloorLoad(melrose)).toBe(false);
    expect(countTrashLoads([melrose])).toBe(1);
  });

  it("does not treat Van Drunen as a destination match", () => {
    const row = load({
      pickup: "Melrose",
      destination: "Van Drunen",
      stationId: "melrose",
    });
    expect(isVanDrunenPickup(row)).toBe(false);
    expect(isWalkingFloorLoad(row)).toBe(false);
  });

  it("matches Van Drunen / Vandrunen pickup aliases without a catalog bubble", () => {
    const aliases = [
      load({ pickup: "Van Drunen", stationId: "custom" }),
      load({ pickup: "Vandrunen", stationId: "custom" }),
      load({ pickup: "van-drunen", stationId: "custom" }),
      load({ pickup: "VAN DRUNEN", stationId: "custom" }),
      load({ pickup: "Custom", stationId: "van-drunen" }),
    ];
    for (const row of aliases) {
      expect(isVanDrunenPickup(row)).toBe(true);
      expect(isWalkingFloorLoad(row)).toBe(true);
    }
    expect(
      SPECIALTY_STATIONS.some((station) =>
        `${station.id}${station.name}`.toLowerCase().includes("drunen"),
      ),
    ).toBe(false);
    expect(
      STATION_CALL_YARDS.some((yard) =>
        `${yard.id}${yard.label}`.toLowerCase().includes("drunen"),
      ),
    ).toBe(false);
  });

  it("counts GraysLake Recycle → Hodgkins (truck 2888) as walking-floor, not trash", () => {
    const row = load({
      id: "2888-gl",
      truck: "2888",
      pickup: "GraysLake",
      commodity: "Recycle",
      destination: "Hodgkins",
      stationId: "grayslake",
    });
    expect(isGraysLakePickup(row)).toBe(true);
    expect(isGraysLakeRecycleLane(row)).toBe(true);
    expect(isWalkingFloorLoad(row)).toBe(true);
    expect(countTrashLoads([row])).toBe(0);
    expect(countWalkingFloorLoads([row])).toBe(1);
    expect(countByTallyLabel([row], "LEACHATE")).toBe(0);
  });

  it("matches GraysLake / Grayslake pickup and stationId aliases on the recycle lane", () => {
    const aliases = [
      load({
        pickup: "GraysLake",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "grayslake",
      }),
      load({
        pickup: "Grayslake",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "custom",
      }),
      load({
        pickup: "Grays Lake",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "custom",
      }),
      load({
        pickup: "grays-lake",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "custom",
      }),
      load({
        pickup: "Custom",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "grayslake",
      }),
    ];
    for (const row of aliases) {
      expect(isGraysLakePickup(row)).toBe(true);
      expect(isGraysLakeRecycleLane(row)).toBe(true);
      expect(isWalkingFloorLoad(row)).toBe(true);
      expect(countTrashLoads([row])).toBe(0);
    }
  });

  it("still counts the lane as WF when commodity is dest-labeled or lacks the recycle substring", () => {
    const destLabeled = load({
      truck: "2888",
      pickup: "GraysLake",
      commodity: "Hodgkins",
      destination: "Recycle",
      stationId: "grayslake",
    });
    const hyphenated = load({
      pickup: "Grayslake",
      commodity: "Re-cycle",
      destination: "Hodgkins",
      stationId: "custom",
    });
    const destOnly = load({
      pickup: "GraysLake",
      commodity: "1-7",
      destination: "Hodgkins",
      stationId: "grayslake",
    });
    for (const row of [destLabeled, hyphenated, destOnly]) {
      expect(isWalkingFloorLoad(row)).toBe(true);
      expect(countTrashLoads([row])).toBe(0);
    }
  });

  it("keeps GraysLake leachate on LEACHATE, not WALKING-FLOOR", () => {
    const tank = load({
      pickup: "GraysLake",
      commodity: "Leachate (tanker)",
      destination: "CID",
      stationId: "grayslake",
    });
    expect(isGraysLakePickup(tank)).toBe(true);
    expect(isGraysLakeRecycleLane(tank)).toBe(false);
    expect(isWalkingFloorLoad(tank)).toBe(false);
    expect(countByTallyLabel([tank], "LEACHATE")).toBe(1);
    expect(countWalkingFloorLoads([tank])).toBe(0);
    expect(countTrashLoads([tank])).toBe(0);
  });
});

describe("daySummaryCards", () => {
  const labels = (cards: ReturnType<typeof daySummaryCards>) =>
    cards.map((card) => [card.label, card.count]);

  it("always shows TRASH, LEACHATE, LOADS, SUBS, and WALKING-FLOOR", () => {
    const loads = [
      load({ id: "1", truck: "418", commodity: "Trash (MSW)" }),
      load({ id: "2", truck: "VZ", commodity: "Trash (MSW)" }),
      load({ id: "3", truck: "55", commodity: "Leachate (tanker)" }),
      load({ id: "4", truck: "CGH", commodity: "Yard Waste" }),
    ];

    expect(countByTallyLabel(loads, "TRASH")).toBe(2);
    expect(countByTallyLabel(loads, "LEACHATE")).toBe(1);

    const cards = daySummaryCards(loads);
    expect(labels(cards)).toEqual([
      ["TRASH", 2],
      ["LEACHATE", 1],
      ["LOADS", 4],
      ["SUBS", 2],
      ["WALKING-FLOOR", 1],
    ]);
    expect(cards.find((card) => card.label === "LOADS")?.emphasis).toBe(true);
  });

  it("keeps TRASH and LEACHATE when yard waste outranks leachate", () => {
    const loads = [
      load({ id: "1", commodity: "Trash (MSW)" }),
      load({ id: "2", commodity: "Yard Waste" }),
      load({ id: "3", commodity: "Yard Waste" }),
      load({ id: "4", commodity: "Recycle" }),
    ];
    expect(labels(daySummaryCards(loads))).toEqual([
      ["TRASH", 1],
      ["LEACHATE", 0],
      ["LOADS", 4],
      ["SUBS", 0],
      ["WALKING-FLOOR", 3],
    ]);
  });

  it("still shows TRASH and LEACHATE at zero on an empty day", () => {
    expect(labels(daySummaryCards([]))).toEqual([
      ["TRASH", 0],
      ["LEACHATE", 0],
      ["LOADS", 0],
      ["SUBS", 0],
      ["WALKING-FLOOR", 0],
    ]);
  });

  it("increments LOADS, TRASH, and SUBS for a broker trash load", () => {
    const before = daySummaryCards([]);
    const after = daySummaryCards([
      load({ truck: "TJ", commodity: "Trash (MSW)" }),
    ]);
    const value = (cards: typeof after, label: string) =>
      cards.find((card) => card.label === label)?.count ?? 0;

    expect(value(after, "LOADS") - value(before, "LOADS")).toBe(1);
    expect(value(after, "TRASH") - value(before, "TRASH")).toBe(1);
    expect(value(after, "LEACHATE") - value(before, "LEACHATE")).toBe(0);
    expect(value(after, "SUBS") - value(before, "SUBS")).toBe(1);
    expect(value(after, "WALKING-FLOOR") - value(before, "WALKING-FLOOR")).toBe(
      0,
    );
    expect(labels(after).map(([label]) => label)).toEqual([
      "TRASH",
      "LEACHATE",
      "LOADS",
      "SUBS",
      "WALKING-FLOOR",
    ]);
  });

  it("counts C&D as TRASH so it is not leftover outside TRASH/LEACHATE/WALKING-FLOOR", () => {
    const loads = [
      load({ id: "msw", commodity: "Trash (MSW)" }),
      load({
        id: "cd-citiwaste",
        truck: "2207",
        pickup: "Citiwaste",
        commodity: "C&D",
        destination: "Pontiac",
        stationId: "citiwaste",
      }),
      load({ id: "cd-lrs", commodity: "C&D", pickup: "LRS", stationId: "lrs" }),
      load({ id: "leach", commodity: "Leachate (tanker)" }),
      load({ id: "yard", commodity: "Yard Waste" }),
    ];

    expect(countByTallyLabel(loads, "TRASH")).toBe(3);
    expect(countByTallyLabel(loads, "C&D")).toBe(0);
    expect(countByTallyLabel(loads, "LEACHATE")).toBe(1);
    expect(countWalkingFloorLoads(loads)).toBe(1);

    const cards = daySummaryCards(loads);
    const value = (label: string) =>
      cards.find((card) => card.label === label)?.count ?? 0;

    expect(cards.map((card) => card.label)).toEqual([
      "TRASH",
      "LEACHATE",
      "LOADS",
      "SUBS",
      "WALKING-FLOOR",
    ]);
    expect(value("TRASH")).toBe(3);
    expect(value("LOADS")).toBe(5);
    expect(value("TRASH") + value("LEACHATE") + value("WALKING-FLOOR")).toBe(
      value("LOADS"),
    );
  });

  it("puts Van Drunen trash on WALKING-FLOOR, not TRASH, and still counts LOADS", () => {
    const loads = [
      load({
        id: "vd-trash",
        pickup: "Van Drunen",
        commodity: "Trash",
        destination: "Newton",
        stationId: "custom",
      }),
      load({
        id: "melrose-trash",
        pickup: "Melrose",
        commodity: "Trash (MSW)",
        destination: "Covanta",
        stationId: "melrose",
      }),
    ];

    expect(countTrashLoads(loads)).toBe(1);
    expect(countWalkingFloorLoads(loads)).toBe(1);
    expect(countByTallyLabel(loads, "TRASH")).toBe(2);

    const cards = daySummaryCards(loads);
    const value = (label: string) =>
      cards.find((card) => card.label === label)?.count ?? 0;

    expect(value("TRASH")).toBe(1);
    expect(value("WALKING-FLOOR")).toBe(1);
    expect(value("LOADS")).toBe(2);
    expect(value("LEACHATE")).toBe(0);
  });

  it("keeps non–Van Drunen C&D in TRASH while Van Drunen C&D is WALKING-FLOOR", () => {
    const loads = [
      load({
        id: "cd-citiwaste",
        pickup: "Citiwaste",
        commodity: "C&D",
        destination: "Pontiac",
        stationId: "citiwaste",
      }),
      load({
        id: "cd-vd",
        pickup: "Vandrunen",
        commodity: "C&D",
        destination: "Newton",
        stationId: "custom",
      }),
    ];

    expect(countTrashLoads(loads)).toBe(1);
    expect(countWalkingFloorLoads(loads)).toBe(1);

    const cards = daySummaryCards(loads);
    const value = (label: string) =>
      cards.find((card) => card.label === label)?.count ?? 0;
    expect(value("TRASH")).toBe(1);
    expect(value("WALKING-FLOOR")).toBe(1);
    expect(value("LOADS")).toBe(2);
  });

  it("counts Tires as TRASH so it is not leftover outside TRASH/LEACHATE/WALKING-FLOOR", () => {
    const loads = [
      load({ id: "msw", commodity: "Trash (MSW)" }),
      load({
        id: "tires-2195",
        truck: "2195",
        pickup: "Tri-State",
        commodity: "Tires",
        destination: "Liberty",
        stationId: "tri-state",
      }),
      load({ id: "leach", commodity: "Leachate (tanker)" }),
      load({ id: "yard", commodity: "Yard Waste" }),
    ];

    expect(countByTallyLabel(loads, "TRASH")).toBe(2);
    expect(countByTallyLabel(loads, "TIRES")).toBe(0);
    expect(countTrashLoads(loads)).toBe(2);
    expect(countByTallyLabel(loads, "LEACHATE")).toBe(1);
    expect(countWalkingFloorLoads(loads)).toBe(1);
    expect(isWalkingFloorLoad(loads[1]!)).toBe(false);

    const cards = daySummaryCards(loads);
    const value = (label: string) =>
      cards.find((card) => card.label === label)?.count ?? 0;

    expect(cards.map((card) => card.label)).toEqual([
      "TRASH",
      "LEACHATE",
      "LOADS",
      "SUBS",
      "WALKING-FLOOR",
    ]);
    expect(value("TRASH")).toBe(2);
    expect(value("LOADS")).toBe(4);
    expect(value("WALKING-FLOOR")).toBe(1);
    expect(value("TRASH") + value("LEACHATE") + value("WALKING-FLOOR")).toBe(
      value("LOADS"),
    );
  });

  it("puts GraysLake Recycle → Hodgkins on WALKING-FLOOR so the three buckets sum to LOADS", () => {
    const loads = [
      load({
        id: "msw",
        pickup: "Melrose",
        commodity: "Trash (MSW)",
        destination: "Covanta",
        stationId: "melrose",
      }),
      load({
        id: "cd",
        pickup: "Citiwaste",
        commodity: "C&D",
        destination: "Pontiac",
        stationId: "citiwaste",
      }),
      load({
        id: "leach",
        pickup: "GraysLake",
        commodity: "Leachate (tanker)",
        destination: "FRWRD",
        stationId: "grayslake",
      }),
      load({
        id: "2888",
        truck: "2888",
        pickup: "GraysLake",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "grayslake",
      }),
      load({
        id: "vd",
        pickup: "Van Drunen",
        commodity: "Trash",
        destination: "Newton",
        stationId: "custom",
      }),
    ];

    const cards = daySummaryCards(loads);
    const value = (label: string) =>
      cards.find((card) => card.label === label)?.count ?? 0;

    expect(value("TRASH")).toBe(2);
    expect(value("LEACHATE")).toBe(1);
    expect(value("WALKING-FLOOR")).toBe(2);
    expect(value("LOADS")).toBe(5);
    expect(value("TRASH") + value("LEACHATE") + value("WALKING-FLOOR")).toBe(
      value("LOADS"),
    );
  });
});

describe("rankCommodities", () => {
  it("groups C&D with Trash (MSW) because they share the TRASH tally bucket", () => {
    expect(
      rankCommodities([
        load({ id: "1", commodity: "C&D" }),
        load({ id: "2", commodity: "Trash (MSW)" }),
      ]),
    ).toEqual([{ key: "TRASH", label: "Trash (MSW)", count: 2 }]);
  });

  it("groups Tires with Trash (MSW) because they share the TRASH tally bucket", () => {
    expect(
      rankCommodities([
        load({ id: "1", commodity: "Tires" }),
        load({ id: "2", commodity: "Trash (MSW)" }),
      ]),
    ).toEqual([{ key: "TRASH", label: "Trash (MSW)", count: 2 }]);
  });
});

describe("endOfDaySummary", () => {
  const heights = { id: "c-heights", label: "C. Heights" };
  const hooker = { id: "hooker", label: "Hooker" };

  it("matches Chicago Heights and Hooker Street to the call-grid yards", () => {
    expect(
      loadMatchesCallYard(
        load({ stationId: "chicago-heights", pickup: "Chicago Heights" }),
        heights,
      ),
    ).toBe(true);
    expect(
      loadMatchesCallYard(load({ stationId: "custom", pickup: "C. Heights" }), heights),
    ).toBe(true);
    expect(
      loadMatchesCallYard(
        load({ stationId: "hooker-street", pickup: "Hooker Street" }),
        hooker,
      ),
    ).toBe(true);
    expect(loadMatchesCallYard(load({ pickup: "Hooker" }), hooker)).toBe(true);
    expect(loadMatchesCallYard(load({ pickup: "Melrose" }), heights)).toBe(false);
  });

  it("groups overall loads, SUBS, pickups, and Closed per call-grid station", () => {
    const loads = [
      load({ id: "1", truck: "418", stationId: "melrose", pickup: "Melrose" }),
      load({ id: "2", truck: "VZ", stationId: "melrose", pickup: "Melrose" }),
      load({
        id: "3",
        truck: "CGH",
        stationId: "chicago-heights",
        pickup: "Chicago Heights",
      }),
      load({ id: "4", truck: "55", stationId: "calumet", pickup: "Calumet" }),
    ];
    let board: StationDayBoard = emptyBoard();
    board = setStationClose({ "2026-09-08": board }, "2026-09-08", "melrose", 6)[
      "2026-09-08"
    ]!;
    board = setStationClose({ "2026-09-08": board }, "2026-09-08", "c-heights", 2)[
      "2026-09-08"
    ]!;

    const summary = endOfDaySummary(loads, board);
    expect(summary.loads).toBe(4);
    expect(summary.subs).toBe(2);
    expect(summary.trash).toBe(4);
    expect(summary.leachate).toBe(0);
    expect(summary.walkingFloor).toBe(0);

    const byId = Object.fromEntries(summary.stations.map((row) => [row.id, row]));
    expect(byId.melrose).toEqual({
      id: "melrose",
      label: "Melrose",
      pickedUp: 2,
      left: "6",
    });
    expect(byId["c-heights"]).toEqual({
      id: "c-heights",
      label: "C. Heights",
      pickedUp: 1,
      left: "2",
    });
    expect(byId.calumet).toEqual({
      id: "calumet",
      label: "Calumet",
      pickedUp: 1,
      left: null,
    });
    expect(byId.apollo?.pickedUp).toBe(0);
    expect(byId.apollo?.left).toBeNull();
    expect(summary.stations.map((row) => row.id)).toContain("roscoe");
  });

  it("carries a blank Close as null instead of falling back to hour cells", () => {
    const board = emptyBoard();
    board.melrose = { hours: { "15": "9" }, close: null };
    const summary = endOfDaySummary([load({ pickup: "Melrose" })], board);
    expect(summary.stations.find((row) => row.id === "melrose")?.left).toBeNull();
  });

  it("tallies trash, leachate, walking-floor, all loads, and SUBS for EOD cards", () => {
    const loads = [
      load({ id: "1", truck: "418", commodity: "Trash (MSW)" }),
      load({ id: "2", truck: "VZ", commodity: "Leachate (tanker)" }),
      load({ id: "3", truck: "55", commodity: "Yard Waste" }),
      load({ id: "4", truck: "CGH", commodity: "Recycle" }),
    ];
    const summary = endOfDaySummary(loads, emptyBoard());
    expect(summary.trash).toBe(1);
    expect(summary.leachate).toBe(1);
    expect(summary.walkingFloor).toBe(2);
    expect(summary.loads).toBe(4);
    expect(summary.subs).toBe(2);
    expect(endOfDayCards(summary).map((card) => [card.label, card.count])).toEqual([
      ["TRASH", 1],
      ["LEACHATE", 1],
      ["WALKING-FLOOR", 2],
      ["LOADS", 4],
      ["SUBS", 2],
    ]);
    expect(endOfDayCards(summary).find((card) => card.label === "LOADS")?.emphasis).toBe(
      true,
    );
  });

  it("keeps TRASH and LEACHATE at zero on an empty day", () => {
    const summary = endOfDaySummary([], emptyBoard());
    expect(endOfDayCards(summary).map((card) => [card.label, card.count])).toEqual([
      ["TRASH", 0],
      ["LEACHATE", 0],
      ["WALKING-FLOOR", 0],
      ["LOADS", 0],
      ["SUBS", 0],
    ]);
  });

  it("uses the same leachate/tanker and trash/MSW labels as Today", () => {
    const loads = [
      load({ id: "1", commodity: "Leachate (tanker)" }),
      load({ id: "2", commodity: "Trash (MSW)" }),
      load({ id: "3", commodity: "MSW" }),
    ];
    const summary = endOfDaySummary(loads, emptyBoard());
    expect(countByTallyLabel(loads, "LEACHATE")).toBe(1);
    expect(countByTallyLabel(loads, "TRASH")).toBe(2);
    expect(summary.leachate).toBe(1);
    expect(summary.trash).toBe(2);
    expect(endOfDayCards(summary).map((card) => card.label)).toEqual([
      "TRASH",
      "LEACHATE",
      "WALKING-FLOOR",
      "LOADS",
      "SUBS",
    ]);
  });

  it("counts C&D inside the TRASH bubble like Today, not as a leftover", () => {
    const loads = [
      load({ id: "msw", commodity: "Trash (MSW)" }),
      load({
        id: "cd",
        truck: "2207",
        pickup: "Citiwaste",
        commodity: "C&D",
        destination: "Pontiac",
        stationId: "citiwaste",
      }),
      load({ id: "leach", commodity: "Leachate (tanker)" }),
      load({ id: "recycle", commodity: "Recycle" }),
    ];
    const summary = endOfDaySummary(loads, emptyBoard());
    expect(summary.trash).toBe(2);
    expect(summary.leachate).toBe(1);
    expect(summary.walkingFloor).toBe(1);
    expect(summary.loads).toBe(4);
    expect(summary.trash + summary.leachate + summary.walkingFloor).toBe(
      summary.loads,
    );
    const cards = endOfDayCards(summary);
    expect(cards.map((card) => card.label)).not.toContain("C&D");
    expect(cards.map((card) => [card.label, card.count])).toEqual([
      ["TRASH", 2],
      ["LEACHATE", 1],
      ["WALKING-FLOOR", 1],
      ["LOADS", 4],
      ["SUBS", 0],
    ]);
  });

  it("puts Van Drunen trash on WALKING-FLOOR, not TRASH, like Today", () => {
    const loads = [
      load({
        id: "vd",
        pickup: "Van Drunen",
        commodity: "Trash",
        destination: "Newton",
        stationId: "custom",
      }),
      load({
        id: "melrose",
        pickup: "Melrose",
        commodity: "Trash (MSW)",
        stationId: "melrose",
      }),
    ];
    const summary = endOfDaySummary(loads, emptyBoard());
    expect(summary.trash).toBe(1);
    expect(summary.walkingFloor).toBe(1);
    expect(summary.loads).toBe(2);
    expect(summary.leachate).toBe(0);
    expect(endOfDayCards(summary).map((card) => [card.label, card.count])).toEqual([
      ["TRASH", 1],
      ["LEACHATE", 0],
      ["WALKING-FLOOR", 1],
      ["LOADS", 2],
      ["SUBS", 0],
    ]);
    expect(summary.stations.some((row) => /drunen/i.test(`${row.id}${row.label}`))).toBe(
      false,
    );
  });

  it("counts Tires inside the TRASH bubble like Today, not as a leftover", () => {
    const loads = [
      load({ id: "msw", commodity: "Trash (MSW)" }),
      load({
        id: "tires",
        truck: "2195",
        pickup: "Tri-State",
        commodity: "Tires",
        destination: "Liberty",
        stationId: "tri-state",
      }),
      load({ id: "leach", commodity: "Leachate (tanker)" }),
      load({ id: "recycle", commodity: "Recycle" }),
    ];
    const summary = endOfDaySummary(loads, emptyBoard());
    expect(summary.trash).toBe(2);
    expect(summary.leachate).toBe(1);
    expect(summary.walkingFloor).toBe(1);
    expect(summary.loads).toBe(4);
    expect(summary.trash + summary.leachate + summary.walkingFloor).toBe(
      summary.loads,
    );
    const cards = endOfDayCards(summary);
    expect(cards.map((card) => card.label)).not.toContain("TIRES");
    expect(cards.map((card) => [card.label, card.count])).toEqual([
      ["TRASH", 2],
      ["LEACHATE", 1],
      ["WALKING-FLOOR", 1],
      ["LOADS", 4],
      ["SUBS", 0],
    ]);
  });

  it("puts GraysLake Recycle → Hodgkins on WALKING-FLOOR so EOD buckets sum to LOADS", () => {
    const loads = [
      load({
        id: "msw",
        commodity: "Trash (MSW)",
        pickup: "Melrose",
        stationId: "melrose",
      }),
      load({
        id: "leach",
        pickup: "GraysLake",
        commodity: "Leachate (tanker)",
        destination: "CID",
        stationId: "grayslake",
      }),
      load({
        id: "2888",
        truck: "2888",
        pickup: "Grayslake",
        commodity: "Recycle",
        destination: "Hodgkins",
        stationId: "grayslake",
      }),
    ];
    const summary = endOfDaySummary(loads, emptyBoard());
    expect(summary.trash).toBe(1);
    expect(summary.leachate).toBe(1);
    expect(summary.walkingFloor).toBe(1);
    expect(summary.loads).toBe(3);
    expect(summary.trash + summary.leachate + summary.walkingFloor).toBe(
      summary.loads,
    );
    expect(endOfDayCards(summary).map((card) => [card.label, card.count])).toEqual([
      ["TRASH", 1],
      ["LEACHATE", 1],
      ["WALKING-FLOOR", 1],
      ["LOADS", 3],
      ["SUBS", 0],
    ]);
  });

  it("shows decimal and letter Close values in Left", () => {
    let board = emptyBoard();
    board = setStationClose({ "2026-09-08": board }, "2026-09-08", "melrose", "1.5")[
      "2026-09-08"
    ]!;
    board = setStationClose({ "2026-09-08": board }, "2026-09-08", "calumet", "late")[
      "2026-09-08"
    ]!;
    const summary = endOfDaySummary([], board);
    expect(summary.stations.find((row) => row.id === "melrose")?.left).toBe("1.5");
    expect(summary.stations.find((row) => row.id === "calumet")?.left).toBe("late");
  });
});
