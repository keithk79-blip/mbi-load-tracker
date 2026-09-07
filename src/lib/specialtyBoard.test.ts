import { describe, expect, it } from "vitest";
import {
  SPECIALTY_DESTINATIONS,
  SPECIALTY_STATIONS,
  isSpecialtyStationId,
  resolveSpecialtyStationId,
} from "./specialtyBoard";

describe("specialty walking-floor catalog", () => {
  it("includes Liberty as a specialty card with the liberty-tank station id", () => {
    expect(SPECIALTY_STATIONS.find((s) => s.id === "liberty-tank")).toEqual({
      id: "liberty-tank",
      name: "Liberty",
    });
    expect(isSpecialtyStationId("liberty-tank")).toBe(true);
    expect(SPECIALTY_STATIONS.some((s) => s.id === "grayslake")).toBe(false);
    expect(SPECIALTY_STATIONS.some((s) => s.id === "newton-tank")).toBe(false);
  });

  it("offers Groot as a specialty destination chip (Wheeling recycle)", () => {
    expect(SPECIALTY_DESTINATIONS).toContain("Groot");
  });

  it("maps Liberty Tank labels to liberty-tank without treating leachate Liberty as the card", () => {
    expect(resolveSpecialtyStationId("liberty-tank")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId(undefined, "Liberty Tank")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("custom", "Liberty")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("liberty", "Liberty")).toBeNull();
    expect(resolveSpecialtyStationId("wheeling", "Wheeling")).toBe("wheeling");
  });
});
