import { useMemo } from "react";
import { fullRosterHiredNames, matchDriverNameSuggestions } from "../lib/driverRoster";
import { useDriverRoster } from "../store/DriverRosterContext";

const NICKNAMES: Record<string, string> = {
  mike: "michael",
  mikey: "michael",
  bob: "robert",
  bobby: "robert",
  rob: "robert",
  bill: "william",
  billy: "william",
  will: "william",
  jim: "james",
  jimmy: "james",
  joe: "joseph",
  joey: "joseph",
  dave: "david",
  danny: "daniel",
  dan: "daniel",
  tom: "thomas",
  tommy: "thomas",
  tony: "anthony",
  steve: "steven",
  stevie: "steven",
  chris: "christopher",
  jon: "john",
  johnny: "john",
  matt: "matthew",
  rich: "richard",
  rick: "richard",
  dick: "richard",
  andy: "andrew",
  drew: "andrew",
  greg: "gregory",
  jerry: "gerald",
  jeff: "jeffrey",
  tim: "timothy",
  pat: "patrick",
};

function queryVariants(query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const first = needle.split(/\s+/)[0] ?? needle;
  const canon = NICKNAMES[first];
  const out = [needle];
  if (canon && canon !== first) out.push(needle.replace(first, canon));
  for (const [nick, full] of Object.entries(NICKNAMES)) {
    if (full === first) out.push(needle.replace(first, nick));
  }
  return [...new Set(out)];
}

/** Hired Full Roster names from every yard. Shared source for typeahead. */
export function useFullRosterDriverNames(): string[] {
  const { store } = useDriverRoster();
  return useMemo(() => fullRosterHiredNames(store), [store]);
}

export function useDriverNameSuggestions(query: string, limit = 8): string[] {
  const names = useFullRosterDriverNames();
  return useMemo(() => {
    const seen = new Set<string>();
    const hits: string[] = [];
    for (const variant of queryVariants(query)) {
      for (const name of matchDriverNameSuggestions(names, variant, limit)) {
        if (seen.has(name)) continue;
        seen.add(name);
        hits.push(name);
        if (hits.length >= limit) return hits;
      }
    }
    return hits;
  }, [names, query, limit]);
}
