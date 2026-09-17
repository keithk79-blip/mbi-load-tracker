import type { TabId } from "../types";

/** Retired dedicated Totals tab — those views now live on Today. */
const RETIRED_TOTALS_SLUG = "totals";

const TAB_SLUGS: Record<Exclude<TabId, "today">, string> = {
  trucks: "trucks",
  customers: "customers",
  analytics: "analytics",
  driver: "driver",
  vacation: "vacation",
  calloffs: "calloffs",
};

const SLUG_TO_TAB: Record<string, TabId> = {
  trucks: "trucks",
  customers: "customers",
  analytics: "analytics",
  driver: "driver",
  vacation: "vacation",
  calloffs: "calloffs",
};

type LocationBits = {
  pathname: string;
  search: string;
  hash: string;
};

function lastPathSegment(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return (slash === -1 ? trimmed : trimmed.slice(slash + 1)).toLowerCase();
}

function hashSlug(hash: string): string {
  return hash.replace(/^#\/?/, "").split(/[/?#]/, 1)[0]?.toLowerCase() ?? "";
}

function queryTab(search: string): string {
  return new URLSearchParams(search).get("tab")?.trim().toLowerCase() ?? "";
}

/** True when the URL only existed to open the old Totals tab. */
export function locationPointsAtTotals(loc: LocationBits): boolean {
  return (
    lastPathSegment(loc.pathname) === RETIRED_TOTALS_SLUG ||
    hashSlug(loc.hash) === RETIRED_TOTALS_SLUG ||
    queryTab(loc.search) === RETIRED_TOTALS_SLUG
  );
}

/**
 * Drop /totals, #totals, or ?tab=totals so old bookmarks open Today.
 * Returns the replacement href, or null when the URL is already fine.
 */
export function rewriteRetiredTotalsHref(loc: LocationBits): string | null {
  if (!locationPointsAtTotals(loc)) return null;

  const pathIsTotals = lastPathSegment(loc.pathname) === RETIRED_TOTALS_SLUG;
  const hashIsTotals = hashSlug(loc.hash) === RETIRED_TOTALS_SLUG;
  const params = new URLSearchParams(loc.search);
  const queryIsTotals = params.get("tab")?.trim().toLowerCase() === RETIRED_TOTALS_SLUG;

  const nextPath = pathIsTotals ? "/" : loc.pathname || "/";
  if (queryIsTotals) params.delete("tab");
  const nextSearch = params.toString() ? `?${params.toString()}` : "";
  const nextHash = hashIsTotals ? "" : loc.hash;

  return `${nextPath}${nextSearch}${nextHash}` || "/";
}

export function replaceRetiredTotalsLocation(
  loc: LocationBits,
  historyApi: Pick<History, "replaceState"> = history,
): boolean {
  const next = rewriteRetiredTotalsHref(loc);
  if (!next) return false;
  const current = `${loc.pathname}${loc.search}${loc.hash}`;
  if (next !== current) historyApi.replaceState(null, "", next);
  return true;
}

export function tabFromLocation(loc: LocationBits): TabId | null {
  if (locationPointsAtTotals(loc)) return "today";
  const path = lastPathSegment(loc.pathname);
  if (path && SLUG_TO_TAB[path]) return SLUG_TO_TAB[path];
  const hash = hashSlug(loc.hash);
  if (hash && SLUG_TO_TAB[hash]) return SLUG_TO_TAB[hash];
  const query = queryTab(loc.search);
  if (query && SLUG_TO_TAB[query]) return SLUG_TO_TAB[query];
  return null;
}

export function hrefForTab(tab: TabId): string {
  if (tab === "today") return "/";
  return `/${TAB_SLUGS[tab]}`;
}

/** Keep `/driver` and `/customers` in the URL when those tabs are open. */
export function replaceTabLocation(
  tab: TabId,
  loc: LocationBits = typeof window !== "undefined"
    ? { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
    : { pathname: "/", search: "", hash: "" },
  historyApi: Pick<History, "replaceState"> = history,
): void {
  const segment = lastPathSegment(loc.pathname);
  const pathTabs = new Set<TabId>(["driver", "customers"]);
  if (pathTabs.has(tab) && segment !== tab) {
    historyApi.replaceState(null, "", hrefForTab(tab));
    return;
  }
  if (!pathTabs.has(tab) && (segment === "driver" || segment === "customers")) {
    historyApi.replaceState(null, "", "/");
  }
}
