/** Customer lanes + 5-year contract rate books. Local persist + Supabase. */

import { CUSTOMER_LANE_SEED } from "../data/customerLaneSeed";
import { isValidISODate } from "./chicagoDate";
import { tallyLabel } from "./commodity";

export const CUSTOMER_LANES_STORE_KEY = "chitrader.load-tracker.customer-lanes.v1";
export const CUSTOMER_LANES_TABLE = "customer_lanes";

export const LANE_COMMODITIES = [
  "Trash (MSW)",
  "Walking Floor",
  "Leachate (tanker)",
] as const;
export type LaneCommodity = (typeof LANE_COMMODITIES)[number];

export type CustomerLane = {
  id: string;
  customer: string;
  destination: string;
  commodity: string;
  effectiveDate: string;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  tier4: number | null;
  tier5: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerLaneInput = {
  id?: string;
  customer: string;
  destination?: string;
  commodity?: string;
  effectiveDate: string;
  tier1?: number | null;
  tier2?: number | null;
  tier3?: number | null;
  tier4?: number | null;
  tier5?: number | null;
};

export type CustomerLaneStore = {
  lanes: Record<string, CustomerLane>;
};

export type CustomerLanePersisted = {
  version: 1;
  lanes: Record<string, CustomerLane>;
  seenRemoteIds: string[];
  seededAt: string | null;
};

export type CustomerLaneRow = {
  id: string;
  customer: string;
  destination: string | null;
  commodity: string | null;
  effective_date: string;
  tier1: number | string | null;
  tier2: number | string | null;
  tier3: number | string | null;
  tier4: number | string | null;
  tier5: number | string | null;
  created_at: string;
  updated_at: string;
};

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function dollarsToCents(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.round(raw * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  }
  return null;
}

export function cleanPlaceName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

export function normalizePlaceName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bde kalb\b/g, "dekalb")
    .replace(/\bdek alb\b/g, "dekalb")
    .replace(/\btrash loads?\b/g, " ")
    .replace(/\bmsw\b/g, " ")
    .replace(/\bstreet\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function placesMatch(a: string, b: string): boolean {
  const ka = normalizePlaceName(a);
  const kb = normalizePlaceName(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.startsWith(kb) || kb.startsWith(ka)) return ka.length >= 3 && kb.length >= 3;
  return false;
}

export function laneCommodityKey(raw: string): string {
  const label = tallyLabel(raw);
  if (label === "LEACHATE") return "leachate";
  if (label === "WOOD" || /walking|wf/.test(raw.toLowerCase())) return "walking-floor";
  if (label === "TRASH") return "trash";
  return normalizePlaceName(raw);
}

export function commoditiesMatch(a: string, b: string): boolean {
  return laneCommodityKey(a) === laneCommodityKey(b);
}

export function isLaneStub(lane: CustomerLane): boolean {
  return !lane.destination.trim();
}

export function laneHasRates(lane: CustomerLane): boolean {
  return [lane.tier1, lane.tier2, lane.tier3, lane.tier4, lane.tier5].some(
    (n) => n !== null && n !== undefined,
  );
}

export function tierDollars(lane: CustomerLane, tier: 1 | 2 | 3 | 4 | 5): number | null {
  if (tier === 1) return lane.tier1;
  if (tier === 2) return lane.tier2;
  if (tier === 3) return lane.tier3;
  if (tier === 4) return lane.tier4;
  return lane.tier5;
}

export function emptyCustomerLaneStore(): CustomerLaneStore {
  return { lanes: {} };
}

export function seedLaneId(customer: string, destination: string, commodity: string, effectiveDate: string): string {
  const slug = (s: string) =>
    normalizePlaceName(s).replace(/\s+/g, "-") || "stub";
  return `cl-${slug(customer)}-${slug(destination)}-${laneCommodityKey(commodity)}-${effectiveDate}`;
}

export function lanesFromSeed(at = "2026-09-16T12:00:00.000Z"): CustomerLane[] {
  return CUSTOMER_LANE_SEED.map((row) => {
    const customer = cleanPlaceName(row.customer);
    const destination = cleanPlaceName(row.destination);
    const commodity = cleanPlaceName(row.commodity) || "Trash (MSW)";
    return {
      id: seedLaneId(customer, destination, commodity, row.effectiveDate),
      customer,
      destination,
      commodity,
      effectiveDate: row.effectiveDate,
      tier1: row.tiers?.[0] ?? null,
      tier2: row.tiers?.[1] ?? null,
      tier3: row.tiers?.[2] ?? null,
      tier4: row.tiers?.[3] ?? null,
      tier5: row.tiers?.[4] ?? null,
      createdAt: at,
      updatedAt: at,
    };
  });
}

export function storeFromLanes(lanes: readonly CustomerLane[]): CustomerLaneStore {
  const next: Record<string, CustomerLane> = {};
  for (const lane of lanes) next[lane.id] = lane;
  return { lanes: next };
}

export function seededCustomerLaneStore(at?: string): CustomerLaneStore {
  return storeFromLanes(lanesFromSeed(at));
}

export function cleanCustomerLane(raw: unknown): CustomerLane | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const customer = cleanPlaceName(rec.customer);
  if (!customer) return null;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : null;
  if (!id) return null;
  const effectiveDate =
    typeof rec.effectiveDate === "string"
      ? rec.effectiveDate
      : typeof rec.effective_date === "string"
        ? rec.effective_date
        : "";
  if (!isValidISODate(effectiveDate)) return null;
  const createdAt =
    typeof rec.createdAt === "string" && rec.createdAt
      ? rec.createdAt
      : typeof rec.created_at === "string" && rec.created_at
        ? rec.created_at
        : nowIso();
  const updatedAt =
    typeof rec.updatedAt === "string" && rec.updatedAt
      ? rec.updatedAt
      : typeof rec.updated_at === "string" && rec.updated_at
        ? rec.updated_at
        : createdAt;
  return {
    id,
    customer,
    destination: cleanPlaceName(rec.destination),
    commodity: cleanPlaceName(rec.commodity) || "Trash (MSW)",
    effectiveDate,
    tier1: parseMoney(rec.tier1),
    tier2: parseMoney(rec.tier2),
    tier3: parseMoney(rec.tier3),
    tier4: parseMoney(rec.tier4),
    tier5: parseMoney(rec.tier5),
    createdAt,
    updatedAt,
  };
}

export function readCustomerLanePersisted(): CustomerLanePersisted {
  try {
    const raw = localStorage.getItem(CUSTOMER_LANES_STORE_KEY);
    if (!raw) return { version: 1, lanes: {}, seenRemoteIds: [], seededAt: null };
    const parsed = JSON.parse(raw) as Partial<CustomerLanePersisted>;
    const lanes: Record<string, CustomerLane> = {};
    if (parsed.lanes && typeof parsed.lanes === "object") {
      for (const value of Object.values(parsed.lanes)) {
        const cleaned = cleanCustomerLane(value);
        if (cleaned) lanes[cleaned.id] = cleaned;
      }
    }
    const seen = Array.isArray(parsed.seenRemoteIds)
      ? parsed.seenRemoteIds.filter((id): id is string => typeof id === "string")
      : [];
    return {
      version: 1,
      lanes,
      seenRemoteIds: seen,
      seededAt: typeof parsed.seededAt === "string" ? parsed.seededAt : null,
    };
  } catch {
    return { version: 1, lanes: {}, seenRemoteIds: [], seededAt: null };
  }
}

export function writeCustomerLanePersisted(next: CustomerLanePersisted): void {
  try {
    localStorage.setItem(CUSTOMER_LANES_STORE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}

export function rowToCustomerLane(row: CustomerLaneRow): CustomerLane | null {
  return cleanCustomerLane({
    id: row.id,
    customer: row.customer,
    destination: row.destination ?? "",
    commodity: row.commodity ?? "Trash (MSW)",
    effectiveDate: row.effective_date?.slice(0, 10),
    tier1: row.tier1,
    tier2: row.tier2,
    tier3: row.tier3,
    tier4: row.tier4,
    tier5: row.tier5,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function customerLaneToRow(lane: CustomerLane, userId: string | null) {
  return {
    id: lane.id,
    customer: lane.customer,
    destination: lane.destination,
    commodity: lane.commodity,
    effective_date: lane.effectiveDate,
    tier1: lane.tier1,
    tier2: lane.tier2,
    tier3: lane.tier3,
    tier4: lane.tier4,
    tier5: lane.tier5,
    created_at: lane.createdAt,
    updated_at: lane.updatedAt,
    created_by: userId,
  };
}

export function upsertCustomerLane(
  store: CustomerLaneStore,
  input: CustomerLaneInput,
  at?: string,
): { store: CustomerLaneStore; lane: CustomerLane | null } {
  const customer = cleanPlaceName(input.customer);
  if (!customer) return { store, lane: null };
  if (!isValidISODate(input.effectiveDate)) return { store, lane: null };
  const stamp = nowIso(at);
  const prev = input.id ? store.lanes[input.id] : undefined;
  const lane: CustomerLane = {
    id: input.id ?? newId(),
    customer,
    destination: cleanPlaceName(input.destination ?? prev?.destination ?? ""),
    commodity: cleanPlaceName(input.commodity ?? prev?.commodity) || "Trash (MSW)",
    effectiveDate: input.effectiveDate,
    tier1: input.tier1 !== undefined ? parseMoney(input.tier1) : (prev?.tier1 ?? null),
    tier2: input.tier2 !== undefined ? parseMoney(input.tier2) : (prev?.tier2 ?? null),
    tier3: input.tier3 !== undefined ? parseMoney(input.tier3) : (prev?.tier3 ?? null),
    tier4: input.tier4 !== undefined ? parseMoney(input.tier4) : (prev?.tier4 ?? null),
    tier5: input.tier5 !== undefined ? parseMoney(input.tier5) : (prev?.tier5 ?? null),
    createdAt: prev?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  return { store: { lanes: { ...store.lanes, [lane.id]: lane } }, lane };
}

export function removeCustomerLane(
  store: CustomerLaneStore,
  id: string,
): { store: CustomerLaneStore; removed: CustomerLane | null } {
  const removed = store.lanes[id] ?? null;
  if (!removed) return { store, removed: null };
  const lanes = { ...store.lanes };
  delete lanes[id];
  return { store: { lanes }, removed };
}

export function customerNames(store: CustomerLaneStore): string[] {
  const names = new Set<string>();
  for (const lane of Object.values(store.lanes)) names.add(lane.customer);
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

export function lanesForCustomer(store: CustomerLaneStore, customer: string): CustomerLane[] {
  return Object.values(store.lanes)
    .filter((lane) => placesMatch(lane.customer, customer))
    .sort((a, b) => {
      const dest = a.destination.localeCompare(b.destination, "en");
      if (dest) return dest;
      const com = a.commodity.localeCompare(b.commodity, "en");
      if (com) return com;
      return b.effectiveDate.localeCompare(a.effectiveDate);
    });
}

/** Latest contract period for this customer+dest+commodity that is in force on `date`. */
export function rateForLoad(
  store: CustomerLaneStore,
  pickup: string,
  destination: string,
  commodity: string,
  date: string,
): CustomerLane | null {
  if (!isValidISODate(date)) return null;
  let best: CustomerLane | null = null;
  for (const lane of Object.values(store.lanes)) {
    if (isLaneStub(lane)) continue;
    if (!laneHasRates(lane)) continue;
    if (lane.effectiveDate > date) continue;
    if (!placesMatch(lane.customer, pickup)) continue;
    if (!placesMatch(lane.destination, destination)) continue;
    if (!commoditiesMatch(lane.commodity, commodity)) continue;
    if (!best || lane.effectiveDate > best.effectiveDate) best = lane;
  }
  return best;
}

export function mergeSeededLanes(store: CustomerLaneStore, at?: string): CustomerLaneStore {
  const seeded = lanesFromSeed(at);
  const lanes = { ...store.lanes };
  for (const row of seeded) {
    if (!lanes[row.id]) lanes[row.id] = row;
  }
  return { lanes };
}

export function currentLanesByCustomer(store: CustomerLaneStore, asOf: string): CustomerLane[] {
  const best = new Map<string, CustomerLane>();
  for (const lane of Object.values(store.lanes)) {
    if (lane.effectiveDate > asOf) continue;
    const key = `${normalizePlaceName(lane.customer)}|${normalizePlaceName(lane.destination)}|${laneCommodityKey(lane.commodity)}`;
    const prev = best.get(key);
    if (!prev || lane.effectiveDate > prev.effectiveDate) best.set(key, lane);
  }
  return [...best.values()].sort((a, b) => {
    const c = a.customer.localeCompare(b.customer, "en");
    if (c) return c;
    return a.destination.localeCompare(b.destination, "en");
  });
}
