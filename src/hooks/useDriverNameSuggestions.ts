import { useMemo } from "react";
import { fullRosterHiredNames, matchDriverNameSuggestions } from "../lib/driverRoster";
import { useDriverRoster } from "../store/DriverRosterContext";

/** Hired Full Roster names from every yard. Shared source for typeahead. */
export function useFullRosterDriverNames(): string[] {
  const { store } = useDriverRoster();
  return useMemo(() => fullRosterHiredNames(store), [store]);
}

export function useDriverNameSuggestions(query: string, limit = 8): string[] {
  const names = useFullRosterDriverNames();
  return useMemo(
    () => matchDriverNameSuggestions(names, query, limit),
    [names, query, limit],
  );
}
