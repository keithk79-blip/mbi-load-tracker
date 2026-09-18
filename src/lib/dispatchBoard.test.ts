import { describe, expect, it } from "vitest";
import { parseCsvRows, parseDispatchBoardLoadsCsv } from "./dispatchBoard";

const LOADS_FOOTER = `9/16/2026,6:00,7:00
C. Heights,2,11
Total MSW,,,311,,,,,-117.5
Total Tank Loads,,,37
Total Walking-Floor Loads,,,26
Total Loads,,,374
Total MBI Drivers,,,135
Total Subs Drivers,
Total Sub Loads,,,13
Average Loads Per Driver,,,2.77
`;

describe("parseDispatchBoardLoadsCsv", () => {
  it("reads the Loads footer and forces Total Loads = MSW + tank + WF", () => {
    const totals = parseDispatchBoardLoadsCsv(LOADS_FOOTER);
    expect(totals).toEqual({
      date: "2026-09-16",
      trash: 311,
      leachate: 37,
      walkingFloor: 26,
      loads: 374,
      subs: 13,
    });
    expect(totals.trash + totals.leachate + totals.walkingFloor).toBe(totals.loads);
  });

  it("uses the three category sum even if Total Loads is blank or wrong", () => {
    const csv = `9/16/2026
Total MSW,10
Total Tank Loads,3
Total Walking-Floor Loads,2
Total Loads,999
Total Sub Loads,1
`;
    expect(parseDispatchBoardLoadsCsv(csv).loads).toBe(15);
  });

  it("parses quoted footer cells", () => {
    const csv = `"9/16/2026","","6:00"
"Total MSW","","","311"
"Total Tank Loads","","","37"
"Total Walking-Floor Loads","","","26"
"Total Sub Loads","","","13"
`;
    expect(parseDispatchBoardLoadsCsv(csv).loads).toBe(374);
    expect(parseCsvRows(csv)[0]?.[0]).toBe("9/16/2026");
  });

  it("reads the live Loads footer shape (quoted blanks, Total Subs Drivers first)", () => {
    const csv = `"9/16/2026","","6:00","7:00"
"C. Heights","2","11"
"Total MSW","","","311","","","","","","","","","","","-53.5"
"Total Tank Loads","","","37"
"Total Walking-Floor Loads","","","26"
"Total Loads","","","999"
"Total Subs Drivers","","","13"
"Total Sub Loads","","","13"
`;
    expect(parseDispatchBoardLoadsCsv(csv)).toEqual({
      date: "2026-09-16",
      trash: 311,
      leachate: 37,
      walkingFloor: 26,
      loads: 374,
      subs: 13,
    });
  });
});
