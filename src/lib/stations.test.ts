import { describe, expect, it } from "vitest";
import {
  FREQUENT_STATION_IDS,
  STATIONS,
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
});





