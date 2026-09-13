import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hrefForTab,
  locationPointsAtTotals,
  replaceRetiredTotalsLocation,
  replaceTabLocation,
  rewriteRetiredTotalsHref,
  tabFromLocation,
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

describe("tabFromLocation", () => {
  it("opens Driver from path, hash, or tab query", () => {
    expect(tabFromLocation({ pathname: "/driver", search: "", hash: "" })).toBe("driver");
    expect(tabFromLocation({ pathname: "/driver/", search: "", hash: "" })).toBe("driver");
    expect(tabFromLocation({ pathname: "/", search: "", hash: "#driver" })).toBe("driver");
    expect(tabFromLocation({ pathname: "/", search: "?tab=driver", hash: "" })).toBe("driver");
    expect(tabFromLocation({ pathname: "/", search: "", hash: "" })).toBeNull();
    expect(tabFromLocation({ pathname: "/totals", search: "", hash: "" })).toBe("today");
  });
});

describe("sidebar labels and order", () => {
  it("lists Today, Drivers, Vacation, Trucks, Analytics", () => {
    const src = readFileSync(new URL("../components/TabBar.tsx", import.meta.url), "utf8");
    expect(src).toMatch(
      /id: "today".*label: "Today"[\s\S]*id: "driver".*label: "Drivers"[\s\S]*id: "vacation".*label: "Vacation"[\s\S]*id: "trucks".*label: "Trucks"[\s\S]*id: "analytics".*label: "Analytics"/,
    );
    expect(src).not.toContain("AnalyticsYTD");
    expect(src).not.toMatch(/label: "Driver"/);
  });
});

describe("hrefForTab / replaceTabLocation", () => {
  it("maps Driver to /driver", () => {
    expect(hrefForTab("driver")).toBe("/driver");
    expect(hrefForTab("today")).toBe("/");
  });

  it("writes /driver only for the Driver tab", () => {
    const calls: string[] = [];
    const historyApi = {
      replaceState(_s: unknown, _t: string, url: string) {
        calls.push(url);
      },
    };
    replaceTabLocation("driver", { pathname: "/", search: "", hash: "" }, historyApi);
    expect(calls).toEqual(["/driver"]);
    replaceTabLocation("today", { pathname: "/driver", search: "", hash: "" }, historyApi);
    expect(calls).toEqual(["/driver", "/"]);
    replaceTabLocation("vacation", { pathname: "/", search: "", hash: "" }, historyApi);
    expect(calls).toEqual(["/driver", "/"]);
  });
});
