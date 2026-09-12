import { describe, expect, it } from "vitest";
import {
  locationPointsAtTotals,
  replaceRetiredTotalsLocation,
  rewriteRetiredTotalsHref,
} from "./tabRoute";

describe("locationPointsAtTotals", () => {
  it("matches /totals, hash, and tab query", () => {
    expect(locationPointsAtTotals({ pathname: "/totals", search: "", hash: "" })).toBe(true);
    expect(locationPointsAtTotals({ pathname: "/totals/", search: "", hash: "" })).toBe(true);
    expect(locationPointsAtTotals({ pathname: "/", search: "", hash: "#totals" })).toBe(true);
    expect(locationPointsAtTotals({ pathname: "/", search: "", hash: "#/totals" })).toBe(true);
    expect(locationPointsAtTotals({ pathname: "/", search: "?tab=totals", hash: "" })).toBe(true);
    expect(locationPointsAtTotals({ pathname: "/", search: "?tab=Today", hash: "" })).toBe(false);
    expect(locationPointsAtTotals({ pathname: "/", search: "", hash: "" })).toBe(false);
    expect(locationPointsAtTotals({ pathname: "/trucks", search: "", hash: "" })).toBe(false);
  });
});

describe("rewriteRetiredTotalsHref", () => {
  it("rewrites path, hash, and query to Today", () => {
    expect(rewriteRetiredTotalsHref({ pathname: "/totals", search: "", hash: "" })).toBe("/");
    expect(rewriteRetiredTotalsHref({ pathname: "/totals/", search: "?keep=1", hash: "" })).toBe(
      "/?keep=1",
    );
    expect(rewriteRetiredTotalsHref({ pathname: "/", search: "", hash: "#totals" })).toBe("/");
    expect(rewriteRetiredTotalsHref({ pathname: "/", search: "?tab=totals", hash: "" })).toBe("/");
    expect(rewriteRetiredTotalsHref({ pathname: "/", search: "?tab=totals&keep=1", hash: "" })).toBe(
      "/?keep=1",
    );
    expect(rewriteRetiredTotalsHref({ pathname: "/", search: "", hash: "#today" })).toBeNull();
  });
});

describe("replaceRetiredTotalsLocation", () => {
  it("replaceStates only when the URL pointed at Totals", () => {
    const calls: string[] = [];
    const historyApi = {
      replaceState(_s: unknown, _t: string, url: string) {
        calls.push(url);
      },
    };

    expect(
      replaceRetiredTotalsLocation(
        { pathname: "/totals", search: "", hash: "" },
        historyApi,
      ),
    ).toBe(true);
    expect(calls).toEqual(["/"]);

    expect(
      replaceRetiredTotalsLocation(
        { pathname: "/", search: "", hash: "" },
        historyApi,
      ),
    ).toBe(false);
    expect(calls).toEqual(["/"]);
  });
});
