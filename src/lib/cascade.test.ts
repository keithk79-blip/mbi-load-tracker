import { describe, expect, it } from "vitest";
import { applyPickupCascade } from "./cascade";

function expectKeep(
  stationId: string,
  commodity: string,
  destination: string,
) {
  expect(applyPickupCascade(stationId, commodity, destination)).toEqual({
    commodity,
    destination,
    commodityValid: true,
    destinationValid: true,
  });
}

function expectClearDest(
  stationId: string,
  commodity: string,
  destination: string,
) {
  expect(applyPickupCascade(stationId, commodity, destination)).toEqual({
    commodity,
    destination: "",
    commodityValid: true,
    destinationValid: false,
  });
}

describe("applyPickupCascade log-load dest locks", () => {
  it("keeps custom pickups unfiltered", () => {
    expect(applyPickupCascade("custom", "Mystery", "Anywhere")).toEqual({
      commodity: "Mystery",
      destination: "Anywhere",
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("clears a dest that is not valid for the selected commodity", () => {
    expectClearDest("calumet", "Trash (MSW)", "Organix");
    expectClearDest("calumet", "Yard Waste", "Pontiac");
  });

  it("clears an invalid commodity and then the dest", () => {
    expect(applyPickupCascade("chicago-heights", "Recycle", "Homewood")).toEqual({
      commodity: "",
      destination: "",
      commodityValid: false,
      destinationValid: false,
    });
  });

  it("Chicago Heights: trash → Newton County, Pontiac", () => {
    expectKeep("chicago-heights", "Trash (MSW)", "Newton County");
    expectKeep("chicago-heights", "Trash (MSW)", "Pontiac");
  });

  it("Calumet: trash vs yard waste dests", () => {
    expectKeep("calumet", "Trash (MSW)", "Newton County");
    expectKeep("calumet", "Trash (MSW)", "Pontiac");
    expectKeep("calumet", "Yard Waste", "Organix");
    expectKeep("calumet", "Yard Waste", "Willow Ranch");
    expectClearDest("calumet", "Trash (MSW)", "Willow Ranch");
  });

  it("Apollo: trash, recycle, yard; Hodgkins is not offered", () => {
    expectKeep("apollo", "Trash (MSW)", "Pontiac");
    expectKeep("apollo", "Trash (MSW)", "Newton County");
    expectKeep("apollo", "Recycle", "Homewood");
    expectKeep("apollo", "Yard Waste", "Christiansen Farms");
    expectKeep("apollo", "Yard Waste", "Organix");
    expectKeep("apollo", "Yard Waste", "Christianson Farms");
    expectClearDest("apollo", "Trash (MSW)", "Homewood");
    expectClearDest("apollo", "Recycle", "Pontiac");
    expectClearDest("apollo", "Yard Waste", "Hodgkins");
    expectClearDest("apollo", "Trash (MSW)", "Hodgkins");
    expectClearDest("apollo", "Recycle", "Hodgkins");
  });

  it("Medill: trash and yard only; recycle dests stay empty", () => {
    expectKeep("medill", "Trash (MSW)", "Pontiac");
    expectKeep("medill", "Trash (MSW)", "Newton County");
    expectKeep("medill", "Yard Waste", "Organix");
    expectKeep("medill", "Yard Waste", "Willow Ranch");
    expectClearDest("medill", "Trash (MSW)", "Organix");
    expect(applyPickupCascade("medill", "Recycle", "Homewood")).toEqual({
      commodity: "",
      destination: "",
      commodityValid: false,
      destinationValid: false,
    });
  });

  it("LRS: trash Pontiac, recycle Dick's San, C&D Ecology/Pontiac", () => {
    expectKeep("lrs", "Trash (MSW)", "Pontiac");
    expectKeep("lrs", "Recycle", "Dick's San");
    expectKeep("lrs", "C&D", "Ecology");
    expectKeep("lrs", "C&D", "Pontiac");
    expectClearDest("lrs", "Trash (MSW)", "Ecology");
    expectClearDest("lrs", "Recycle", "Pontiac");
    expectClearDest("lrs", "C&D", "Dick's San");
  });

  it("Schererville: trash Newton County/County Line, recycle Homewood", () => {
    expectKeep("schererville", "Trash (MSW)", "Newton County");
    expectKeep("schererville", "Trash (MSW)", "County Line");
    expectKeep("schererville", "Recycle", "Homewood");
    expectClearDest("schererville", "Trash (MSW)", "Homewood");
    expectClearDest("schererville", "Recycle", "Newton County");
  });

  it("Arc: trash, yard, recycle including Resource alias", () => {
    expectKeep("arc", "Trash (MSW)", "Winnebago");
    expectKeep("arc", "Trash (MSW)", "Pontiac");
    expectKeep("arc", "Yard Waste", "Organix");
    expectKeep("arc", "Yard Waste", "Thelens");
    expectKeep("arc", "Recycle", "Hodgkins");
    expectKeep("arc", "Recycle", "Resource MGT");
    expectKeep("arc", "Recycle", "Resource");
    expectClearDest("arc", "Yard Waste", "Winnebago");
    expectClearDest("arc", "Trash (MSW)", "Hodgkins");
    expectClearDest("arc", "Recycle", "Pontiac");
  });

  it("Northlake: trash, yard, recycle dests", () => {
    expectKeep("northlake", "Trash (MSW)", "Winnebago");
    expectKeep("northlake", "Trash (MSW)", "Newton County");
    expectKeep("northlake", "Trash (MSW)", "Dixon");
    expectKeep("northlake", "Trash (MSW)", "Pontiac");
    expectKeep("northlake", "Yard Waste", "Thelens");
    expectKeep("northlake", "Yard Waste", "Organix");
    expectKeep("northlake", "Recycle", "Hodgkins");
    expectClearDest("northlake", "Recycle", "Pontiac");
    expectClearDest("northlake", "Yard Waste", "Dixon");
    expectClearDest("northlake", "Trash (MSW)", "Hodgkins");
  });

  it("Melrose: trash, recycle, yard, cardboard; wood has no dests", () => {
    expectKeep("melrose", "Trash (MSW)", "DeKalb");
    expectKeep("melrose", "Trash (MSW)", "Liberty");
    expectKeep("melrose", "Trash (MSW)", "Prairie Hill");
    expectKeep("melrose", "Trash (MSW)", "Covanta");
    expectKeep("melrose", "Trash (MSW)", "Rockford");
    expectKeep("melrose", "Trash (MSW)", "Zion");
    expectKeep("melrose", "Recycle", "Hodgkins");
    expectKeep("melrose", "Recycle", "Homewood");
    expectKeep("melrose", "Yard Waste", "Willow Ranch");
    expectKeep("melrose", "Cardboard", "RSI");
    expectClearDest("melrose", "Wood", "Covanta");
    expectClearDest("melrose", "Wood", "Loop Paper");
    expectClearDest("melrose", "Cardboard", "Hodgkins");
    expectClearDest("melrose", "Yard Waste", "RSI");
    expectClearDest("melrose", "Recycle", "Rockford");
    expectClearDest("melrose", "Trash (MSW)", "Willow Ranch");
  });

  it("Batavia: trash, recycle, cardboard dests", () => {
    expectKeep("batavia", "Trash (MSW)", "DeKalb");
    expectKeep("batavia", "Trash (MSW)", "Prairie Hill");
    expectKeep("batavia", "Trash (MSW)", "Rockford");
    expectKeep("batavia", "Trash (MSW)", "Trash");
    expectKeep("batavia", "Recycle", "Hodgkins");
    expectKeep("batavia", "Recycle", "Lake Co MRF");
    expectKeep("batavia", "Cardboard", "RSI");
    expectKeep("batavia", "Cardboard", "Resource MGT");
    expectClearDest("batavia", "Recycle", "Resource MGT");
    expectClearDest("batavia", "Trash (MSW)", "Hodgkins");
  });

  it("Elgin: trash, recycle, wood, cardboard dests", () => {
    expectKeep("elgin", "Trash (MSW)", "DeKalb");
    expectKeep("elgin", "Trash (MSW)", "Covanta");
    expectKeep("elgin", "Trash (MSW)", "Rockford");
    expectKeep("elgin", "Trash (MSW)", "Prairie Hill");
    expectKeep("elgin", "Recycle", "Hodgkins");
    expectKeep("elgin", "Recycle", "RSI");
    expectKeep("elgin", "Recycle", "Lake Co MRF");
    expectKeep("elgin", "Wood", "DeKalb");
    expectKeep("elgin", "Cardboard", "Lake Co MRF");
    expectKeep("elgin", "Cardboard", "DuPage");
    expectClearDest("elgin", "Wood", "Rockford");
    expectClearDest("elgin", "Trash (MSW)", "Hodgkins");
    expectClearDest("elgin", "Cardboard", "RSI");
  });

  it("Evanston: trash → Rockford, DeKalb, Zion", () => {
    expectKeep("evanston", "Trash (MSW)", "Rockford");
    expectKeep("evanston", "Trash (MSW)", "DeKalb");
    expectKeep("evanston", "Trash (MSW)", "Zion");
  });

  it("Hooker Street: trash vs recycle dests", () => {
    expectKeep("hooker-street", "Trash (MSW)", "DeKalb");
    expectKeep("hooker-street", "Trash (MSW)", "Liberty");
    expectKeep("hooker-street", "Trash (MSW)", "Rockford");
    expectKeep("hooker-street", "Trash (MSW)", "Winnebago");
    expectKeep("hooker-street", "Trash (MSW)", "Prairie View");
    expectKeep("hooker-street", "Recycle", "RSI");
    expectKeep("hooker-street", "Recycle", "Hodgkins");
    expectClearDest("hooker-street", "Trash (MSW)", "Hodgkins");
    expectClearDest("hooker-street", "Recycle", "Liberty");
  });

  it("Wheeling: recycle no longer includes GraysLake", () => {
    expectKeep("wheeling", "Recycle", "Groot");
    expectKeep("wheeling", "Recycle", "Hodgkins");
    expectKeep("wheeling", "Recycle", "Lake Co MRF");
    expectKeep("wheeling", "Trash (MSW)", "DeKalb");
    expectKeep("wheeling", "Trash (MSW)", "Rockford");
    expectKeep("wheeling", "Trash (MSW)", "Liberty");
    expectKeep("wheeling", "Trash (MSW)", "Zion");
    expectKeep("wheeling", "Trash (MSW)", "Prairie Hill RFD");
    expectClearDest("wheeling", "Trash (MSW)", "Prairie Hill");
    expectKeep("wheeling", "Yard Waste", "Thelens");
    expectKeep("wheeling", "Yard Waste", "Willow Ranch");
    expectClearDest("wheeling", "Recycle", "GraysLake");
    expectClearDest("wheeling", "Trash (MSW)", "GraysLake");
    expectClearDest("wheeling", "Yard Waste", "GraysLake");
    expectClearDest("wheeling", "Recycle", "DeKalb");
    expectClearDest("wheeling", "Recycle", "Prairie Hill RFD");
    expectClearDest("wheeling", "Trash (MSW)", "Groot");
    expectClearDest("wheeling", "Yard Waste", "Hodgkins");
    expectClearDest("wheeling", "Yard Waste", "Prairie Hill RFD");
  });

  it("Tri-State: trash and tires share Liberty and Prairie View", () => {
    expectKeep("tri-state", "Trash (MSW)", "Liberty");
    expectKeep("tri-state", "Trash (MSW)", "Prairie View");
    expectKeep("tri-state", "Tires", "Liberty");
    expectKeep("tri-state", "Tires", "Prairie View");
  });

  it("Citiwaste: C&D, yard, recycle dests", () => {
    expectKeep("citiwaste", "C&D", "Pontiac");
    expectKeep("citiwaste", "C&D", "Loop");
    expectKeep("citiwaste", "Yard Waste", "Joyce Farms");
    expectKeep("citiwaste", "Recycle", "Hodgkins");
    expectKeep("citiwaste", "Recycle", "WCN MRF");
    expectKeep("citiwaste", "Recycle", "Homewood");
    expectClearDest("citiwaste", "Yard Waste", "Pontiac");
    expectClearDest("citiwaste", "Recycle", "Loop");
    expectClearDest("citiwaste", "C&D", "Joyce Farms");
  });

  it("Roscoe: trash Rockford only, recycle Lake Co MRF/Hodgkins", () => {
    expectKeep("roscoe", "Trash (MSW)", "Rockford");
    expectKeep("roscoe", "Recycle", "Lake Co MRF");
    expectKeep("roscoe", "Recycle", "Hodgkins");
    expectClearDest("roscoe", "Trash (MSW)", "Hodgkins");
    expectClearDest("roscoe", "Recycle", "Rockford");
  });

  it("McCook still accepts the Christianson Farms alias", () => {
    expectKeep("mccook", "Yard Waste", "Christiansen Farms");
    expectKeep("mccook", "Yard Waste", "Christianson Farms");
    expectClearDest("mccook", "Trash (MSW)", "Hodgkins");
  });
});
