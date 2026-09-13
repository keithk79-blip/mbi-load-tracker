import { describe, expect, it } from "vitest";
import {
  LOAD_FETCH_PAGE_SIZE,
  fetchAllPaged,
  isMissingDriverNameColumn,
  loadToRow,
  pagedErrorMessage,
  rowToLoad,
  type LoadRow,
} from "./cloud";
import type { Load } from "../types";

describe("fetchAllPaged", () => {
  it("walks PostgREST range pages until a short page", async () => {
    const rows = Array.from({ length: 2506 }, (_, i) => ({ id: `row-${i}` }));
    const calls: Array<[number, number]> = [];
    const { data, error } = await fetchAllPaged(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    }, 1000);

    expect(error).toBeNull();
    expect(data).toHaveLength(2506);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("returns an empty list when the first page is empty", async () => {
    const { data, error } = await fetchAllPaged(async () => ({ data: [], error: null }));
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("stops and surfaces an error instead of keeping a truncated first page", async () => {
    const { data, error } = await fetchAllPaged(async (from) => {
      if (from === 0) {
        return {
          data: Array.from({ length: LOAD_FETCH_PAGE_SIZE }, (_, i) => ({ id: i })),
          error: null,
        };
      }
      return { data: null, error: new Error("range failed") };
    });
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe("pagedErrorMessage", () => {
  it("reads PostgREST-style message objects", () => {
    expect(pagedErrorMessage({ message: "range failed" })).toBe("range failed");
    expect(pagedErrorMessage(new Error("boom"))).toBe("boom");
    expect(pagedErrorMessage(null)).toBeUndefined();
  });
});

describe("load driver_name mapping", () => {
  const row: LoadRow = {
    id: "a",
    date: "2026-09-13",
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash",
    destination: "Covanta",
    station_id: "melrose",
    created_at: "2026-09-13T12:00:00.000Z",
    updated_at: "2026-09-13T12:00:00.000Z",
    created_by: null,
    display_name: null,
  };

  const load: Load = {
    id: "a",
    truck: "418",
    pickup: "Melrose",
    commodity: "Trash",
    destination: "Covanta",
    stationId: "melrose",
    date: "2026-09-13",
    createdAt: "2026-09-13T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
    driverName: "Alice Smith",
  };

  it("maps driver_name when the column is present", () => {
    expect(rowToLoad({ ...row, driver_name: "Alice Smith" }).driverName).toBe("Alice Smith");
    expect(rowToLoad({ ...row, driver_name: null }).driverName).toBeNull();
  });

  it("omits driverName when the column is absent so merge can keep a local snapshot", () => {
    expect(rowToLoad(row).driverName).toBeUndefined();
  });

  it("writes driver_name on upsert rows", () => {
    expect(loadToRow(load, null).driver_name).toBe("Alice Smith");
    expect(loadToRow({ ...load, driverName: undefined }, null).driver_name).toBeNull();
  });

  it("detects a missing driver_name column", () => {
    expect(
      isMissingDriverNameColumn({
        message: "Could not find the 'driver_name' column of 'loads' in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingDriverNameColumn({ message: "permission denied" })).toBe(false);
  });
});
