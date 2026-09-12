/** Vacation calendar board — week rows, driver entries, local persist + cloud merge. */

import {
  addDays,
  isValidISODate,
  parseISODate,
  parseSheetDate,
  weekdayOfISO,
  yearOfISO,
} from "./chicagoDate";

export const VACATION_STORE_KEY = "chitrader.load-tracker.vacation.v1";

export const VACATION_STATUSES = ["pending", "approved", "paid"] as const;
export type VacationStatus = (typeof VACATION_STATUSES)[number];

export const VACATION_WEEK_KINDS = ["open", "holiday", "blocked"] as const;
export type VacationWeekKind = (typeof VACATION_WEEK_KINDS)[number];

export type VacationEntry = {
  id: string;
  weekOf: string;
  name: string;
  note: string;
  status: VacationStatus;
  createdAt: string;
  updatedAt: string;
};

export type VacationWeek = {
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
  version: 1;
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
  return { id: rec.id, weekOf, name, note, status, createdAt, updatedAt };
}

export function cleanVacationStore(raw: unknown): VacationStore {
  const store = emptyVacationStore();
  if (!raw || typeof raw !== "object") return store;
  const rec = raw as { weeks?: unknown; entries?: unknown };
  if (rec.weeks && typeof rec.weeks === "object") {
    for (const week of Object.values(rec.weeks as Record<string, unknown>)) {
      const cleaned = cleanWeek(week);
      if (cleaned) store.weeks[cleaned.weekOf] = cleaned;
    }
  }
  if (Array.isArray(rec.weeks)) {
    for (const week of rec.weeks) {
      const cleaned = cleanWeek(week);
      if (cleaned) store.weeks[cleaned.weekOf] = cleaned;
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

export function applyVacationTombstones(
  store: VacationStore,
  deletedWeekOfs: Iterable<string> = [],
  deletedEntryIds: Iterable<string> = [],
): VacationStore {
  const dropWeeks = new Set(deletedWeekOfs);
  const dropEntries = new Set(deletedEntryIds);
  const weeks: Record<string, VacationWeek> = {};
  const entries: Record<string, VacationEntry> = {};
  for (const [key, week] of Object.entries(store.weeks)) {
    if (dropWeeks.has(week.weekOf) || dropWeeks.has(key)) continue;
    weeks[week.weekOf] = week;
  }
  for (const [id, entry] of Object.entries(store.entries)) {
    if (dropEntries.has(id) || dropWeeks.has(entry.weekOf)) continue;
    entries[id] = entry;
  }
  return { weeks, entries };
}

export function readVacationPersisted(): VacationPersisted {
  const empty: VacationPersisted = {
    version: 1,
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
    if (parsed?.version !== 1) return empty;
    const store = applyVacationTombstones(
      cleanVacationStore(parsed),
      parseIdList(parsed.deletedWeekOfs),
      parseIdList(parsed.deletedEntryIds),
    );
    return {
      version: 1,
      weeks: store.weeks,
      entries: store.entries,
      deletedWeekOfs: parseIdList(parsed.deletedWeekOfs),
      deletedEntryIds: parseIdList(parsed.deletedEntryIds),
      seenRemoteWeekOfs: parseIdList(parsed.seenRemoteWeekOfs),
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
      version: 1,
      weeks: stripped.weeks,
      entries: stripped.entries,
      deletedWeekOfs: persisted.deletedWeekOfs,
      deletedEntryIds: persisted.deletedEntryIds,
      seenRemoteWeekOfs: persisted.seenRemoteWeekOfs,
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
    version: 1,
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

export function entriesForWeek(store: VacationStore, weekOf: string): VacationEntry[] {
  const key = normalizeWeekOf(weekOf) ?? weekOf;
  return Object.values(store.entries)
    .filter((entry) => entry.weekOf === key)
    .sort((a, b) => {
      const name = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
      if (name) return name;
      return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    });
}

export function weeksForYear(store: VacationStore, year: number): VacationWeek[] {
  return sundaysForVacationYear(year)
    .map((weekOf) => store.weeks[weekOf])
    .filter((week): week is VacationWeek => Boolean(week));
}

export function yearsInStore(store: VacationStore, extra: number[] = []): number[] {
  const set = new Set<number>(extra);
  for (const week of Object.values(store.weeks)) set.add(week.year);
  for (const weekOf of Object.keys(store.weeks)) {
    const mid = addDays(weekOf, 3);
    set.add(yearOfISO(mid));
  }
  return [...set].filter((y) => y >= 2000 && y <= 2100).sort((a, b) => a - b);
}

export function rosterNamesFromStore(store: VacationStore, extra: string[] = []): string[] {
  const map = new Map<string, string>();
  for (const name of extra) {
    const key = vacationNameKey(name);
    if (key && !map.has(key)) map.set(key, name.trim());
  }
  for (const entry of Object.values(store.entries)) {
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

export function buildEmptyYearWeeks(year: number, at = nowIso()): VacationWeek[] {
  return sundaysForVacationYear(year).map((weekOf) => {
    const holiday = holidayLabelForWeek(weekOf, year);
    if (holiday) {
      return {
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
): VacationStore {
  const weeks = { ...store.weeks };
  const entries = { ...store.entries };
  const byWeek = new Map<string, VacationSeedWeek>();
  for (const seed of seeds) {
    const weekOf = normalizeWeekOf(seed.weekOf);
    if (weekOf) byWeek.set(weekOf, seed);
  }

  for (const weekOf of sundaysForVacationYear(year)) {
    if (weeks[weekOf]) continue;
    const seed = byWeek.get(weekOf);
    const week = seed
      ? seedWeekToStoreWeek(seed, year, at)
      : buildEmptyYearWeeks(year, at).find((row) => row.weekOf === weekOf) ?? null;
    if (week) weeks[weekOf] = week;
    if (!seed) continue;
    seedCellsForWeek(seed).forEach((cell, index) => {
      const id = vacationSeedId(`${weekOf}|${vacationNameKey(cell.name)}|${index}`);
      if (entries[id]) return;
      entries[id] = {
        id,
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

export function yearHasWeeks(store: VacationStore, year: number): boolean {
  return sundaysForVacationYear(year).some(
    (weekOf) => store.weeks[weekOf]?.year === year,
  );
}

export function upsertWeek(
  store: VacationStore,
  patch: Partial<VacationWeek> & { weekOf: string },
  at = nowIso(),
): VacationStore {
  const weekOf = normalizeWeekOf(patch.weekOf);
  if (!weekOf) return store;
  const prev = store.weeks[weekOf];
  const year = patch.year ?? prev?.year ?? yearOfISO(addDays(weekOf, 3));
  const kind = patch.kind ?? prev?.kind ?? "open";
  const next: VacationWeek = {
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
  return { ...store, weeks: { ...store.weeks, [weekOf]: next } };
}

export function addVacationEntry(
  store: VacationStore,
  weekOf: string,
  name: string,
  opts: { note?: string; status?: VacationStatus; id?: string; at?: string } = {},
): { store: VacationStore; entry: VacationEntry | null } {
  const week = normalizeWeekOf(weekOf);
  const trimmed = name.trim();
  if (!week || !trimmed) return { store, entry: null };
  const at = opts.at ?? nowIso();
  const note = opts.note?.trim() ?? "";
  const entry: VacationEntry = {
    id: opts.id ?? newVacationId(),
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
  const dropWeeks = new Set(deletedWeekOfs);
  const dropEntries = new Set(deletedEntryIds);
  const weeks: Record<string, VacationWeek> = {};
  for (const week of Object.values(remote.weeks)) {
    if (dropWeeks.has(week.weekOf)) continue;
    weeks[week.weekOf] = week;
  }
  for (const week of Object.values(local.weeks)) {
    if (dropWeeks.has(week.weekOf)) continue;
    const existing = weeks[week.weekOf];
    weeks[week.weekOf] = existing ? newerVacation(existing, week) : week;
  }
  const entries: Record<string, VacationEntry> = {};
  for (const entry of Object.values(remote.entries)) {
    if (dropEntries.has(entry.id) || dropWeeks.has(entry.weekOf)) continue;
    entries[entry.id] = entry;
  }
  for (const entry of Object.values(local.entries)) {
    if (dropEntries.has(entry.id) || dropWeeks.has(entry.weekOf)) continue;
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
 * One successful cloud refresh. Remote absence of a previously seen row is a
 * delete (do not re-upload). Never-seen local rows still upload. Tombstones
 * strip both sides. Empty remote + no prior pull keeps local (no wipe).
 */
export function reconcileVacationCloud(
  input: VacationCloudReconcileInput,
): VacationCloudReconcileResult {
  const deletedWeeks = new Set(
    [...input.deletedWeekOfs].filter((id) => typeof id === "string" && id.length > 0),
  );
  const deletedEntries = new Set(
    [...input.deletedEntryIds].filter((id) => typeof id === "string" && id.length > 0),
  );
  const seenWeeks = new Set(
    [...(input.seenRemoteWeekOfs ?? [])].filter((id) => typeof id === "string" && id.length > 0),
  );
  const seenEntries = new Set(
    [...(input.seenRemoteEntryIds ?? [])].filter((id) => typeof id === "string" && id.length > 0),
  );
  const remoteWeeks = new Set(Object.keys(input.remote.weeks));
  const remoteEntries = new Set(Object.keys(input.remote.entries));
  const remoteCount = remoteWeeks.size + remoteEntries.size;
  const trustRemoteAbsence = remoteCount > 0 || (seenWeeks.size === 0 && seenEntries.size === 0);

  if (trustRemoteAbsence && remoteCount > 0) {
    for (const id of seenWeeks) {
      if (!remoteWeeks.has(id)) deletedWeeks.add(id);
    }
    for (const id of seenEntries) {
      if (!remoteEntries.has(id)) deletedEntries.add(id);
    }
  }

  const next = mergeVacationStores(input.local, input.remote, deletedWeeks, deletedEntries);

  const toDeleteRemoteWeeks = [...deletedWeeks].filter((id) => remoteWeeks.has(id));
  const toDeleteRemoteEntries = [...deletedEntries].filter((id) => remoteEntries.has(id));

  const toUploadWeeks: VacationWeek[] = [];
  for (const week of Object.values(next.weeks)) {
    if (deletedWeeks.has(week.weekOf)) continue;
    const remote = input.remote.weeks[week.weekOf];
    if (!remote) {
      if (!seenWeeks.has(week.weekOf)) toUploadWeeks.push(week);
      continue;
    }
    if (week.updatedAt > remote.updatedAt) toUploadWeeks.push(week);
  }

  const toUploadEntries: VacationEntry[] = [];
  for (const entry of Object.values(next.entries)) {
    if (deletedEntries.has(entry.id) || deletedWeeks.has(entry.weekOf)) continue;
    const remote = input.remote.entries[entry.id];
    if (!remote) {
      if (!seenEntries.has(entry.id)) toUploadEntries.push(entry);
      continue;
    }
    if (entry.updatedAt > remote.updatedAt) toUploadEntries.push(entry);
  }

  const nextSeenWeeks = new Set(seenWeeks);
  for (const id of remoteWeeks) nextSeenWeeks.add(id);
  for (const id of deletedWeeks) nextSeenWeeks.add(id);
  const nextSeenEntries = new Set(seenEntries);
  for (const id of remoteEntries) nextSeenEntries.add(id);
  for (const id of deletedEntries) nextSeenEntries.add(id);

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
