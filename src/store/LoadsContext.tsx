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
import type { Load } from "../types";
import { fetchAllPaged, loadToRow, rowToLoad, type LoadRow } from "../lib/cloud";
import {
  deletedLoadIds,
  localOnlyLoadsForUpload,
  mergeCloudLoads,
  reconcilePersistedSnapshot,
  shouldApplyRealtimeDelete,
  shouldApplyRealtimeUpsert,
  snapshotForDeviceBackup,
  snapshotLosesProtectedDeviceLoads,
} from "../lib/cloudMerge";
import { loadsToCsv } from "../lib/commodity";
import {
  enqueueDelete,
  enqueueUpsert,
  pendingIds,
  readQueue,
  writeQueue,
} from "../lib/queue";
import { buildSeedLoads } from "../lib/seed";
import { sortLoads } from "../lib/sortLoads";
import { getSupabase, isCloudConfigured } from "../lib/supabase";
import {
  allLoads,
  clearSeeded,
  gcLoadDeletedIds,
  loadsForDate,
  parseDeletedIds,
  readLastSuccessfulSyncAt,
  readStore,
  rememberDeletedIds,
  removeLoad,
  snapshotFromLoads,
  upsertLoad,
  upsertLoadIntoRef,
  writeLastSuccessfulSyncAt,
  writeStore,
  type Persisted,
} from "../lib/storage";
import { useAuth } from "./AuthContext";

export type SyncStatus = "local" | "live" | "syncing" | "offline" | "error";

type LoadsContextValue = {
  loads: Load[];
  loadsOn: (date: string) => Load[];
  saveLoad: (load: Load) => void;
  deleteLoad: (id: string) => void;
  clearSampleLoads: () => void;
  hasSampleLoads: boolean;
  exportCsv: (date: string) => void;
  findById: (id: string) => Load | undefined;
  syncStatus: SyncStatus;
  queuedCount: number;
  localPendingCount: number;
  uploadLocalLoads: () => Promise<number>;
  pushAllLoadsToCloud: () => Promise<number>;
};

const CACHE_KEY = "chitrader.load-tracker.cloud-cache.v1";

const LoadsContext = createContext<LoadsContextValue | null>(null);

function readCloudCache(): Persisted {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { version: 1, loadsByDate: {} };
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.version !== 1 || typeof parsed.loadsByDate !== "object") {
      return { version: 1, loadsByDate: {} };
    }
    const deletedIds = parseDeletedIds(parsed.deletedIds);
    return deletedIds.length
      ? { version: 1, loadsByDate: parsed.loadsByDate, deletedIds }
      : { version: 1, loadsByDate: parsed.loadsByDate };
  } catch {
    return { version: 1, loadsByDate: {} };
  }
}

function writeCloudCache(store: Persisted): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(store));
}

function bootstrapLocal(): Persisted {
  const existing = readStore();
  const hasAny = Object.keys(existing.loadsByDate).length > 0;
  if (hasAny) return existing;
  const seeded = buildSeedLoads();
  let next = existing;
  for (const load of seeded) next = upsertLoad(next, load);
  writeStore(next);
  return next;
}

export function LoadsProvider({ children }: { children: ReactNode }) {
  const { configured, session, user, displayName } = useAuth();
  const cloud = configured && Boolean(session);
  const [store, setStore] = useState<Persisted>(() =>
    isCloudConfigured() ? readCloudCache() : bootstrapLocal(),
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    isCloudConfigured() ? "syncing" : "local",
  );
  const [queuedCount, setQueuedCount] = useState(() => readQueue().length);
  const flushing = useRef(false);
  const flushPromise = useRef<Promise<boolean> | null>(null);
  const flushQueueRef = useRef<() => Promise<void>>(async () => {});
  const storeRef = useRef(store);
  const lastGoodRef = useRef<Persisted>(store);
  const lastSuccessfulSyncAtRef = useRef<string | null>(readLastSuccessfulSyncAt());
  const refreshStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    storeRef.current = store;
    if (allLoads(store).some((load) => !load.seeded) || (store.deletedIds?.length ?? 0) > 0) {
      lastGoodRef.current = store;
    }
  }, [store]);

  const persistLocal = useCallback((next: Persisted) => {
    writeStore(next);
    storeRef.current = next;
    setStore(next);
  }, []);

  const backupLocalStore = useCallback((next: Persisted) => {
    const snapshot = snapshotForDeviceBackup(next, readStore(), readQueue());
    if (!snapshot) return;
    writeStore(snapshot);
  }, []);

  const persistCloudCache = useCallback((next: Persisted): boolean => {
    const pending = readQueue();
    const cache = readCloudCache();
    const local = readStore();
    const live = storeRef.current;
    const lastGood = lastGoodRef.current;
    const lastSuccessfulSyncAt = lastSuccessfulSyncAtRef.current;
    const refreshStartedAt = refreshStartedAtRef.current;
    const reconciled = reconcilePersistedSnapshot({
      incoming: next,
      live,
      cache,
      local,
      lastGood,
      pending,
      lastSuccessfulSyncAt,
      refreshStartedAt,
    });
    if (!reconciled) return false;
    // Refuse only if pending / in-flight saves would be dropped — not stale ghosts.
    if (
      snapshotLosesProtectedDeviceLoads(
        allLoads(reconciled),
        cache,
        local,
        pending,
        reconciled.deletedIds,
        [live, lastGood],
        lastSuccessfulSyncAt,
        refreshStartedAt,
      )
    ) {
      return false;
    }
    next = reconciled;
    writeCloudCache(next);
    storeRef.current = next;
    setStore(next);
    if (allLoads(next).some((load) => !load.seeded) || (next.deletedIds?.length ?? 0) > 0) {
      lastGoodRef.current = next;
    }
    backupLocalStore(next);
    return true;
  }, [backupLocalStore]);

  const applyQueueStatus = useCallback((remaining: number, failed: boolean) => {
    setQueuedCount(remaining);
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    if (remaining > 0 || failed) {
      setSyncStatus("error");
      return;
    }
    setSyncStatus("live");
  }, []);

  const flushQueue = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session) return;
    if (flushPromise.current) {
      const priorFailed = await flushPromise.current;
      if (priorFailed) return;
      if (readQueue().length && !flushing.current) return flushQueueRef.current();
      return;
    }
    if (!navigator.onLine) {
      applyQueueStatus(readQueue().length, false);
      return;
    }

    const run = async () => {
      flushing.current = true;
      setSyncStatus("syncing");
      let failed = false;
      try {
        for (;;) {
          const ops = readQueue();
          if (!ops.length) break;
          const op = ops[0];
          let attempts = 0;
          for (;;) {
            try {
              if (op.kind === "upsert") {
                const { error } = await supabase
                  .from("loads")
                  .upsert(loadToRow(op.load, user?.id ?? null));
                if (error) throw error;
              } else {
                const { error } = await supabase.from("loads").delete().eq("id", op.loadId);
                if (error) throw error;
              }
              break;
            } catch (error) {
              attempts += 1;
              if (attempts >= 3 || !navigator.onLine) throw error;
              await new Promise((resolve) => setTimeout(resolve, 400 * attempts));
            }
          }
          const rest = readQueue().filter((item) => item.opId !== op.opId);
          writeQueue(rest);
          setQueuedCount(rest.length);
        }
      } catch {
        failed = true;
      } finally {
        flushing.current = false;
        applyQueueStatus(readQueue().length, failed);
      }
      return failed;
    };

    flushPromise.current = run();
    let failed = true;
    try {
      failed = await flushPromise.current;
    } finally {
      flushPromise.current = null;
    }
    if (!failed && readQueue().length && !flushing.current) {
      await flushQueueRef.current();
    }
  }, [applyQueueStatus, session, user]);

  useEffect(() => {
    flushQueueRef.current = flushQueue;
  }, [flushQueue]);

  const enqueueMissing = useCallback(
    (loads: Load[]) => {
      const deleted = deletedLoadIds(readQueue(), storeRef.current, readStore());
      let queued = readQueue();
      for (const load of loads) {
        if (deleted.has(load.id)) continue;
        queued = enqueueUpsert({
          ...load,
          seeded: false,
          displayName: load.displayName ?? displayName,
          createdBy: load.createdBy ?? user?.id,
        });
      }
      setQueuedCount(queued.length);
      return queued.length;
    },
    [displayName, user?.id],
  );

  const refreshFromCloud = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !session) return;
    const refreshStartedAt = new Date().toISOString();
    refreshStartedAtRef.current = refreshStartedAt;
    const lastSuccessfulSyncAt = lastSuccessfulSyncAtRef.current;
    try {
      const { data, error } = await fetchAllPaged<LoadRow>(async (from, to) => {
        const page = await supabase
          .from("loads")
          .select("*")
          .order("updated_at", { ascending: false })
          .range(from, to);
        return { data: page.data as LoadRow[] | null, error: page.error };
      });
      if (error || !Array.isArray(data)) {
        applyQueueStatus(readQueue().length, true);
        return;
      }
      const remote = (data as LoadRow[]).map(rowToLoad);
      const cache = readCloudCache();
      const local = readStore();
      const pending = readQueue();
      const deviceCache =
        Object.keys(cache.loadsByDate).length > 0
          ? cache
          : lastGoodRef.current;
      const extra = [lastGoodRef.current, storeRef.current];
      const { merged, toUpsert, toDelete, toTombstone } = mergeCloudLoads({
        remote,
        cache: deviceCache,
        local,
        pending,
        extra,
        lastSuccessfulSyncAt,
        refreshStartedAt,
      });
      const deleted = deletedLoadIds(
        pending,
        deviceCache,
        local,
        toTombstone,
        toDelete.map((row) => row.id),
        ...extra,
      );
      for (const row of remote) {
        if (deleted.has(row.id)) enqueueDelete(row.id);
      }
      for (const row of toDelete) {
        enqueueDelete(row.id);
      }
      const keptTombstones = gcLoadDeletedIds(deleted, remote, deviceCache, local);
      const persisted = persistCloudCache(snapshotFromLoads(merged, keptTombstones));
      if (persisted && remote.length > 0) {
        writeLastSuccessfulSyncAt(refreshStartedAt);
        lastSuccessfulSyncAtRef.current = refreshStartedAt;
      }
      if (toUpsert.length) enqueueMissing(toUpsert);
      await flushQueue();
    } finally {
      refreshStartedAtRef.current = null;
    }
  }, [applyQueueStatus, enqueueMissing, flushQueue, persistCloudCache, session]);

  useEffect(() => {
    if (!cloud) {
      if (!configured) {
        setStore(bootstrapLocal());
        setSyncStatus("local");
      }
      return;
    }
    void refreshFromCloud();
    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel("loads-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loads" },
        (payload) => {
          const queued = readQueue();
          const pending = pendingIds(queued);
          if (payload.eventType === "DELETE") {
            const row = payload.old as Partial<LoadRow>;
            const deletedId = row.id;
            if (!shouldApplyRealtimeDelete(deletedId, queued)) return;
            persistCloudCache(rememberDeletedIds(storeRef.current, [deletedId]));
            return;
          }
          const row = payload.new as LoadRow;
          if (!row?.id) return;
          const incoming = rowToLoad(row);
          if (!shouldApplyRealtimeUpsert(incoming, storeRef.current, pending)) return;
          persistCloudCache(upsertLoad(storeRef.current, incoming));
        },
      )
      .subscribe();

    const onOnline = () => void flushQueue().then(() => refreshFromCloud());
    const onOffline = () => setSyncStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setSyncStatus("offline");

    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [cloud, configured, flushQueue, persistCloudCache, refreshFromCloud]);

  const saveLoad = useCallback(
    (load: Load) => {
      const stamped: Load = {
        ...load,
        seeded: false,
        updatedAt: new Date().toISOString(),
        createdBy: load.createdBy ?? user?.id,
        displayName: load.displayName ?? (cloud ? displayName : undefined),
      };
      if (cloud) {
        persistCloudCache(upsertLoadIntoRef(storeRef, stamped));
        setQueuedCount(enqueueUpsert(stamped).length);
        void flushQueue();
        return;
      }
      persistLocal(upsertLoadIntoRef(storeRef, stamped));
    },
    [cloud, displayName, flushQueue, persistCloudCache, persistLocal, user?.id],
  );

  const deleteLoad = useCallback(
    (id: string) => {
      if (cloud) {
        const next = rememberDeletedIds(storeRef.current, [id]);
        storeRef.current = next;
        // Enqueue the delete before persist so backup/merge see it immediately.
        setQueuedCount(enqueueDelete(id).length);
        persistCloudCache(next);
        void flushQueue();
        return;
      }
      persistLocal(removeLoad(storeRef.current, id));
    },
    [cloud, flushQueue, persistCloudCache, persistLocal],
  );

  const clearSampleLoads = useCallback(() => {
    persistLocal(clearSeeded(storeRef.current));
  }, [persistLocal]);

  const uploadLocalLoads = useCallback(async () => {
    const local = localOnlyLoadsForUpload(storeRef.current, readStore(), readQueue());
    if (local.length) enqueueMissing(local);
    await flushQueue();
    return local.length;
  }, [enqueueMissing, flushQueue]);

  const pushAllLoadsToCloud = useCallback(async () => {
    if (!cloud) return 0;
    // Refresh-first: mergeCloudLoads decides toUpsert / toDelete. Blindly
    // enqueueing deviceLoadsForPush re-upserts the whole cache and can
    // resurrect rows another device already deleted.
    await refreshFromCloud();
    return readQueue().length;
  }, [cloud, refreshFromCloud]);

  const localPendingCount = useMemo(() => {
    if (!cloud) return 0;
    const deleted = deletedLoadIds(readQueue(), store, readStore());
    const cloudIds = new Set(allLoads(store).map((load) => load.id));
    return allLoads(readStore()).filter(
      (load) => !load.seeded && !cloudIds.has(load.id) && !deleted.has(load.id),
    ).length;
  }, [cloud, store]);

  const value = useMemo<LoadsContextValue>(() => {
    const loads = sortLoads(allLoads(store));
    return {
      loads,
      loadsOn: (date: string) => sortLoads(loadsForDate(store, date)),
      saveLoad,
      deleteLoad,
      clearSampleLoads,
      hasSampleLoads: !cloud && loads.some((load) => load.seeded),
      exportCsv: (date: string) => {
        const dayLoads = sortLoads(loadsForDate(store, date));
        const csv = loadsToCsv(dayLoads);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `load-tracker-${date}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      findById: (id: string) => allLoads(store).find((load) => load.id === id),
      syncStatus: cloud ? syncStatus : "local",
      queuedCount,
      localPendingCount,
      uploadLocalLoads,
      pushAllLoadsToCloud,
    };
  }, [
    clearSampleLoads,
    cloud,
    deleteLoad,
    localPendingCount,
    pushAllLoadsToCloud,
    queuedCount,
    saveLoad,
    store,
    syncStatus,
    uploadLocalLoads,
  ]);

  return <LoadsContext.Provider value={value}>{children}</LoadsContext.Provider>;
}

export function useLoads(): LoadsContextValue {
  const ctx = useContext(LoadsContext);
  if (!ctx) throw new Error("useLoads must be used within LoadsProvider");
  return ctx;
}
