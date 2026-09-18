import { describe, expect, it } from "vitest";
import {
  commoditiesMatch,
  currentLanesByCustomer,
  placesMatch,
  rateForLoad,
  seededCustomerLaneStore,
  upsertCustomerLane,
} from "./customerLanes";

describe("place matching", () => {
  it("treats DeKalb / Dekalb / dekalb as the same dest", () => {
    expect(placesMatch("DeKalb", "Dekalb")).toBe(true);
    expect(placesMatch("Melrose Trash Loads", "Melrose")).toBe(true);
    expect(placesMatch("Hooker Street", "Hooker")).toBe(true);
    expect(placesMatch("Rockford", "DeKalb")).toBe(false);
  });

  it("buckets Trash (MSW) together", () => {
    expect(commoditiesMatch("Trash (MSW)", "MSW")).toBe(true);
    expect(commoditiesMatch("Trash (MSW)", "Leachate (tanker)")).toBe(false);
  });
});

describe("seeded rate book", () => {
  const store = seededCustomerLaneStore();

  it("pays Melrose → DeKalb Trash at the current contract", () => {
    const lane = rateForLoad(store, "Melrose", "DeKalb", "Trash (MSW)", "2026-09-16");
    expect(lane?.tier1).toBe(114.57);
    expect(lane?.tier5).toBe(126.41);
  });

  it("does not invent pay for an unpriced dest", () => {
    expect(rateForLoad(store, "Melrose", "Covanta", "Trash (MSW)", "2026-09-16")).toBeNull();
    expect(rateForLoad(store, "LRS", "Pontiac", "Trash (MSW)", "2026-09-16")).toBeNull();
  });

  it("uses the newest contract that is already in force", () => {
    const next = upsertCustomerLane(store, {
      customer: "Melrose",
      destination: "DeKalb",
      commodity: "Trash (MSW)",
      effectiveDate: "2026-01-01",
      tier1: 200,
      tier2: 200,
      tier3: 200,
      tier4: 200,
      tier5: 200,
    }).store;
    expect(rateForLoad(next, "Melrose", "DeKalb", "Trash (MSW)", "2025-12-31")?.tier1).toBe(114.57);
    expect(rateForLoad(next, "Melrose", "DeKalb", "Trash (MSW)", "2026-01-01")?.tier1).toBe(200);
  });

  it("keeps unpriced shells so they show on Customers", () => {
    const names = currentLanesByCustomer(store, "2026-09-16").map((row) => row.customer);
    expect(names).toContain("LRS");
    expect(names).toContain("Ford");
    expect(names).toContain("Melrose");
  });
});
