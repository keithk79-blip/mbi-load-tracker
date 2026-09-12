import { isTauriRuntime } from "./layout";
import {
  BURNHAM_OOT_PAIRS,
  ROCKFORD_OOT_PAIRS,
  SINGLE_COL_OOT_PAIRS,
  type CallOffRow,
  type OotPair,
} from "./driverAvailability";

export const DEFAULT_ROSTER_SHEET_ID = "1mdNWIsz7LZauHCccQBB7QzjR-Wo9pukGn8HrmODnPpw";
export const DEFAULT_CALLOFF_SHEET_ID = "1FnKGIuWfKCPvcaSwchnIpQjdezHKWC5O23jECPcJzyM";
/** Gone 2026 archive tab — one-time seed only. Contact columns are not fetched for storage. */
export const DEFAULT_GONE_SHEET_ID = "1azaww09ttC1p571RzB_NDkeBqAFkRBhpTboODpk4z40";
export const GONE_SHEET_TAB = "Gone 2026";
export const GONE_SHEET_GID = "544546254";
export const ROSTER_TAB = "Burnham";
export const ROSTER_CELL = "L13";
export const ROSTER_GRID_RANGE = "A:I";

/**
 * Weekday yard tabs on the Work-Dispatch workbook (one-time import only).
 * Live titles: Burnham, Rockford, Pontiac, ARC Drivers, Zion.
 */
export const OOT_YARDS = [
  {
    slug: "burnham",
    tab: "Burnham",
    range: "A:I",
    pairs: BURNHAM_OOT_PAIRS,
    label: "Burnham",
  },
  {
    slug: "rockford",
    tab: "Rockford",
    range: "A:F",
    pairs: ROCKFORD_OOT_PAIRS,
    label: "Rockford",
  },
  {
    slug: "pontiac",
    tab: "Pontiac",
    range: "A:C",
    pairs: SINGLE_COL_OOT_PAIRS,
    label: "Pontiac",
  },
  {
    slug: "arc",
    tab: "ARC Drivers",
    range: "A:C",
    pairs: SINGLE_COL_OOT_PAIRS,
    label: "ARC",
  },
  {
    slug: "zion",
    tab: "Zion",
    range: "A:C",
    pairs: SINGLE_COL_OOT_PAIRS,
    label: "Zion",
  },
] as const satisfies readonly {
  slug: string;
  tab: string;
  range: string;
  pairs: readonly OotPair[];
  label: string;
}[];

export const SATURDAY_CELLS = [
  { slug: "burnham", tab: "Sat-Burnham", range: "I4" },
  { slug: "rockford", tab: "Sat-Rockford", range: "I4" },
  { slug: "pontiac", tab: "Sat-Pontiac", range: "H3" },
  { slug: "arc", tab: "Sat-Arc", range: "H3" },
  { slug: "zion", tab: "Sat-Zion", range: "H3" },
] as const;

/** Full-grid ranges for the Driver tab one-time import. */
export const ROSTER_FULL_GRID_RANGE = "A:Z";
export const ROSTER_SAT_GRID_RANGE = "A:Z";

export const FULL_ROSTER_SHEETS = [
  { slug: "burnham", tab: "Burnham" },
  { slug: "rockford", tab: "Rockford" },
  { slug: "pontiac", tab: "Pontiac" },
  { slug: "arc", tab: "ARC Drivers" },
  { slug: "zion", tab: "Zion" },
] as const;

export const SAT_ROSTER_SHEETS = [
  { slug: "burnham", tab: "Sat-Burnham" },
  { slug: "rockford", tab: "Sat-Rockford" },
  { slug: "pontiac", tab: "Sat-Pontiac" },
  { slug: "arc", tab: "Sat-Arc" },
  { slug: "zion", tab: "Sat-Zion" },
] as const;

/**
 * Footer holiday notes sit a few rows below each Sat yard list. gviz drops
 * those isolated cells when a range starts inside the driver table (so A1:I2
 * and a full-tab export both miss “full mandatory work day”). Two bands that
 * start after typical list lengths catch the existing Labor Day note.
 */
export const SATURDAY_BODY_SCANS = [
  { key: "upper", range: "A14:Z35" },
  { key: "lower", range: "A28:Z80" },
] as const;

const SATURDAY_FULL_MANDATORY_RE = /full mandatory work day/i;

/** True when any Sat-tab CSV body marks a full mandatory / holiday work day. */
export function saturdaySheetsUseWeekdayBase(bodies: readonly string[]): boolean {
  return bodies.some((text) => SATURDAY_FULL_MANDATORY_RE.test(text));
}

const CACHE_KEY = "chitrader.load-tracker.drivers.v1";

export type DriverSnapshot = {
  baseAvailable: number;
  saturdayAvailable: number;
  /** Sat tabs say full-mandatory / holiday — use weekday Full Roster + call-off rules. */
  saturdayUsesWeekdayBase: boolean;
  offs: CallOffRow[];
  ootNames: string[];
  fetchedAt: string;
  source: "live" | "cache";
};

type Cached = {
  version: 1 | 2 | 3 | 4;
  baseAvailable: number;
  saturdayAvailable?: number;
  saturdayUsesWeekdayBase?: boolean;
  offs: CallOffRow[];
  ootNames?: string[];
  fetchedAt: string;
};

function rosterId(): string {
  return import.meta.env.VITE_ROSTER_SHEET_ID || DEFAULT_ROSTER_SHEET_ID;
}

function googleCsvUrl(sheetId: string, query: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&${query}`;
}
/** Vite `/sheets/*` proxy only exists in `vite dev` / `vite preview`. */
function useSheetProxy(): boolean {
  return !isTauriRuntime() && import.meta.env.DEV;
}

/** One-time Driver-tab seed only. Not used for Today’s available count. */
export function rosterFullFetchUrl(slug: string): string {
  const sheet = FULL_ROSTER_SHEETS.find((row) => row.slug === slug);
  const tab = sheet?.tab ?? "Burnham";
  if (useSheetProxy()) return `/sheets/roster-full/${slug}`;
  return googleCsvUrl(
    rosterId(),
    `sheet=${encodeURIComponent(tab)}&range=${encodeURIComponent(ROSTER_FULL_GRID_RANGE)}`,
  );
}

export function rosterSatGridFetchUrl(slug: string): string {
  const sheet = SAT_ROSTER_SHEETS.find((row) => row.slug === slug);
  const tab = sheet?.tab ?? "Sat-Burnham";
  if (useSheetProxy()) return `/sheets/roster-sat/${slug}`;
  return googleCsvUrl(
    rosterId(),
    `sheet=${encodeURIComponent(tab)}&range=${encodeURIComponent(ROSTER_SAT_GRID_RANGE)}`,
  );
}

/** One-time Gone archive seed. Parser keeps emp # / name / hire / term / notes only. */
export function rosterGoneFetchUrl(): string {
  if (useSheetProxy()) return "/sheets/roster-gone";
  return googleCsvUrl(DEFAULT_GONE_SHEET_ID, `gid=${GONE_SHEET_GID}`);
}

export function readDriverCache(): DriverSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (typeof parsed?.baseAvailable !== "number") return null;
    if (!Array.isArray(parsed.offs)) return null;
    return {
      baseAvailable: parsed.baseAvailable,
      saturdayAvailable:
        typeof parsed.saturdayAvailable === "number" ? parsed.saturdayAvailable : 0,
      saturdayUsesWeekdayBase: parsed.saturdayUsesWeekdayBase === true,
      offs: parsed.offs,
      ootNames: Array.isArray(parsed.ootNames) ? parsed.ootNames : [],
      fetchedAt: parsed.fetchedAt,
      source: "cache",
    };
  } catch {
    return null;
  }
}

/**
 * @deprecated Live Today tally must not call this. Full Roster + manuals only.
 * Kept so old caches can still be read; it never hits Google.
 */
export async function fetchDriverSnapshot(): Promise<DriverSnapshot> {
  const snap: DriverSnapshot = {
    baseAvailable: 0,
    saturdayAvailable: 0,
    saturdayUsesWeekdayBase: true,
    offs: [],
    ootNames: [],
    fetchedAt: new Date().toISOString(),
    source: "live",
  };
  return snap;
}
