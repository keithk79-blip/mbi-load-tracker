/** Chicago hot-corridor traffic from SigAlert.
 * Desktop: Tauri command `fetch_sigalert_chicago`, plugin-http fallback.
 * Web / phone: GET /api/sigalert (Cloudflare Pages Function, or Vite middleware in `npm run dev`).
 */

import {
  errorDetail,
  fetchSigalertFeedViaHttp,
  parseSigalertTrafficData,
  sigalertDataUrls,
  SIGALERT_PAGES_PATH,
  truncateTrafficError,
  type SigalertFeed,
  type SigalertTrafficMeta,
} from "./sigalertHttp";

export {
  errorDetail,
  fetchSigalertFeedViaHttp,
  parseSigalertTrafficData,
  sigalertDataUrls,
  SIGALERT_PAGES_PATH,
  truncateTrafficError,
};
export type { SigalertFeed, SigalertTrafficMeta };

export type TrafficAlertKind = "incident" | "construction" | "travel";

export type TrafficAlert = {
  id: string;
  kind: TrafficAlertKind;
  title: string;
  detail: string;
  severity?: string;
  congestion?: string;
  source?: string;
};

export type ChicagoTrafficSnapshot = {
  incidents: TrafficAlert[];
  construction: TrafficAlert[];
  travelTimes: TrafficAlert[];
  updatedAt: number | null;
  fetchedAt: number;
  errors: string[];
};

/** SigAlert incident row indexes (verified against live ChicagoData.json / client JS). */
export const SIGALERT_IDX = {
  rowId: 0,
  incidentId: 1,
  timeText: 2,
  location: 3,
  type: 4,
  severity: 5,
  started: 8,
  updated: 9,
} as const;

const ALERT_CAP = 12;

/** Hot corridors — match the primary road (before "between" / "at"). */
const CORRIDOR_RES: RegExp[] = [
  /\bI-?90\b/i,
  /\bI-?94\b/i,
  /\bI-?55\b/i,
  /\bI-?57\b/i,
  /\bI-?80\b/i,
  /\bI-?294\b/i,
  /\bI-?88\b/i,
  /\bI-?290\b/i,
  /\bI-?355\b/i,
  /\bLake\s*Shore\b/i,
  /\bLSD\b/i,
  /\bKennedy(\s+Express|\s+Expy|\s*\(I-)/i,
  /\bDan\s*Ryan\b/i,
  /\bEisenhower\b/i,
  /\bStevenson(\s+Express|\s+Expy|\s*\(I-)/i,
  /\bEdens\b/i,
  /\bJane\s*Addams\b/i,
  /\bTri-?State\b/i,
  /\bSkyway\b/i,
  /\bSkwy\b/i,
  /\bBishop\s*Ford\b/i,
];

const CORRIDOR_CHIPS = [
  "I-90",
  "I-94",
  "I-55",
  "I-57",
  "I-80",
  "I-294",
  "I-88",
  "I-290",
  "I-355",
  "LSD",
];

const CONSTRUCTION_RE =
  /construct|resurfac|paving|roadwork|work zone|bridge work|lane clos|ramp closed due to construction|maintenance|utility work/i;

export function corridorChipsLabel(): string {
  return CORRIDOR_CHIPS.join(" · ");
}

export function primaryRoad(text: string): string {
  if (!text) return "";
  return text.split(/\s+(?:between|at)\b/i)[0]?.trim() || text.trim();
}

export function isHotCorridor(text: string): boolean {
  if (!text) return false;
  return CORRIDOR_RES.some((re) => re.test(primaryRoad(text)));
}

/** True when running inside the Tauri desktop shell. */
export function isTauriDesktop(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

export function isConstructionType(typeText: string): boolean {
  return CONSTRUCTION_RE.test(typeText);
}

export function severityLabel(score: number): "severe" | "moderate" | "minor" {
  if (score >= 80) return "severe";
  if (score >= 30) return "moderate";
  return "minor";
}

function cell(row: unknown[], i: number): unknown {
  return i >= 0 && i < row.length ? row[i] : undefined;
}

function asText(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseTs(raw: string): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

type RawIncident = {
  id: string;
  location: string;
  type: string;
  timeText: string;
  severity: number;
  updatedMs: number | null;
};

function readIncident(row: unknown): RawIncident | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const id = asText(cell(row, SIGALERT_IDX.incidentId)) || asText(cell(row, SIGALERT_IDX.rowId));
  const location = asText(cell(row, SIGALERT_IDX.location));
  const type = asText(cell(row, SIGALERT_IDX.type));
  if (!id || (!location && !type)) return null;
  const updated =
    parseTs(asText(cell(row, SIGALERT_IDX.updated))) ??
    parseTs(asText(cell(row, SIGALERT_IDX.started)));
  return {
    id,
    location,
    type,
    timeText: asText(cell(row, SIGALERT_IDX.timeText)),
    severity: asNumber(cell(row, SIGALERT_IDX.severity)),
    updatedMs: updated,
  };
}

function toAlert(row: RawIncident, kind: TrafficAlertKind): TrafficAlert {
  const sev = severityLabel(row.severity);
  const bits = [
    sev !== "minor" ? sev[0].toUpperCase() + sev.slice(1) : "",
    row.type,
    row.timeText,
  ].filter(Boolean);
  return {
    id: `${kind}-${row.id}`,
    kind,
    title: row.location || "Incident",
    detail: bits.join(" · "),
    severity: sev,
    source: "SigAlert",
  };
}

function betterIncident(a: RawIncident, b: RawIncident): RawIncident {
  const aHot = isHotCorridor(a.location);
  const bHot = isHotCorridor(b.location);
  if (aHot !== bHot) return aHot ? a : b;
  if (a.severity !== b.severity) return a.severity > b.severity ? a : b;
  const aUp = a.updatedMs ?? 0;
  const bUp = b.updatedMs ?? 0;
  if (aUp !== bUp) return aUp > bUp ? a : b;
  return a.location.length >= b.location.length ? a : b;
}

function sortIncidents(a: RawIncident, b: RawIncident): number {
  if (b.severity !== a.severity) return b.severity - a.severity;
  const aUp = a.updatedMs ?? 0;
  const bUp = b.updatedMs ?? 0;
  if (bUp !== aUp) return bUp - aUp;
  return a.location.localeCompare(b.location);
}

export function snapshotFromSigalertIncidents(
  incidents: unknown,
  cap = ALERT_CAP,
  fetchedAt = Date.now(),
): ChicagoTrafficSnapshot {
  const rows = Array.isArray(incidents) ? incidents : [];
  const byId = new Map<string, RawIncident>();
  for (const raw of rows) {
    const row = readIncident(raw);
    if (!row) continue;
    if (!isHotCorridor(`${row.location} ${row.type}`)) continue;
    const prev = byId.get(row.id);
    byId.set(row.id, prev ? betterIncident(prev, row) : row);
  }

  const hot = [...byId.values()].sort(sortIncidents);
  const incidentRows: RawIncident[] = [];
  const constructionRows: RawIncident[] = [];
  for (const row of hot) {
    if (isConstructionType(row.type)) constructionRows.push(row);
    else incidentRows.push(row);
  }

  const incidentsOut = incidentRows.slice(0, cap).map((r) => toAlert(r, "incident"));
  const remaining = Math.max(0, cap - incidentsOut.length);
  const constructionOut = constructionRows
    .slice(0, remaining)
    .map((r) => toAlert(r, "construction"));

  return {
    incidents: incidentsOut,
    construction: constructionOut,
    travelTimes: [],
    updatedAt: null,
    fetchedAt,
    errors: [],
  };
}

function emptySnapshot(errors: string[], fetchedAt = Date.now()): ChicagoTrafficSnapshot {
  return {
    incidents: [],
    construction: [],
    travelTimes: [],
    updatedAt: null,
    fetchedAt,
    errors,
  };
}

function asFeed(value: unknown, via: string): SigalertFeed {
  if (typeof value === "string") {
    try {
      return asFeed(JSON.parse(value), via);
    } catch (e) {
      throw new Error(`${via}: not JSON (${errorDetail(e)})`);
    }
  }
  if (!value || typeof value !== "object") {
    throw new Error(`${via}: empty SigAlert payload`);
  }
  return value as SigalertFeed;
}

export async function fetchSigalertFeedViaPages(
  fetchImpl: typeof fetch = fetch,
): Promise<SigalertFeed> {
  const res = await fetchImpl(SIGALERT_PAGES_PATH, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${SIGALERT_PAGES_PATH} ${truncateTrafficError(body, 80)}`,
    );
  }
  return asFeed(JSON.parse(body), "pages /api/sigalert");
}

async function loadSigalertFeed(): Promise<SigalertFeed> {
  const errors: string[] = [];
  if (isTauriDesktop()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<unknown>("fetch_sigalert_chicago");
      return asFeed(raw, "tauri command");
    } catch (e) {
      errors.push(`tauri command: ${errorDetail(e)}`);
    }
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      return await fetchSigalertFeedViaHttp(tauriFetch as typeof fetch);
    } catch (e) {
      errors.push(`plugin-http: ${errorDetail(e)}`);
      throw new Error(errors.join(" | "));
    }
  }
  return fetchSigalertFeedViaPages();
}

export async function fetchChicagoTraffic(): Promise<ChicagoTrafficSnapshot> {
  try {
    const feed = await loadSigalertFeed();
    if (!Array.isArray(feed.incidents)) {
      throw new Error("SigAlert feed missing incidents array");
    }
    return snapshotFromSigalertIncidents(feed.incidents);
  } catch (e) {
    return emptySnapshot([truncateTrafficError(errorDetail(e))]);
  }
}

export function formatRelativeUpdated(
  ms: number | null,
  now = Date.now(),
): string {
  if (ms == null) return "just now";
  const sec = Math.max(0, Math.round((now - ms) / 1000));
  if (sec < 45) return "just now";
  if (sec < 90) return "1 min ago";
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  const hr = Math.round(sec / 3600);
  return hr === 1 ? "1 hr ago" : `${hr} hr ago`;
}

export function totalAlerts(s: ChicagoTrafficSnapshot): number {
  return s.incidents.length + s.construction.length + s.travelTimes.length;
}
