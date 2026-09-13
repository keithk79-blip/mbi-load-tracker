import { describe, expect, it } from "vitest";
import type { Load } from "../types";
import { batchCreatedAt } from "./quantity";
import { sortLoads, sortLoadsNewestFirst } from "./sortLoads";

function load(partial: Partial<Load> & Pick<Load, "id" | "createdAt">): Load {
  return {
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "Covanta",
    stationId: "melrose",
    date: "2026-09-11",
    updatedAt: partial.updatedAt ?? partial.createdAt,
    ...partial,
  };
}

describe("sortLoads", () => {
  it("orders by createdAt ascending so the first dispatched load stays first", () => {
    const later = load({ id: "later", createdAt: "2026-09-11T14:00:00.000Z" });
    const earlier = load({ id: "earlier", createdAt: "2026-09-11T10:00:00.000Z" });
    expect(sortLoads([later, earlier]).map((row) => row.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("ignores updatedAt so a cloud upsert does not reshuffle the feed", () => {
    const first = load({
      id: "first",
      createdAt: "2026-09-11T10:00:00.000Z",
      updatedAt: "2026-09-11T18:00:00.000Z",
    });
    const second = load({
      id: "second",
      createdAt: "2026-09-11T10:05:00.000Z",
      updatedAt: "2026-09-11T10:05:00.000Z",
    });
    expect(sortLoads([second, first]).map((row) => row.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps qty>1 batchCreatedAt rows consecutive in entry order", () => {
    const base = "2026-09-11T15:00:00.000Z";
    const batch = [2, 0, 1].map((index) =>
      load({
        id: `qty-${index}`,
        createdAt: batchCreatedAt(base, index),
        updatedAt: "2026-09-11T20:00:00.000Z",
      }),
    );
    const neighbor = load({
      id: "after",
      createdAt: "2026-09-11T15:00:10.000Z",
    });
    expect(sortLoads([...batch, neighbor]).map((row) => row.id)).toEqual([
      "qty-0",
      "qty-1",
      "qty-2",
      "after",
    ]);
  });

  it("tie-breaks equal createdAt by id so order stays deterministic", () => {
    const b = load({ id: "b-id", createdAt: "2026-09-11T12:00:00.000Z" });
    const a = load({ id: "a-id", createdAt: "2026-09-11T12:00:00.000Z" });
    expect(sortLoads([b, a]).map((row) => row.id)).toEqual(["a-id", "b-id"]);
  });
});

describe("sortLoadsNewestFirst", () => {
  it("puts the most recently logged load first", () => {
    const later = load({ id: "later", createdAt: "2026-09-11T14:00:00.000Z" });
    const earlier = load({ id: "earlier", createdAt: "2026-09-11T10:00:00.000Z" });
    expect(sortLoadsNewestFirst([earlier, later]).map((row) => row.id)).toEqual([
      "later",
      "earlier",
    ]);
  });

  it("ignores updatedAt the same way as oldest-first", () => {
    const first = load({
      id: "first",
      createdAt: "2026-09-11T10:00:00.000Z",
      updatedAt: "2026-09-11T18:00:00.000Z",
    });
    const second = load({
      id: "second",
      createdAt: "2026-09-11T10:05:00.000Z",
      updatedAt: "2026-09-11T10:05:00.000Z",
    });
    expect(sortLoadsNewestFirst([first, second]).map((row) => row.id)).toEqual([
      "second",
      "first",
    ]);
  });
});

