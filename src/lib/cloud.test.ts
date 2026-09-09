import { describe, expect, it } from "vitest";
import { LOAD_FETCH_PAGE_SIZE, fetchAllPaged } from "./cloud";

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
