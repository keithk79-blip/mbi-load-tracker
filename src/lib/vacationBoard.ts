/** Vacation calendar board — week rows, driver entries, local persist + cloud merge. */

import {
  addDays,
  isValidISODate,
  parseISODate,
  parseSheetDate,
  weekdayOfISO,
  yearOfISO,
} from "./chicagoDate";

export const VACATION_STORE_KEY = "chitrader.load-tracker.vacation.v2";
export const VACATION_YARD_STORAGE_KEY = "chitrader.load-tracker.vacation-yard.v1";

export const VACATION_STATUSES = ["pending", "approved", "paid"] as const;
export type VacationStatus = (typeof VACATION_STATUSES)[number];

export const VACATION_WEEK_KINDS = ["open", "holiday", "blocked"] as const;
export type VacationWeekKind = (typeof VACATION_WEEK_KINDS)[number];

export const VACATION_YARDS = ["rockford", "chicago"] as const;
export type VacationYard = (typeof VACATION_YARDS)[number];
export const DEFAULT_VACATION_YARD: VacationYard = "rockford";

export const VACATION_YARD_LABELS: Record<VacationYard, string> = {
  rockford: "Rockford",
  chicago: "Chicago",
};

export type VacationEntry = {
  id: string;
  yard: VacationYard;
  weekOf: string;
  name: string;
  note: string;
  status: VacationStatus;
  createdAt: string;
  updatedAt: string;
};

export type VacationWeek = {
  yard: VacationYard;
  weekOf: string;
  year: number;
  capacity: number | null;
  label: string;
  kind: VacationWeekKind;
  createdAt: string;
  updatedAt: string;
};

export type VacationStore = {
  weeks: Record<string, VacationWeek>;
  entries: Record<string, VacationEntry>;
};

export type VacationPersisted = {
  version: 1 | 2;
  weeks: Record<string, VacationWeek>;
  entries: Record<string, VacationEntry>;
  deletedWeekOfs: string[];
  deletedEntryIds: string[];
  seenRemoteWeekOfs: string[];
  seenRemoteEntryIds: string[];
};

export type VacationSeedCell = {
  name: string;
  note?: string;
  status?: VacationStatus;
};

export type VacationSeedWeek = {
  weekOf: string;
  capacity?: number | null;
  label?: string;
  kind?: VacationWeekKind;
  names?: Array<string | VacationSeedCell>;
};

const STATUS_SET = new Set<string>(VACATION_STATUSES);
const KIND_SET = new Set<string>(VACATION_WEEK_KINDS);
const YARD_SET = new Set<string>(VACATION_YARDS);

const HOLIDAY_ALIASES: Record<string, string> = {
  blocked: "Blocked",
  "new years": "New Years",
  "new year's": "New Years",
  "new year": "New Years",
  "new year's day": "New Years",
  "memorial day": "Memorial Day",
  "4th of july": "4th of July",
  "fourth of july": "4th of July",
  "independence day": "4th of July",
  "labor day": "Labor Day",
  thanksgiving: "Thanksgiving",
  christmas: "Christmas",
  "christmas day": "Christmas",
};

export function isVacationStatus(value: unknown): value is VacationStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function isVacationWeekKind(value: unknown): value is VacationWeekKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function isVacationYard(value: unknown): value is VacationYard {
  return typeof value === "string" && YARD_SET.has(value);
}

export function cleanVacationYard(value: unknown): VacationYard {
  return isVacationYard(value) ? value : DEFAULT_VACATION_YARD;
}

export function vacationYardLabel(yard: VacationYard, year?: number): string {
  const name = VACATION_YARD_LABELS[yard];
  return year != null ? `${name} ${year}` : name;
}

/** Composite store / tombstone key so Rockford and Chicago can share a Sunday. */
export function vacationWeekKey(yard: VacationYard, weekOf: string): string {
  return `${yard}:${weekOf}`;
}

export function parseVacationWeekKey(
  key: string,
): { yard: VacationYard; weekOf: string } | null {
  if (!key) return null;
  const colon = key.indexOf(":");
  if (colon === -1) {
    const weekOf = normalizeWeekOf(key);
    return weekOf ? { yard: DEFAULT_VACATION_YARD, weekOf } : null;
  }
  const yard = cleanVacationYard(key.slice(0, colon));
  const weekOf = normalizeWeekOf(key.slice(colon + 1));
  return weekOf ? { yard, weekOf } : null;
}

export function readSelectedVacationYard(): VacationYard {
  try {
    return cleanVacationYard(localStorage.getItem(VACATION_YARD_STORAGE_KEY));
  } catch {
    return DEFAULT_VACATION_YARD;
  }
}

export function writeSelectedVacationYard(yard: VacationYard): void {
  localStorage.setItem(VACATION_YARD_STORAGE_KEY, yard);
}

export function vacationNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sundayOnOrBefore(iso: string): string {
  const dow = weekdayOfISO(iso);
  return addDays(iso, -dow);
}

export function sundayOnOrAfter(iso: string): string {
  const dow = weekdayOfISO(iso);
  return dow === 0 ? iso : addDays(iso, 7 - dow);
}

/** Sundays from the week containing Jan 1 through the week containing Dec 31. */
export function sundaysForVacationYear(year: number): string[] {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return [];
  const start = sundayOnOrBefore(`${year}-01-01`);
  const end = sundayOnOrBefore(`${year}-12-31`);
  const out: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) out.push(day);
  return out;
}

export function weekBelongsToYear(weekOf: string, year: number): boolean {
  return sundaysForVacationYear(year).includes(weekOf);
}

export function weekContainsDate(weekOf: string, iso: string): boolean {
  if (!isValidISODate(weekOf) || !isValidISODate(iso)) return false;
  return iso >= weekOf && iso <= addDays(weekOf, 6);
}

export function normalizeWeekOf(raw: string): string | null {
  const iso = isValidISODate(raw) ? raw : parseSheetDate(raw);
  if (!iso) return null;
  return sundayOnOrBefore(iso);
}

/** Last Monday of May. */
export function memorialDayISO(year: number): string {
  const last = `${year}-05-31`;
  const dow = weekdayOfISO(last);
  const offset = dow >= 1 ? dow - 1 : 6;
  return addDays(last, -offset);
}

/** First Monday of September. */
export function laborDayISO(year: number): string {
  const first = `${year}-09-01`;
  const dow = weekdayOfISO(first);
  const offset = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  return addDays(first, offset);
}

/** Fourth Thursday of November. */
export function thanksgivingISO(year: number): string {
  const first = `${year}-11-01`;
  const dow = weekdayOfISO(first);
  const firstThu = addDays(first, dow <= 4 ? 4 - dow : 11 - dow);
  return addDays(firstThu, 21);
}

export function holidayLabelForWeek(weekOf: string, year: number): string | null {
  const start = weekOf;
  const end = addDays(weekOf, 6);
  const hits: Array<{ day: string; label: string }> = [
    { day: `${year}-01-01`, label: "New Years" },
    { day: `${year - 1}-01-01`, label: "New Years" },
    { day: `${year + 1}-01-01`, label: "New Years" },
    { day: memorialDayISO(year), label: "Memorial Day" },
    { day: `${year}-07-04`, label: "4th of July" },
    { day: laborDayISO(year), label: "Labor Day" },
    { day: thanksgivingISO(year), label: "Thanksgiving" },
    { day: `${year}-12-25`, label: "Christmas" },
  ];
  for (const hit of hits) {
    if (hit.day >= start && hit.day <= end) return hit.label;
  }
  return null;
}

/**
 * Sheet pattern: 8 through the first Sunday of March, then 4.
 * Holiday / blocked weeks have no numeric capacity.
 */
export function defaultCapacityForWeek(weekOf: string): number {
  const { m, d } = parseISODate(weekOf);
  if (m === 1 || m === 2) return 8;
  if (m === 3 && d < 8) return 8;
  return 4;
}

export function canonicalHolidayLabel(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/['’]/g, "'");
  if (!key) return null;
  return HOLIDAY_ALIASES[key] ?? null;
}

export function parseWeekCapacityLabel(raw: string): {
  kind: VacationWeekKind;
  capacity: number | null;
  label: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "open", capacity: null, label: "" };
  if (/^\d+$/.test(trimmed)) {
    return { kind: "open", capacity: Number(trimmed), label: "" };
  }
  const holiday = canonicalHolidayLabel(trimmed);
  if (holiday === "Blocked") return { kind: "blocked", capacity: null, label: "Blocked" };
  if (holiday) return { kind: "holiday", capacity: null, label: holiday };
  return { kind: "holiday", capacity: null, label: trimmed };
}

const DATE_RANGE_NOTE =
  /\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s*[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)|\d{1,2}\/\d{1,2}\s*[-–—]\s*\d{1,2}\/\d{1,2})\s*$/;

const ELLIPSIS = /[.…]+$/;

export function inferSeedStatus(name: string, note = ""): VacationStatus {
  const blob = `${name} ${note}`.toLowerCase();
  if (/\bpay(\s*out|s|ed)?\b|\bpayout\b/.test(blob)) return "paid";
  return "approved";
}

export function parseDriverCell(raw: string): VacationSeedCell {
  let text = raw.trim().replace(ELLIPSIS, "").trim();
  let note = "";
  const range = DATE_RANGE_NOTE.exec(text);
  if (range) {
    note = range[1].replace(/\s*[-–—]\s*/g, "–").trim();
    text = text.slice(0, range.index).trim();
  }
  const status = inferSeedStatus(text, note);
  const cleanedName = text.replace(/\bpay(\s*out|s|ed)?\b|\bpayout\b/gi, "").trim() || text;
  return { name: cleanedName, note, status };
}

/** Deterministic UUID so two devices seed the same entry id. */
export function vacationSeedId(key: string): string {
  const bytes = new Uint8Array(16);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    bytes[i % 16] ^= h & 0xff;
    bytes[(i + 5) % 16] ^= (h >>> 8) & 0xff;
    bytes[(i + 11) % 16] ^= (h >>> 16) & 0xff;
  }
  for (let i = 0; i < 16; i++) {
    h = Math.imul(h ^ bytes[i], 0x01000193);
    bytes[i] ^= (h >>> (i % 24)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newVacationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return vacationSeedId(`local-${Date.now()}-${Math.random()}`);
}

function nowIso(at?: string): string {
  return at ?? new Date().toISOString();
}

export function emptyVacationStore(): VacationStore {
  return { weeks: {}, entries: {} };
}

function cleanWeek(raw: unknown): VacationWeek | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const weekOf =
    typeof rec.weekOf === "string" ? normalizeWeekOf(rec.weekOf) : null;
  if (!weekOf) return null;
  const year =
    typeof rec.year === "number" && Number.isInteger(rec.year)
      ? rec.year
      : yearOfISO(addDays(weekOf, 3));
  const kind = isVacationWeekKind(rec.kind) ? rec.kind : "open";
  const capacity =
    typeof rec.capacity === "number" && Number.isFinite(rec.capacity)
      ? Math.max(0, Math.floor(rec.capacity))
      : null;
  const label = typeof rec.label === "string" ? rec.label.trim() : "";
  const createdAt = typeof rec.createdAt === "string" ? rec.createdAt : nowIso();
  const updatedAt = typeof rec.updatedAt === "string" ? rec.updatedAt : createdAt;
  return {
    yard: cleanVacationYard(rec.yard),
    weekOf,
    year,
    capacity: kind === "open" ? capacity : null,
    label: kind === "open" ? label : label || (kind === "blocked" ? "Blocked" : ""),
    kind,
    createdAt,
    updatedAt,
  };
}

function cleanEntry(raw: unknown): VacationEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id) return null;
  const weekOf =
    typeof rec.weekOf === "string" ? normalizeWeekOf(rec.weekOf) : null;
  if (!weekOf) return null;
  if (typeof rec.name !== "string") return null;
  const name = rec.name.trim();
  if (!name) return null;
  const note = typeof rec.note === "string" ? rec.note.trim() : "";
  const status = isVacationStatus(rec.status) ? rec.status : "approved";
  const createdAt = typeof rec.createdAt === "string" ? rec.createdAt : nowIso();
  const updatedAt = typeof rec.updatedAt === "string" ? rec.updatedAt : createdAt;
  return {
    id: rec.id,
    yard: cleanVacationYard(rec.yard),
    weekOf,
    name,
    note,
    status,
    createdAt,
    updatedAt,
  };
}

export function cleanVacationStore(raw: unknown): VacationStore {
  const store = emptyVacationStore();
  if (!raw || typeof raw !== "object") return store;
  const rec = raw as { weeks?: unknown; entries?: unknown };
  if (rec.weeks && typeof rec.weeks === "object") {
    for (const week of Object.values(rec.weeks as Record<string, unknown>)) {
      const cleaned = cleanWeek(week);
      if (cleaned) store.weeks[vacationWeekKey(cleaned.yard, cleaned.weekOf)] = cleaned;
    }
  }
  if (Array.isArray(rec.weeks)) {
    for (const week of rec.weeks) {
      const cleaned = cleanWeek(week);
      if (cleaned) store.weeks[vacationWeekKey(cleaned.yard, cleaned.weekOf)] = cleaned;
    }
  }
  if (rec.entries && typeof rec.entries === "object") {
    const list = Array.isArray(rec.entries)
      ? rec.entries
      : Object.values(rec.entries as Record<string, unknown>);
    for (const entry of list) {
      const cleaned = cleanEntry(entry);
      if (cleaned) store.entries[cleaned.id] = cleaned;
    }
  }
  return store;
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function normalizeDeletedWeekKey(id: string): string {
  const parsed = parseVacationWeekKey(id);
  return parsed ? vacationWeekKey(parsed.yard, parsed.weekOf) : id;
}

function weekIsTombstoned(week: VacationWeek, dropWeeks: Set<string>): boolean {
  const key = vacationWeekKey(week.yard, week.weekOf);
  if (dropWeeks.has(key) || dropWeeks.has(week.weekOf)) return true;
  if (week.yard === DEFAULT_VACATION_YARD && dropWeeks.has(week.weekOf)) return true;
  return false;
}

function entryWeekIsTombstoned(entry: VacationEntry, dropWeeks: Set<string>): boolean {
  return weekIsTombstoned(
    {
      yard: entry.yard,
      weekOf: entry.weekOf,
      year: 0,
      capacity: null,
      label: "",
      kind: "open",
      createdAt: "",
      updatedAt: "",
    },
    dropWeeks,
  );
}

export function applyVacationTombstones(
  store: VacationStore,
  deletedWeekOfs: Iterable<string> = [],
  deletedEntryIds: Iterable<string> = [],
): VacationStore {
  const dropWeeks = new Set([...deletedWeekOfs].map(normalizeDeletedWeekKey));
  const dropEntries = new Set(deletedEntryIds);
  const weeks: Record<string, VacationWeek> = {};
  const entries: Record<string, VacationEntry> = {};
  for (const week of Object.values(store.weeks)) {
    if (weekIsTombstoned(week, dropWeeks)) continue;
    weeks[vacationWeekKey(week.yard, week.weekOf)] = week;
  }
  for (const [id, entry] of Object.entries(store.entries)) {
    if (dropEntries.has(id) || entryWeekIsTombstoned(entry, dropWeeks)) continue;
    entries[id] = entry;
  }
  return { weeks, entries };
}

export function readVacationPersisted(): VacationPersisted {
  const empty: VacationPersisted = {
    version: 2,
    weeks: {},
    entries: {},
    deletedWeekOfs: [],
    deletedEntryIds: [],
    seenRemoteWeekOfs: [],
    seenRemoteEntryIds: [],
  };
  try {
    const raw = localStorage.getItem(VACATION_STORE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<VacationPersisted>;
    if (parsed?.version !== 1 && parsed?.version !== 2) return empty;
    const store = applyVacationTombstones(
      cleanVacationStore(parsed),
      parseIdList(parsed.deletedWeekOfs),
      parseIdList(parsed.deletedEntryIds),
    );
    return {
      version: 2,
      weeks: store.weeks,
      entries: store.entries,
      deletedWeekOfs: parseIdList(parsed.deletedWeekOfs).map(normalizeDeletedWeekKey),
      deletedEntryIds: parseIdList(parsed.deletedEntryIds),
      seenRemoteWeekOfs: parseIdList(parsed.seenRemoteWeekOfs).map(normalizeDeletedWeekKey),
      seenRemoteEntryIds: parseIdList(parsed.seenRemoteEntryIds),
    };
  } catch {
    return empty;
  }
}

export function readVacationStore(): VacationStore {
  const persisted = readVacationPersisted();
  return { weeks: persisted.weeks, entries: persisted.entries };
}

export function writeVacationPersisted(persisted: VacationPersisted): void {
  const stripped = applyVacationTombstones(
    { weeks: persisted.weeks, entries: persisted.entries },
    persisted.deletedWeekOfs,
    persisted.deletedEntryIds,
  );
  localStorage.setItem(
    VACATION_STORE_KEY,
    JSON.stringify({
      version: 2,
      weeks: stripped.weeks,
      entries: stripped.entries,
      deletedWeekOfs: persisted.deletedWeekOfs.map(normalizeDeletedWeekKey),
      deletedEntryIds: persisted.deletedEntryIds,
      seenRemoteWeekOfs: persisted.seenRemoteWeekOfs.map(normalizeDeletedWeekKey),
      seenRemoteEntryIds: persisted.seenRemoteEntryIds,
    }),
  );
}

export function writeVacationStore(
  store: VacationStore,
  deletedWeekOfs?: string[],
  deletedEntryIds?: string[],
  seenRemoteWeekOfs?: string[],
  seenRemoteEntryIds?: string[],
): void {
  const prev = readVacationPersisted();
  writeVacationPersisted({
    version: 2,
    weeks: store.weeks,
    entries: store.entries,
    deletedWeekOfs: deletedWeekOfs ?? prev.deletedWeekOfs,
    deletedEntryIds: deletedEntryIds ?? prev.deletedEntryIds,
    seenRemoteWeekOfs: seenRemoteWeekOfs ?? prev.seenRemoteWeekOfs,
    seenRemoteEntryIds: seenRemoteEntryIds ?? prev.seenRemoteEntryIds,
  });
}

export function newerVacation<T extends { updatedAt: string }>(a: T, b: T): T {
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function entriesForWeek(
  store: VacationStore,
  weekOf: string,
  yard: VacationYard = DEFAULT_VACATION_YARD,
): VacationEntry[] {
  const key = normalizeWeekOf(weekOf) ?? weekOf;
  return Object.values(store.entries)
    .filter((entry) => entry.weekOf === key && entry.yard === yard)
    .sort((a, b) => {
      const name = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (name) return name;
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
}

export function weeksForYear(
  store: VacationStore,
  year: number,
  yard: VacationYard = DEFAULT_VACATION_YARD,
): VacationWeek[] {
  return sundaysForVacationYear(year)
    .map((weekOf) => store.weeks[vacationWeekKey(yard, weekOf)])
    .filter((week): week is VacationWeek => Boolean(week));
}

export function yearsInStore(
  store: VacationStore,
  extra: number[] = [],
  yard?: VacationYard,
): number[] {
  const set = new Set<number>(extra);
  for (const week of Object.values(store.weeks)) {
    if (yard && week.yard !== yard) continue;
    set.add(week.year);
    set.add(yearOfISO(addDays(week.weekOf, 3)));
  }
  return [...set].filter((y) => y >= 2000 && y <= 2100).sort((a, b) => a - b);
}

export function rosterNamesFromStore(
  store: VacationStore,
  extra: string[] = [],
  yard?: VacationYard,
): string[] {
  const map = new Map<string, string>();
  for (const name of extra) {
    const key = vacationNameKey(name);
    if (key && !map.has(key)) map.set(key, name.trim());
  }
  for (const entry of Object.values(store.entries)) {
    if (yard && entry.yard !== yard) continue;
    const key = vacationNameKey(entry.name);
    if (key && !map.has(key)) map.set(key, entry.name);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export function weekFillLabel(week: VacationWeek, filled: number): string {
  if (week.kind === "blocked") return week.label || "Blocked";
  if (week.kind === "holiday") return week.label || "Holiday";
  if (week.capacity == null) {
    return filled === 1 ? "1 driver" : `${filled} drivers`;
  }
  return `${filled} of ${week.capacity} filled`;
}

export function weekIsOverCapacity(week: VacationWeek, filled: number): boolean {
  return week.kind === "open" && week.capacity != null && filled > week.capacity;
}

/** User-visible labels. Keys stay pending | approved | paid. */
export const VACATION_STATUS_LABELS: Record<VacationStatus, string> = {
  pending: "Approved",
  approved: "Requested",
  paid: "Paid",
};

export function vacationStatusLabel(status: VacationStatus): string {
  return VACATION_STATUS_LABELS[status];
}

export function statusTone(status: VacationStatus): "blue" | "neutral" | "green" {
  if (status === "pending") return "blue";
  if (status === "paid") return "green";
  return "neutral";
}

export function nextVacationStatus(status: VacationStatus): VacationStatus {
  if (status === "approved") return "pending";
  if (status === "pending") return "paid";
  return "approved";
}

export function buildEmptyYearWeeks(
  year: number,
  at = nowIso(),
  yard: VacationYard = DEFAULT_VACATION_YARD,
): VacationWeek[] {
  return sundaysForVacationYear(year).map((weekOf) => {
    const holiday = holidayLabelForWeek(weekOf, year);
    if (holiday) {
      return {
        yard,
        weekOf,
        year,
        capacity: null,
        label: holiday,
        kind: "holiday",
        createdAt: at,
        updatedAt: at,
      };
    }
    return {
      yard,
      weekOf,
      year,
      capacity: defaultCapacityForWeek(weekOf),
      label: "",
      kind: "open",
      createdAt: at,
      updatedAt: at,
    };
  });
}

export function seedWeekToStoreWeek(
  seed: VacationSeedWeek,
  year: number,
  at: string,
  yard: VacationYard = DEFAULT_VACATION_YARD,
): VacationWeek | null {
  const weekOf = normalizeWeekOf(seed.weekOf);
  if (!weekOf) return null;
  const parsed = parseWeekCapacityLabel(seed.label ?? "");
  const kind = seed.kind ?? (seed.label ? parsed.kind : "open");
  const holiday = kind === "open" ? holidayLabelForWeek(weekOf, year) : null;
  const resolvedKind =
    holiday && kind === "open" && seed.capacity == null && !seed.label
      ? "holiday"
      : kind;
  let label = (seed.label ?? parsed.label).trim();
  if (/^\d+$/.test(label)) label = "";
  if (resolvedKind === "holiday" && !label) label = holiday ?? "Holiday";
  if (resolvedKind === "blocked" && !label) label = "Blocked";
  const capacity =
    resolvedKind === "open"
      ? (seed.capacity ?? parsed.capacity ?? defaultCapacityForWeek(weekOf))
      : null;
  return {
    yard,
    weekOf,
    year,
    capacity,
    label,
    kind: resolvedKind,
    createdAt: at,
    updatedAt: at,
  };
}

export function seedCellsForWeek(seed: VacationSeedWeek): VacationSeedCell[] {
  const cells: VacationSeedCell[] = [];
  for (const item of seed.names ?? []) {
    if (typeof item === "string") {
      const parsed = parseDriverCell(item);
      if (parsed.name) cells.push(parsed);
      continue;
    }
    const name = item.name.trim();
    if (!name) continue;
    const note = item.note?.trim() ?? "";
    cells.push({
      name,
      note,
      status: item.status ?? inferSeedStatus(name, note),
    });
  }
  return cells;
}

export function applySeedWeeks(
  store: VacationStore,
  year: number,
  seeds: VacationSeedWeek[],
  at = nowIso(),
  yard: VacationYard = DEFAULT_VACATION_YARD,
): VacationStore {
  const weeks = { ...store.weeks };
  const entries = { ...store.entries };
  const byWeek = new Map<string, VacationSeedWeek>();
  for (const seed of seeds) {
    const weekOf = normalizeWeekOf(seed.weekOf);
    if (weekOf) byWeek.set(weekOf, seed);
  }
  const emptyByWeek = new Map(
    buildEmptyYearWeeks(year, at, yard).map((row) => [row.weekOf, row]),
  );

  for (const weekOf of sundaysForVacationYear(year)) {
    const key = vacationWeekKey(yard, weekOf);
    if (weeks[key]) continue;
    const seed = byWeek.get(weekOf);
    const week = seed
      ? seedWeekToStoreWeek(seed, year, at, yard)
      : emptyByWeek.get(weekOf) ?? null;
    if (week) weeks[key] = week;
    if (!seed) continue;
    seedCellsForWeek(seed).forEach((cell, index) => {
      // Rockford keeps the original seed ids so existing local/cloud rows match.
      const seedKey =
        yard === DEFAULT_VACATION_YARD
          ? `${weekOf}|${vacationNameKey(cell.name)}|${index}`
          : `${yard}|${weekOf}|${vacationNameKey(cell.name)}|${index}`;
      const id = vacationSeedId(seedKey);
      if (entries[id]) return;
      entries[id] = {
        id,
        yard,
        weekOf,
        name: cell.name,
        note: cell.note ?? "",
        status: cell.status ?? inferSeedStatus(cell.name, cell.note ?? ""),
        createdAt: at,
        updatedAt: at,
      };
    });
  }
  return { weeks, entries };
}

export function yearHasWeeks(
  store: VacationStore,
  year: number,
  yard: VacationYard = DEFAULT_VACATION_YARD,
): boolean {
  return sundaysForVacationYear(year).some(
    (weekOf) => store.weeks[vacationWeekKey(yard, weekOf)]?.year === year,
  );
}

export function upsertWeek(
  store: VacationStore,
  patch: Partial<VacationWeek> & { weekOf: string },
  at = nowIso(),
): VacationStore {
  const weekOf = normalizeWeekOf(patch.weekOf);
  if (!weekOf) return store;
  const yard = cleanVacationYard(patch.yard);
  const key = vacationWeekKey(yard, weekOf);
  const prev = store.weeks[key];
  const year = patch.year ?? prev?.year ?? yearOfISO(addDays(weekOf, 3));
  const kind = patch.kind ?? prev?.kind ?? "open";
  const next: VacationWeek = {
    yard,
    weekOf,
    year,
    capacity:
      kind === "open"
        ? patch.capacity !== undefined
          ? patch.capacity
          : (prev?.capacity ?? null)
        : null,
    label:
      patch.label !== undefined ? patch.label.trim() : (prev?.label ?? ""),
    kind,
    createdAt: prev?.createdAt ?? at,
    updatedAt: at,
  };
  return { ...store, weeks: { ...store.weeks, [key]: next } };
}

export function addVacationEntry(
  store: VacationStore,
  weekOf: string,
  name: string,
  opts: {
    note?: string;
    status?: VacationStatus;
    id?: string;
    at?: string;
    yard?: VacationYard;
  } = {},
): { store: VacationStore; entry: VacationEntry | null } {
  const week = normalizeWeekOf(weekOf);
  const trimmed = name.trim();
  if (!week || !trimmed) return { store, entry: null };
  const at = opts.at ?? nowIso();
  const note = opts.note?.trim() ?? "";
  const entry: VacationEntry = {
    id: opts.id ?? newVacationId(),
    yard: cleanVacationYard(opts.yard),
    weekOf: week,
    name: trimmed,
    note,
    status: opts.status ?? "approved",
    createdAt: at,
    updatedAt: at,
  };
  return {
    store: { ...store, entries: { ...store.entries, [entry.id]: entry } },
    entry,
  };
}

export function updateVacationEntry(
  store: VacationStore,
  id: string,
  patch: Partial<Pick<VacationEntry, "name" | "note" | "status">>,
  at = nowIso(),
): VacationStore {
  const prev = store.entries[id];
  if (!prev) return store;
  const name = patch.name !== undefined ? patch.name.trim() : prev.name;
  if (!name) return store;
  const next: VacationEntry = {
    ...prev,
    name,
    note: patch.note !== undefined ? patch.note.trim() : prev.note,
    status: patch.status ?? prev.status,
    updatedAt: at,
  };
  return { ...store, entries: { ...store.entries, [id]: next } };
}

export function removeVacationEntry(
  store: VacationStore,
  id: string,
): { store: VacationStore; removed: VacationEntry | null } {
  const removed = store.entries[id] ?? null;
  if (!removed) return { store, removed: null };
  const entries = { ...store.entries };
  delete entries[id];
  return { store: { ...store, entries }, removed };
}

export function cycleVacationEntryStatus(
  store: VacationStore,
  id: string,
  at = nowIso(),
): VacationStore {
  const prev = store.entries[id];
  if (!prev) return store;
  return updateVacationEntry(store, id, { status: nextVacationStatus(prev.status) }, at);
}

export function mergeVacationStores(
  local: VacationStore,
  remote: VacationStore,
  deletedWeekOfs: Iterable<string> = [],
  deletedEntryIds: Iterable<string> = [],
): VacationStore {
  const dropWeeks = new Set([...deletedWeekOfs].map(normalizeDeletedWeekKey));
  const dropEntries = new Set(deletedEntryIds);
  const weeks: Record<string, VacationWeek> = {};
  for (const week of Object.values(remote.weeks)) {
    if (weekIsTombstoned(week, dropWeeks)) continue;
    weeks[vacationWeekKey(week.yard, week.weekOf)] = week;
  }
  for (const week of Object.values(local.weeks)) {
    if (weekIsTombstoned(week, dropWeeks)) continue;
    const key = vacationWeekKey(week.yard, week.weekOf);
    const existing = weeks[key];
    weeks[key] = existing ? newerVacation(existing, week) : week;
  }
  const entries: Record<string, VacationEntry> = {};
  for (const entry of Object.values(remote.entries)) {
    if (dropEntries.has(entry.id) || entryWeekIsTombstoned(entry, dropWeeks)) continue;
    entries[entry.id] = entry;
  }
  for (const entry of Object.values(local.entries)) {
    if (dropEntries.has(entry.id) || entryWeekIsTombstoned(entry, dropWeeks)) continue;
    const existing = entries[entry.id];
    entries[entry.id] = existing ? newerVacation(existing, entry) : entry;
  }
  return { weeks, entries };
}

export type VacationCloudReconcileInput = {
  local: VacationStore;
  remote: VacationStore;
  deletedWeekOfs: Iterable<string>;
  deletedEntryIds: Iterable<string>;
  seenRemoteWeekOfs?: Iterable<string>;
  seenRemoteEntryIds?: Iterable<string>;
};

export type VacationCloudReconcileResult = {
  next: VacationStore;
  deletedWeekOfs: string[];
  deletedEntryIds: string[];
  seenRemoteWeekOfs: string[];
  seenRemoteEntryIds: string[];
  toDeleteRemoteWeeks: string[];
  toDeleteRemoteEntries: string[];
  toUploadWeeks: VacationWeek[];
  toUploadEntries: VacationEntry[];
};

/**
 * One successful cloud refresh. Cloud vacation is the crew source of truth
 * on pull. Stale/empty local must not merge back or re-upsert over cloud.
 *
 * - Non-empty remote weeks/entries REPLACE the matching local table.
 * - Sync never schedules remote DELETEs (weeks or entries). Individual
 *   logged-in UI x still deletes via VacationContext.removeDriver.
 * - Empty remote + no prior pull keeps local and may first-seed upload.
 * - Empty remote after a prior pull does not re-upload (do not refill a wipe).
 * - Empty remote weeks with leftover entries keep local weeks (week-grid
 *   wipe must not hide the calendar) but take cloud entries.
 */
export function reconcileVacationCloud(
  input: VacationCloudReconcileInput,
): VacationCloudReconcileResult {
  const incomingDeletedWeeks = new Set(
    [...input.deletedWeekOfs]
      .filter((id) => typeof id === "string" && id.length > 0)
      .map(normalizeDeletedWeekKey),
  );
  const incomingDeletedEntries = new Set(
    [...input.deletedEntryIds].filter((id) => typeof id === "string" && id.length > 0),
  );
  const seenWeeks = new Set(
    [...(input.seenRemoteWeekOfs ?? [])]
      .filter((id) => typeof id === "string" && id.length > 0)
      .map(normalizeDeletedWeekKey),
  );
  const seenEntries = new Set(
    [...(input.seenRemoteEntryIds ?? [])].filter((id) => typeof id === "string" && id.length > 0),
  );
  const remoteWeeks = new Set(
    Object.values(input.remote.weeks).map((week) => vacationWeekKey(week.yard, week.weekOf)),
  );
  const remoteEntries = new Set(Object.keys(input.remote.entries));
  const remoteHasWeeks = remoteWeeks.size > 0;
  const remoteHasEntries = remoteEntries.size > 0;
  const everSeen = seenWeeks.size > 0 || seenEntries.size > 0;

  // Forget tombstones for ids that are live on remote. A stale client x list
  // must not hide cloud vacation or feed a mass DELETE.
  const deletedWeeks = new Set<string>();
  for (const id of incomingDeletedWeeks) {
    if (!remoteWeeks.has(id)) deletedWeeks.add(id);
  }
  const deletedEntries = new Set<string>();
  for (const id of incomingDeletedEntries) {
    if (!remoteEntries.has(id)) deletedEntries.add(id);
  }

  const toDeleteRemoteWeeks: string[] = [];
  const toDeleteRemoteEntries: string[] = [];
  let next: VacationStore;
  let toUploadWeeks: VacationWeek[] = [];
  let toUploadEntries: VacationEntry[] = [];

  if (remoteHasWeeks && remoteHasEntries) {
    next = {
      weeks: { ...input.remote.weeks },
      entries: { ...input.remote.entries },
    };
  } else if (remoteHasWeeks) {
    // Cloud week grid exists; names on cloud are empty. Replace entries so
    // a stale local set cannot re-push.
    next = { weeks: { ...input.remote.weeks }, entries: {} };
  } else if (remoteHasEntries) {
    // Week-grid wipe leftover: keep local weeks, adopt cloud entries.
    next = {
      weeks: { ...input.local.weeks },
      entries: { ...input.remote.entries },
    };
    if (!everSeen) {
      toUploadWeeks = Object.values(next.weeks).filter((week) => {
        const key = vacationWeekKey(week.yard, week.weekOf);
        return !seenWeeks.has(key) && !remoteWeeks.has(key);
      });
    }
  } else if (!everSeen) {
    next = mergeVacationStores(input.local, input.remote, deletedWeeks, deletedEntries);
    toUploadWeeks = Object.values(next.weeks);
    toUploadEntries = Object.values(next.entries);
  } else {
    // Prior pull saw cloud; this pull is empty. Keep local UI, do not refill.
    next = mergeVacationStores(input.local, emptyVacationStore(), deletedWeeks, deletedEntries);
  }

  const nextSeenWeeks = new Set(seenWeeks);
  for (const id of remoteWeeks) nextSeenWeeks.add(id);
  const nextSeenEntries = new Set(seenEntries);
  for (const id of remoteEntries) nextSeenEntries.add(id);

  return {
    next,
    deletedWeekOfs: [...deletedWeeks],
    deletedEntryIds: [...deletedEntries],
    seenRemoteWeekOfs: [...nextSeenWeeks],
    seenRemoteEntryIds: [...nextSeenEntries],
    toDeleteRemoteWeeks,
    toDeleteRemoteEntries,
    toUploadWeeks,
    toUploadEntries,
  };
}

export function formatWeekRange(weekOf: string): string {
  const start = parseISODate(weekOf);
  const end = parseISODate(addDays(weekOf, 6));
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (start.m === end.m) return `${months[start.m - 1]} ${start.d}–${end.d}`;
  return `${months[start.m - 1]} ${start.d} – ${months[end.m - 1]} ${end.d}`;
}

export function monthKeyForWeek(weekOf: string): string {
  const mid = addDays(weekOf, 3);
  const { y, m } = parseISODate(mid);
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function monthLabelForKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[m - 1]} ${y}`;
}
