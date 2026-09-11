import { describe, expect, it } from "vitest";
import { STATION_BY_ID } from "../data/stations";
import { applyPickupCascade } from "./cascade";
import {
  SPECIALTY_DESTINATIONS,
  SPECIALTY_STATIONS,
  addSpecialtySlot,
  applySpecialtyTombstones,
  consumeSpecialtyOpens,
  consumeSpecialtyOpensAny,
  consumeSpecialtyOpensTracked,
  countSpecialtyOpens,
  destKeepAfterChange,
  isSpecialtyStationId,
  mergeSpecialtyStores,
  missingSpecialtyOpensWarn,
  omitSpecialtyIds,
  reconcileSpecialtyCloud,
  remainingSpecialtySlotIds,
  removeSpecialtySlot,
  resolveSpecialtyBoardLane,
  resolveSpecialtyBoardMatch,
  resolveSpecialtyStationId,
  specialtyChipMode,
  specialtyDestHint,
  specialtyDestinationsFor,
  specialtyDestKey,
  unkeptSpecialtyIds,
  type SpecialtyStore,
} from "./specialtyBoard";

function catalogLogPickup(
  specialtyId: string,
  displayName: string,
): { stationId: string; pickup: string } {
  // Liberty card id is liberty-tank; drivers log the catalog Liberty chip (leachate id).
  if (specialtyId === "liberty-tank") {
    return { stationId: "liberty", pickup: "Liberty" };
  }
  const catalog = STATION_BY_ID[specialtyId];
  return {
    stationId: catalog?.id ?? specialtyId,
    pickup: catalog?.name ?? displayName,
  };
}

function boardCommodityFor(specialtyId: string | null, chip?: string): string {
  if (specialtyId === "liberty-tank" || specialtyId === "grayslake") {
    return "Leachate (tanker)";
  }
  if (specialtyId === "hodgkins") return "Residual";
  if (specialtyId === "herthside") return "Trash (MSW)";
  if (specialtyId && specialtyChipMode(specialtyId) === "commodity") {
    if (chip && specialtyDestinationsFor(specialtyId).some((c) => c === chip)) {
      return chip === "Trash" ? "Trash (MSW)" : chip;
    }
  }
  return "Recycle";
}

function logLoadConsume(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  pickup: string,
  destination: string,
  qty = 1,
  commodity?: string,
): SpecialtyStore {
  const resolved = resolveSpecialtyStationId(stationId, pickup);
  const match = resolveSpecialtyBoardMatch(
    stationId,
    pickup,
    destination,
    commodity ?? boardCommodityFor(resolved, destination),
  );
  if (!match) return store;
  return consumeSpecialtyOpensAny(
    store,
    date,
    match.specialtyId,
    match.chips,
    qty,
  );
}

describe("specialty walking-floor catalog", () => {
  it("includes Liberty as a specialty card with the liberty-tank station id", () => {
    expect(SPECIALTY_STATIONS.find((s) => s.id === "liberty-tank")).toEqual({
      id: "liberty-tank",
      name: "Liberty",
    });
    expect(isSpecialtyStationId("liberty-tank")).toBe(true);
    expect(SPECIALTY_STATIONS.find((s) => s.id === "grayslake")).toEqual({
      id: "grayslake",
      name: "GraysLake",
    });
    expect(SPECIALTY_STATIONS.some((s) => s.id === "gray-tank")).toBe(false);
    expect(SPECIALTY_STATIONS.some((s) => s.name === "Gray Tank")).toBe(false);
    expect(SPECIALTY_STATIONS.some((s) => s.id === "newton-tank")).toBe(false);
  });

  it("lists only Recycle, Yard Waste, Cardboard on Wheeling specialty chips", () => {
    expect(specialtyDestinationsFor("wheeling")).toEqual([
      "Recycle",
      "Yard Waste",
      "Cardboard",
    ]);
    expect(specialtyChipMode("wheeling")).toBe("commodity");
    expect(specialtyDestinationsFor("wheeling")).not.toContain("Hodgkins");
    expect(specialtyDestinationsFor("wheeling")).not.toContain("GraysLake");
    expect(specialtyDestinationsFor("wheeling")).not.toContain("Groot");
    expect(specialtyDestinationsFor("wheeling")).not.toContain("RSI");
    expect(SPECIALTY_DESTINATIONS).toContain("Groot");
    expect(SPECIALTY_DESTINATIONS).not.toContain("GraysLake");
    expect(applyPickupCascade("wheeling", "Recycle", "GraysLake")).toEqual({
      commodity: "Recycle",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("wheeling", "Trash (MSW)", "GraysLake")).toEqual({
      commodity: "Trash (MSW)",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    for (const station of SPECIALTY_STATIONS) {
      expect(specialtyDestinationsFor(station.id)).not.toContain("GraysLake");
    }
  });

  it("lists walking-floor commodity chips on Rockdale, Dekalb, Roscoe, Ford, Prairie Hill", () => {
    expect(specialtyDestinationsFor("rockdale")).toEqual([
      "Recycle",
      "Yard Waste",
      "Cardboard",
    ]);
    expect(specialtyDestinationsFor("dekalb")).toEqual([
      "Wood",
      "Recycle",
      "Yard Waste",
      "C&D",
    ]);
    expect(specialtyDestinationsFor("roscoe")).toEqual(["Recycle"]);
    expect(specialtyDestinationsFor("ford")).toEqual(["Cardboard", "Trash", "Recycle"]);
    expect(specialtyDestinationsFor("prairie-hill")).toEqual(["C&D", "Yard Waste"]);
    for (const id of [
      "wheeling",
      "rockdale",
      "dekalb",
      "roscoe",
      "ford",
      "prairie-hill",
    ]) {
      expect(specialtyChipMode(id)).toBe("commodity");
    }
  });

  it("lists only CID, Kankakee, Reworld, KanSpcl, Sun Chem on Liberty specialty chips", () => {
    expect(specialtyDestinationsFor("liberty-tank")).toEqual([
      "CID",
      "Kankakee",
      "Reworld",
      "KanSpcl",
      "Sun Chem",
    ]);
    expect(specialtyChipMode("liberty-tank")).toBe("destination");
    expect(specialtyDestinationsFor("liberty-tank")).not.toContain("Hodgkins");
    expect(specialtyDestinationsFor("liberty-tank")).not.toContain("RSI");
    expect(applyPickupCascade("liberty", "Leachate (tanker)", "KanSpcl")).toEqual({
      commodity: "Leachate (tanker)",
      destination: "KanSpcl",
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("liberty", "Leachate (tanker)", "Sun Chem")).toMatchObject({
      destinationValid: true,
    });
  });

  it("does not list Gray Tank as a specialty card or log-load pickup", () => {
    expect(SPECIALTY_STATIONS.some((s) => s.id === "gray-tank")).toBe(false);
    expect(isSpecialtyStationId("gray-tank")).toBe(false);
    expect(resolveSpecialtyStationId("gray-tank", "Gray Tank")).toBeNull();
    expect(resolveSpecialtyStationId(undefined, "Gray Tank")).toBeNull();
  });

  it("does not invent a Van Drunen specialty bubble", () => {
    expect(
      SPECIALTY_STATIONS.some((s) =>
        `${s.id}${s.name}`.toLowerCase().includes("drunen"),
      ),
    ).toBe(false);
    expect(isSpecialtyStationId("van-drunen")).toBe(false);
    expect(resolveSpecialtyStationId("van-drunen", "Van Drunen")).toBeNull();
    expect(resolveSpecialtyStationId(undefined, "Van Drunen")).toBeNull();
    expect(resolveSpecialtyStationId(undefined, "Vandrunen")).toBeNull();
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
    expect(
      resolveSpecialtyBoardMatch("apollo", "Apollo", "Christiansen Farms", "Yard Waste"),
    ).toEqual({
      specialtyId: "apollo",
      chip: "Christianson Farms",
      chips: ["Christianson Farms"],
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
    expect(applyPickupCascade("melrose", "Wood", "Covanta")).toEqual({
      commodity: "Wood",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("melrose", "Recycle", "Homewood")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists Hodgkins, Lake Co MRF, RSI, and Trash on Batavia specialty chips", () => {
    expect(specialtyDestinationsFor("batavia")).toEqual([
      "Hodgkins",
      "Lake Co MRF",
      "RSI",
      "Trash",
    ]);
    expect(specialtyDestHint("batavia")).toBe("Hodgkins · Lake Co MRF · RSI · Trash");
    expect(specialtyDestinationsFor("batavia")).not.toContain("DeKalb");
    expect(specialtyDestinationsFor("batavia")).not.toContain("Rockford");
    expect(specialtyDestinationsFor("batavia")).not.toContain("Resource MGT");
    expect(applyPickupCascade("batavia", "Recycle", "Resource MGT")).toEqual({
      commodity: "Recycle",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("batavia", "Trash (MSW)", "Trash")).toEqual({
      commodity: "Trash (MSW)",
      destination: "Trash",
      commodityValid: true,
      destinationValid: true,
    });
  });

  it("lists FRWRD, CID, Dekalb Sanitary on the GraysLake specialty card", () => {
    expect(SPECIALTY_STATIONS.find((s) => s.id === "grayslake")).toEqual({
      id: "grayslake",
      name: "GraysLake",
    });
    expect(specialtyDestinationsFor("grayslake")).toEqual([
      "FRWRD",
      "CID",
      "Dekalb Sanitary",
    ]);
    expect(specialtyDestHint("grayslake")).toBe("FRWRD · CID · Dekalb Sanitary");
    expect(specialtyDestinationsFor("grayslake")).not.toContain("Hodgkins");
    expect(specialtyDestinationsFor("grayslake")).not.toContain("RSI");
    expect(specialtyDestinationsFor("grayslake")).not.toContain("KanSpcl");
    expect(specialtyChipMode("grayslake")).toBe("destination");
    expect(resolveSpecialtyStationId("grayslake", "GraysLake")).toBe("grayslake");
    expect(resolveSpecialtyStationId(undefined, "Grays Lake")).toBe("grayslake");
    expect(applyPickupCascade("grayslake", "Recycle", "Hodgkins")).toEqual({
      commodity: "Recycle",
      destination: "Hodgkins",
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("grayslake", "Leachate (tanker)", "FRWRD")).toEqual({
      commodity: "Leachate (tanker)",
      destination: "FRWRD",
      commodityValid: true,
      destinationValid: true,
    });
    expect(applyPickupCascade("grayslake", "Leachate (tanker)", "CID")).toMatchObject({
      destinationValid: true,
    });
    expect(
      applyPickupCascade("grayslake", "Leachate (tanker)", "Dekalb Sanitary"),
    ).toMatchObject({ destinationValid: true });
    expect(
      applyPickupCascade("grayslake", "Leachate (tanker)", "Dekalb San"),
    ).toMatchObject({ destinationValid: true });
    expect(specialtyDestKey("Dekalb San")).toBe(specialtyDestKey("Dekalb Sanitary"));
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
    expect(applyPickupCascade("arc", "Yard Waste", "Winnebago")).toEqual({
      commodity: "Yard Waste",
      destination: "",
      commodityValid: true,
      destinationValid: false,
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

  it("keeps McCook specialty chips as Christianson Farms and aliases the log-load spelling", () => {
    expect(specialtyDestinationsFor("mccook")).toEqual(["Christianson Farms"]);
    expect(specialtyDestinationsFor("mccook")).not.toContain("Hodgkins");
    expect(applyPickupCascade("mccook", "Trash (MSW)", "Hodgkins")).toEqual({
      commodity: "Trash (MSW)",
      destination: "",
      commodityValid: true,
      destinationValid: false,
    });
    expect(applyPickupCascade("mccook", "Yard Waste", "Christiansen Farms")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
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

  it("maps Liberty catalog and Liberty Tank labels to liberty-tank without a separate card id", () => {
    expect(isSpecialtyStationId("liberty-tank")).toBe(true);
    expect(isSpecialtyStationId("liberty")).toBe(false);
    expect(resolveSpecialtyStationId("liberty-tank")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("liberty", "Liberty")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId(undefined, "Liberty Tank")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("custom", "Liberty")).toBe("liberty-tank");
    expect(resolveSpecialtyStationId("wheeling", "Wheeling")).toBe("wheeling");
    expect(resolveSpecialtyStationId("Wheeling")).toBe("wheeling");
    expect(resolveSpecialtyStationId("herthside", "Hearthside")).toBe("herthside");
    expect(resolveSpecialtyStationId("gray-tank", "Gray Tank")).toBeNull();
    expect(resolveSpecialtyStationId("grayslake", "GraysLake")).toBe("grayslake");
    expect(resolveSpecialtyStationId("laraway", "Laraway")).toBeNull();
    expect(resolveSpecialtyStationId("prairie-hill-rfd", "Prairie Hill RFD")).toBeNull();
  });
});

describe("No Available Loads warn is only for specialty-board lanes", () => {
  const date = "2026-09-08";

  it("does not warn for Northlake Trash → Pontiac (ordinary trash dispatch)", () => {
    expect(
      resolveSpecialtyBoardLane("northlake", "Northlake", "Pontiac", "Trash (MSW)"),
    ).toBeNull();
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "northlake",
        "Northlake",
        "Pontiac",
        "Trash (MSW)",
      ),
    ).toBeNull();
  });

  it("does not consume a Northlake specialty open when logging Trash → Pontiac", () => {
    let store = addSpecialtySlot({}, date, "northlake", "Hodgkins");
    store = logLoadConsume(
      store,
      date,
      "northlake",
      "Northlake",
      "Pontiac",
      1,
      "Trash (MSW)",
    );
    expect(countSpecialtyOpens(store, date, "northlake", "Hodgkins")).toBe(1);
    expect(countSpecialtyOpens(store, date, "northlake", "Pontiac")).toBe(0);
  });

  it("warns for Northlake Recycle → Hodgkins when the board has zero opens", () => {
    expect(
      resolveSpecialtyBoardLane("northlake", "Northlake", "Hodgkins", "Recycle"),
    ).toBe("northlake");
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "northlake",
        "Northlake",
        "Hodgkins",
        "Recycle",
      ),
    ).toEqual({ specialtyId: "northlake", opens: 0 });
  });

  it("does not warn for Northlake Recycle → Hodgkins when an open exists, and consume burns it", () => {
    let store = addSpecialtySlot({}, date, "northlake", "Hodgkins");
    expect(
      missingSpecialtyOpensWarn(
        store,
        date,
        "northlake",
        "Northlake",
        "Hodgkins",
        "Recycle",
      ),
    ).toBeNull();
    store = logLoadConsume(store, date, "northlake", "Northlake", "Hodgkins", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "northlake", "Hodgkins")).toBe(0);
  });

  it("does not warn for Apollo Trash → Pontiac (dest is on the board, commodity is not)", () => {
    expect(
      resolveSpecialtyBoardLane("apollo", "Apollo", "Pontiac", "Trash (MSW)"),
    ).toBeNull();
    expect(
      missingSpecialtyOpensWarn({}, date, "apollo", "Apollo", "Pontiac", "Trash (MSW)"),
    ).toBeNull();
  });

  it("never warns for Trash (MSW) from specialty pickups except Ford, Hearthside, and Batavia→Trash", () => {
    for (const station of SPECIALTY_STATIONS) {
      if (station.id === "ford" || station.id === "herthside") continue;
      const dest = specialtyDestinationsFor(station.id)[0];
      expect(dest).toBeTruthy();
      const log = catalogLogPickup(station.id, station.name);
      expect(
        resolveSpecialtyBoardLane(
          log.stationId,
          log.pickup,
          dest,
          "Trash (MSW)",
        ),
      ).toBeNull();
      expect(
        missingSpecialtyOpensWarn(
          {},
          date,
          log.stationId,
          log.pickup,
          dest,
          "Trash (MSW)",
        ),
      ).toBeNull();
    }
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "wheeling",
        "Wheeling",
        "Groot",
        "Trash (MSW)",
      ),
    ).toBeNull();
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "herthside",
        "Hearthside",
        "Newton County",
        "Trash (MSW)",
      ),
    ).toEqual({ specialtyId: "herthside", opens: 0 });
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "northlake",
        "Northlake",
        "Pontiac",
        "MSW",
      ),
    ).toBeNull();
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "batavia",
        "Batavia",
        "DeKalb",
        "Trash (MSW)",
      ),
    ).toBeNull();
    expect(
      resolveSpecialtyBoardLane("batavia", "Batavia", "Rockford", "Trash (MSW)"),
    ).toBeNull();
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "batavia",
        "Batavia",
        "Trash",
        "Trash (MSW)",
      ),
    ).toEqual({ specialtyId: "batavia", opens: 0 });
  });

  it("treats Ford Trash, Hearthside Newton County, and Batavia→Trash as specialty lanes", () => {
    expect(
      resolveSpecialtyBoardLane("ford", "Ford", "RSI", "Trash (MSW)"),
    ).toBe("ford");
    expect(
      resolveSpecialtyBoardMatch("ford", "Ford", "RSI", "Trash (MSW)"),
    ).toEqual({ specialtyId: "ford", chip: "Trash", chips: ["Trash", "RSI"] });
    expect(
      missingSpecialtyOpensWarn({}, date, "ford", "Ford", "RSI", "Trash (MSW)"),
    ).toEqual({ specialtyId: "ford", opens: 0 });
    expect(
      resolveSpecialtyBoardLane("ford", "Ford", "Hodgkins", "Recycle"),
    ).toBe("ford");
    expect(
      resolveSpecialtyBoardMatch(
        "herthside",
        "Hearthside",
        "Newton County",
        "Trash (MSW)",
      ),
    ).toEqual({
      specialtyId: "herthside",
      chip: "Newton County",
      chips: ["Newton County"],
    });
    expect(
      resolveSpecialtyBoardLane("wheeling", "Wheeling", "Groot", "Trash (MSW)"),
    ).toBeNull();
    expect(
      resolveSpecialtyBoardLane("melrose", "Melrose", "Hodgkins", "Trash (MSW)"),
    ).toBeNull();
    expect(
      resolveSpecialtyBoardMatch("batavia", "Batavia", "Trash", "Trash (MSW)"),
    ).toEqual({
      specialtyId: "batavia",
      chip: "Trash",
      chips: ["Trash"],
    });
    expect(
      resolveSpecialtyBoardLane("batavia", "Batavia", "Prairie Hill", "Trash (MSW)"),
    ).toBeNull();
  });

  it("warns for Wheeling Recycle on the Recycle chip regardless of dest", () => {
    expect(
      resolveSpecialtyBoardMatch("wheeling", "Wheeling", "Groot", "Recycle"),
    ).toEqual({
      specialtyId: "wheeling",
      chip: "Recycle",
      chips: ["Recycle", "Groot"],
    });
    expect(
      resolveSpecialtyBoardMatch("wheeling", "Wheeling", "GraysLake", "Recycle"),
    ).toEqual({
      specialtyId: "wheeling",
      chip: "Recycle",
      chips: ["Recycle", "GraysLake"],
    });
    expect(
      resolveSpecialtyBoardLane("wheeling", "Wheeling", "Hodgkins", "Recycle"),
    ).toBe("wheeling");
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "wheeling",
        "Wheeling",
        "GraysLake",
        "Recycle",
      ),
    ).toEqual({ specialtyId: "wheeling", opens: 0 });
    expect(
      resolveSpecialtyBoardLane("wheeling", "Wheeling", "Groot", "Yard Waste"),
    ).toBe("wheeling");
  });

  it("still warns for Liberty and GraysLake leachate → CID with zero opens, not Gray Tank", () => {
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "liberty",
        "Liberty",
        "CID",
        "Leachate (tanker)",
      ),
    ).toEqual({ specialtyId: "liberty-tank", opens: 0 });
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "grayslake",
        "GraysLake",
        "CID",
        "Leachate (tanker)",
      ),
    ).toEqual({ specialtyId: "grayslake", opens: 0 });
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "gray-tank",
        "Gray Tank",
        "CID",
        "Leachate (tanker)",
      ),
    ).toBeNull();
  });
});

describe("specialty consume on logged loads", () => {
  it("consumes a Wheeling Recycle open when Recycle → Groot is logged", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {};
    store = addSpecialtySlot(store, date, "wheeling", "Recycle");
    store = addSpecialtySlot(store, date, "wheeling", "Yard Waste");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(1);
    expect(applyPickupCascade("wheeling", "Recycle", "Groot")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });

    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Yard Waste")).toBe(1);
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(0);
  });

  it("consumes a legacy Wheeling Groot dest open when Recycle → Groot is logged", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "wheeling", "Groot");
    store = addSpecialtySlot(store, date, "wheeling", "Hodgkins");
    expect(
      missingSpecialtyOpensWarn(
        store,
        date,
        "wheeling",
        "Wheeling",
        "Groot",
        "Recycle",
      ),
    ).toBeNull();

    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Hodgkins")).toBe(1);
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(0);
  });

  it("consumes a legacy Wheeling Hodgkins dest open when Recycle → Hodgkins is logged", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "wheeling", "Groot");
    store = addSpecialtySlot(store, date, "wheeling", "Hodgkins");
    store = logLoadConsume(
      store,
      date,
      "wheeling",
      "Wheeling",
      "Hodgkins",
      1,
      "Recycle",
    );
    expect(countSpecialtyOpens(store, date, "wheeling", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(1);
  });

  it("consumes a legacy Roscoe Hodgkins dest open when Recycle → Hodgkins is logged", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "roscoe", "Hodgkins");
    store = logLoadConsume(store, date, "roscoe", "Roscoe", "Hodgkins", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "roscoe", "Hodgkins")).toBe(0);
  });

  it("prefers a Recycle commodity open over a Groot dest open for qty=1", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "wheeling", "Recycle");
    store = addSpecialtySlot(store, date, "wheeling", "Groot");
    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(1);
  });

  it("qty=2 Recycle → Groot burns Recycle then Groot without double-burning qty=1", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "wheeling", "Recycle");
    store = addSpecialtySlot(store, date, "wheeling", "Groot");
    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 2, "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(0);
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(0);
  });

  it("does not consume a Wheeling Recycle open from a Yard Waste log to the same dest", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "wheeling", "Recycle");
    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 1, "Yard Waste");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(1);
  });

  it("consumes Ford Trash (MSW) against a Trash chip and leaves other stations ungated", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "ford", "Trash");
    store = addSpecialtySlot(store, date, "wheeling", "Recycle");
    store = addSpecialtySlot(store, date, "melrose", "Hodgkins");
    store = logLoadConsume(store, date, "ford", "Ford", "RSI", 1, "Trash (MSW)");
    expect(countSpecialtyOpens(store, date, "ford", "Trash")).toBe(0);
    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 1, "Trash (MSW)");
    store = logLoadConsume(store, date, "melrose", "Melrose", "Hodgkins", 1, "Trash (MSW)");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(1);
    expect(countSpecialtyOpens(store, date, "melrose", "Hodgkins")).toBe(1);
  });

  it("consumes Liberty KanSpcl and Sun Chem dest chips from leachate logs and aliases", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "liberty-tank", "KanSpcl");
    store = addSpecialtySlot(store, date, "liberty-tank", "Sun Chem");
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    store = logLoadConsume(
      store,
      date,
      "liberty",
      "Liberty",
      "Kan Special",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "liberty-tank", "KanSpcl")).toBe(0);
    store = logLoadConsume(
      store,
      date,
      "liberty",
      "Liberty",
      "Sun Chemical",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "liberty-tank", "Sun Chem")).toBe(0);
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(1);
  });

  it("consumes a Melrose → Hodgkins open and leaves a different dest", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {};
    store = addSpecialtySlot(store, date, "melrose", "Hodgkins");
    store = addSpecialtySlot(store, date, "melrose", "RSI");
    store = logLoadConsume(store, date, "melrose", "Melrose", "Hodgkins");
    expect(countSpecialtyOpens(store, date, "melrose", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(store, date, "melrose", "RSI")).toBe(1);
  });

  it("consumes Batavia Hodgkins qty=2 and leaves RSI; trash does not wipe the card", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "batavia", "Hodgkins");
    store = addSpecialtySlot(store, date, "batavia", "Hodgkins");
    store = addSpecialtySlot(store, date, "batavia", "RSI");
    store = logLoadConsume(
      store,
      date,
      "batavia",
      "Batavia",
      "Hodgkins",
      2,
      "Recycle",
    );
    expect(countSpecialtyOpens(store, date, "batavia", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(store, date, "batavia", "RSI")).toBe(1);
    store = logLoadConsume(
      store,
      date,
      "batavia",
      "Batavia",
      "RSI",
      1,
      "Trash (MSW)",
    );
    expect(countSpecialtyOpens(store, date, "batavia", "RSI")).toBe(1);
    store = logLoadConsume(store, date, "batavia", "Batavia", "RSI", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "batavia", "RSI")).toBe(0);
  });

  it("consumes Batavia→Trash (MSW) against the Trash chip and leaves Hodgkins", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "batavia", "Trash");
    store = addSpecialtySlot(store, date, "batavia", "Hodgkins");
    store = logLoadConsume(
      store,
      date,
      "batavia",
      "Batavia",
      "DeKalb",
      1,
      "Trash (MSW)",
    );
    expect(countSpecialtyOpens(store, date, "batavia", "Trash")).toBe(1);
    store = logLoadConsume(
      store,
      date,
      "batavia",
      "Batavia",
      "Trash",
      1,
      "Trash (MSW)",
    );
    expect(countSpecialtyOpens(store, date, "batavia", "Trash")).toBe(0);
    expect(countSpecialtyOpens(store, date, "batavia", "Hodgkins")).toBe(1);
  });

  it("consumes GraysLake FRWRD / CID / Dekalb San aliases without touching Liberty", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "grayslake", "FRWRD");
    store = addSpecialtySlot(store, date, "grayslake", "CID");
    store = addSpecialtySlot(store, date, "grayslake", "Dekalb Sanitary");
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    store = logLoadConsume(
      store,
      date,
      "grayslake",
      "GraysLake",
      "FRWRD",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "grayslake", "FRWRD")).toBe(0);
    store = logLoadConsume(
      store,
      date,
      "grayslake",
      "Grays Lake",
      "CID",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "grayslake", "CID")).toBe(0);
    store = logLoadConsume(
      store,
      date,
      "grayslake",
      "GraysLake",
      "Dekalb San",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "grayslake", "Dekalb Sanitary")).toBe(0);
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(1);
  });

  it("does not consume GraysLake leachate opens when Recycle → Hodgkins is logged", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "grayslake", "FRWRD");
    store = addSpecialtySlot(store, date, "grayslake", "CID");
    store = addSpecialtySlot(store, date, "grayslake", "Dekalb Sanitary");
    expect(
      resolveSpecialtyBoardMatch("grayslake", "GraysLake", "Hodgkins", "Recycle"),
    ).toBeNull();
    expect(
      missingSpecialtyOpensWarn(
        {},
        date,
        "grayslake",
        "GraysLake",
        "Hodgkins",
        "Recycle",
      ),
    ).toBeNull();
    store = logLoadConsume(
      store,
      date,
      "grayslake",
      "GraysLake",
      "Hodgkins",
      1,
      "Recycle",
    );
    expect(countSpecialtyOpens(store, date, "grayslake", "FRWRD")).toBe(1);
    expect(countSpecialtyOpens(store, date, "grayslake", "CID")).toBe(1);
    expect(countSpecialtyOpens(store, date, "grayslake", "Dekalb Sanitary")).toBe(1);
  });

  it("consumes Liberty CID x2 then Kankakee without touching the other dest", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "liberty-tank", "CID");
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    store = addSpecialtySlot(store, date, "liberty-tank", "Kankakee");
    store = logLoadConsume(
      store,
      date,
      "liberty",
      "Liberty",
      "CID",
      2,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(0);
    expect(countSpecialtyOpens(store, date, "liberty-tank", "Kankakee")).toBe(1);
    store = logLoadConsume(
      store,
      date,
      "liberty",
      "Liberty",
      "Kankakee",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "liberty-tank", "Kankakee")).toBe(0);
  });

  it.each(
    SPECIALTY_STATIONS.flatMap((station) =>
      specialtyDestinationsFor(station.id).map((chip) => ({
        id: station.id,
        name: station.name,
        chip,
      })),
    ),
  )(
    "consumes $id chip $chip when the matching load is logged",
    ({ id, name, chip }) => {
      const date = "2026-09-08";
      let store = addSpecialtySlot({}, date, id, chip);
      const log = catalogLogPickup(id, name);
      const commodity =
        specialtyChipMode(id) === "commodity"
          ? chip === "Trash"
            ? "Trash (MSW)"
            : chip
          : boardCommodityFor(id, chip);
      const destination =
        specialtyChipMode(id) === "commodity" ? "Groot" : chip;
      store = logLoadConsume(
        store,
        date,
        log.stationId,
        log.pickup,
        destination,
        1,
        commodity,
      );
      expect(countSpecialtyOpens(store, date, id, chip)).toBe(0);
    },
  );

  it("matches Wheeling opens stored under the display name or a timestamped date key", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {
      "2026-09-08T00:00:00.000Z": [
        {
          id: "sp-wheeling-recycle",
          stationId: "Wheeling",
          destination: "Recycle",
          createdAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    };
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(1);
    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot", 1, "Recycle");
    expect(countSpecialtyOpens(store, date, "wheeling", "Recycle")).toBe(0);
  });

  it("does not resurrect a consumed Wheeling Recycle open from a stale remote merge", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "wheeling", "Recycle");
    const slotId = local[date][0].id;
    const remote = local;
    local = consumeSpecialtyOpens(local, date, "wheeling", "Recycle", 1);
    expect(countSpecialtyOpens(local, date, "wheeling", "Recycle")).toBe(0);

    const restored = mergeSpecialtyStores(local, remote);
    expect(countSpecialtyOpens(restored, date, "wheeling", "Recycle")).toBe(1);

    const kept = mergeSpecialtyStores(local, remote, [slotId]);
    expect(countSpecialtyOpens(kept, date, "wheeling", "Recycle")).toBe(0);
  });

  it("keeps Liberty CID dest-chip remove gone when remote still has that open", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    const slotId = local[date][0].id;
    const remote: SpecialtyStore = {
      [date]: local[date].map((s) => ({ ...s })),
    };

    local = removeSpecialtySlot(local, date, "liberty-tank", "CID");
    expect(countSpecialtyOpens(local, date, "liberty-tank", "CID")).toBe(0);

    const bounced = mergeSpecialtyStores(local, remote);
    expect(countSpecialtyOpens(bounced, date, "liberty-tank", "CID")).toBe(1);

    const keep = destKeepAfterChange(local, date, "liberty-tank", "CID");
    expect(keep.keepIds).toEqual([]);
    const gone = mergeSpecialtyStores(local, remote, [slotId], [keep]);
    expect(countSpecialtyOpens(gone, date, "liberty-tank", "CID")).toBe(0);
    expect(
      countSpecialtyOpens(
        applySpecialtyTombstones(bounced, [slotId], [keep]),
        date,
        "liberty-tank",
        "CID",
      ),
    ).toBe(0);
  });

  it("does not restore Liberty CID from a different-id remote liberty row after dest-chip remove", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    const localId = local[date][0].id;
    const remote: SpecialtyStore = {
      [date]: [
        {
          id: "remote-liberty-cid",
          stationId: "liberty",
          destination: "CID",
          createdAt: "2026-09-08T12:00:00.000Z",
        },
        {
          id: localId,
          stationId: "liberty-tank",
          destination: "CID",
          createdAt: "2026-09-08T12:01:00.000Z",
        },
      ],
    };

    local = removeSpecialtySlot(local, date, "liberty-tank", "CID");
    expect(countSpecialtyOpens(local, date, "liberty-tank", "CID")).toBe(0);

    // PR #11 gap: UUID tombstone of the local slot still lets the catalog-id copy in.
    const uuidOnly = mergeSpecialtyStores(local, remote, [localId]);
    expect(countSpecialtyOpens(uuidOnly, date, "liberty-tank", "CID")).toBe(1);

    const keep = destKeepAfterChange(local, date, "liberty-tank", "CID");
    const gone = mergeSpecialtyStores(local, remote, [localId], [keep]);
    expect(countSpecialtyOpens(gone, date, "liberty-tank", "CID")).toBe(0);
    expect(
      unkeptSpecialtyIds(remote, date, "liberty-tank", "CID", keep.keepIds).sort(),
    ).toEqual(["remote-liberty-cid", localId].sort());
    expect(countSpecialtyOpens(gone, date, "batavia", "CID")).toBe(0);
  });

  it("dest-chip minus of one Liberty CID keeps the remaining local slot and drops remote extras", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    local = addSpecialtySlot(local, date, "liberty-tank", "CID");
    const keptId = local[date][0].id;
    const removedId = local[date][1].id;
    local = addSpecialtySlot(local, date, "batavia", "RSI");
    const otherId = local[date].find((s) => s.stationId === "batavia")?.id;
    expect(otherId).toBeTruthy();

    const remote: SpecialtyStore = {
      [date]: [
        ...local[date].map((s) => ({ ...s })),
        {
          id: "dup-liberty-alias",
          stationId: "Liberty",
          destination: "CID",
          createdAt: "2026-09-08T15:00:00.000Z",
        },
      ],
    };

    local = removeSpecialtySlot(local, date, "liberty-tank", "CID");
    expect(countSpecialtyOpens(local, date, "liberty-tank", "CID")).toBe(1);
    expect(remainingSpecialtySlotIds(local, date, "liberty-tank", "CID")).toEqual([
      keptId,
    ]);

    const keep = destKeepAfterChange(local, date, "liberty-tank", "CID");
    const merged = mergeSpecialtyStores(local, remote, [removedId], [keep]);
    expect(countSpecialtyOpens(merged, date, "liberty-tank", "CID")).toBe(1);
    expect(remainingSpecialtySlotIds(merged, date, "liberty-tank", "CID")).toEqual([
      keptId,
    ]);
    expect(countSpecialtyOpens(merged, date, "batavia", "RSI")).toBe(1);
  });

  it("station minus of Liberty CID stays gone after UUID tombstone GC if dest-keep remains", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    const slotId = local[date][0].id;
    const remoteStillHas = {
      [date]: [
        {
          id: slotId,
          stationId: "liberty-tank",
          destination: "CID",
          createdAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    } satisfies SpecialtyStore;

    local = removeSpecialtySlot(local, date, "liberty-tank");
    const keep = destKeepAfterChange(local, date, "liberty-tank", "CID");

    // Simulate gcDeleted dropping the UUID because a later pull missed it, while
    // an overlapping stale pull still contains the row (PR #11 bounce).
    const afterGc = mergeSpecialtyStores(local, remoteStillHas, [], [keep]);
    expect(countSpecialtyOpens(afterGc, date, "liberty-tank", "CID")).toBe(0);
  });

  it.each(SPECIALTY_STATIONS)(
    "consumes $id opens when a matching load is logged with qty=2",
    ({ id, name }) => {
      const dest = specialtyDestinationsFor(id)[0];
      expect(dest).toBeTruthy();
      const date = "2026-09-08";
      let store: SpecialtyStore = {};
      store = addSpecialtySlot(store, date, id, dest);
      store = addSpecialtySlot(store, date, id, dest);
      expect(countSpecialtyOpens(store, date, id, dest)).toBe(2);

      const log = catalogLogPickup(id, name);
      expect(resolveSpecialtyStationId(log.stationId, log.pickup)).toBe(id);
      store = logLoadConsume(
        store,
        date,
        log.stationId,
        log.pickup,
        dest,
        2,
        boardCommodityFor(id, dest),
      );
      expect(countSpecialtyOpens(store, date, id, dest)).toBe(0);
    },
  );

  it("consumes Hearthside Newton County opens when logging Trash (MSW)", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "herthside", "Newton County");
    store = logLoadConsume(
      store,
      date,
      "herthside",
      "Hearthside",
      "Newton County",
      1,
      "Trash (MSW)",
    );
    expect(countSpecialtyOpens(store, date, "herthside", "Newton County")).toBe(0);
  });

  it.each([
    { stationId: "liberty", pickup: "Liberty" },
    { stationId: "liberty-tank", pickup: "Liberty" },
    { stationId: "custom", pickup: "Liberty Tank" },
  ])("consumes Liberty → CID qty=2 from $stationId / $pickup", ({ stationId, pickup }) => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {};
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(2);

    store = logLoadConsume(store, date, stationId, pickup, "CID", 2);
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(0);
    expect(countSpecialtyOpens(store, date, "liberty", "CID")).toBe(0);
  });

  it("consume Liberty→CID stays gone when remote still has that open and a liberty alias copy", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    const slotId = local[date][0].id;
    const remote: SpecialtyStore = {
      [date]: [
        { ...local[date][0] },
        {
          id: "cloud-liberty-cid",
          stationId: "liberty",
          destination: "CID",
          createdAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    };

    local = logLoadConsume(local, date, "liberty", "Liberty", "CID", 1);
    expect(countSpecialtyOpens(local, date, "liberty-tank", "CID")).toBe(0);

    const uuidOnly = mergeSpecialtyStores(local, remote, [slotId]);
    expect(countSpecialtyOpens(uuidOnly, date, "liberty-tank", "CID")).toBe(1);

    const keep = destKeepAfterChange(local, date, "liberty-tank", "CID");
    const gone = mergeSpecialtyStores(local, remote, [slotId], [keep]);
    expect(countSpecialtyOpens(gone, date, "liberty-tank", "CID")).toBe(0);
  });

  it("consumes Dekalb Wood and Prairie Hill C&D chips from the load commodity", () => {
    const date = "2026-09-08";
    let store = addSpecialtySlot({}, date, "dekalb", "Wood");
    store = addSpecialtySlot(store, date, "dekalb", "Recycle");
    store = addSpecialtySlot(store, date, "prairie-hill", "C&D");
    store = logLoadConsume(store, date, "dekalb", "Dekalb", "CID", 1, "Wood");
    expect(countSpecialtyOpens(store, date, "dekalb", "Wood")).toBe(0);
    expect(countSpecialtyOpens(store, date, "dekalb", "Recycle")).toBe(1);
    store = logLoadConsume(
      store,
      date,
      "prairie-hill",
      "PrairieHill",
      "Hodgkins",
      1,
      "C&D",
    );
    expect(countSpecialtyOpens(store, date, "prairie-hill", "C&D")).toBe(0);
  });

  it("does not consume Liberty CID when logging Gray Tank leachate (not a pickup)", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {};
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    store = logLoadConsume(
      store,
      date,
      "gray-tank",
      "Gray Tank",
      "CID",
      1,
      "Leachate (tanker)",
    );
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(1);
    expect(resolveSpecialtyBoardMatch("gray-tank", "Gray Tank", "CID", "Leachate (tanker)")).toBeNull();
  });

  it.each(SPECIALTY_STATIONS)(
    "keeps $id minus after a stale remote merge when tombstones are applied",
    ({ id }) => {
      const dest = specialtyDestinationsFor(id)[0];
      const date = "2026-09-08";
      let local = addSpecialtySlot({}, date, id, dest);
      local = addSpecialtySlot(local, date, id, dest);
      expect(countSpecialtyOpens(local, date, id, dest)).toBe(2);
      const slotId = local[date][local[date].length - 1].id;
      const remote: SpecialtyStore = {
        [date]: local[date].map((s) => ({ ...s })),
      };

      // UI − button: no dest, most recent slot for the station.
      local = removeSpecialtySlot(local, date, id);
      expect(countSpecialtyOpens(local, date, id, dest)).toBe(1);

      const bounced = mergeSpecialtyStores(local, remote);
      expect(countSpecialtyOpens(bounced, date, id, dest)).toBe(2);

      const kept = mergeSpecialtyStores(local, remote, [slotId]);
      expect(countSpecialtyOpens(kept, date, id, dest)).toBe(1);

      const destKeep = destKeepAfterChange(local, date, id, dest);
      expect(
        countSpecialtyOpens(
          mergeSpecialtyStores(local, remote, [slotId], [destKeep]),
          date,
          id,
          dest,
        ),
      ).toBe(1);

      // Persist path: even if merge ran without tombstones, omit at write wins.
      expect(
        countSpecialtyOpens(omitSpecialtyIds(bounced, [slotId]), date, id, dest),
      ).toBe(1);
    },
  );
});

function consumeThenReconcile(
  local: SpecialtyStore,
  date: string,
  stationId: string,
  pickup: string,
  destination: string,
  commodity: string,
  qty: number,
  remote: SpecialtyStore,
  seenRemoteIds?: string[],
) {
  const match = resolveSpecialtyBoardMatch(
    stationId,
    pickup,
    destination,
    commodity,
  );
  expect(match).not.toBeNull();
  const tracked = consumeSpecialtyOpensTracked(
    local,
    date,
    match!.specialtyId,
    match!.chips,
    qty,
  );
  const seen =
    seenRemoteIds ?? Object.values(remote).flat().map((slot) => slot.id);
  return {
    match: match!,
    tracked,
    refresh: reconcileSpecialtyCloud({
      local: tracked.store,
      remote,
      deletedIds: tracked.burnedIds,
      destKeeps: tracked.destKeeps,
      seenRemoteIds: seen,
    }),
  };
}

describe("specialty consume sticks through refresh/merge", () => {
  const date = "2026-09-09";

  it("dest-mode Melrose Recycle→Hodgkins stays 1→0 after a stale remote merge", () => {
    let local = addSpecialtySlot({}, date, "melrose", "Hodgkins");
    local = addSpecialtySlot(local, date, "melrose", "RSI");
    const remote: SpecialtyStore = {
      [date]: local[date].map((slot) => ({ ...slot })),
    };
    const seen = remote[date].map((slot) => slot.id);

    const { tracked, refresh } = consumeThenReconcile(
      local,
      date,
      "melrose",
      "Melrose",
      "Hodgkins",
      "Recycle",
      1,
      remote,
      seen,
    );
    expect(tracked.burned).toBe(1);
    expect(countSpecialtyOpens(tracked.store, date, "melrose", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(tracked.store, date, "melrose", "RSI")).toBe(1);
    expect(countSpecialtyOpens(refresh.next, date, "melrose", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(refresh.next, date, "melrose", "RSI")).toBe(1);
    expect(refresh.toUpload).toEqual([]);
    expect(refresh.toDeleteRemote.length).toBeGreaterThan(0);

    const second = reconcileSpecialtyCloud({
      local: refresh.next,
      remote,
      deletedIds: refresh.deletedIds,
      destKeeps: refresh.destKeeps,
      seenRemoteIds: refresh.seenRemoteIds,
    });
    expect(countSpecialtyOpens(second.next, date, "melrose", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(second.next, date, "melrose", "RSI")).toBe(1);
  });

  it("does not resurrect a tombstoned Melrose Hodgkins id after dest-keep GC", () => {
    const local = addSpecialtySlot({}, date, "melrose", "Hodgkins");
    const slotId = local[date][0].id;
    const remote: SpecialtyStore = {
      [date]: local[date].map((slot) => ({ ...slot })),
    };
    const { refresh } = consumeThenReconcile(
      local,
      date,
      "melrose",
      "Melrose",
      "Hodgkins",
      "Recycle",
      1,
      remote,
    );
    expect(refresh.deletedIds).toContain(slotId);

    const remoteGone: SpecialtyStore = {};
    const afterGc = reconcileSpecialtyCloud({
      local: refresh.next,
      remote: remoteGone,
      deletedIds: refresh.deletedIds,
      destKeeps: refresh.destKeeps,
      seenRemoteIds: refresh.seenRemoteIds,
    });
    expect(afterGc.deletedIds).toContain(slotId);

    const resurrected: SpecialtyStore = {
      [date]: [
        {
          id: slotId,
          stationId: "melrose",
          destination: "Hodgkins",
          createdAt: "2026-09-09T12:00:00.000Z",
        },
      ],
    };
    const bounced = reconcileSpecialtyCloud({
      local: afterGc.next,
      remote: resurrected,
      deletedIds: afterGc.deletedIds,
      destKeeps: afterGc.destKeeps,
      seenRemoteIds: afterGc.seenRemoteIds,
    });
    expect(countSpecialtyOpens(bounced.next, date, "melrose", "Hodgkins")).toBe(0);
    expect(bounced.toUpload).toEqual([]);
    expect(bounced.toDeleteRemote).toContain(slotId);
  });

  it("commodity-mode Wheeling Recycle and legacy Groot dest both stick through refresh", () => {
    let local = addSpecialtySlot({}, date, "wheeling", "Recycle");
    local = addSpecialtySlot(local, date, "wheeling", "Groot");
    local = addSpecialtySlot(local, date, "wheeling", "Hodgkins");
    const remote: SpecialtyStore = {
      [date]: local[date].map((slot) => ({ ...slot })),
    };

    const recycle = consumeThenReconcile(
      local,
      date,
      "wheeling",
      "Wheeling",
      "Groot",
      "Recycle",
      1,
      remote,
    );
    expect(countSpecialtyOpens(recycle.refresh.next, date, "wheeling", "Recycle")).toBe(
      0,
    );
    expect(countSpecialtyOpens(recycle.refresh.next, date, "wheeling", "Groot")).toBe(1);
    expect(countSpecialtyOpens(recycle.refresh.next, date, "wheeling", "Hodgkins")).toBe(
      1,
    );

    const groot = consumeThenReconcile(
      recycle.tracked.store,
      date,
      "wheeling",
      "Wheeling",
      "Groot",
      "Recycle",
      1,
      remote,
      recycle.refresh.seenRemoteIds,
    );
    const grootRefresh = reconcileSpecialtyCloud({
      local: groot.tracked.store,
      remote,
      deletedIds: [
        ...recycle.refresh.deletedIds,
        ...groot.tracked.burnedIds,
      ],
      destKeeps: groot.tracked.destKeeps,
      seenRemoteIds: recycle.refresh.seenRemoteIds,
    });
    expect(countSpecialtyOpens(grootRefresh.next, date, "wheeling", "Groot")).toBe(0);
    expect(countSpecialtyOpens(grootRefresh.next, date, "wheeling", "Hodgkins")).toBe(
      1,
    );
  });

  it("does not re-upload a remotely deleted specialty id the local cache still has", () => {
    const localHodgkins = addSpecialtySlot({}, date, "batavia", "Hodgkins");
    const slotId = localHodgkins[date][0].id;
    const remoteOther = addSpecialtySlot({}, date, "elgin", "RSI");
    const local = {
      [date]: [...localHodgkins[date], ...remoteOther[date]],
    } satisfies SpecialtyStore;
    const refresh = reconcileSpecialtyCloud({
      local,
      remote: remoteOther,
      deletedIds: [],
      destKeeps: [],
      seenRemoteIds: [slotId, remoteOther[date][0].id],
    });
    expect(countSpecialtyOpens(refresh.next, date, "batavia", "Hodgkins")).toBe(0);
    expect(countSpecialtyOpens(refresh.next, date, "elgin", "RSI")).toBe(1);
    expect(refresh.toUpload).toEqual([]);
    expect(refresh.deletedIds).toContain(slotId);
  });

  it("still uploads a never-seen local add when remote is missing it", () => {
    const local = addSpecialtySlot({}, date, "apollo", "Homewood");
    const slotId = local[date][0].id;
    const refresh = reconcileSpecialtyCloud({
      local,
      remote: {},
      deletedIds: [],
      destKeeps: [],
      seenRemoteIds: [],
    });
    expect(refresh.toUpload.map((row) => row.slot.id)).toEqual([slotId]);
    expect(countSpecialtyOpens(refresh.next, date, "apollo", "Homewood")).toBe(1);
  });

  it("Liberty CID consume stays gone when remote still has a liberty alias copy", () => {
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    const localId = local[date][0].id;
    const remote: SpecialtyStore = {
      [date]: [
        { ...local[date][0] },
        {
          id: "cloud-liberty-cid",
          stationId: "liberty",
          destination: "CID",
          createdAt: "2026-09-09T12:00:00.000Z",
        },
      ],
    };
    const { refresh } = consumeThenReconcile(
      local,
      date,
      "liberty",
      "Liberty",
      "CID",
      "Leachate (tanker)",
      1,
      remote,
    );
    expect(countSpecialtyOpens(refresh.next, date, "liberty-tank", "CID")).toBe(0);
    expect(refresh.deletedIds).toEqual(
      expect.arrayContaining([localId, "cloud-liberty-cid"]),
    );

    const afterGc = reconcileSpecialtyCloud({
      local: refresh.next,
      remote: {},
      deletedIds: refresh.deletedIds,
      destKeeps: refresh.destKeeps,
      seenRemoteIds: refresh.seenRemoteIds,
    });
    const bounced = reconcileSpecialtyCloud({
      local: afterGc.next,
      remote,
      deletedIds: afterGc.deletedIds,
      destKeeps: afterGc.destKeeps,
      seenRemoteIds: afterGc.seenRemoteIds,
    });
    expect(countSpecialtyOpens(bounced.next, date, "liberty-tank", "CID")).toBe(0);
  });
});

