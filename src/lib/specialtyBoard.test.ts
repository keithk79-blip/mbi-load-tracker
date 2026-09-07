import { describe, expect, it } from "vitest";
import { applyPickupCascade } from "./cascade";
import {
  SPECIALTY_DESTINATIONS,
  SPECIALTY_STATIONS,
  isSpecialtyStationId,
  resolveSpecialtyStationId,
  specialtyDestinationsFor,
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
    expect(specialtyDestinationsFor("wheeling")).toContain("Groot");
  });

  it("lists only leachate dests on the Gray Tank specialty card", () => {
    expect(specialtyDestinationsFor("gray-tank")).toEqual([
      "FRWRD",
      "CID",
      "Dekalb Sanitary",
    ]);
    expect(specialtyDestinationsFor("gray-tank")).not.toContain("Hodgkins");
    expect(specialtyDestinationsFor("gray-tank")).not.toContain("RSI");
    expect(specialtyDestinationsFor("elgin")).toEqual([...SPECIALTY_DESTINATIONS]);
  });

  it("cascades Gray Tank log-load to leachate dests only", () => {
    expect(applyPickupCascade("gray-tank", "Recycle", "Hodgkins")).toEqual({
      commodity: "",
      destination: "",
      commodityValid: false,
      destinationValid: false,
    });
    expect(applyPickupCascade("gray-tank", "Leachate (tanker)", "FRWRD")).toEqual({
      commodity: "Leachate (tanker)",
      destination: "FRWRD",
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("gray-tank", "Leachate (tanker)", "CID")).toMatchObject({
      destinationValid: true,
    });
    expect(
      applyPickupCascade("gray-tank", "Leachate (tanker)", "Dekalb Sanitary"),
    ).toMatchObject({ destinationValid: true });
  });

  it("lists only Newton County on the Hearthside specialty card", () => {
    expect(SPECIALTY_STATIONS.find((s) => s.id === "herthside")).toEqual({
      id: "herthside",
      name: "Hearthside",
    });
    expect(specialtyDestinationsFor("herthside")).toEqual(["Newton County"]);
    expect(specialtyDestinationsFor("herthside")).not.toContain("RSI");
    expect(resolveSpecialtyStationId(undefined, "Hearthside")).toBe("herthside");
    expect(resolveSpecialtyStationId(undefined, "Herthside")).toBe("herthside");
    expect(applyPickupCascade("herthside", "Recycle", "Hodgkins")).toEqual({
      commodity: "",
      destination: "",
      commodityValid: false,
      destinationValid: false,
    });
    expect(applyPickupCascade("herthside", "Trash (MSW)", "Newton County")).toEqual({
      commodity: "Trash (MSW)",
      destination: "Newton County",
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists Hodgkins residual/glass dests on specialty chips and cascade", () => {
    expect(specialtyDestinationsFor("hodgkins")).toEqual([
      "Pontiac",
      "Liberty",
      "Strategic",
      "Resource MGT",
    ]);
    expect(specialtyDestinationsFor("hodgkins")).not.toContain("RSI");
    expect(applyPickupCascade("hodgkins", "Residual", "Pontiac")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("hodgkins", "Residual", "Strategic")).toEqual({
      commodity: "Residual",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("hodgkins", "Glass", "Resource MGT")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("hodgkins", "Glass", "Liberty")).toEqual({
      commodity: "Glass",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
  });

  it("lists only Pontiac, Christianson Farms, Organix, Homewood on Apollo specialty chips", () => {
    expect(specialtyDestinationsFor("apollo")).toEqual([
      "Pontiac",
      "Christianson Farms",
      "Organix",
      "Homewood",
    ]);
    expect(specialtyDestinationsFor("apollo")).not.toContain("Newton County");
    expect(specialtyDestinationsFor("apollo")).not.toContain("Hodgkins");
    expect(applyPickupCascade("apollo", "Trash (MSW)", "Newton County")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("apollo", "Yard Waste", "Organix")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("maps Liberty Tank labels to liberty-tank without treating leachate Liberty as the card", () => {
    expect(resolveSpecialtyStationId("liberty-tank")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId(undefined, "Liberty Tank")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("custom", "Liberty")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("liberty", "Liberty")).toBeNull();
    expect(resolveSpecialtyStationId("wheeling", "Wheeling")).toBe("wheeling");
  });
});
