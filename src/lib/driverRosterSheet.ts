import { parseSheetDate } from "./chicagoDate";
import { parseCsv } from "./driverAvailability";
import {
  cleanDriverName,
  cleanDriverStatus,
  cleanTruckNumber,
  isDriverRosterYard,
  isRosterUnavailableToken,
  yardFromSheetTab,
  type DriverRosterKind,
  type DriverRosterYard,
  type ImportedRosterRow,
} from "./driverRoster";
import { rosterFullFetchUrl, rosterSatGridFetchUrl } from "./sheets";

export const FULL_ROSTER_TABS = [
  { yard: "burnham", tab: "Burnham" },
  { yard: "rockford", tab: "Rockford" },
  { yard: "pontiac", tab: "Pontiac" },
  { yard: "arc", tab: "ARC Drivers" },
  { yard: "zion", tab: "Zion" },
] as const satisfies readonly { yard: DriverRosterYard; tab: string }[];

export const SAT_ROSTER_TABS = [
  { yard: "burnham", tab: "Sat-Burnham" },
  { yard: "rockford", tab: "Sat-Rockford" },
  { yard: "pontiac", tab: "Sat-Pontiac" },
  { yard: "arc", tab: "Sat-Arc" },
  { yard: "zion", tab: "Sat-Zion" },
] as const satisfies readonly { yard: DriverRosterYard; tab: string }[];

const SUMMARY_RE =
  /^(?:total|all)\b.*\bdrivers?\b|\bdrivers?\s+(?:un)?available\b|^(?:un)?available\s+drivers?\b|^pit\s*time\b/i;

const TIME_RE = /^\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i;

const LOCATION_ONLY = new Set([
  "arc",
  "arc wf",
  "dekalb",
  "dekalb reload",
  "elgin",
  "grayslake",
  "joliet",
  "lincolnshire",
  "lrs",
  "morris",
  "northlake",
  "northlake wf",
  "pontiac",
  "reload",
  "roscoe",
  "zion",
]);

export type ParsedRosterPerson = {
  truckNumber: string | null;
  name: string;
  status: string | null;
};

export type ParsedRosterTab = {
  kind: DriverRosterKind;
  yard: DriverRosterYard;
  tab: string;
  forDate: string | null;
  people: ParsedRosterPerson[];
};

export function isRosterSummaryLabel(raw: string): boolean {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return false;
  return SUMMARY_RE.test(text);
}

export function isRosterStatusToken(raw: string): boolean {
  return isRosterUnavailableToken(raw);
}

export function isRosterTruckNumber(raw: string): boolean {
  return cleanTruckNumber(raw) !== null;
}

function letterCount(text: string): number {
  return (text.match(/[A-Za-z]/g) ?? []).length;
}

export function isRosterPersonName(raw: string): boolean {
  const name = cleanDriverName(raw);
  if (!name) return false;
  if (isRosterSummaryLabel(name)) return false;
  if (TIME_RE.test(name)) return false;
  if (parseSheetDate(name)) return false;
  if (isRosterTruckNumber(name)) return false;
  if (isRosterStatusToken(name)) return false;
  if (letterCount(name) < 2) return false;
  const key = name.toLowerCase();
  if (LOCATION_ONLY.has(key)) return false;
  return true;
}

function extractSheetDate(table: string[][]): string | null {
  for (const row of table) {
    for (const cell of row) {
      const iso = parseSheetDate(cell);
      if (iso) return iso;
    }
  }
  return null;
}

/**
 * Walk repeating truck | name | status? groups. Blank cells and summary
 * labels (`Total Burnham Drivers`, `Available Drivers`, …) are ignored.
 */
export function parseRosterPeople(csv: string): {
  people: ParsedRosterPerson[];
  forDate: string | null;
} {
  const table = parseCsv(csv);
  const found: Array<ParsedRosterPerson & { col: number; row: number }> = [];
  const seen = new Set<string>();

  table.forEach((row, rowIdx) => {
    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] ?? "").trim();
      if (!cell) continue;
      if (isRosterSummaryLabel(cell)) continue;
      if (parseSheetDate(cell)) continue;
      if (!isRosterTruckNumber(cell)) continue;

      let nameIdx = c + 1;
      while (nameIdx < row.length && !(row[nameIdx] ?? "").trim()) nameIdx += 1;
      if (nameIdx >= row.length) continue;
      const nameRaw = row[nameIdx] ?? "";
      if (!isRosterPersonName(nameRaw)) continue;

      const name = cleanDriverName(nameRaw);
      const truckNumber = cleanTruckNumber(cell);
      const next = (row[nameIdx + 1] ?? "").trim();
      const status = isRosterStatusToken(next) ? cleanDriverStatus(next) : null;
      const key = `${truckNumber ?? ""}|${name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ truckNumber, name, status, col: c, row: rowIdx });
      }
      c = status ? nameIdx + 1 : nameIdx;
    }
  });

  found.sort((a, b) => a.col - b.col || a.row - b.row);
  return {
    people: found.map(({ truckNumber, name, status }) => ({ truckNumber, name, status })),
    forDate: extractSheetDate(table),
  };
}

export function parseRosterTabCsv(
  csv: string,
  kind: DriverRosterKind,
  yard: DriverRosterYard,
  tab: string,
): ParsedRosterTab {
  const { people, forDate } = parseRosterPeople(csv);
  return {
    kind,
    yard,
    tab,
    forDate: kind === "sat" ? forDate : null,
    people,
  };
}

export function parsedTabToRows(tab: ParsedRosterTab): ImportedRosterRow[] {
  return tab.people.map((person) => ({
    kind: tab.kind,
    yard: tab.yard,
    truckNumber: person.truckNumber,
    name: person.name,
    status: tab.kind === "full" ? person.status : null,
    forDate: tab.kind === "sat" ? tab.forDate : null,
  }));
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheets HTTP ${res.status}`);
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
    throw new Error("Sheets proxy returned HTML instead of CSV");
  }
  return text;
}

/** One-time seed / explicit Import. Never used for Today’s available tally. */
export async function fetchRosterWorkbook(opts?: {
  fetchText?: (url: string) => Promise<string>;
}): Promise<{ rows: ImportedRosterRow[]; tabs: ParsedRosterTab[] }> {
  const load = opts?.fetchText ?? fetchText;
  const specs: Array<{ kind: DriverRosterKind; yard: DriverRosterYard; tab: string; url: string }> =
    [
      ...FULL_ROSTER_TABS.map((item) => ({
        kind: "full" as const,
        yard: item.yard,
        tab: item.tab,
        url: rosterFullFetchUrl(item.yard),
      })),
      ...SAT_ROSTER_TABS.map((item) => ({
        kind: "sat" as const,
        yard: item.yard,
        tab: item.tab,
        url: rosterSatGridFetchUrl(item.yard),
      })),
    ];

  const tabs = await Promise.all(
    specs.map(async (spec) => {
      const csv = await load(spec.url);
      return parseRosterTabCsv(csv, spec.kind, spec.yard, spec.tab);
    }),
  );

  return { tabs, rows: tabs.flatMap(parsedTabToRows) };
}

export function describeImportGroup(group: string): string {
  const [kind, yard] = group.split(":");
  const yardLabel = isDriverRosterYard(yard)
    ? yard.charAt(0).toUpperCase() + yard.slice(1)
    : yard;
  return `${kind === "sat" ? "Sat" : "Full"} · ${yardLabel}`;
}

export { yardFromSheetTab };
