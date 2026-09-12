import type { VacationSeedWeek } from "../lib/vacationBoard";
import seed2025 from "./vacationSeed2025.json" with { type: "json" };

/**
 * 2026 named weeks from the MBI Vacation Calendar **Rockford 2026** tab.
 * Remaining weeks are filled by `applySeedWeeks` (capacity pattern + holidays).
 * Status is not in the export: Pay/Payout → paid, else approved.
 * Chicago is a separate yard — do not put Chicago names in this Rockford seed.
 */
export const VACATION_SEED_2026: VacationSeedWeek[] = [
  { weekOf: "12/29/25", label: "New Years", kind: "holiday" },
  { weekOf: "1/4/26", capacity: 8, names: ["Greg Cellarius"] },
  {
    weekOf: "1/11/26",
    capacity: 8,
    names: ["Devell Nutall", "Josh Maciejewski", "Ryan Lollis"],
  },
  {
    weekOf: "1/18/26",
    capacity: 8,
    names: ["John Deyoung", "Horus Frontino", "Jeff Haynes", "Doug Lautwein"],
  },
  {
    weekOf: "1/25/26",
    capacity: 8,
    names: ["Johnny Owens", "Horus Frontino", "Jerron Dove", "Jim Carter"],
  },
  { weekOf: "2/1/26", capacity: 8, names: ["Paul Finch"] },
  {
    weekOf: "2/8/26",
    capacity: 8,
    names: [
      "Terry Muzzarelli 2/11-2/24",
      "Francisco Ramirez",
      "Wojo Kubala",
      "Roberto Gonzalez",
      "Mike Davy 2/11-2/17",
    ],
  },
  {
    weekOf: "2/15/26",
    capacity: 8,
    names: [
      "Michael Schroeder",
      { name: "Terry Muzzarelli", note: "2/11–2/24" },
      "Randy Mesarchik",
      "Roberto Gonzalez",
      "Candido Antunez",
      "Kevin Bray",
      "Francisco Ramirez",
      "Tino Mendoza",
      "Shakey Sinks",
    ],
  },
  {
    weekOf: "2/22/26",
    capacity: 8,
    names: [
      "Kevin Bray",
      "Paul Tiemens",
      { name: "Terry Muzzarelli", note: "2/11–2/24" },
      "Roberto Gonzalez",
      "Dave Vanderbilt",
    ],
  },
  {
    weekOf: "3/1/26",
    capacity: 8,
    names: [
      "Bob Fedderman",
      "Paris Cochran",
      "Paul Tiemens",
      "Roberto Gonzalez",
      "Dave Vanderbilt",
      "Doug Lautwein",
      "Dave Rieck",
    ],
  },
  {
    weekOf: "3/8/26",
    capacity: 4,
    names: [
      "Bob Fedderman",
      "Jim Carter",
      "Chuck Toohey",
      "Hilton Acosta",
      "Elbert Echols",
      "Jerry Orr",
    ],
  },
  {
    weekOf: "3/15/26",
    capacity: 4,
    names: ["Hilton Acosta", "Daniel Alvarado", "Herber Hill", "Roy Strickland"],
  },
  {
    weekOf: "3/22/26",
    capacity: 4,
    names: ["Greg Cellarius", "Paul Finch", "Emile Spearman"],
  },
  {
    weekOf: "3/29/26",
    capacity: 4,
    names: [
      "Robert Mickelson",
      "Alex Acosta",
      "David Reick",
      "Kyle Odekirk",
      "Mickey Schroeder",
    ],
  },
];

/**
 * 2025 week structure (capacities + holidays). Driver names were not available
 * from the private sheet; the year still opens as a full calendar.
 */
export const VACATION_SEED_2025 = seed2025 as VacationSeedWeek[];

export const VACATION_SEEDS_BY_YEAR: Record<number, VacationSeedWeek[]> = {
  2025: VACATION_SEED_2025,
  2026: VACATION_SEED_2026,
};
