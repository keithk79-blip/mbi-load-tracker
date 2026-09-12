import {
  addDays,
  isChicagoSaturday,
  isChicagoSunday,
  startOfYear,
} from "./chicagoDate";
import {
  availableDrivers,
  fullDayOffCount,
  fullDayOffEntries,
  manualsToRows,
  reasonForKind,
  withManualOffs,
  type CallOffEntry,
  type CallOffRow,
  type DayAvailability,
  type ManualCallOff,
} from "./driverAvailability";

export type AvailabilitySource = "weekday" | "saturday" | "saturday-weekday";

export type LockedDay = DayAvailability & {
  locked: boolean;
  lockedAt: string;
  /** Calendar Saturday + weekday L13 when Sat tabs mark a full mandatory day. */
  source?: AvailabilitySource;
  /**
   * Call-off pills frozen with this Chicago day (sheet + manuals at last
   * today-snapshot, then manuals re-merged on later edits). Missing on days
   * snapshotted before this field existed.
   */
  callOffs?: CallOffEntry[];
};

export type DayStore = Record<string, LockedDay>;

export type LiveSheet = {
  base: number;
  saturdayBase: number;
  /**
   * Sat-* banners/body include “full mandatory work day”. Today’s Saturday
   * then uses weekday L13 + weekday call-off subtract rules, not saturdayBase.
   */
  saturdayUsesWeekdayBase?: boolean;
  offs: CallOffRow[];
  /** Live OOT names — only written onto today's snapshot, never past days. */
  ootNames?: string[];
  /** Manual call-off chips for the date being computed (today or a projected future day). Late/Early is listed but does not subtract. */
  manualOffs?: ManualCallOff[];
};

function usesSaturdayWorklist(live: LiveSheet, day: string): boolean {
  return isChicagoSaturday(day) && !live.saturdayUsesWeekdayBase;
}

function availabilitySource(live: LiveSheet, day: string): AvailabilitySource {
  if (!isChicagoSaturday(day)) return "weekday";
  return live.saturdayUsesWeekdayBase ? "saturday-weekday" : "saturday";
}

function storedDayUsesWeekdayBase(day: LockedDay): boolean {
  return day.source === "saturday-weekday";
}

/** Sundays have no driver tally. Saturdays use the sat-yard sum unless marked full-mandatory. */
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
    source: availabilitySource(live, date),
  };
}


export function computeAvailability(live: LiveSheet, day: string): DayAvailability {
  if (usesSaturdayWorklist(live, day)) {
    const base = Math.max(0, Math.floor(live.saturdayBase));
    const offs = fullDayOffCount(manualsToRows(live.manualOffs, day), day);
    return { date: day, base, offs, available: Math.max(0, base - offs) };
  }
  const rows = withManualOffs(live.offs, live.manualOffs, day);
  return availableDrivers(live.base, rows, day);
}

/**
 * Recompute one stored day's offs / available / callOffs from its locked
 * base + current manuals. Today is rewritten via `applyLiveSheet`. Future
 * dates are not persisted. Missing past days are not invented (no backfill).
 * Past days keep ootNames and the original lock timestamps.
 */
export function applyManualsToStoredDay(
  store: DayStore,
  live: LiveSheet,
  date: string,
  today: string,
  nowIso: string,
): DayStore {
  if (!isDriverTallyDay(date)) return store;
  if (date === today) {
    return applyLiveSheet(store, live, today, nowIso);
  }
  if (date > today) return store;
  const existing = store[date];
  if (!existing) return store;
  const sheetRows = sheetRowsForLockedDay(existing, live.offs);
  const computed = computeAvailability(
    {
      base: existing.base,
      saturdayBase: existing.base,
      saturdayUsesWeekdayBase: storedDayUsesWeekdayBase(existing),
      offs: sheetRows,
      manualOffs: live.manualOffs,
    },
    date,
  );
  return {
    ...store,
    [date]: {
      ...existing,
      offs: computed.offs,
      available: computed.available,
      callOffs: fullDayOffEntries(sheetRows, live.manualOffs, date),
    },
  };
}

/**
 * Frozen sheet pills (if snapshotted) plus current manuals.
 * Days without a callOffs snapshot keep their locked available count so a
 * later live sheet cannot rewrite history; the pill list still refreshes.
 */
export function availabilityWithManuals(
  day: LockedDay,
  live: LiveSheet,
): LockedDay {
  const date = day.date;
  const sheetRows = sheetRowsForLockedDay(day, live.offs);
  const callOffs = fullDayOffEntries(sheetRows, live.manualOffs, date);
  if (!day.callOffs) {
    return { ...day, callOffs };
  }
  const computed = computeAvailability(
    {
      base: day.base,
      saturdayBase: day.base,
      saturdayUsesWeekdayBase: storedDayUsesWeekdayBase(day),
      offs: sheetRows,
      manualOffs: live.manualOffs,
    },
    date,
  );
  return {
    ...day,
    offs: computed.offs,
    available: computed.available,
    callOffs,
  };
}

/** After a manuals pull, refresh past snapshots that already have callOffs. */
export function refreshPastDayManuals(
  store: DayStore,
  live: Omit<LiveSheet, "manualOffs">,
  manualsByDate: Record<string, ManualCallOff[] | undefined>,
  today: string,
  nowIso: string,
): DayStore {
  let next = store;
  for (const date of Object.keys(store)) {
    if (date >= today || !store[date]?.callOffs) continue;
    next = applyManualsToStoredDay(
      next,
      { ...live, manualOffs: manualsByDate[date] },
      date,
      today,
      nowIso,
    );
  }
  return next;
}

/** Date-scoped pills: past days prefer a locked snapshot's sheet names. */
export function callOffsOnDay(
  date: string,
  today: string,
  sheetOffs: CallOffRow[],
  manuals: ManualCallOff[] | undefined,
  locked?: LockedDay | null,
): CallOffEntry[] {
  if (date < today && locked?.callOffs) {
    return (
      availabilityWithManuals(locked, {
        base: locked.base,
        saturdayBase: locked.base,
        saturdayUsesWeekdayBase: storedDayUsesWeekdayBase(locked),
        offs: sheetOffs,
        manualOffs: manuals,
      }).callOffs ?? []
    );
  }
  return fullDayOffEntries(sheetOffs, manuals, date);
}

function sheetRowsForLockedDay(
  day: LockedDay,
  liveOffs: CallOffRow[],
): CallOffRow[] {
  if (!day.callOffs) return liveOffs;
  return day.callOffs
    .filter((entry) => entry.source === "sheet")
    .map((entry) => ({
      name: entry.name,
      start: day.date,
      end: null,
      reason: reasonForKind(entry.kind),
    }));
}

/**
 * Lock any stored day that is before Chicago `today`. Does not invent
 * missing dates and never changes a locked available count, ootNames,
 * or snapshotted callOffs.
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
 * including today's live ootNames and callOffs.
 * Past days are never given ootNames or callOffs from today's sheet (no backfill).
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
    const callOffs = fullDayOffEntries(live.offs, live.manualOffs, today);
    next[today] = {
      ...computed,
      ootNames,
      callOffs,
      locked: false,
      lockedAt: nowIso,
      source: availabilitySource(live, today),
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
      // Remote rows may predate callOffs; keep a local snapshot if the winner lacks one.
      if (!winner.callOffs && (a.callOffs || b.callOffs)) {
        winner = { ...winner, callOffs: a.callOffs ?? b.callOffs };
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

