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
  fetchDispatchTalliesFromCloud,
  readDispatchTalliesPersisted,
  reconcileDispatchTalliesCloud,
  stampDispatchTallies,
  talliesOn,
  upsertDispatchTallies,
  upsertDispatchTalliesRows,
  writeDispatchTalliesPersisted,
  type DispatchTallies,
  type DispatchTalliesPersisted,
  type DispatchTalliesStore,
} from "../lib/dispatchTallies";
import { attachCloudRefresh } from "../lib/cloudRefresh";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type DispatchTalliesContextValue = {
  store: DispatchTalliesStore;
  cloud: boolean;
  talliesOn: (date: string) => DispatchTallies;
  setBataviaPreload: (date: string, count: number) => Promise<void>;
  decrementBataviaPreload: (date: string) => Promise<void>;
  setEvanstonAsking: (date: string, count: number) => Promise<void>;
  refresh: () => Promise<void>;
};

const DispatchTalliesContext = createContext<DispatchTalliesContextValue | null>(null);

export function DispatchTalliesProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DispatchTalliesStore>(
    () => readDispatchTalliesPersisted().byDate,
  );
  const storeRef = useRef(store);
  storeRef.current = store;
  const seenRemoteRef = useRef<Set<string>>(
    new Set(readDispatchTalliesPersisted().seenRemoteDates ?? []),
  );
  const uploadingRef = useRef(false);
  const refreshTailRef = useRef(Promise.resolve());

  const persistLocal = useCallback((next: DispatchTalliesStore, seen?: Iterable<string>) => {
    if (seen) seenRemoteRef.current = new Set(seen);
    const snapshot: DispatchTalliesPersisted = {
      version: 1,
      byDate: next,
      seenRemoteDates: [...seenRemoteRef.current],
    };
    writeDispatchTalliesPersisted(snapshot);
    storeRef.current = next;
    setStore(next);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const pulled = await fetchDispatchTalliesFromCloud();
    if (!pulled.store) return;
    const result = reconcileDispatchTalliesCloud({
      local: storeRef.current,
      remote: pulled.store,
      seenRemoteDates: seenRemoteRef.current,
    });
    if (result.toUpload.length && !uploadingRef.current) {
      uploadingRef.current = true;
      try {
        await upsertDispatchTalliesRows(result.toUpload, user?.id ?? null);
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
      .channel("day-dispatch-tallies-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_dispatch_tallies" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  useEffect(() => {
    if (!cloud) return;
    return attachCloudRefresh(refresh);
  }, [cloud, refresh]);

  const save = useCallback(
    async (date: string, patch: { bataviaPreload?: number; evanstonAsking?: number }) => {
      const stamped = stampDispatchTallies(date, patch, storeRef.current[date]);
      if (!stamped) return;
      persistLocal(upsertDispatchTallies(storeRef.current, stamped));
      if (!cloud) return;
      await upsertDispatchTalliesRows([stamped], user?.id ?? null);
    },
    [cloud, persistLocal, user?.id],
  );

  const setBataviaPreload = useCallback(
    (date: string, count: number) => save(date, { bataviaPreload: Math.max(0, Math.floor(count)) }),
    [save],
  );

  const decrementBataviaPreload = useCallback(
    (date: string) => {
      const current = talliesOn(storeRef.current, date).bataviaPreload;
      return save(date, { bataviaPreload: Math.max(0, current - 1) });
    },
    [save],
  );

  const setEvanstonAsking = useCallback(
    (date: string, count: number) => save(date, { evanstonAsking: Math.max(0, Math.floor(count)) }),
    [save],
  );

  const talliesForDate = useCallback((date: string) => talliesOn(store, date), [store]);

  const value = useMemo<DispatchTalliesContextValue>(
    () => ({
      store,
      cloud,
      talliesOn: talliesForDate,
      setBataviaPreload,
      decrementBataviaPreload,
      setEvanstonAsking,
      refresh,
    }),
    [cloud, decrementBataviaPreload, refresh, setBataviaPreload, setEvanstonAsking, store, talliesForDate],
  );

  return (
    <DispatchTalliesContext.Provider value={value}>{children}</DispatchTalliesContext.Provider>
  );
}

export function useDispatchTallies(): DispatchTalliesContextValue {
  const ctx = useContext(DispatchTalliesContext);
  if (!ctx) throw new Error("useDispatchTallies must be used within DispatchTalliesProvider");
  return ctx;
}
