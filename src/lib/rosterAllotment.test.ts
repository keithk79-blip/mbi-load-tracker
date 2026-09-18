import { describe, expect, it } from "vitest";
import type { CallOffLogEntry } from "./callOffLog";
import {
  allotmentForName,
  allotmentKindFromReason,
  yearlyAllotmentUses,
} from "./rosterAllotment";

function log(
  name: string,
  start: string,
  reason: string,
  end: string | null = null,
): CallOffLogEntry {
  return {
    id: `${name}-${start}-${reason}`,
    name,
    start,
    end,
    reason,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("allotmentKindFromReason", () => {
  it("only spends P-Day and Call Off", () => {
    expect(allotmentKindFromReason("P-Day")).toBe("p-day");
    expect(allotmentKindFromReason("Call Off")).toBe("call-off");
    expect(allotmentKindFromReason("ok'd off")).toBeNull();
    expect(allotmentKindFromReason("Vacation Day")).toBeNull();
    expect(allotmentKindFromReason("FMLA Day")).toBeNull();
    expect(allotmentKindFromReason("NCNS")).toBeNull();
    expect(allotmentKindFromReason("Late/Early")).toBeNull();
  });
});

describe("yearly allotment", () => {
  it("starts every driver at 5 P-Days and 6 call-offs", () => {
    const tally = allotmentForName("Dave Vanderbilt", []);
    expect(tally).toEqual({
      pDayUsed: 0,
      callOffUsed: 0,
      pDayLeft: 5,
      callOffLeft: 6,
    });
  });

  it("deducts a Today P-Day and a Call-off log day, once", () => {
    const uses = yearlyAllotmentUses(
      [log("Dave Vanderbilt", "2026-03-02", "P-Day")],
      {
        "2026-03-02": [{ name: "Dave Vanderbilt", kind: "p-day" }],
        "2026-04-10": [{ name: "Dave Vanderbilt", kind: "call-off" }],
      },
      2026,
    );
    const tally = allotmentForName("Dave Vanderbilt", uses);
    expect(tally.pDayUsed).toBe(1);
    expect(tally.callOffUsed).toBe(1);
    expect(tally.pDayLeft).toBe(4);
    expect(tally.callOffLeft).toBe(5);
  });

  it("counts each day in a through-date range in the current year", () => {
    const uses = yearlyAllotmentUses(
      [log("James Carter", "2025-12-31", "Call Off", "2026-01-02")],
      {},
      2026,
    );
    expect(allotmentForName("James Carter", uses).callOffUsed).toBe(2);
  });

  it("does not spend Ok'd Off or last year's rows", () => {
    const uses = yearlyAllotmentUses(
      [
        log("Kevin Bray", "2026-02-01", "ok'd off"),
        log("Kevin Bray", "2025-11-01", "P-Day"),
      ],
      { "2025-12-01": [{ name: "Kevin Bray", kind: "call-off" }] },
      2026,
    );
    expect(allotmentForName("Kevin Bray", uses)).toEqual({
      pDayUsed: 0,
      callOffUsed: 0,
      pDayLeft: 5,
      callOffLeft: 6,
    });
  });
});
