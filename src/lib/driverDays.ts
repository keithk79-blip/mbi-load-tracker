import {
  addDays,
  isChicagoSaturday,
  isChicagoSunday,
  startOfYear,
} from "./chicagoDate";
import {
  availableDrivers,
  fullDayOffCount,
  manualsToRows,
  withManualOffs,
  type CallOffRow,
  type DayAvailability,
  type ManualCallOff,
} from "./driverAvailability";

export type LockedDay = DayAvailability & {
  locked: boolean;
  lockedAt: string;
  source?: "weekday" | "saturday";
};

export type DayStore = Record<string, LockedDay>;

export type LiveSheet = {
  base: number;
  saturdayBase: number;
  offs: CallOffRow[];
  /** Live OOT names — only written onto today's snapshot, never past days. */
  ootNames?: string[];
  /** Manual full-day offs for the date being computed (today or a projected future day). */
  manualOffs?: ManualCallOff[];
};

/** Sundays have no driver tally. Saturdays use the sat-yard sum. */
export function isDriverTallyDay(iso: string): boolean {
  return !isChicagoSunday(iso);
}

export function lookupDay(store: DayStore, date: string): LockedDay | null {
  if (!isDriverTallyDay(date)) return null;
  return store[date] ?? null;
}

/**
 * Live projection for Chicago dates after today.
 * Uses current base / Saturday sum + call-offs. Never persisted as a lock.
 */
export function projectFutureDay(live: LiveSheet, date: string, today: string): LockedDay | null {
  if (!isDriverTallyDay(date) || date <= today) return null;
  const computed = computeAvailability(live, date);
  return {
    ...computed,
    locked: false,
    lockedAt: today,
    source: isChicagoSaturday(date) ? "saturday" : "weekday",
  };
}


export function computeAvailability(live: LiveSheet, day: string): DayAvailability {
  if (isChicagoSaturday(day)) {
    const base = Math.max(0, Math.floor(live.saturdayBase));
    const offs = fullDayOffCount(manualsToRows(live.manualOffs, day), day);
    return { date: day, base, offs, available: Math.max(0, base - offs) };
  }
  const rows = withManualOffs(live.offs, live.manualOffs, day);
  return availableDrivers(live.base, rows, day);
}

/**
 * Lock any stored day that is before Chicago `today`. Does not invent
 * missing dates and never changes a locked available count or ootNames.
 */
export function lockEndedDays(
  store: DayStore,
  today: string,
  nowIso: string,
): DayStore {
  let changed = false;
  const next: DayStore = {};
  for (const [date, day] of Object.entries(store)) {
    if (!isDriverTallyDay(date)) {
      changed = true;
      continue;
    }
    if (date < today && !day.locked) {
      next[date] = { ...day, locked: true, lockedAt: day.lockedAt || nowIso };
      changed = true;
    } else {
      next[date] = day;
    }
  }
  return changed ? next : store;
}

/**
 * Apply a live sheet pull.
 * Today is snapshotted (unlocked) and may update until Chicago midnight,
 * including today's live ootNames.
 * Past days are never given ootNames from today's sheet (no backfill).
 * Missing past days are left empty.
 */
export function applyLiveSheet(
  store: DayStore,
  live: LiveSheet,
  today: string,
  nowIso: string,
): DayStore {
  const next = { ...lockEndedDays(store, today, nowIso) };

  if (isDriverTallyDay(today)) {
    const computed = computeAvailability(live, today);
    const ootNames = Array.isArray(live.ootNames) ? [...live.ootNames] : [];
    next[today] = {
      ...computed,
      ootNames,
      locked: false,
      lockedAt: nowIso,
      source: isChicagoSaturday(today) ? "saturday" : "weekday",
    };
  } else {
    delete next[today];
  }

  return next;
}

/** Locked historical values win; later sheet edits must not replace them. */
export function mergeDayStores(local: DayStore, remote: DayStore): DayStore {
  const out: DayStore = {};
  const dates = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const date of dates) {
    if (!isDriverTallyDay(date)) continue;
    const a = local[date];
    const b = remote[date];
    if (a && b) {
      let winner: LockedDay;
      if (b.locked && !a.locked) winner = b;
      else if (a.locked && !b.locked) winner = a;
      else if (a.locked && b.locked) {
        winner = a.lockedAt <= b.lockedAt ? a : b;
      } else {
        winner = a.lockedAt >= b.lockedAt ? a : b;
      }
      out[date] = winner;
    } else {
      out[date] = (a ?? b) as LockedDay;
    }
  }
  return out;
}

export function averageWorkingDays(
  store: DayStore,
  start: string,
  end: string,
): number | null {
  let sum = 0;
  let days = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isDriverTallyDay(d)) continue;
    const row = store[d];
    if (!row) continue;
    sum += row.available;
    days += 1;
    if (days > 400) break;
  }
  return days === 0 ? null : sum / days;
}

export function ytdWorkingAverage(store: DayStore, today: string): number | null {
  return averageWorkingDays(store, startOfYear(today), today);
}

