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
import {
  fetchDailyEodFromCloud,
  readDailyEodPersisted,
  reconcileDailyEodCloud,
  removeDailyEod,
  stampDailyEod,
  totalsOn,
  upsertDailyEod,
  upsertDailyEodRows,
  writeDailyEodPersisted,
  type DailyEodInput,
  type DailyEodPersisted,
  type DailyEodStore,
  type DailyEodTotals,
} from "../lib/dailyEod";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type DailyEodContextValue = {
  store: DailyEodStore;
  cloud: boolean;
  totalsOn: (date: string) => DailyEodTotals | null;
  upsertTotals: (input: DailyEodInput) => Promise<string | null>;
  removeTotals: (date: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const DailyEodContext = createContext<DailyEodContextValue | null>(null);

export function DailyEodProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DailyEodStore>(
    () => readDailyEodPersisted().byDate,
  );
  const storeRef = useRef(store);
  storeRef.current = store;
  const seenRemoteRef = useRef<Set<string>>(
    new Set(readDailyEodPersisted().seenRemoteDates ?? []),
  );
  const uploadingRef = useRef(false);
  const refreshTailRef = useRef(Promise.resolve());

  const persistLocal = useCallback((next: DailyEodStore, seen?: Iterable<string>) => {
    if (seen) seenRemoteRef.current = new Set(seen);
    const snapshot: DailyEodPersisted = {
      version: 1,
      byDate: next,
      seenRemoteDates: [...seenRemoteRef.current],
    };
    writeDailyEodPersisted(snapshot);
    storeRef.current = next;
    setStore(next);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const pulled = await fetchDailyEodFromCloud();
    if (!pulled.store) return;
    const result = reconcileDailyEodCloud({
      local: storeRef.current,
      remote: pulled.store,
      seenRemoteDates: seenRemoteRef.current,
    });
    if (result.toUpload.length && !uploadingRef.current) {
      uploadingRef.current = true;
      try {
        await upsertDailyEodRows(result.toUpload, user?.id ?? null);
      } finally {
        uploadingRef.current = false;
      }
    }
    persistLocal(result.next, result.seenRemoteDates);
  }, [cloud, persistLocal, user?.id]);

  const refresh = useCallback(() => {
    const run = refreshTailRef.current.then(refreshInner, refreshInner);
    refreshTailRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, [refreshInner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cloud) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel("daily-eod-totals-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_eod_totals" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const saveTotals = useCallback(
    async (input: DailyEodInput) => {
      const stamped = stampDailyEod(input, storeRef.current[input.date]);
      if (!stamped) return "Enter a Chicago calendar date and non-negative counts.";
      persistLocal(upsertDailyEod(storeRef.current, stamped));
      if (!cloud) return null;
      return upsertDailyEodRows([stamped], user?.id ?? null);
    },
    [cloud, persistLocal, user?.id],
  );

  const dropTotals = useCallback(
    async (date: string) => {
      persistLocal(removeDailyEod(storeRef.current, date));
    },
    [persistLocal],
  );

  const totalsForDate = useCallback(
    (date: string) => totalsOn(store, date),
    [store],
  );

  const value = useMemo<DailyEodContextValue>(
    () => ({
      store,
      cloud,
      totalsOn: totalsForDate,
      upsertTotals: saveTotals,
      removeTotals: dropTotals,
      refresh,
    }),
    [cloud, dropTotals, refresh, saveTotals, store, totalsForDate],
  );

  return (
    <DailyEodContext.Provider value={value}>{children}</DailyEodContext.Provider>
  );
}

export function useDailyEod(): DailyEodContextValue {
  const ctx = useContext(DailyEodContext);
  if (!ctx) throw new Error("useDailyEod must be used within DailyEodProvider");
  return ctx;
}
