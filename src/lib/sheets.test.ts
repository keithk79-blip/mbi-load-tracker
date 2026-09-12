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
        "Due to the Labor day Holiday, Saturday 9/12/26 will be a full mandatory work day. Transfers and Landfills will have extended hours. ",
      ]),
    ).toBe(true);
    expect(saturdaySheetsUseWeekdayBase(["FULL MANDATORY WORK DAY"])).toBe(true);
    expect(saturdaySheetsUseWeekdayBase(["Full Mandatory Work Day"])).toBe(true);
  });

  it("is false when no Sat CSV bodies are present", () => {
    expect(saturdaySheetsUseWeekdayBase([])).toBe(false);
  });
});
