/** SigAlert Chicago feed — Map.asp trafficData path, then ChicagoData.json.
 * Shared by the Cloudflare Pages Function, Vite dev middleware, and tests.
 * No Tauri imports (Workers bundler must not pull @tauri-apps).
 */

export type SigalertFeed = {
  region?: string;
  path?: string;
  cacheBuster?: number;
  incidents?: unknown;
};

export type SigalertTrafficMeta = {
  id: string;
  region: string;
  path: string;
  cacheBuster: number;
  rootPath: string;
};

export const SIGALERT_MAP_URL = "https://www.sigalert.com/Map.asp?region=Chicago";
export const SIGALERT_PAGES_PATH = "/api/sigalert";

const SIGALERT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 LoadTracker/1.0";

const ERROR_MAX = 180;

export function truncateTrafficError(text: string, max = ERROR_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export function errorDetail(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const rec = err as { message?: unknown; error?: unknown };
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
    try {
      return JSON.stringify(err);
    } catch {
      /* fall through */
    }
  }
  return String(err);
}

export function parseSigalertTrafficData(html: string): SigalertTrafficMeta {
  const key = '"trafficData"';
  const start = html.indexOf(key);
  if (start < 0) throw new Error("Map.asp HTML missing trafficData");
  const after = html.slice(start + key.length);
  const bracket = after.indexOf("[");
  if (bracket < 0) throw new Error("Map.asp trafficData is not an array");
  const src = after.slice(bracket);
  let depth = 0;
  let inStr = false;
  let escape = false;
  let end = -1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("unterminated trafficData array in Map.asp");
  const entries = JSON.parse(src.slice(0, end + 1)) as Array<{
    id?: string;
    region?: string;
    path?: string;
    cacheBuster?: number;
    rootPath?: string;
  }>;
  const chicago = entries.find(
    (e) =>
      (e.id && e.id.toLowerCase() === "chicago") ||
      (e.region && e.region.toLowerCase() === "chicago"),
  );
  if (!chicago?.path) throw new Error("Map.asp trafficData has no Chicago region");
  const cacheBuster = Number(chicago.cacheBuster);
  if (!Number.isFinite(cacheBuster)) {
    throw new Error("Map.asp Chicago trafficData missing cacheBuster");
  }
  return {
    id: chicago.id || "Chicago",
    region: chicago.region || "Chicago",
    path: chicago.path,
    cacheBuster,
    rootPath: chicago.rootPath || "/Data",
  };
}

export function sigalertDataUrls(meta: SigalertTrafficMeta): string[] {
  const root = (meta.rootPath || "/Data").replace(/\/+$/, "");
  const path = meta.path.replace(/^\/+|\/+$/g, "");
  const region = meta.region || "Chicago";
  const file = `${region}Data.json`;
  const q = `cb=${meta.cacheBuster}`;
  return [
    `https://cdn-dynamic.sigalert.com${root}/${path}/${file}?${q}`,
    `https://www.sigalert.com${root}/${path}/${file}?${q}`,
    `https://cdn.sigalert.com${root}/${path}/${file}?${q}`,
  ];
}

async function httpGetText(
  fetchImpl: typeof fetch,
  url: string,
  accept: string,
): Promise<string> {
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: accept,
      Referer: SIGALERT_MAP_URL,
      "User-Agent": SIGALERT_UA,
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url} ${truncateTrafficError(body, 80)}`);
  }
  return body;
}

export async function fetchSigalertFeedViaHttp(
  fetchImpl: typeof fetch = fetch,
): Promise<SigalertFeed> {
  const html = await httpGetText(
    fetchImpl,
    SIGALERT_MAP_URL,
    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  );
  const meta = parseSigalertTrafficData(html);
  const urls = sigalertDataUrls(meta);
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const body = await httpGetText(
        fetchImpl,
        url,
        "application/json,text/plain;q=0.9,*/*;q=0.8",
      );
      const parsed = JSON.parse(body) as { incidents?: unknown };
      if (!Array.isArray(parsed.incidents)) {
        throw new Error(`${url} missing incidents array`);
      }
      return {
        region: meta.region,
        path: meta.path,
        cacheBuster: meta.cacheBuster,
        incidents: parsed.incidents,
      };
    } catch (e) {
      errors.push(errorDetail(e));
    }
  }
  throw new Error(errors.join(" | ") || "SigAlert ChicagoData.json failed");
}

export function sigalertFeedJsonResponse(feed: SigalertFeed, status = 200): Response {
  return new Response(JSON.stringify(feed), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30, s-maxage=30",
    },
  });
}

export function sigalertErrorJsonResponse(err: unknown, status = 502): Response {
  return new Response(JSON.stringify({ error: errorDetail(err) }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
