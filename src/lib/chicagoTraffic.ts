/** Chicago hot-corridor traffic from Travel Midwest / IDOT Gateway.
 * Desktop (Tauri) only — POSTs via `@tauri-apps/plugin-http` (no WebView CORS).
 */

export const CHICAGO_BBOX: [number, number, number, number] = [
  -88.55, 41.35, -87.35, 42.25,
];

export type TrafficKind = "incident" | "construction" | "travelTime";

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

type GeoFeature = {
  type?: string;
  properties?: Record<string, unknown>;
};

type FeatureCollection = {
  type?: string;
  features?: GeoFeature[];
  timestamp?: string;
};

const KIND_UPSTREAM: Record<TrafficKind, string> = {
  incident: "https://travelmidwest.com/lmiga/incidentMap.json",
  construction: "https://travelmidwest.com/lmiga/constructionMap.json",
  travelTime: "https://travelmidwest.com/lmiga/travelTimeMap.json",
};

/** Hot corridors only — match locDesc / desc. */
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
  /\bKennedy\b/i,
  /\bDan\s*Ryan\b/i,
  /\bEisenhower\b/i,
  /\bStevenson\b/i,
  /\bEdens\b/i,
  /\bJane\s*Addams\b/i,
  /\bTri-?State\b/i,
  /\bSkyway\b/i,
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

export function corridorChipsLabel(): string {
  return CORRIDOR_CHIPS.join(" · ");
}

export function isHotCorridor(text: string): boolean {
  if (!text) return false;
  return CORRIDOR_RES.some((re) => re.test(text));
}

/** True when running inside the Tauri desktop shell. */
export function isTauriDesktop(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function propsOf(f: GeoFeature): Record<string, unknown> {
  return f.properties && typeof f.properties === "object" ? f.properties : {};
}

export function trafficEndpoint(kind: TrafficKind): string {
  return KIND_UPSTREAM[kind];
}

/** Browser `fetch` hits CORS in the Tauri WebView; the HTTP plugin does not. */
async function trafficFetch(
  input: string,
  init: RequestInit,
): Promise<Response> {
  if (isTauriDesktop()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}

async function postMap(kind: TrafficKind): Promise<FeatureCollection> {
  const res = await trafficFetch(trafficEndpoint(kind), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bbox: CHICAGO_BBOX }),
  });
  if (!res.ok) {
    throw new Error(`${kind} ${res.status}`);
  }
  return (await res.json()) as FeatureCollection;
}

function parseTs(raw: string | undefined): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export function normalizeIncidents(fc: FeatureCollection): TrafficAlert[] {
  const out: TrafficAlert[] = [];
  const seen = new Set<string>();
  for (const f of fc.features ?? []) {
    const p = propsOf(f);
    const loc = str(p.locDesc);
    const desc = str(p.desc);
    if (!isHotCorridor(`${loc} ${desc}`)) continue;
    const id = str(p.id) || `${loc}|${str(p.closure)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const closure = str(p.closure);
    const src = str(p.src);
    const detailParts = [
      closure,
      desc && desc !== closure ? desc : "",
      src ? `src ${src}` : "",
    ].filter(Boolean);
    out.push({
      id,
      kind: "incident",
      title: loc || "Incident",
      detail: detailParts.join(" · "),
      severity: str(p.lanes) || undefined,
      source: src || undefined,
    });
  }
  return out;
}

function constructionScore(p: Record<string, unknown>): number {
  const lanes = str(p.lanes).toLowerCase();
  const sev = str(p.sev).toLowerCase();
  let score = 0;
  if (lanes === "full") score += 40;
  if (sev === "high" || sev === "major") score += 30;
  else if (sev === "medium") score += 15;
  if (/all lanes/i.test(str(p.closure))) score += 10;
  return score;
}

export function normalizeConstruction(
  fc: FeatureCollection,
  cap = 8,
): TrafficAlert[] {
  type Scored = { alert: TrafficAlert; score: number };
  const scored: Scored[] = [];
  const seen = new Set<string>();
  for (const f of fc.features ?? []) {
    const p = propsOf(f);
    const loc = str(p.locDesc);
    const desc = str(p.desc);
    if (!isHotCorridor(`${loc} ${desc}`)) continue;
    const lanes = str(p.lanes).toLowerCase();
    const sev = str(p.sev).toLowerCase();
    const prefer =
      lanes === "full" ||
      sev === "high" ||
      sev === "major" ||
      sev === "medium";
    if (!prefer) continue;
    const id = str(p.id) || `${loc}|${str(p.closure)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const closure = str(p.closure);
    const src = str(p.src);
    const detail = [closure, src].filter(Boolean).join(" · ");
    scored.push({
      score: constructionScore(p),
      alert: {
        id,
        kind: "construction",
        title: loc || "Construction",
        detail,
        severity: str(p.sev) || str(p.lanes) || undefined,
        source: src || undefined,
      },
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, cap).map((s) => s.alert);
}

const CNG_RANK: Record<string, number> = {
  heavy: 3,
  medium: 2,
  light: 1,
};

export function normalizeTravelTimes(
  fc: FeatureCollection,
  cap = 6,
): TrafficAlert[] {
  type Scored = { alert: TrafficAlert; rank: number };
  const scored: Scored[] = [];
  const seen = new Set<string>();
  for (const f of fc.features ?? []) {
    const p = propsOf(f);
    const loc = str(p.locDesc);
    if (!isHotCorridor(loc)) continue;
    const cng = str(p.cng);
    if (!cng || /^uncongested$/i.test(cng)) continue;
    const id = str(p.id) || loc;
    if (seen.has(id)) continue;
    seen.add(id);
    const tt = str(p.tt);
    const spd = str(p.spd);
    const detail = [tt, spd, cng].filter(Boolean).join(" · ");
    scored.push({
      rank: CNG_RANK[cng.toLowerCase()] ?? 0,
      alert: {
        id,
        kind: "travel",
        title: loc,
        detail,
        congestion: cng,
      },
    });
  }
  scored.sort((a, b) => b.rank - a.rank);
  return scored.slice(0, cap).map((s) => s.alert);
}

export async function fetchChicagoTraffic(): Promise<ChicagoTrafficSnapshot> {
  const errors: string[] = [];
  let incidents: TrafficAlert[] = [];
  let construction: TrafficAlert[] = [];
  let travelTimes: TrafficAlert[] = [];
  let updatedAt: number | null = null;

  const results = await Promise.allSettled([
    postMap("incident"),
    postMap("construction"),
    postMap("travelTime"),
  ]);

  const [incRes, conRes, ttRes] = results;

  if (incRes.status === "fulfilled") {
    incidents = normalizeIncidents(incRes.value);
    updatedAt = parseTs(incRes.value.timestamp) ?? updatedAt;
  } else {
    errors.push("incidents");
  }

  if (conRes.status === "fulfilled") {
    construction = normalizeConstruction(conRes.value);
    updatedAt = parseTs(conRes.value.timestamp) ?? updatedAt;
  } else {
    errors.push("construction");
  }

  if (ttRes.status === "fulfilled") {
    travelTimes = normalizeTravelTimes(ttRes.value);
    updatedAt = parseTs(ttRes.value.timestamp) ?? updatedAt;
  } else {
    errors.push("travel times");
  }

  return {
    incidents,
    construction,
    travelTimes,
    updatedAt,
    fetchedAt: Date.now(),
    errors,
  };
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
