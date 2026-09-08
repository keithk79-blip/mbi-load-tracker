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
  lockEndedDays,
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
  pushMissingManualOffs,
  upsertRemoteManualOff,
} from "../lib/driverCloud";
import {
  readDayStore,
  readDriverDaysPayload,
  writeDayStore,
  writeManualOffs,
} from "../lib/driverStore";
import { fetchDriverSnapshot, readDriverCache } from "../lib/sheets";
import {
  callOffNameKey,
  fullDayOffEntries,
  type CallOffEntry,
  type CallOffKind,
  type CallOffRow,
} from "../lib/driverAvailability";
import {
  addManualOff as insertManualOff,
  deletedManualKey,
  gcDeletedManualKeys,
  mergeManualOffStores,
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

export function DriversProvider({ children }: { children: ReactNode }) {
  const { configured, session } = useAuth();
  const cached = readDriverCache();
  const [status, setStatus] = useState<DriversStatus>(cached ? "cached" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [baseAvailable, setBase] = useState<number | null>(cached?.baseAvailable ?? null);
  const [saturdayAvailable, setSaturday] = useState<number | null>(cached?.saturdayAvailable ?? null);
  const [offs, setOffs] = useState<CallOffRow[]>(cached?.offs ?? []);
  const [fetchedAt, setFetchedAt] = useState<string | null>(cached?.fetchedAt ?? null);
  const [ootNames, setOotNames] = useState<string[]>(cached?.ootNames ?? []);
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
  const todayRef = useRef(chicagoToday());

  const persistDays = useCallback((next: DayStore) => {
    writeDayStore(next);
    setDays(next);
    if (configured && session) {
      void pushDayStore(next);
    }
  }, [configured, session]);

  const persistManuals = useCallback(
    (next: ManualOffsStore, deleted: string[] = deletedRef.current) => {
      deletedRef.current = deleted;
      writeManualOffs(next, deleted);
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
        offs: CallOffRow[];
        ootNames?: string[];
      },
      today: string,
      now: string,
      manuals: ManualOffsStore,
    ) =>
      applyLiveSheet(
        store,
        {
          ...live,
          manualOffs: manuals[today],
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
        if (remoteManuals) {
          const local = readDriverDaysPayload();
          const mergedManuals = mergeManualOffStores(
            local.manualOffs,
            remoteManuals,
            local.manualOffsDeleted,
          );
          const nextDeleted = gcDeletedManualKeys(
            local.manualOffsDeleted,
            remoteManuals,
          );
          persistManuals(mergedManuals, nextDeleted);
          await pushMissingManualOffs(mergedManuals, remoteManuals);
          for (const key of nextDeleted) {
            const split = key.indexOf("|");
            if (split <= 0) continue;
            await deleteRemoteManualOff(key.slice(0, split), key.slice(split + 1));
          }
        }
      }
      const snap = await fetchDriverSnapshot();
      setBase(snap.baseAvailable);
      setSaturday(snap.saturdayAvailable);
      setOffs(snap.offs);
      setOotNames(snap.ootNames);
      setFetchedAt(snap.fetchedAt);
      const manuals = readDriverDaysPayload().manualOffs;
      const next = applySheetWithManuals(
        readDayStore(),
        {
          base: snap.baseAvailable,
          saturdayBase: snap.saturdayAvailable,
          offs: snap.offs,
          ootNames: snap.ootNames,
        },
        today,
        now,
        manuals,
      );
      persistDays(next);
      setStatus("live");
    } catch (err) {
      const cachedNow = readDriverCache();
      const manuals = readDriverDaysPayload().manualOffs;
      if (cachedNow) {
        setBase(cachedNow.baseAvailable);
        setSaturday(cachedNow.saturdayAvailable);
        setOffs(cachedNow.offs);
        setOotNames(cachedNow.ootNames);
        setFetchedAt(cachedNow.fetchedAt);
        const next = applySheetWithManuals(
          readDayStore(),
          {
            base: cachedNow.baseAvailable,
            saturdayBase: cachedNow.saturdayAvailable,
            offs: cachedNow.offs,
            ootNames: cachedNow.ootNames,
          },
          today,
          now,
          manuals,
        );
        persistDays(next);
        setStatus("cached");
        setError("Could not refresh sheets — showing last pull / locked days.");
      } else if (Object.keys(readDayStore()).length) {
        setStatus("cached");
        setError("Could not refresh sheets — showing locked days.");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not reach Google Sheets.");
      }
    }
  }, [applySheetWithManuals, configured, persistDays, persistManuals, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      if (date <= today) return lookupDay(days, date);
      if (baseAvailable === null) return null;
      return projectFutureDay(
        {
          base: baseAvailable,
          saturdayBase: saturdayAvailable ?? 0,
          offs,
          manualOffs: manualOffs[date],
        },
        date,
        today,
      );
    },
    [days, baseAvailable, saturdayAvailable, offs, manualOffs],
  );

  const callOffsOn = useCallback(
    (date: string): CallOffEntry[] =>
      fullDayOffEntries(offs, manualOffs[date], date),
    [offs, manualOffs],
  );

  const recomputeTodayFrom = useCallback(
    (nextManuals: ManualOffsStore) => {
      const today = chicagoToday();
      if (baseAvailable === null) return;
      const next = applySheetWithManuals(
        readDayStore(),
        {
          base: baseAvailable,
          saturdayBase: saturdayAvailable ?? 0,
          offs,
          ootNames,
        },
        today,
        new Date().toISOString(),
        nextManuals,
      );
      persistDays(next);
    },
    [
      applySheetWithManuals,
      baseAvailable,
      offs,
      ootNames,
      persistDays,
      saturdayAvailable,
    ],
  );

  const addManualOff = useCallback(
    async (date: string, name: string, kind: CallOffKind): Promise<boolean> => {
      if (isChicagoSunday(date) || date < chicagoToday()) return false;
      const occupied = new Set(
        fullDayOffEntries(offs, undefined, date).map((row) =>
          callOffNameKey(row.name),
        ),
      );
      const { store: next, added } = insertManualOff(
        manualOffs,
        date,
        name,
        kind,
        occupied,
      );
      if (!added) return false;
      const nextDeleted = deletedRef.current.filter(
        (key) => key !== deletedManualKey(date, added.name),
      );
      persistManuals(next, nextDeleted);
      recomputeTodayFrom(next);
      if (configured && session) {
        await upsertRemoteManualOff(date, added);
      }
      return true;
    },
    [
      configured,
      manualOffs,
      offs,
      persistManuals,
      recomputeTodayFrom,
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
      recomputeTodayFrom(next);
      if (configured && session) {
        await deleteRemoteManualOff(date, removed.name);
      }
      return true;
    },
    [configured, manualOffs, persistManuals, recomputeTodayFrom, session],
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
