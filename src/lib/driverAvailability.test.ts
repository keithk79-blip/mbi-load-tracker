import { describe, expect, it } from "vitest";
import { parseSheetDate } from "./chicagoDate";
import {
  availableDrivers,
  CALL_OFF_KIND_OPTIONS,
  CALL_OFF_KIND_TONES,
  callOffAppliesToDay,
  callOffKindFromReason,
  cleanCallOffEntries,
  fullDayOffCount,
  fullDayOffEntries,
  isCallOffKind,
  isCallOffListReason,
  isFullDayOff,
  kindRemovesFromAvailable,
  parseCallOffCsv,
  reasonForKind,
  withManualOffs,
  type CallOffKind,
  type CallOffRow,
} from "./driverAvailability";

const SUBTRACT = [
  "P-Day",
  "P-day",
  "1 P-Day",
  "Call Off",
  "Call Off, taking kid to school",
  "FMLA Day",
  "ok'd off",
  "Ok'd Off",
  "Ok'd day off",
  "ok'd off.",
  "ok'd off, told when hired",
  "Ok'd off, when hired",
  "Jury Duty",
  "Court at 1pm.",
  "Vacation Day",
  "1 vacation day",
  "Bereavement, father died",
  "Last Day , retiring",
  "Last Day, Retiring",
  "NCNS",
  "ncns",
  "No Call No Show",
];

const STATUS_ONLY = ["Late/Early", "late-early", "Late / Early"];

const KEEP = [
  "Needs to be parked by noon",
  "needs to park by 11am.",
  "needs to park by 1pm",
  "Parked at 3:30Pm",
  "Parked by Noon",
  "Parked by 1:30pm",
  "coming in a bit late, needs to sign papers",
  "ok'd to do 1 load",
  "ok'd to do 2 loads, dr. apt.",
  "Ok'd to do 2 loads",
  "ok'd to come in at noon",
  "Ok'd to come in late, 11am",
  "ok'd to come in late, kid going to school",
  "Ok'd to park empty, need trailer work",
  "ok'd to park by 3 pm",
  "ok;d to park early",
  "dr. apt in the morning, coming in after.",
  "taking daughter to dr. need to park at noon",
  "needing to park by noon",
  "",
  "dr. apt",
];

describe("isFullDayOff", () => {
  it("subtracts full-day / status offs from the live sheet", () => {
    for (const reason of SUBTRACT) {
      expect(isFullDayOff(reason), reason).toBe(true);
    }
  });

  it("does not subtract operational notes or unsure reasons", () => {
    for (const reason of KEEP) {
      expect(isFullDayOff(reason), reason).toBe(false);
    }
  });

  it("does not subtract Late/Early; it is orange status only", () => {
    for (const reason of STATUS_ONLY) {
      expect(isFullDayOff(reason), reason).toBe(false);
      expect(isCallOffListReason(reason), reason).toBe(true);
    }
  });
});

describe("through-date ranges", () => {
  const row: CallOffRow = {
    name: "Jovan Morris",
    start: "2026-08-26",
    end: "2026-08-29",
    reason: "ok'd off, told when hired",
  };

  it("counts each inclusive day in the through range", () => {
    expect(callOffAppliesToDay(row, "2026-08-25")).toBe(false);
    expect(callOffAppliesToDay(row, "2026-08-26")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-27")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-28")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-29")).toBe(true);
    expect(callOffAppliesToDay(row, "2026-08-30")).toBe(false);
  });

  it("treats a blank through date as that call-off day only", () => {
    const single: CallOffRow = {
      name: "Crandall Wells",
      start: "2026-08-06",
      end: null,
      reason: "Call Off",
    };
    expect(callOffAppliesToDay(single, "2026-08-06")).toBe(true);
    expect(callOffAppliesToDay(single, "2026-08-07")).toBe(false);
  });
});

describe("availableDrivers", () => {
  it("is the weekday base minus unique full-day offs, floored at 0", () => {
    const rows: CallOffRow[] = [
      { name: "A", start: "2026-09-05", end: null, reason: "P-Day" },
      { name: "B", start: "2026-09-05", end: null, reason: "Needs to be parked by noon" },
      { name: "C", start: "2026-09-05", end: null, reason: "ok'd off" },
    ];
    expect(availableDrivers(143, rows, "2026-09-05")).toEqual({
      date: "2026-09-05",
      base: 143,
      offs: 2,
      available: 141,
    });
    expect(availableDrivers(1, rows, "2026-09-05").available).toBe(0);
  });

  it("does not double-count the same driver twice on one day", () => {
    const rows: CallOffRow[] = [
      { name: "Jim Schroeder", start: "2026-08-03", end: null, reason: "P-Day" },
      { name: "Jim Schroeder", start: "2026-08-03", end: null, reason: "Call Off" },
    ];
    expect(fullDayOffCount(rows, "2026-08-03")).toBe(1);
  });
});

describe("parseSheetDate + CSV", () => {
  it("reads US sheet dates", () => {
    expect(parseSheetDate("8/3/26")).toBe("2026-08-03");
    expect(parseSheetDate("9/1/2026")).toBe("2026-09-01");
    expect(parseSheetDate("8/29/2026")).toBe("2026-08-29");
  });

  it("parses the live header row and a through-date line", () => {
    const csv = [
      "Name,Call Off ,Through Date,Reason",
      "Tim Rozzoni,8/3/26,,Jury Duty",
      'Jovan Morris,8/26/26,8/29/2026,"ok\'d off, told when hired"',
      "Martell Beasley,8/6/26,,Needs to be parked by noon",
    ].join("\n");
    const rows = parseCallOffCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      name: "Jovan Morris",
      start: "2026-08-26",
      end: "2026-08-29",
    });
    expect(isFullDayOff(rows[2].reason)).toBe(false);
  });
});

describe("CALL_OFF_KIND_OPTIONS + tones", () => {
  it("lists Late/Early with the other manual types", () => {
    expect(CALL_OFF_KIND_OPTIONS.map((row) => row.kind)).toEqual([
      "call-off",
      "p-day",
      "okd-off",
      "ncns",
      "late-early",
    ]);
    expect(
      CALL_OFF_KIND_OPTIONS.find((row) => row.kind === "late-early")?.label,
    ).toBe("Late/Early");
    expect(isCallOffKind("late-early")).toBe(true);
    expect(kindRemovesFromAvailable("late-early")).toBe(false);
    for (const kind of ["call-off", "p-day", "okd-off", "ncns"] as const) {
      expect(kindRemovesFromAvailable(kind)).toBe(true);
    }
  });

  it("maps Late/Early to orange, distinct from existing pill tones", () => {
    expect(CALL_OFF_KIND_TONES["late-early"]).toBe("orange");
    expect(CALL_OFF_KIND_TONES["call-off"]).toBe("blue");
    expect(CALL_OFF_KIND_TONES["p-day"]).toBe("green");
    expect(CALL_OFF_KIND_TONES["okd-off"]).toBe("gold");
    expect(CALL_OFF_KIND_TONES["ncns"]).toBe("red");
    const tones = Object.values(CALL_OFF_KIND_TONES);
    expect(new Set(tones).size).toBe(CALL_OFF_KIND_OPTIONS.length);
    expect(tones.filter((tone) => tone === "orange")).toEqual(["orange"]);
    for (const option of CALL_OFF_KIND_OPTIONS) {
      expect(CALL_OFF_KIND_TONES[option.kind as CallOffKind]).toBeTruthy();
    }
  });
});

describe("callOffKindFromReason", () => {
  it("maps sheet reasons onto the pill types and defaults the rest to Call Off", () => {
    expect(callOffKindFromReason("Call Off")).toBe("call-off");
    expect(callOffKindFromReason("Call Off, taking kid to school")).toBe("call-off");
    expect(callOffKindFromReason("P-Day")).toBe("p-day");
    expect(callOffKindFromReason("1 P-Day")).toBe("p-day");
    expect(callOffKindFromReason("Ok'd Off")).toBe("okd-off");
    expect(callOffKindFromReason("ok'd day off")).toBe("okd-off");
    expect(callOffKindFromReason("NCNS")).toBe("ncns");
    expect(callOffKindFromReason("No Call No Show")).toBe("ncns");
    expect(callOffKindFromReason("Late/Early")).toBe("late-early");
    expect(callOffKindFromReason("late-early")).toBe("late-early");
    expect(callOffKindFromReason("FMLA Day")).toBe("call-off");
    expect(callOffKindFromReason("Jury Duty")).toBe("call-off");
    expect(reasonForKind("late-early")).toBe("Late/Early");
  });
});

describe("cleanCallOffEntries", () => {
  it("keeps valid sheet/manual pills and drops junk", () => {
    expect(
      cleanCallOffEntries([
        { name: "Pablo Cruz", kind: "call-off", source: "manual" },
        { name: "Skip", kind: "call-off", source: "invented" },
        { name: "Sheet Friday", kind: "p-day", source: "sheet" },
        { name: "pablo cruz", kind: "ncns", source: "sheet" },
      ]),
    ).toEqual([
      { name: "Pablo Cruz", kind: "call-off", source: "manual" },
      { name: "Sheet Friday", kind: "p-day", source: "sheet" },
    ]);
    expect(cleanCallOffEntries(undefined)).toBeUndefined();
    expect(cleanCallOffEntries([])).toEqual([]);
  });
});

describe("fullDayOffEntries + manuals", () => {
  const sheet: CallOffRow[] = [
    { name: "Agustin Baca Guzman", start: "2026-09-08", end: null, reason: "Call Off" },
    { name: "Pablo Cruz", start: "2026-09-08", end: null, reason: "P-Day" },
    { name: "Late Note", start: "2026-09-08", end: null, reason: "Needs to be parked by noon" },
  ];

  it("colors sheet names from Reason and appends manuals without duplicating", () => {
    const entries = fullDayOffEntries(
      sheet,
      [
        { name: "Mike Davy", kind: "okd-off" },
        { name: "agustin baca guzman", kind: "ncns" },
      ],
      "2026-09-08",
    );
    expect(entries).toEqual([
      { name: "Agustin Baca Guzman", kind: "call-off", source: "sheet" },
      { name: "Mike Davy", kind: "okd-off", source: "manual" },
      { name: "Pablo Cruz", kind: "p-day", source: "sheet" },
    ]);
  });

  it("counts unique sheet + manual names in the available-driver subtract", () => {
    const rows = withManualOffs(sheet, [{ name: "Mike Davy", kind: "ncns" }], "2026-09-08");
    expect(availableDrivers(143, rows, "2026-09-08")).toEqual({
      date: "2026-09-08",
      base: 143,
      offs: 3,
      available: 140,
    });
  });

  it("subtracts real off kinds and does not double-count a sheet name", () => {
    const rows = withManualOffs(sheet, [
      { name: "Call Off Driver", kind: "call-off" },
      { name: "P Day Driver", kind: "p-day" },
      { name: "Okd Driver", kind: "okd-off" },
      { name: "Ncns Driver", kind: "ncns" },
      { name: "Pablo Cruz", kind: "ncns" },
    ], "2026-09-08");
    expect(availableDrivers(143, rows, "2026-09-08")).toMatchObject({
      offs: 6,
      available: 137,
    });
  });

  it("shows Late/Early manuals on the call-off list without subtracting them", () => {
    expect(kindRemovesFromAvailable("late-early")).toBe(false);
    const entries = fullDayOffEntries(
      sheet,
      [
        { name: "Derek Winters", kind: "late-early" },
        { name: "Off Guy", kind: "call-off" },
      ],
      "2026-09-08",
    );
    expect(entries).toContainEqual({
      name: "Derek Winters",
      kind: "late-early",
      source: "manual",
    });
    expect(entries).toContainEqual({
      name: "Off Guy",
      kind: "call-off",
      source: "manual",
    });
    const mixedRows = withManualOffs(
      sheet,
      [
        { name: "Derek Winters", kind: "late-early" },
        { name: "Off Guy", kind: "call-off" },
      ],
      "2026-09-08",
    );
    const lateEarlyOnly = withManualOffs(
      sheet,
      [{ name: "Derek Winters", kind: "late-early" }],
      "2026-09-08",
    );
    const callOffOnly = withManualOffs(
      sheet,
      [{ name: "Off Guy", kind: "call-off" }],
      "2026-09-08",
    );
    expect(availableDrivers(143, lateEarlyOnly, "2026-09-08")).toMatchObject({
      offs: 2,
      available: 141,
    });
    expect(availableDrivers(143, callOffOnly, "2026-09-08")).toMatchObject({
      offs: 3,
      available: 140,
    });
    expect(availableDrivers(143, mixedRows, "2026-09-08")).toMatchObject({
      offs: 3,
      available: 140,
    });
  });

  it("lists sheet Late/Early as orange status without changing the tally", () => {
    const withSheetStatus: CallOffRow[] = [
      ...sheet,
      { name: "Glen Barker", start: "2026-09-08", end: null, reason: "Late/Early" },
    ];
    expect(
      fullDayOffEntries(withSheetStatus, undefined, "2026-09-08"),
    ).toContainEqual({
      name: "Glen Barker",
      kind: "late-early",
      source: "sheet",
    });
    expect(availableDrivers(143, withSheetStatus, "2026-09-08")).toMatchObject({
      offs: 2,
      available: 141,
    });
  });
});
