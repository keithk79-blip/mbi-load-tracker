import { describe, expect, it } from "vitest";
import type { Load } from "../types";
import { seededCustomerLaneStore } from "./customerLanes";
import { formatPayCents, payForLoad, weekPayForDriver } from "./loadPay";

function load(partial: Partial<Load> & Pick<Load, "id">): Load {
  return {
    truck: "6195",
    pickup: "Melrose",
    commodity: "Trash (MSW)",
    destination: "DeKalb",
    stationId: "melrose",
    date: "2026-09-16",
    createdAt: "2026-09-16T12:00:00.000Z",
    updatedAt: "2026-09-16T12:00:00.000Z",
    driverName: "Christopher Oleson",
    ...partial,
  };
}

describe("payForLoad", () => {
  const lanes = seededCustomerLaneStore();

  it("uses Tier 5 for a 26-year driver", () => {
    const hit = payForLoad(load({ id: "a" }), lanes, "2000-03-20");
    expect(hit?.tier).toBe(5);
    expect(hit?.cents).toBe(12641);
  });

  it("uses Tier 1 in the first year", () => {
    const hit = payForLoad(load({ id: "a" }), lanes, "2026-01-01");
    expect(hit?.tier).toBe(1);
    expect(hit?.cents).toBe(11457);
  });

  it("flips tier on the anniversary for that day's loads", () => {
    const before = payForLoad(
      load({ id: "a", date: "2025-09-15" }),
      lanes,
      "2024-09-16",
    );
    const onDay = payForLoad(
      load({ id: "b", date: "2025-09-16" }),
      lanes,
      "2024-09-16",
    );
    expect(before?.tier).toBe(1);
    expect(onDay?.tier).toBe(2);
  });

  it("skips unpriced dests instead of inventing pay", () => {
    expect(
      payForLoad(load({ id: "a", destination: "Covanta" }), lanes, "2000-03-20"),
    ).toBeNull();
  });
});

describe("weekPayForDriver", () => {
  const lanes = seededCustomerLaneStore();

  it("restarts Sunday and keeps each day's truck", () => {
    const week = weekPayForDriver({
      loads: [
        load({ id: "sun", date: "2026-09-13", truck: "100" }),
        load({ id: "mon1", date: "2026-09-14", truck: "6195" }),
        load({ id: "mon2", date: "2026-09-14", truck: "6195" }),
        load({ id: "tue", date: "2026-09-15", truck: "88", destination: "Rockford" }),
        load({ id: "other", date: "2026-09-16", driverName: "Someone Else" }),
      ],
      lanes,
      driverName: "Chris Oleson",
      hireDate: "2000-03-20",
      asOf: "2026-09-16",
    });
    expect(week.weekStart).toBe("2026-09-13");
    expect(week.days[0]?.cents).toBe(12641);
    expect(week.days[0]?.truck).toBe("100");
    expect(week.days[1]?.loads).toBe(2);
    expect(week.days[1]?.cents).toBe(25282);
    expect(week.days[1]?.truck).toBe("6195");
    expect(week.days[2]?.cents).toBe(14236);
    expect(week.days[2]?.truck).toBe("88");
    expect(week.days[3]?.cents).toBe(0);
    expect(week.totalCents).toBe(12641 + 25282 + 14236);
    expect(formatPayCents(week.days[1]!.cents)).toBe("$252.82");
  });
});
