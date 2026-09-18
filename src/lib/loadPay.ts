/** Per-load driver pay from customer lanes + anniversary tier. */

import { weekStartingSunday } from "./chicagoDate";
import {
  centsToDollars,
  dollarsToCents,
  rateForLoad,
  tierDollars,
  type CustomerLaneStore,
} from "./customerLanes";
import { payTierFromHireDate, type PayTier } from "./driverPay";
import { rosterNamesMatch } from "./rosterVacation";
import type { Load } from "../types";

export const PAY_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export type LoadPayHit = {
  loadId: string;
  date: string;
  truck: string;
  cents: number;
  tier: PayTier;
};

export type DayPay = {
  date: string;
  weekday: (typeof PAY_WEEKDAYS)[number];
  cents: number;
  loads: number;
  truck: string | null;
};

export type WeekPay = {
  weekStart: string;
  days: DayPay[];
  totalCents: number;
  loadCount: number;
};

export function formatPayCents(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = centsToDollars(cents);
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

export function payForLoad(
  load: Load,
  lanes: CustomerLaneStore,
  hireDate: string | null,
): LoadPayHit | null {
  const tier = payTierFromHireDate(hireDate, load.date);
  if (!tier) return null;
  const lane = rateForLoad(lanes, load.pickup, load.destination, load.commodity, load.date);
  if (!lane) return null;
  const dollars = tierDollars(lane, tier);
  const cents = dollarsToCents(dollars);
  if (cents === null) return null;
  return {
    loadId: load.id,
    date: load.date,
    truck: load.truck,
    cents,
    tier,
  };
}

export function loadsForDriver(loads: readonly Load[], driverName: string): Load[] {
  const name = driverName.trim();
  if (!name) return [];
  return loads.filter((load) => {
    const logged = load.driverName;
    if (typeof logged !== "string" || !logged.trim()) return false;
    return rosterNamesMatch(logged, name);
  });
}

export function weekPayForDriver(opts: {
  loads: readonly Load[];
  lanes: CustomerLaneStore;
  driverName: string;
  hireDate: string | null;
  asOf: string;
}): WeekPay {
  const week = weekStartingSunday(opts.asOf);
  const days: DayPay[] = week.map((date, i) => ({
    date,
    weekday: PAY_WEEKDAYS[i],
    cents: 0,
    loads: 0,
    truck: null,
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  const trucks = new Map<string, Map<string, number>>();

  for (const load of loadsForDriver(opts.loads, opts.driverName)) {
    const day = byDate.get(load.date);
    if (!day) continue;
    const hit = payForLoad(load, opts.lanes, opts.hireDate);
    day.loads += 1;
    if (hit) day.cents += hit.cents;
    const truck = load.truck.trim();
    if (truck) {
      let counts = trucks.get(load.date);
      if (!counts) {
        counts = new Map();
        trucks.set(load.date, counts);
      }
      counts.set(truck, (counts.get(truck) ?? 0) + 1);
    }
  }

  for (const day of days) {
    const counts = trucks.get(day.date);
    if (!counts?.size) continue;
    let best: string | null = null;
    let bestN = 0;
    for (const [truck, n] of counts) {
      if (n > bestN) {
        best = truck;
        bestN = n;
      }
    }
    day.truck = best;
  }

  return {
    weekStart: week[0],
    days,
    totalCents: days.reduce((sum, day) => sum + day.cents, 0),
    loadCount: days.reduce((sum, day) => sum + day.loads, 0),
  };
}
