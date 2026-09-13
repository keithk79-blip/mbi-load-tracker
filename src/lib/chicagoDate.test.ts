import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { weekStartingMonday, weekStartingSunday } from "./chicagoDate";

describe("weekStartingSunday", () => {
  it("returns Sunday through Saturday for a midweek date", () => {
    expect(weekStartingSunday("2026-09-16")).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]);
  });

  it("keeps a Sunday as the first day", () => {
    expect(weekStartingSunday("2026-09-13")[0]).toBe("2026-09-13");
    expect(weekStartingSunday("2026-09-13")[6]).toBe("2026-09-19");
  });

  it("starts Saturday’s week on the prior Sunday", () => {
    expect(weekStartingSunday("2026-09-19")[0]).toBe("2026-09-13");
  });

  it("DayPicker and Today week bubbles use Sunday start", () => {
    const picker = readFileSync(new URL("../components/DayPicker.tsx", import.meta.url), "utf8");
    const today = readFileSync(new URL("../screens/TodayScreen.tsx", import.meta.url), "utf8");
    expect(picker).toContain("weekStartingSunday");
    expect(picker).not.toContain("weekStartingMonday");
    expect(today).toContain("weekStartingSunday");
    expect(today).toContain("sortLoadsNewestFirst");
  });
});

describe("weekStartingMonday", () => {
  it("still returns Monday through Sunday when asked", () => {
    expect(weekStartingMonday("2026-09-16")[0]).toBe("2026-09-14");
    expect(weekStartingMonday("2026-09-16")[6]).toBe("2026-09-20");
  });
});
