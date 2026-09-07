import { describe, expect, it } from "vitest";
import { STATION_BY_ID } from "../data/stations";
import { applyPickupCascade } from "./cascade";
import {
  SPECIALTY_DESTINATIONS,
  SPECIALTY_STATIONS,
  addSpecialtySlot,
  applySpecialtyTombstones,
  consumeSpecialtyOpens,
  countSpecialtyOpens,
  destKeepAfterChange,
  isSpecialtyStationId,
  mergeSpecialtyStores,
  omitSpecialtyIds,
  remainingSpecialtySlotIds,
  removeSpecialtySlot,
  resolveSpecialtyStationId,
  slotsForStation,
  specialtyDestinationsFor,
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

function logLoadConsume(
  store: SpecialtyStore,
  date: string,
  stationId: string,
  pickup: string,
  destination: string,
  qty = 1,
): SpecialtyStore {
  const specialtyId = resolveSpecialtyStationId(stationId, pickup);
  if (!specialtyId) return store;
  return consumeSpecialtyOpens(store, date, specialtyId, destination, qty);
}

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
    expect(resolveSpecialtyStationId("grayslake", "GraysLake")).toBeNull();
    expect(resolveSpecialtyStationId("laraway", "Laraway")).toBeNull();
    expect(resolveSpecialtyStationId("prairie-hill-rfd", "Prairie Hill RFD")).toBeNull();
  });
});

describe("specialty consume on logged loads", () => {
  it("consumes a Wheeling → Groot open when a Recycle load is logged for that day", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {};
    store = addSpecialtySlot(store, date, "wheeling", "Groot");
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(1);
    expect(applyPickupCascade("wheeling", "Recycle", "Groot")).toMatchObject({
      commodityValid: true,
      destinationValid: true,
    });

    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot");
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(0);
    expect(slotsForStation(store[date] ?? [], "wheeling")).toEqual([]);
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

  it("matches Wheeling opens stored under the display name or a timestamped date key", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {
      "2026-09-08T00:00:00.000Z": [
        {
          id: "sp-wheeling-groot",
          stationId: "Wheeling",
          destination: "Groot Recycling",
          createdAt: "2026-09-08T12:00:00.000Z",
        },
      ],
    };
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(1);
    store = logLoadConsume(store, date, "wheeling", "Wheeling", "Groot");
    expect(countSpecialtyOpens(store, date, "wheeling", "Groot")).toBe(0);
  });

  it("does not resurrect a consumed Wheeling → Groot open from a stale remote merge", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "wheeling", "Groot");
    const slotId = local[date][0].id;
    const remote = local;
    local = consumeSpecialtyOpens(local, date, "wheeling", "Groot", 1);
    expect(countSpecialtyOpens(local, date, "wheeling", "Groot")).toBe(0);

    const restored = mergeSpecialtyStores(local, remote);
    expect(countSpecialtyOpens(restored, date, "wheeling", "Groot")).toBe(1);

    const kept = mergeSpecialtyStores(local, remote, [slotId]);
    expect(countSpecialtyOpens(kept, date, "wheeling", "Groot")).toBe(0);
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
    expect(countSpecialtyOpens(gone, date, "gray-tank", "CID")).toBe(0);
  });

  it("dest-chip minus of one Liberty CID keeps the remaining local slot and drops remote extras", () => {
    const date = "2026-09-08";
    let local = addSpecialtySlot({}, date, "liberty-tank", "CID");
    local = addSpecialtySlot(local, date, "liberty-tank", "CID");
    const keptId = local[date][0].id;
    const removedId = local[date][1].id;
    local = addSpecialtySlot(local, date, "gray-tank", "CID");
    const grayId = local[date].find((s) => s.stationId === "gray-tank")?.id;
    expect(grayId).toBeTruthy();

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
    expect(countSpecialtyOpens(merged, date, "gray-tank", "CID")).toBe(1);
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
      store = logLoadConsume(store, date, log.stationId, log.pickup, dest, 2);
      expect(countSpecialtyOpens(store, date, id, dest)).toBe(0);
    },
  );

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

  it("consumes Gray Tank → CID without touching a Liberty CID open", () => {
    const date = "2026-09-08";
    let store: SpecialtyStore = {};
    store = addSpecialtySlot(store, date, "gray-tank", "CID");
    store = addSpecialtySlot(store, date, "liberty-tank", "CID");
    store = logLoadConsume(store, date, "gray-tank", "Gray Tank", "CID");
    expect(countSpecialtyOpens(store, date, "gray-tank", "CID")).toBe(0);
    expect(countSpecialtyOpens(store, date, "liberty-tank", "CID")).toBe(1);
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
