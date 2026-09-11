import type { DayStore, LockedDay } from "./driverDays";
import { isDriverTallyDay } from "./driverDays";
import {
  cleanDeletedKeys,
  cleanManualOffs,
  type ManualOffsStore,
} from "./manualCallOffs";

export const DAYS_KEY = "chitrader.load-tracker.driver-days.v1";

type PersistedDays = {
  version: 1;
  days: DayStore;
  /** Ad-hoc full-day offs keyed by Chicago calendar date. Additive to the sheets list. */
  manualOffs?: ManualOffsStore;
  /** Tombstones `YYYY-MM-DD|namekey` so a cloud pull cannot restore a local remove. */
  manualOffsDeleted?: string[];
  /** Keys observed on a successful `manual_call_offs` pull. */
  manualOffsSeen?: string[];
};

export type DriverDaysPayload = {
  days: DayStore;
  manualOffs: ManualOffsStore;
  manualOffsDeleted: string[];
  manualOffsSeen: string[];
};

function cleanOot(names: unknown): string[] | undefined {
  if (!Array.isArray(names)) return undefined;
  return names.filter((n): n is string => typeof n === "string");
}

function clean(store: DayStore): DayStore {
  const out: DayStore = {};
  for (const [date, day] of Object.entries(store)) {
    if (!isDriverTallyDay(date)) continue;
    if (!day || typeof day.available !== "number") continue;
    const ootNames = cleanOot(day.ootNames);
    out[date] = ootNames ? { ...day, ootNames } : { ...day };
    if (!ootNames) delete out[date].ootNames;
  }
  return out;
}

function emptyPayload(): DriverDaysPayload {
  return { days: {}, manualOffs: {}, manualOffsDeleted: [], manualOffsSeen: [] };
}

export function readDriverDaysPayload(): DriverDaysPayload {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    if (!raw) return emptyPayload();
    const parsed = JSON.parse(raw) as PersistedDays;
    if (parsed?.version !== 1 || typeof parsed.days !== "object" || !parsed.days) {
      return emptyPayload();
    }
    return {
      days: clean(parsed.days),
      manualOffs: cleanManualOffs(parsed.manualOffs),
      manualOffsDeleted: cleanDeletedKeys(parsed.manualOffsDeleted),
      manualOffsSeen: cleanDeletedKeys(parsed.manualOffsSeen),
    };
  } catch {
    return emptyPayload();
  }
}

function writePayload(payload: DriverDaysPayload): void {
  const next: PersistedDays = {
    version: 1,
    days: clean(payload.days),
    manualOffs: payload.manualOffs,
    manualOffsDeleted: payload.manualOffsDeleted,
    manualOffsSeen: payload.manualOffsSeen,
  };
  localStorage.setItem(DAYS_KEY, JSON.stringify(next));
}

export function readDayStore(): DayStore {
  return readDriverDaysPayload().days;
}

export function writeDayStore(store: DayStore): void {
  const current = readDriverDaysPayload();
  writePayload({ ...current, days: store });
}

export function readManualOffs(): ManualOffsStore {
  return readDriverDaysPayload().manualOffs;
}

export function writeManualOffs(
  manualOffs: ManualOffsStore,
  manualOffsDeleted?: string[],
  manualOffsSeen?: string[],
): void {
  const current = readDriverDaysPayload();
  writePayload({
    ...current,
    manualOffs: cleanManualOffs(manualOffs),
    manualOffsDeleted:
      manualOffsDeleted === undefined
        ? current.manualOffsDeleted
        : cleanDeletedKeys(manualOffsDeleted),
    manualOffsSeen:
      manualOffsSeen === undefined
        ? current.manualOffsSeen
        : cleanDeletedKeys(manualOffsSeen),
  });
}

export function persistDriverDays(payload: DriverDaysPayload): void {
  writePayload({
    days: payload.days,
    manualOffs: cleanManualOffs(payload.manualOffs),
    manualOffsDeleted: cleanDeletedKeys(payload.manualOffsDeleted),
    manualOffsSeen: cleanDeletedKeys(payload.manualOffsSeen ?? []),
  });
}

export function asLockedDay(row: {
  date: string;
  base: number;
  offs: number;
  available: number;
  locked: boolean;
  locked_at: string;
  oot_names?: string[] | null;
}): LockedDay {
  const ootNames = cleanOot(row.oot_names);
  return {
    date: row.date,
    base: row.base,
    offs: row.offs,
    available: row.available,
    locked: row.locked,
    lockedAt: row.locked_at,
    ...(ootNames ? { ootNames } : {}),
  };
}
