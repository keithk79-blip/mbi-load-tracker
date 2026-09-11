import { describe, expect, it } from "vitest";
import { commodityRankLabel, tallyLabel } from "./commodity";

describe("tallyLabel", () => {
  it("rolls C&D into TRASH like the Dispatch Board sheet Total MSW", () => {
    expect(tallyLabel("C&D")).toBe("TRASH");
    expect(tallyLabel("Trash (MSW)")).toBe("TRASH");
    expect(tallyLabel("MSW")).toBe("TRASH");
  });

  it("does not treat C&D as its own leftover tally bucket", () => {
    expect(tallyLabel("C&D")).not.toBe("C&D");
  });
});

describe("commodityRankLabel", () => {
  it("keeps C&D as a display name distinct from the TRASH tally bucket", () => {
    expect(commodityRankLabel("C&D")).toBe("C&D");
    expect(commodityRankLabel("Trash (MSW)")).toBe("Trash (MSW)");
  });
});
