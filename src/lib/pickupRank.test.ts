import { describe, expect, it } from "vitest";
import { FREQUENT_STATION_IDS, STATIONS } from "../data/stations";
import { countPickupsByStationId, rankPickupStations } from "./pickupRank";

function load(stationId: string, pickup: string) {
  return { stationId, pickup };
}

describe("countPickupsByStationId", () => {
  it("counts stationId and pickup-name matches, skipping unmatched custom sites", () => {
    const counts = countPickupsByStationId([
      load("medill", "Medill"),
      load("medill", "Medill"),
      load("wheeling", "Wheeling"),
      load("custom", "Wheeling"),
      load("custom", "Mystery Yard"),
    ]);
    expect(counts.get("medill")).toBe(2);
    expect(counts.get("wheeling")).toBe(2);
    expect(counts.get("custom")).toBeUndefined();
    expect(counts.size).toBe(2);
  });
});

describe("rankPickupStations", () => {
  it("keeps frequent chips first when nothing is logged", () => {
    const ranked = rankPickupStations(STATIONS, []);
    expect(ranked.slice(0, FREQUENT_STATION_IDS.length).map((s) => s.id)).toEqual(
      STATIONS.filter((s) =>
        (FREQUENT_STATION_IDS as readonly string[]).includes(s.id),
      ).map((s) => s.id),
    );
    expect(ranked.map((s) => s.id).sort()).toEqual(
      [...STATIONS.map((s) => s.id)].sort(),
    );
  });

  it("lifts high-frequency pickups to the front of the visible grid", () => {
    const loads = [
      load("medill", "Medill"),
      load("medill", "Medill"),
      load("medill", "Medill"),
      load("wheeling", "Wheeling"),
      load("wheeling", "Wheeling"),
      load("apollo", "Apollo"),
    ];
    const ranked = rankPickupStations(STATIONS, loads);
    expect(ranked.slice(0, 3).map((s) => s.id)).toEqual([
      "medill",
      "wheeling",
      "apollo",
    ]);
    expect(ranked.map((s) => s.id)).toContain("melrose");
    expect(ranked).toHaveLength(STATIONS.length);
  });

  it("uses catalog order when frequencies tie", () => {
    const loads = [load("calumet", "Calumet"), load("apollo", "Apollo")];
    const ranked = rankPickupStations(STATIONS, loads);
    const calumet = STATIONS.findIndex((s) => s.id === "calumet");
    const apollo = STATIONS.findIndex((s) => s.id === "apollo");
    expect(calumet).toBeLessThan(apollo);
    expect(ranked.slice(0, 2).map((s) => s.id)).toEqual(["calumet", "apollo"]);
  });
});
