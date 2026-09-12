/** Retired dedicated Totals tab — those views now live on Today. */
const RETIRED_TOTALS_SLUG = "totals";

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
