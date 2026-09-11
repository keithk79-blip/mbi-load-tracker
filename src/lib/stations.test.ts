import { describe, expect, it } from "vitest";
import {
  FREQUENT_STATION_IDS,
  STATIONS,
  STATION_BY_NAME,
  canonicalDestination,
  commoditiesFor,
  destinationsFor,
  sameDestination,
} from "../data/stations";

describe("pickup stations", () => {
  it("includes Liberty leachate plus DeKalb, Prairie Hill RFD, GraysLake, and Laraway", () => {
    expect(STATIONS).toHaveLength(29);
    expect(FREQUENT_STATION_IDS).toContain("liberty");
    expect(FREQUENT_STATION_IDS).toContain("dekalb");
    expect(FREQUENT_STATION_IDS).toContain("prairie-hill-rfd");
    expect(FREQUENT_STATION_IDS).toContain("grayslake");
    expect(FREQUENT_STATION_IDS).toContain("laraway");

    expect(commoditiesFor("liberty")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("liberty")).toEqual([
      "CID",
      "Kankakee",
      "Reworld",
      "KanSpcl",
      "Sun Chem",
    ]);
    expect(destinationsFor("liberty", "Leachate (tanker)")).toEqual([
      "CID",
      "Kankakee",
      "Reworld",
      "KanSpcl",
      "Sun Chem",
    ]);

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

    expect(commoditiesFor("grayslake")).toEqual(["Leachate (tanker)", "Recycle"]);
    expect(destinationsFor("grayslake")).toEqual([
      "FRWRD",
      "CID",
      "Dekalb Sanitary",
      "Hodgkins",
    ]);
    expect(destinationsFor("grayslake", "Leachate (tanker)")).toEqual([
      "FRWRD",
      "CID",
      "Dekalb Sanitary",
    ]);
    expect(destinationsFor("grayslake", "Leachate (tanker)")).not.toContain("Hodgkins");
    expect(destinationsFor("grayslake", "Recycle")).toEqual(["Hodgkins"]);
    expect(destinationsFor("grayslake", "Recycle")).not.toContain("FRWRD");
    expect(destinationsFor("grayslake", "Recycle")).not.toContain("CID");
    expect(destinationsFor("grayslake", "Recycle")).not.toContain("Dekalb Sanitary");

    expect(commoditiesFor("laraway")).toEqual(["Leachate (tanker)"]);
    expect(destinationsFor("laraway")).toEqual(["CID", "Kankakee"]);

    expect(STATIONS.some((s) => s.id === "gray-tank")).toBe(false);
    expect(STATIONS.some((s) => s.name === "Gray Tank")).toBe(false);
  });

  it("allows Wheeling recycle to Groot, Hodgkins, and Lake Co MRF only", () => {
    expect(commoditiesFor("wheeling")).toEqual([
      "Recycle",
      "Trash (MSW)",
      "Yard Waste",
    ]);
    expect(destinationsFor("wheeling")).toContain("Groot");
    expect(destinationsFor("wheeling", "Recycle")).toEqual([
      "Groot",
      "Hodgkins",
      "Lake Co MRF",
    ]);
  });

  it("drops GraysLake from Wheeling recycle and every other pickup cascade", () => {
    expect(STATION_BY_NAME["grays lake"]?.id).toBe("grayslake");
    expect(STATION_BY_NAME.grayslake?.id).toBe("grayslake");
    expect(destinationsFor("wheeling", "Recycle")).not.toContain("GraysLake");
    expect(destinationsFor("wheeling", "Trash (MSW)")).not.toContain("GraysLake");
    expect(destinationsFor("wheeling", "Yard Waste")).not.toContain("GraysLake");
    expect(destinationsFor("wheeling")).not.toContain("GraysLake");

    for (const station of STATIONS) {
      expect(destinationsFor(station.id)).not.toContain("GraysLake");
      expect(destinationsFor(station.id, "Recycle")).not.toContain("GraysLake");
    }
  });

  it("does not list Gray Tank as a log-load pickup", () => {
    expect(STATIONS.find((s) => s.id === "gray-tank")).toBeUndefined();
    expect(STATION_BY_NAME["gray tank"]).toBeUndefined();
    expect(commoditiesFor("gray-tank")).toEqual([]);
    expect(destinationsFor("gray-tank")).toEqual([]);
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

  it("keeps Apollo log-load Newton County while omitting Hodgkins from the cascade", () => {
    expect(destinationsFor("apollo")).toEqual([
      "Newton County",
      "Pontiac",
      "Christiansen Farms",
      "Homewood",
      "Organix",
    ]);
    expect(destinationsFor("apollo")).not.toContain("Hodgkins");
    expect(destinationsFor("apollo", "Trash (MSW)")).toEqual([
      "Pontiac",
      "Newton County",
    ]);
    expect(destinationsFor("apollo", "Recycle")).toEqual(["Homewood"]);
    expect(destinationsFor("apollo", "Yard Waste")).toEqual([
      "Christiansen Farms",
      "Organix",
    ]);
  });

  it("tightens McCook and Dekalb Reload dests off the open-ended walking-floor list", () => {
    expect(destinationsFor("mccook")).toEqual(["Christiansen Farms"]);
    expect(destinationsFor("dekalb-reload")).toEqual(["Hodgkins", "RSI"]);
  });

  it("maps Christianson Farms to the Christiansen Farms dest chip", () => {
    expect(canonicalDestination("Christianson Farms")).toBe("Christiansen Farms");
    expect(canonicalDestination("christianson farms")).toBe("Christiansen Farms");
    expect(sameDestination("Christianson Farms", "Christiansen Farms")).toBe(true);
    expect(canonicalDestination("Resource")).toBe("Resource MGT");
    expect(sameDestination("Resource", "Resource MGT")).toBe(true);
    expect(canonicalDestination("Dekalb San")).toBe("Dekalb Sanitary");
    expect(sameDestination("Dekalb San", "Dekalb Sanitary")).toBe(true);
  });
});

describe("log-load commodity dest cascades", () => {
  it("locks Chicago Heights trash to Newton County and Pontiac", () => {
    expect(commoditiesFor("chicago-heights")).toEqual(["Trash (MSW)"]);
    expect(destinationsFor("chicago-heights")).toEqual(["Newton County", "Pontiac"]);
    expect(destinationsFor("chicago-heights", "Trash (MSW)")).toEqual([
      "Newton County",
      "Pontiac",
    ]);
  });

  it("locks Calumet trash vs yard waste dests", () => {
    expect(commoditiesFor("calumet")).toEqual(["Trash (MSW)", "Yard Waste"]);
    expect(destinationsFor("calumet", "Trash (MSW)")).toEqual([
      "Newton County",
      "Pontiac",
    ]);
    expect(destinationsFor("calumet", "Yard Waste")).toEqual([
      "Organix",
      "Willow Ranch",
    ]);
    expect(destinationsFor("calumet", "Recycle")).toEqual([]);
  });

  it("locks Medill to trash and yard only", () => {
    expect(commoditiesFor("medill")).toEqual(["Trash (MSW)", "Yard Waste"]);
    expect(commoditiesFor("medill")).not.toContain("Recycle");
    expect(destinationsFor("medill", "Trash (MSW)")).toEqual([
      "Pontiac",
      "Newton County",
    ]);
    expect(destinationsFor("medill", "Yard Waste")).toEqual([
      "Organix",
      "Willow Ranch",
    ]);
    expect(destinationsFor("medill", "Recycle")).toEqual([]);
  });

  it("locks LRS trash, recycle, and C&D dests", () => {
    expect(commoditiesFor("lrs")).toEqual(["Trash (MSW)", "C&D", "Recycle"]);
    expect(destinationsFor("lrs", "Trash (MSW)")).toEqual(["Pontiac"]);
    expect(destinationsFor("lrs", "Recycle")).toEqual(["Dick's San"]);
    expect(destinationsFor("lrs", "C&D")).toEqual(["Ecology", "Pontiac"]);
  });

  it("locks Schererville trash vs recycle dests", () => {
    expect(commoditiesFor("schererville")).toEqual(["Trash (MSW)", "Recycle"]);
    expect(destinationsFor("schererville", "Trash (MSW)")).toEqual([
      "Newton County",
      "County Line",
    ]);
    expect(destinationsFor("schererville", "Recycle")).toEqual(["Homewood"]);
  });

  it("locks Arc dests and uses Resource MGT for recycle", () => {
    expect(commoditiesFor("arc")).toEqual(["Yard Waste", "Trash (MSW)", "Recycle"]);
    expect(destinationsFor("arc")).toEqual([
      "Organix",
      "Winnebago",
      "Hodgkins",
      "Thelens",
      "Pontiac",
      "Resource MGT",
    ]);
    expect(destinationsFor("arc")).not.toContain("Resource");
    expect(destinationsFor("arc", "Trash (MSW)")).toEqual(["Winnebago", "Pontiac"]);
    expect(destinationsFor("arc", "Yard Waste")).toEqual(["Organix", "Thelens"]);
    expect(destinationsFor("arc", "Recycle")).toEqual(["Hodgkins", "Resource MGT"]);
  });

  it("locks Northlake dests per commodity", () => {
    expect(commoditiesFor("northlake")).toEqual([
      "Yard Waste",
      "Recycle",
      "Trash (MSW)",
    ]);
    expect(destinationsFor("northlake", "Trash (MSW)")).toEqual([
      "Winnebago",
      "Newton County",
      "Dixon",
      "Pontiac",
    ]);
    expect(destinationsFor("northlake", "Yard Waste")).toEqual([
      "Thelens",
      "Organix",
    ]);
    expect(destinationsFor("northlake", "Recycle")).toEqual(["Hodgkins"]);
  });

  it("adds Melrose yard waste and gates dests per commodity", () => {
    expect(commoditiesFor("melrose")).toEqual([
      "Wood",
      "Recycle",
      "Trash (MSW)",
      "Cardboard",
      "Yard Waste",
    ]);
    expect(destinationsFor("melrose", "Trash (MSW)")).toEqual([
      "DeKalb",
      "Liberty",
      "Prairie Hill",
      "Covanta",
      "Rockford",
      "Zion",
    ]);
    expect(destinationsFor("melrose", "Recycle")).toEqual(["Hodgkins", "Homewood"]);
    expect(destinationsFor("melrose", "Yard Waste")).toEqual(["Willow Ranch"]);
    expect(destinationsFor("melrose", "Cardboard")).toEqual(["RSI"]);
    expect(destinationsFor("melrose", "Wood")).toEqual([]);
    expect(destinationsFor("melrose")).toContain("Loop Paper");
    expect(destinationsFor("melrose", "Trash (MSW)")).not.toContain("Loop Paper");
  });

  it("locks Batavia dests per commodity", () => {
    expect(commoditiesFor("batavia")).toEqual([
      "Trash (MSW)",
      "Recycle",
      "Cardboard",
    ]);
    expect(destinationsFor("batavia", "Trash (MSW)")).toEqual([
      "DeKalb",
      "Prairie Hill",
      "Rockford",
      "Trash",
    ]);
    expect(destinationsFor("batavia", "Recycle")).toEqual([
      "Hodgkins",
      "Lake Co MRF",
    ]);
    expect(destinationsFor("batavia", "Cardboard")).toEqual(["RSI", "Resource MGT"]);
  });

  it("locks Elgin dests per commodity", () => {
    expect(commoditiesFor("elgin")).toEqual([
      "Trash (MSW)",
      "Recycle",
      "Wood",
      "Cardboard",
    ]);
    expect(destinationsFor("elgin", "Trash (MSW)")).toEqual([
      "DeKalb",
      "Covanta",
      "Rockford",
      "Prairie Hill",
    ]);
    expect(destinationsFor("elgin", "Recycle")).toEqual([
      "Hodgkins",
      "RSI",
      "Lake Co MRF",
    ]);
    expect(destinationsFor("elgin", "Wood")).toEqual(["DeKalb"]);
    expect(destinationsFor("elgin", "Cardboard")).toEqual(["Lake Co MRF", "DuPage"]);
  });

  it("locks Evanston trash dests", () => {
    expect(commoditiesFor("evanston")).toEqual(["Trash (MSW)"]);
    expect(destinationsFor("evanston", "Trash (MSW)")).toEqual([
      "Rockford",
      "DeKalb",
      "Zion",
    ]);
  });

  it("locks Hooker Street trash vs recycle dests", () => {
    expect(commoditiesFor("hooker-street")).toEqual(["Trash (MSW)", "Recycle"]);
    expect(destinationsFor("hooker-street", "Trash (MSW)")).toEqual([
      "DeKalb",
      "Liberty",
      "Rockford",
      "Winnebago",
      "Prairie View",
    ]);
    expect(destinationsFor("hooker-street", "Recycle")).toEqual(["RSI", "Hodgkins"]);
  });

  it("locks Wheeling dests and offers Prairie Hill RFD on trash only", () => {
    expect(destinationsFor("wheeling")).toContain("Prairie Hill");
    expect(destinationsFor("wheeling")).toContain("Prairie Hill RFD");
    expect(destinationsFor("wheeling", "Trash (MSW)")).toEqual([
      "DeKalb",
      "Rockford",
      "Liberty",
      "Zion",
      "Prairie Hill RFD",
    ]);
    expect(destinationsFor("wheeling", "Yard Waste")).toEqual([
      "Thelens",
      "Willow Ranch",
    ]);
    expect(destinationsFor("wheeling", "Recycle")).not.toContain("Prairie Hill");
    expect(destinationsFor("wheeling", "Recycle")).not.toContain("Prairie Hill RFD");
    expect(destinationsFor("wheeling", "Trash (MSW)")).not.toContain("Prairie Hill");
    expect(destinationsFor("wheeling", "Yard Waste")).not.toContain("Prairie Hill");
    expect(destinationsFor("wheeling", "Yard Waste")).not.toContain("Prairie Hill RFD");
  });

  it("allows both Tri-State commodities to Liberty and Prairie View", () => {
    expect(commoditiesFor("tri-state")).toEqual(["Trash (MSW)", "Tires"]);
    expect(destinationsFor("tri-state", "Trash (MSW)")).toEqual([
      "Liberty",
      "Prairie View",
    ]);
    expect(destinationsFor("tri-state", "Tires")).toEqual([
      "Liberty",
      "Prairie View",
    ]);
  });

  it("locks Citiwaste dests per commodity", () => {
    expect(commoditiesFor("citiwaste")).toEqual(["Yard Waste", "Recycle", "C&D"]);
    expect(destinationsFor("citiwaste", "C&D")).toEqual(["Pontiac", "Loop"]);
    expect(destinationsFor("citiwaste", "Yard Waste")).toEqual(["Joyce Farms"]);
    expect(destinationsFor("citiwaste", "Recycle")).toEqual([
      "Hodgkins",
      "WCN MRF",
      "Homewood",
    ]);
  });

  it("locks GraysLake leachate dests and Recycle → Hodgkins", () => {
    expect(commoditiesFor("grayslake")).toEqual(["Leachate (tanker)", "Recycle"]);
    expect(destinationsFor("grayslake", "Leachate (tanker)")).toEqual([
      "FRWRD",
      "CID",
      "Dekalb Sanitary",
    ]);
    expect(destinationsFor("grayslake", "Recycle")).toEqual(["Hodgkins"]);
    expect(destinationsFor("grayslake", "Leachate (tanker)")).not.toContain("Hodgkins");
    expect(destinationsFor("grayslake", "Recycle")).not.toContain("FRWRD");
  });

  it("locks Roscoe trash vs recycle dests", () => {
    expect(commoditiesFor("roscoe")).toEqual(["Trash (MSW)", "Recycle"]);
    expect(destinationsFor("roscoe", "Trash (MSW)")).toEqual(["Rockford"]);
    expect(destinationsFor("roscoe", "Recycle")).toEqual(["Lake Co MRF", "Hodgkins"]);
  });

  it("leaves Rockdale, Ford, and Liberty leachate dests unchanged", () => {
    expect(destinationsFor("rockdale")).toEqual([
      "Willow Ranch",
      "Hodgkins",
      "Prairie View",
      "RSI",
      "Pontiac",
      "Homewood",
    ]);
    expect(destinationsFor("ford")).toEqual([
      "RSI",
      "Hodgkins",
      "Homewood",
      "DeKalb",
      "CID",
      "Kankakee",
      "Rockford",
      "Prairie Hill",
      "Pontiac",
      "Liberty",
      "Newton County",
      "Covanta",
      "Loop",
      "Willow Ranch",
      "Organix",
    ]);
    expect(destinationsFor("liberty")).toEqual([
      "CID",
      "Kankakee",
      "Reworld",
      "KanSpcl",
      "Sun Chem",
    ]);
  });
});
