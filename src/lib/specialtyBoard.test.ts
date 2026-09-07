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
    expect(specialtyDestinationsFor("ford")).toEqual([...SPECIALTY_DESTINATIONS]);
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

  it("lists only Hodgkins, DeKalb, Covanta, RSI, Prairie Hill, Lake Co MRF, DuPage on Elgin specialty chips", () => {
    expect(specialtyDestinationsFor("elgin")).toEqual([
      "Hodgkins",
      "DeKalb",
      "Covanta",
      "RSI",
      "Prairie Hill",
      "Lake Co MRF",
      "DuPage",
    ]);
    expect(specialtyDestinationsFor("elgin")).not.toContain("Rockford");
    expect(specialtyDestinationsFor("elgin")).not.toContain("Homewood");
    expect(specialtyDestinationsFor("elgin")).not.toContain("Newton County");
    expect(applyPickupCascade("elgin", "Trash (MSW)", "Rockford")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists only Hodgkins, RSI, Willow Ranch, Homewood on Melrose specialty chips", () => {
    expect(specialtyDestinationsFor("melrose")).toEqual([
      "Hodgkins",
      "RSI",
      "Willow Ranch",
      "Homewood",
    ]);
    expect(specialtyDestinationsFor("melrose")).not.toContain("Covanta");
    expect(specialtyDestinationsFor("melrose")).not.toContain("Liberty");
    expect(specialtyDestinationsFor("melrose")).not.toContain("Rockford");
    expect(applyPickupCascade("melrose", "Wood", "Covanta")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("melrose", "Recycle", "Homewood")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists only Hodgkins, Lake Co MRF, RSI on Batavia specialty chips", () => {
    expect(specialtyDestinationsFor("batavia")).toEqual([
      "Hodgkins",
      "Lake Co MRF",
      "RSI",
    ]);
    expect(specialtyDestinationsFor("batavia")).not.toContain("DeKalb");
    expect(specialtyDestinationsFor("batavia")).not.toContain("Rockford");
    expect(specialtyDestinationsFor("batavia")).not.toContain("Resource MGT");
    expect(applyPickupCascade("batavia", "Recycle", "Resource MGT")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists only Hodgkins, Thelens, Organix on the N. Lake specialty card", () => {
    expect(SPECIALTY_STATIONS.find((s) => s.id === "northlake")).toEqual({
      id: "northlake",
      name: "N. Lake",
    });
    expect(specialtyDestinationsFor("northlake")).toEqual([
      "Hodgkins",
      "Thelens",
      "Organix",
    ]);
    expect(specialtyDestinationsFor("northlake")).not.toContain("Newton County");
    expect(specialtyDestinationsFor("northlake")).not.toContain("Pontiac");
    expect(specialtyDestinationsFor("northlake")).not.toContain("Winnebago");
    expect(resolveSpecialtyStationId("northlake", "Northlake")).toBe("northlake");
    expect(resolveSpecialtyStationId(undefined, "N. Lake")).toBe("northlake");
    expect(applyPickupCascade("northlake", "Trash (MSW)", "Newton County")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists only Organix, Hodgkins, Thelens, Resource MGT on Arc specialty chips", () => {
    expect(specialtyDestinationsFor("arc")).toEqual([
      "Organix",
      "Hodgkins",
      "Thelens",
      "Resource MGT",
    ]);
    expect(specialtyDestinationsFor("arc")).not.toContain("Winnebago");
    expect(specialtyDestinationsFor("arc")).not.toContain("Pontiac");
    expect(applyPickupCascade("arc", "Yard Waste", "Winnebago")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("arc", "Recycle", "Resource MGT")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists Joyce Farms, Hodgkins, WCN MRF, Homewood, Pontiac, Loop on Citi Waste specialty chips", () => {
    expect(SPECIALTY_STATIONS.find((s) => s.id === "citiwaste")).toEqual({
      id: "citiwaste",
      name: "Citi Waste",
    });
    expect(specialtyDestinationsFor("citiwaste")).toEqual([
      "Joyce Farms",
      "Hodgkins",
      "WCN MRF",
      "Homewood",
      "Pontiac",
      "Loop",
    ]);
    expect(resolveSpecialtyStationId(undefined, "Citi Waste")).toBe("citiwaste");
    expect(resolveSpecialtyStationId("citiwaste", "Citiwaste")).toBe("citiwaste");
  });

  it("lists only Homewood on Schererville specialty chips", () => {
    expect(specialtyDestinationsFor("schererville")).toEqual(["Homewood"]);
    expect(specialtyDestinationsFor("schererville")).not.toContain("Newton County");
    expect(applyPickupCascade("schererville", "Trash (MSW)", "Newton County")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("schererville", "Recycle", "Homewood")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists only Christianson Farms on McCook specialty chips and log-load", () => {
    expect(specialtyDestinationsFor("mccook")).toEqual(["Christianson Farms"]);
    expect(specialtyDestinationsFor("mccook")).not.toContain("Hodgkins");
    expect(applyPickupCascade("mccook", "Trash (MSW)", "Hodgkins")).toEqual({
      commodity: "Trash (MSW)",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("mccook", "Yard Waste", "Christianson Farms")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists only Hodgkins and RSI on Dekalb Reload specialty chips and log-load", () => {
    expect(specialtyDestinationsFor("dekalb-reload")).toEqual(["Hodgkins", "RSI"]);
    expect(specialtyDestinationsFor("dekalb-reload")).not.toContain("Homewood");
    expect(applyPickupCascade("dekalb-reload", "Recycle", "Organix")).toEqual({
      commodity: "Recycle",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("dekalb-reload", "Trash (MSW)", "Hodgkins")).toMatchObject({
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
