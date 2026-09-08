import { describe, expect, it } from "vitest";
import type { Load } from "../types";
import {
  countBrokerLoads,
  countByTallyLabel,
  countWalkingFloorLoads,
  daySummaryCards,
  isWalkingFloorLoad,
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
});
