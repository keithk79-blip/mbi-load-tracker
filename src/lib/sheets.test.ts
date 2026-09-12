import { describe, expect, it } from "vitest";
import { saturdaySheetsUseWeekdayBase } from "./sheets";

describe("saturdaySheetsUseWeekdayBase", () => {
  it("ignores the normal Mandatory Saturday worklist title", () => {
    expect(
      saturdaySheetsUseWeekdayBase([
        "Mandatory Saturday Worklist - Burnham",
        "Mandatory Saturday List - Pontiac",
      ]),
    ).toBe(false);
  });

  it("flags a full mandatory / holiday work day (case-insensitive)", () => {
    expect(
      saturdaySheetsUseWeekdayBase([
        "Mandatory Saturday Worklist - Burnham",
        "Labor Day Holiday extended hours — full mandatory work day",
      ]),
    ).toBe(true);
    expect(saturdaySheetsUseWeekdayBase(["FULL MANDATORY WORK DAY"])).toBe(true);
    expect(saturdaySheetsUseWeekdayBase(["Full Mandatory Work Day"])).toBe(true);
  });

  it("is false when no Sat CSV bodies are present", () => {
    expect(saturdaySheetsUseWeekdayBase([])).toBe(false);
  });
});
