/**
 * Vacation tab → Full Roster auto-VAC (derived, not persisted).
 *
 * Today’s available tally uses `liveSheetFromRoster` (Full Roster − VAC −
 * leftover full-day offs). Per-yard join:
 *
 *   const names = vacationNamesOnDate(vacationStore, chicagoDate, rosterYard);
 *   const { hired, unavailable, available } = fullRosterTally(fullEntries, {
 *     treatAsUnavailable: (entry) => rosterEntryOnVacation(entry, names),
 *   });
 *
 * Yard map: Rockford vacation ↔ Rockford roster; Chicago vacation ↔
 * Burnham / Pontiac / Arc / Zion. Prefer that mapping, then fall back to
 * the other Vacation yard (Vacation is names-only).
 *
 * Read-only: never writes `status`, never deletes hired / Sat rows. VAC is
 * derived at display/tally time so a week rollover cannot wipe the roster.
 */

import {
  fullRosterTally,
  type DriverRosterEntry,
  type DriverRosterYard,
  type FullRosterTally,
} from "./driverRoster";
import {
  entriesForWeek,
  sundayOnOrBefore,
  vacationNameKey,
  type VacationStore,
  type VacationYard,
} from "./vacationBoard";

const FIRST_NAME_ALIASES: Record<string, string> = {
  al: "albert",
  alex: "alexander",
  andy: "andrew",
  bill: "william",
  billy: "william",
  bob: "robert",
  bobby: "robert",
  chris: "christopher",
  dan: "daniel",
  danny: "daniel",
  dave: "david",
  dick: "richard",
  jeff: "jeffrey",
  jim: "james",
  jimmy: "james",
  joe: "joseph",
  joey: "joseph",
  johnnie: "john",
  johnny: "john",
  jon: "john",
  matt: "matthew",
  mike: "michael",
  mikey: "michael",
  rich: "richard",
  rick: "richard",
  rob: "robert",
  steve: "steven",
  stevie: "steven",
  tom: "thomas",
  tommy: "thomas",
  tony: "anthony",
  will: "william",
};

export type EffectiveRosterStatus = {
  /** Status used for tally / display (`vac` when Vacation wins). */
  status: string | null;
  source: "vacation" | "manual" | null;
  storedStatus: string | null;
  onVacation: boolean;
};

export function vacationYardForRosterYard(yard: DriverRosterYard): VacationYard {
  return yard === "rockford" ? "rockford" : "chicago";
}

/** Preferred Vacation yard first, then the other (names-only fallback). */
export function vacationYardsForRosterYard(yard: DriverRosterYard): VacationYard[] {
  const preferred = vacationYardForRosterYard(yard);
  const other: VacationYard = preferred === "rockford" ? "chicago" : "rockford";
  return [preferred, other];
}

/** Lowercase, collapse space, drop nicknames / trainer `-T` suffixes. */
export function rosterNameKey(name: string): string {
  return vacationNameKey(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,'/]/g, " ")
    .replace(/\s*-\s*t\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rosterNamesMatch(a: string, b: string): boolean {
  const ka = rosterNameKey(a);
  const kb = rosterNameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;

  const ta = ka.split(" ").filter(Boolean);
  const tb = kb.split(" ").filter(Boolean);
  if (ta.length >= 2 && tb.length >= 2 && (ka.startsWith(`${kb} `) || kb.startsWith(`${ka} `))) {
    return true;
  }
  if (ta.length < 2 || tb.length < 2) return false;
  if (!firstNamesMatch(ta[0], tb[0])) return false;
  return lastNamesMatch(ta[ta.length - 1], tb[tb.length - 1]);
}

export function vacationNamesOnDate(
  vacation: VacationStore,
  date: string,
  rosterYard: DriverRosterYard,
): string[] {
  const weekOf = sundayOnOrBefore(date);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const yard of vacationYardsForRosterYard(rosterYard)) {
    for (const entry of entriesForWeek(vacation, weekOf, yard)) {
      const key = rosterNameKey(entry.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(entry.name);
    }
  }
  return names;
}

export function rosterEntryOnVacation(
  entry: Pick<DriverRosterEntry, "name">,
  vacationNames: readonly string[],
): boolean {
  return vacationNames.some((name) => rosterNamesMatch(entry.name, name));
}

export function effectiveRosterStatus(
  entry: Pick<DriverRosterEntry, "name" | "status">,
  vacationNames: readonly string[],
): EffectiveRosterStatus {
  const stored = entry.status?.trim() ? entry.status : null;
  const onVacation = rosterEntryOnVacation(entry, vacationNames);
  if (onVacation) {
    return { status: "vac", source: "vacation", storedStatus: stored, onVacation: true };
  }
  if (stored) {
    return { status: stored, source: "manual", storedStatus: stored, onVacation: false };
  }
  return { status: null, source: null, storedStatus: null, onVacation: false };
}

export function fullRosterTallyForDate(
  entries: readonly DriverRosterEntry[],
  vacation: VacationStore,
  date: string,
  rosterYard: DriverRosterYard,
): FullRosterTally {
  const vacationNames = vacationNamesOnDate(vacation, date, rosterYard);
  return fullRosterTally(entries, {
    treatAsUnavailable: (entry) => rosterEntryOnVacation(entry, vacationNames),
  });
}

function firstNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (canonicalFirst(a) === canonicalFirst(b)) return true;
  return fuzzyToken(a, b);
}

function lastNamesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return fuzzyToken(a, b);
}

function canonicalFirst(token: string): string {
  return FIRST_NAME_ALIASES[token] ?? token;
}

function fuzzyToken(a: string, b: string): boolean {
  const min = Math.min(a.length, b.length);
  return min >= 5 && editDistance(a, b) <= 1;
}

/** Damerau–Levenshtein (adjacent transposition counts as 1). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = best;
    }
  }
  return dp[m][n];
}
