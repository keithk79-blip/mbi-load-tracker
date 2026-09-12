/**
 * Today’s available-driver base from in-app Full Roster — not Burnham!L13.
 *
 *   available = hired − status − Vacation VAC − full-day offs
 *               (Late/Early listed, not subtracted)
 *
 * Chicago = Burnham + Rockford + Pontiac + Arc + Zion.
 * Saturday uses the same Full Roster formula (no Sat-* sheet sums).
 * Sync/import/VAC never delete roster rows.
 */

import {
  DRIVER_ROSTER_YARDS,
  entriesForRoster,
  rosterStatusRemovesFromAvailable,
  type DriverRosterEntry,
  type DriverRosterStore,
  type FullRosterTally,
} from "./driverRoster";
import {
  type CallOffRow,
  type ManualCallOff,
} from "./driverAvailability";
import type { LiveSheet } from "./driverDays";
import {
  effectiveRosterStatus,
  rosterNamesMatch,
  vacationNamesOnDate,
} from "./rosterVacation";
import type { VacationStore } from "./vacationBoard";

export function chicagoFullRosterTally(
  roster: DriverRosterStore,
  vacation: VacationStore,
  date: string,
): FullRosterTally {
  let hired = 0;
  let unavailable = 0;
  for (const yard of DRIVER_ROSTER_YARDS) {
    const names = vacationNamesOnDate(vacation, date, yard);
    for (const entry of entriesForRoster(roster, "full", yard)) {
      hired += 1;
      const effective = effectiveRosterStatus(entry, names);
      if (
        rosterStatusRemovesFromAvailable(effective.status) ||
        effective.onVacation
      ) {
        unavailable += 1;
      }
    }
  }
  return {
    hired,
    unavailable,
    available: Math.max(0, hired - unavailable),
  };
}

export function rosterUnavailableEntries(
  roster: DriverRosterStore,
  vacation: VacationStore,
  date: string,
): DriverRosterEntry[] {
  const out: DriverRosterEntry[] = [];
  for (const yard of DRIVER_ROSTER_YARDS) {
    const names = vacationNamesOnDate(vacation, date, yard);
    for (const entry of entriesForRoster(roster, "full", yard)) {
      const effective = effectiveRosterStatus(entry, names);
      if (rosterStatusRemovesFromAvailable(effective.status) || effective.onVacation) {
        out.push(entry);
      }
    }
  }
  return out;
}

export function rosterOotNames(roster: DriverRosterStore): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const yard of DRIVER_ROSTER_YARDS) {
    for (const entry of entriesForRoster(roster, "full", yard)) {
      if ((entry.status ?? "").toLowerCase() !== "oot") continue;
      const key = entry.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(entry.name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export function nameMatchesUnavailable(
  name: string,
  unavailable: readonly Pick<DriverRosterEntry, "name">[],
): boolean {
  return unavailable.some((entry) => rosterNamesMatch(entry.name, name));
}

/** Drop call-off rows already counted as roster status / Vacation VAC. */
export function dropOffsAlreadyUnavailable(
  offs: readonly CallOffRow[],
  unavailable: readonly Pick<DriverRosterEntry, "name">[],
): CallOffRow[] {
  return offs.filter((row) => !nameMatchesUnavailable(row.name, unavailable));
}

export function dropManualsAlreadyUnavailable(
  manuals: readonly ManualCallOff[] | undefined,
  unavailable: readonly Pick<DriverRosterEntry, "name">[],
): ManualCallOff[] | undefined {
  if (!manuals?.length) return manuals ? [...manuals] : undefined;
  return manuals.filter((row) => {
    if (row.kind === "late-early") return true;
    return !nameMatchesUnavailable(row.name, unavailable);
  });
}

export function liveSheetFromRoster(input: {
  roster: DriverRosterStore;
  vacation: VacationStore;
  date: string;
  offs: readonly CallOffRow[];
  manuals?: readonly ManualCallOff[];
  saturdayUsesWeekdayBase: boolean;
}): LiveSheet {
  const tally = chicagoFullRosterTally(input.roster, input.vacation, input.date);
  const unavailable = rosterUnavailableEntries(input.roster, input.vacation, input.date);
  return {
    base: tally.available,
    saturdayBase: tally.available,
    saturdayUsesWeekdayBase: input.saturdayUsesWeekdayBase,
    offs: dropOffsAlreadyUnavailable(input.offs, unavailable),
    ootNames: rosterOotNames(input.roster),
    manualOffs: dropManualsAlreadyUnavailable(input.manuals, unavailable),
  };
}
