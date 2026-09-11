import { describe, expect, it } from "vitest";
import { commodityRankLabel, commodityTone, tallyLabel } from "./commodity";

describe("tallyLabel", () => {
  it("rolls C&D into TRASH like the Dispatch Board sheet Total MSW", () => {
    expect(tallyLabel("C&D")).toBe("TRASH");
    expect(tallyLabel("Trash (MSW)")).toBe("TRASH");
    expect(tallyLabel("MSW")).toBe("TRASH");
  });

  it("does not treat C&D as its own leftover tally bucket", () => {
    expect(tallyLabel("C&D")).not.toBe("C&D");
  });

  it("rolls Tires into TRASH like C&D, not a leftover TIRES bucket", () => {
    expect(tallyLabel("Tires")).toBe("TRASH");
    expect(tallyLabel("Tires")).not.toBe("TIRES");
  });
});

describe("commodityRankLabel", () => {
  it("keeps C&D as a display name distinct from the TRASH tally bucket", () => {
    expect(commodityRankLabel("C&D")).toBe("C&D");
    expect(commodityRankLabel("Trash (MSW)")).toBe("Trash (MSW)");
  });

  it("keeps Tires as a display name distinct from the TRASH tally bucket", () => {
    expect(commodityRankLabel("Tires")).toBe("Tires");
  });
});

describe("commodityTone", () => {
  it("keeps Tires on its own color, not the trash tone", () => {
    const tires = commodityTone("Tires");
    const trash = commodityTone("Trash (MSW)");
    expect(tires).not.toEqual(trash);
    expect(tires.fg).toBe("#c4b4e0");
  });
});
