import { describe, expect, it } from "vitest";
import {
  CUSTOM_SPECIALTY_IDS,
  formatCustomSpecialtyChip,
  parseCustomSpecialtyChip,
} from "./customSpecialty";
import {
  isSpecialtyStationId,
  resolveSpecialtyBoardMatch,
  resolveSpecialtyStationId,
  specialtyDestinationsFor,
  specialtyDestHint,
} from "./specialtyBoard";

describe("custom odd-ball specialty cards", () => {
  it("adds four typed-name cards at the end of the board", () => {
    expect(CUSTOM_SPECIALTY_IDS).toEqual([
      "custom-1",
      "custom-2",
      "custom-3",
      "custom-4",
    ]);
    for (const id of CUSTOM_SPECIALTY_IDS) {
      expect(isSpecialtyStationId(id)).toBe(true);
      expect(specialtyDestinationsFor(id)).toEqual([]);
      expect(specialtyDestHint(id)).toMatch(/Leachate/);
    }
  });

  it("stores load type and a typed destination on one chip", () => {
    expect(formatCustomSpecialtyChip("Leachate", "Kankakee")).toBe("Leachate · Kankakee");
    expect(parseCustomSpecialtyChip("Walking-floor · Acme LF")).toEqual({
      loadType: "Walking-floor",
      destination: "Acme LF",
    });
  });

  it("matches a custom pickup name when logging the dest", () => {
    expect(resolveSpecialtyStationId("custom-1", "Odd-ball 1")).toBe("custom-1");
    expect(
      resolveSpecialtyBoardMatch(
        "custom",
        "Odd-ball 1",
        "Kankakee",
        "Leachate (tanker)",
      ),
    ).toMatchObject({
      specialtyId: "custom-1",
    });
  });
});
