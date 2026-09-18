import type { Load } from "../types";
import type { RankRow } from "./totals";
import { startOfYear, yearOfISO } from "./chicagoDate";

export type DailyCount = {
  date: string;
  count: number;
};

export function loadsYearToDate(loads: Load[], today: string): Load[] {
  const start = startOfYear(today);
  return loads.filter((load) => load.date >= start && load.date <= today);
}

export function dailyCounts(loads: Load[], dates: string[]): DailyCount[] {
  const map = new Map<string, number>();
  for (const load of loads) {
    map.set(load.date, (map.get(load.date) ?? 0) + 1);
  }
  return dates.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

export function peakDailyCount(days: DailyCount[]): number {
  return days.reduce((max, day) => Math.max(max, day.count), 0);
}

export function chicagoYearLabel(today: string): string {
  return String(yearOfISO(today));
}

export type PieSlice = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
};

const PIE_COLORS = [
  "#d8282c",
  "#3d8fd4",
  "#5cbf8a",
  "#e0b07a",
  "#7edce8",
  "#c47ad0",
  "#e8a54b",
  "#9a9588",
];

const MAX_NAMED_SLICES = 6;

function integerPercents(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((n) => (n / total) * 100);
  const floors = raw.map((n) => Math.floor(n));
  let leftover = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < leftover; k++) {
    out[order[k % order.length].i] += 1;
  }
  return out;
}

/** Named pickup slices for a YTD pie. Zero-count rows are dropped. */
export function pickupPieSlices(rows: RankRow[]): PieSlice[] {
  const live = rows.filter((row) => row.count > 0);
  if (live.length === 0) return [];

  let grouped = live;
  if (live.length > MAX_NAMED_SLICES + 1) {
    const head = live.slice(0, MAX_NAMED_SLICES);
    const tail = live.slice(MAX_NAMED_SLICES);
    const otherCount = tail.reduce((sum, row) => sum + row.count, 0);
    const otherTrash = tail.reduce((sum, row) => sum + row.trashCount, 0);
    grouped = [
      ...head,
      { key: "other", label: "Other", count: otherCount, trashCount: otherTrash },
    ];
  }

  const percents = integerPercents(grouped.map((row) => row.count));
  return grouped.map((row, i) => ({
    key: row.key,
    label: row.label,
    count: row.count,
    pct: percents[i],
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
}
