import { describe, expect, it } from "vitest";
import {
  FREQUENT_STATION_IDS,
  STATIONS,
  STATION_BY_NAME,
  commoditiesFor,
  destinationsFor,
} from "../data/stations";

describe("pickup stations", () => {
  it("includes Liberty leachate plus DeKalb, Prairie Hill RFD, GraysLake, and Laraway", () => {
    expect(STATIONS).toHaveLength(30);
    expect(FREQUENT_STATION_IDS).toContain("liberty");
    expect(FREQUENT_STATION_IDS).toContain("dekalb");
    expect(FREQUENT_STATION_IDS).toContain("prairie-hill-rfd");
    expect(FREQUENT_STATION_IDS).toContain("grayslake");
    expect(FREQUENT_STATION_IDS).toContain("laraway");

    expect(commoditiesFor("liberty")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("liberty")).toEqual(["CID", "Kankakee", "Reworld"]);

    expect(commoditiesFor("dekalb")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("dekalb")).toEqual(["Dekalb Sanitary", "Rochelle WWTP"]);

    expect(commoditiesFor("prairie-hill-rfd")).toEqual([
      "Leachate (tanker)",
      "Yard Waste",
    ]);
    expect(destinationsFor("prairie-hill-rfd")).toEqual([
      "Rochelle WWTP",
      "Dixon WWTP",
      "CID",
      "Dekalb Sanitary",
      "Dekalb",
    ]);

    expect(commoditiesFor("grayslake")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("grayslake")).toEqual(["FRWRD", "CID", "Dekalb Sanitary"]);

    expect(commoditiesFor("laraway")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("laraway")).toEqual(["CID", "Kankakee"]);
  });

  it("allows Wheeling recycle to Groot", () => {
    expect(commoditiesFor("wheeling")).toContain("Recycle");
    expect(destinationsFor("wheeling")).toContain("Groot");
  });

  it("allows Wheeling recycle to GraysLake without adding it to other pickups", () => {
    expect(STATION_BY_NAME["grays lake"]?.id).toBe("grayslake");
    expect(STATION_BY_NAME.grayslake?.id).toBe("grayslake");
    expect(commoditiesFor("wheeling")).toContain("Recycle");
    expect(destinationsFor("wheeling", "Recycle")).toContain("Groot");
    expect(destinationsFor("wheeling", "Recycle")).toContain("GraysLake");
    expect(destinationsFor("wheeling", "Trash (MSW)")).not.toContain("GraysLake");
    expect(destinationsFor("wheeling", "Yard Waste")).not.toContain("GraysLake");
    expect(destinationsFor("wheeling")).not.toContain("GraysLake");

    for (const station of STATIONS) {
      if (station.id === "wheeling") continue;
      expect(destinationsFor(station.id)).not.toContain("GraysLake");
      expect(destinationsFor(station.id, "Recycle")).not.toContain("GraysLake");
    }
  });

  it("restricts Gray Tank to leachate → FRWRD, CID, Dekalb Sanitary", () => {
    expect(commoditiesFor("gray-tank")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("gray-tank")).toEqual(["FRWRD", "CID", "Dekalb Sanitary"]);
  });

  it("restricts Hearthside to Trash (MSW) → Newton County", () => {
    expect(STATION_BY_NAME.hearthside?.id).toBe("herthside");
    expect(STATION_BY_NAME.herthside?.id).toBe("herthside");
    expect(commoditiesFor("herthside")).toEqual(["Trash (MSW)"]);
    expect(destinationsFor("herthside")).toEqual(["Newton County"]);
    expect(destinationsFor("herthside", "Trash (MSW)")).toEqual(["Newton County"]);
  });

  it("restricts Hodgkins residual/glass dests", () => {
    expect(commoditiesFor("hodgkins")).toEqual(["Residual", "Glass"]);
    expect(destinationsFor("hodgkins")).toEqual([
      "Pontiac",
      "Liberty",
      "Strategic",
      "Resource MGT",
    ]);
    expect(destinationsFor("hodgkins", "Residual")).toEqual(["Pontiac", "Liberty"]);
    expect(destinationsFor("hodgkins", "Glass")).toEqual([
      "Strategic",
      "Resource MGT",
    ]);
  });

  it("keeps Apollo log-load Newton County while specialty chips omit it", () => {
    expect(destinationsFor("apollo")).toEqual([
      "Newton County",
      "Pontiac",
      "Christianson Farms",
      "Hodgkins",
      "Homewood",
      "Organix",
    ]);
  });

  it("tightens McCook and Dekalb Reload dests off the open-ended walking-floor list", () => {
    expect(destinationsFor("mccook")).toEqual(["Christianson Farms"]);
    expect(destinationsFor("dekalb-reload")).toEqual(["Hodgkins", "RSI"]);
  });
});





