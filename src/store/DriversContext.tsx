import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { chicagoToday, isChicagoSunday } from "../lib/chicagoDate";
import {
  applyLiveSheet,
  applyManualsToStoredDay,
  availabilityWithManuals,
  callOffsOnDay,
  lockEndedDays,
  refreshPastDayManuals,
  lookupDay,
  mergeDayStores,
  projectFutureDay,
  ytdWorkingAverage,
  type DayStore,
  type LockedDay,
} from "../lib/driverDays";
import {
  deleteRemoteManualOff,
  fetchRemoteDays,
  fetchRemoteManualOffs,
  pushDayStore,
  upsertRemoteManualOff,
} from "../lib/driverCloud";
import {
  readDayStore,
  readDriverDaysPayload,
  writeDayStore,
  writeManualOffs,
} from "../lib/driverStore";
import {
  callOffNameKey,
  type CallOffEntry,
  type CallOffKind,
  type CallOffRow,
} from "../lib/driverAvailability";
import { liveSheetFromRoster } from "../lib/rosterAvailability";
import { useDriverRoster } from "./DriverRosterContext";
import { useVacation } from "./VacationContext";
import {
  addManualOff as insertManualOff,
  deletedManualKey,
  reconcileManualOffsCloud,
  removeManualOff as dropManualOff,
  type ManualOffsStore,
} from "../lib/manualCallOffs";
import { useAuth } from "./AuthContext";

export type DriversStatus = "loading" | "live" | "cached" | "error";

type DriversContextValue = {
  status: DriversStatus;
  error: string | null;
  fetchedAt: string | null;
  baseAvailable: number | null;
  saturdayAvailable: number | null;
  offs: CallOffRow[];
  days: DayStore;
  ootNames: string[];
  availabilityOn: (date: string) => LockedDay | null;
  callOffsOn: (date: string) => CallOffEntry[];
  addManualOff: (
    date: string,
    name: string,
    kind: CallOffKind,
  ) => Promise<boolean>;
  removeManualOff: (date: string, name: string) => Promise<boolean>;
  ytdAverage: (today: string) => number | null;
  refresh: () => Promise<void>;
};

const DriversContext = createContext<DriversContextValue | null>(null);

/** Today available = Full Roster − status/VAC − manual offs. No live Google pull. */
export function DriversProvider({ children }: { children: ReactNode }) {
  const { configured, session } = useAuth();
  const { store: rosterStore } = useDriverRoster();
  const { store: vacationStore } = useVacation();
  const [status, setStatus] = useState<DriversStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [baseAvailable, setBase] = useState<number | null>(null);
  const [saturdayAvailable, setSaturday] = useState<number | null>(null);
  const [offs] = useState<CallOffRow[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [ootNames, setOotNames] = useState<string[]>([]);
  const [days, setDays] = useState<DayStore>(() => {
    const current = readDayStore();
    const locked = lockEndedDays(current, chicagoToday(), new Date().toISOString());
    if (locked !== current) writeDayStore(locked);
    return locked;
  });
  const initialManuals = readDriverDaysPayload();
  const [manualOffs, setManualOffs] = useState<ManualOffsStore>(
    () => initialManuals.manualOffs,
  );
  const deletedRef = useRef<string[]>(initialManuals.manualOffsDeleted);
  const seenRef = useRef<string[]>(initialManuals.manualOffsSeen);
  const todayRef = useRef(chicagoToday());
  const rosterRef = useRef(rosterStore);
  rosterRef.current = rosterStore;
  const vacationRef = useRef(vacationStore);
  vacationRef.current = vacationStore;

  const persistDays = useCallback((next: DayStore) => {
    writeDayStore(next);
    setDays(next);
    if (configured && session) {
      void pushDayStore(next);
    }
  }, [configured, session]);

  const persistManuals = useCallback(
    (
      next: ManualOffsStore,
      deleted: string[] = deletedRef.current,
      seen: string[] = seenRef.current,
    ) => {
      deletedRef.current = deleted;
      seenRef.current = seen;
      writeManualOffs(next, deleted, seen);
      setManualOffs(next);
    },
    [],
  );

  const applySheetWithManuals = useCallback(
    (
      store: DayStore,
      live: {
        base: number;
        saturdayBase: number;
        saturdayUsesWeekdayBase?: boolean;
        offs: CallOffRow[];
        ootNames?: string[];
        manualOffs?: import("../lib/driverAvailability").ManualCallOff[];
      },
      today: string,
      now: string,
      manuals: ManualOffsStore,
    ) =>
      applyLiveSheet(
        store,
        {
          ...live,
          manualOffs: live.manualOffs ?? manuals[today],
        },
        today,
        now,
      ),
    [],
  );

  const refresh = useCallback(async () => {
    setStatus((prev) => (prev === "live" || prev === "cached" ? prev : "loading"));
    setError(null);
    const today = chicagoToday();
    const now = new Date().toISOString();
    try {
      if (configured && session) {
        const remote = await fetchRemoteDays();
        if (remote) {
          const merged = mergeDayStores(readDayStore(), remote);
          writeDayStore(merged);
          setDays(merged);
        }
        const remoteManuals = await fetchRemoteManualOffs();
        if (remoteManuals.error) {
          setError(remoteManuals.error);
        }
        if (remoteManuals.store !== null) {
          const local = readDriverDaysPayload();
          const result = reconcileManualOffsCloud({
            local: local.manualOffs,
            remote: remoteManuals.store,
            deletedKeys: local.manualOffsDeleted,
            seenRemoteKeys: local.manualOffsSeen,
          });
          persistManuals(result.next, result.deletedKeys, result.seenRemoteKeys);
          for (const { date, off } of result.toUpload) {
            const pushed = await upsertRemoteManualOff(date, off);
            if (!pushed.ok && pushed.error) {
              setError(pushed.error);
            }
          }
          for (const { date, name } of result.toDeleteRemote) {
            const removed = await deleteRemoteManualOff(date, name);
            if (!removed.ok && removed.error) {
              setError(removed.error);
            }
          }
        }
      }
      const manuals = readDriverDaysPayload().manualOffs;
      const live = liveSheetFromRoster({
        roster: rosterRef.current,
        vacation: vacationRef.current,
        date: today,
        offs: [],
        manuals: manuals[today],
        saturdayUsesWeekdayBase: true,
      });
      setBase(live.base);
      setSaturday(live.saturdayBase);
      setOotNames(live.ootNames ?? []);
      setFetchedAt(now);
      const next = refreshPastDayManuals(
        applySheetWithManuals(readDayStore(), live, today, now, manuals),
        live,
        manuals,
        today,
        now,
      );
      persistDays(next);
      setStatus("live");
    } catch (err) {
      const manuals = readDriverDaysPayload().manualOffs;
      const live = liveSheetFromRoster({
        roster: rosterRef.current,
        vacation: vacationRef.current,
        date: today,
        offs: [],
        manuals: manuals[today],
        saturdayUsesWeekdayBase: true,
      });
      setBase(live.base);
      setSaturday(live.saturdayBase);
      setOotNames(live.ootNames ?? []);
      const next = refreshPastDayManuals(
        applySheetWithManuals(readDayStore(), live, today, now, manuals),
        live,
        manuals,
        today,
        now,
      );
      persistDays(next);
      setStatus("live");
      setError(err instanceof Error ? err.message : "Could not sync availability.");
    }
  }, [applySheetWithManuals, configured, persistDays, persistManuals, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const today = chicagoToday();
    const now = new Date().toISOString();
    const manuals = readDriverDaysPayload().manualOffs;
    const live = liveSheetFromRoster({
      roster: rosterStore,
      vacation: vacationStore,
      date: today,
      offs: [],
      manuals: manuals[today],
      saturdayUsesWeekdayBase: true,
    });
    setBase(live.base);
    setSaturday(live.saturdayBase);
    setOotNames(live.ootNames ?? []);
    persistDays(
      refreshPastDayManuals(
        applySheetWithManuals(readDayStore(), live, today, now, manuals),
        live,
        manuals,
        today,
        now,
      ),
    );
  }, [
    applySheetWithManuals,
    persistDays,
    rosterStore,
    vacationStore,
  ]);

  useEffect(() => {
    const freezePastDays = () => {
      const today = chicagoToday();
      const now = new Date().toISOString();
      if (today !== todayRef.current) {
        todayRef.current = today;
        void refresh();
        return;
      }
      const current = readDayStore();
      const locked = lockEndedDays(current, today, now);
      if (locked === current) return;
      persistDays(locked);
    };

    const onVisible = () => {
      freezePastDays();
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const id = window.setInterval(freezePastDays, 30_000);
    document.addEventListener("visibilitychange", onVisible);
    freezePastDays();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [persistDays, refresh]);

  const availabilityOn = useCallback(
    (date: string): LockedDay | null => {
      const today = chicagoToday();
      if (date > today) {
        return projectFutureDay(
          liveSheetFromRoster({
            roster: rosterStore,
            vacation: vacationStore,
            date,
            offs: [],
            manuals: manualOffs[date],
            saturdayUsesWeekdayBase: true,
          }),
          date,
          today,
        );
      }
      const stored = lookupDay(days, date);
      if (!stored) return null;
      if (date === today) return stored;
      return availabilityWithManuals(stored, {
        base: stored.base,
        saturdayBase: stored.base,
        saturdayUsesWeekdayBase: stored.source === "saturday-weekday",
        offs,
        manualOffs: manualOffs[date],
      });
    },
    [days, offs, manualOffs, rosterStore, vacationStore],
  );

  const callOffsOn = useCallback(
    (date: string): CallOffEntry[] =>
      callOffsOnDay(
        date,
        chicagoToday(),
        offs,
        manualOffs[date],
        date < chicagoToday() ? days[date] : undefined,
      ),
    [days, offs, manualOffs],
  );

  const recomputeDayFrom = useCallback(
    (date: string, nextManuals: ManualOffsStore) => {
      const today = chicagoToday();
      const now = new Date().toISOString();
      const live = liveSheetFromRoster({
        roster: rosterStore,
        vacation: vacationStore,
        date: date === today ? today : date,
        offs: [],
        manuals: nextManuals[date],
        saturdayUsesWeekdayBase: true,
      });
      setBase(live.base);
      setSaturday(live.saturdayBase);
      setOotNames(live.ootNames ?? []);
      if (date === today) {
        persistDays(applySheetWithManuals(readDayStore(), live, today, now, nextManuals));
        return;
      }
      persistDays(applyManualsToStoredDay(readDayStore(), live, date, today, now));
    },
    [applySheetWithManuals, persistDays, rosterStore, vacationStore],
  );

  const addManualOff = useCallback(
    async (date: string, name: string, kind: CallOffKind): Promise<boolean> => {
      if (isChicagoSunday(date)) return false;
      const occupied = new Set(
        callOffsOn(date)
          .filter((row) => row.source === "sheet")
          .map((row) => callOffNameKey(row.name)),
      );
      const { store: next, added } = insertManualOff(
        manualOffs,
        date,
        name,
        kind,
        occupied,
      );
      if (!added) return false;
      const addKey = deletedManualKey(date, added.name);
      const nextDeleted = deletedRef.current.filter((key) => key !== addKey);
      // Forget seen so a refresh before the upsert lands cannot treat this
      // re-add as "another device deleted a previously pulled name".
      const nextSeen = seenRef.current.filter((key) => key !== addKey);
      persistManuals(next, nextDeleted, nextSeen);
      recomputeDayFrom(date, next);
      if (configured && session) {
        const written = await upsertRemoteManualOff(date, added);
        if (!written.ok && written.error) {
          setError(written.error);
        }
      }
      return true;
    },
    [
      callOffsOn,
      configured,
      manualOffs,
      persistManuals,
      recomputeDayFrom,
      session,
    ],
  );

  const removeManualOff = useCallback(
    async (date: string, name: string): Promise<boolean> => {
      const { store: next, removed } = dropManualOff(manualOffs, date, name);
      if (!removed) return false;
      const tombstone = deletedManualKey(date, removed.name);
      const nextDeleted = deletedRef.current.includes(tombstone)
        ? deletedRef.current
        : [...deletedRef.current, tombstone];
      persistManuals(next, nextDeleted);
      recomputeDayFrom(date, next);
      if (configured && session) {
        const written = await deleteRemoteManualOff(date, removed.name);
        if (!written.ok && written.error) {
          setError(written.error);
        }
      }
      return true;
    },
    [configured, manualOffs, persistManuals, recomputeDayFrom, session],
  );

  const value = useMemo<DriversContextValue>(
    () => ({
      status,
      error,
      fetchedAt,
      baseAvailable,
      saturdayAvailable,
      offs,
      days,
      ootNames,
      availabilityOn,
      callOffsOn,
      addManualOff,
      removeManualOff,
      ytdAverage: (today: string) => ytdWorkingAverage(days, today),
      refresh,
    }),
    [
      status,
      error,
      fetchedAt,
      baseAvailable,
      saturdayAvailable,
      offs,
      days,
      ootNames,
      availabilityOn,
      callOffsOn,
      addManualOff,
      removeManualOff,
      refresh,
    ],
  );

  return <DriversContext.Provider value={value}>{children}</DriversContext.Provider>;
}

export function useDrivers(): DriversContextValue {
  const ctx = useContext(DriversContext);
  if (!ctx) throw new Error("useDrivers must be used inside DriversProvider");
  return ctx;
}
