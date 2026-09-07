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
import { getSupabase } from "../lib/supabase";
import {
  addSpecialtySlot,
  applySpecialtyTombstones,
  boardForDate,
  consumeSpecialtyOpens,
  countSpecialtyOpens,
  destKeepAfterChange,
  gcSpecialtyDestKeeps,
  matchingSpecialtySlotIds,
  mergeSpecialtyStores,
  notifySpecialtyBoardChanged,
  readSpecialtyDeletedIds,
  readSpecialtyDestKeeps,
  readSpecialtyStore,
  remainingSpecialtySlotIds,
  removeSpecialtySlot,
  resolveSpecialtyStationId,
  sameSpecialtyDest,
  sameSpecialtyStation,
  specialtyDateKey,
  unkeptSpecialtyIds,
  upsertSpecialtyDestKeep,
  writeSpecialtyStore,
  type SpecialtyDestKeep,
  type SpecialtySlot,
  type SpecialtyStore,
} from "../lib/specialtyBoard";
import { useAuth } from "./AuthContext";

type SpecialtyRow = {
  id: string;
  date: string;
  station_id: string;
  destination: string;
  created_at: string;
};

type SpecialtyContextValue = {
  store: SpecialtyStore;
  boardOn: (date: string) => SpecialtySlot[];
  addOpen: (date: string, stationId: string, destination: string) => Promise<void>;
  removeOpen: (
    date: string,
    stationId: string,
    destination?: string,
  ) => Promise<void>;
  consumeOpens: (
    date: string,
    stationId: string,
    destination: string,
    count: number,
  ) => Promise<number>;
  opensFor: (date: string, stationId: string, destination: string) => number;
  refresh: () => Promise<void>;
  cloud: boolean;
};

const SpecialtyContext = createContext<SpecialtyContextValue | null>(null);

function rowsToStore(rows: SpecialtyRow[]): SpecialtyStore {
  const store: SpecialtyStore = {};
  for (const row of rows) {
    const date = specialtyDateKey(row.date);
    const slot: SpecialtySlot = {
      id: row.id,
      stationId:
        resolveSpecialtyStationId(row.station_id, row.station_id) ??
        row.station_id,
      destination: row.destination,
      createdAt: row.created_at,
    };
    if (!store[date]) store[date] = [];
    store[date].push(slot);
  }
  return store;
}

export { mergeSpecialtyStores } from "../lib/specialtyBoard";

export function SpecialtyProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<SpecialtyStore>(() => readSpecialtyStore());
  const storeRef = useRef(store);
  storeRef.current = store;
  const uploadingRef = useRef(false);
  const deletedIdsRef = useRef<Set<string>>(new Set(readSpecialtyDeletedIds()));
  const destKeepsRef = useRef<SpecialtyDestKeep[]>(readSpecialtyDestKeeps());
  const epochRef = useRef(0);
  const refreshTailRef = useRef(Promise.resolve());

  const bumpEpoch = useCallback(() => {
    epochRef.current += 1;
  }, []);

  const persistLocal = useCallback((next: SpecialtyStore) => {
    const ids = [...deletedIdsRef.current];
    const keeps = destKeepsRef.current;
    // Strip UUID tombstones and dest-keeps at persist so a stale refresh cannot restore.
    writeSpecialtyStore(next, ids, keeps);
    setStore(applySpecialtyTombstones(next, ids, keeps));
    notifySpecialtyBoardChanged();
  }, []);

  const rememberDeleted = useCallback((ids: string[]) => {
    if (!ids.length) return;
    for (const id of ids) deletedIdsRef.current.add(id);
    // Flush tombstones immediately so an in-flight cloud pull cannot miss them.
    writeSpecialtyStore(storeRef.current, [...deletedIdsRef.current], destKeepsRef.current);
  }, []);

  const rememberDestKeep = useCallback((keep: SpecialtyDestKeep) => {
    destKeepsRef.current = upsertSpecialtyDestKeep(destKeepsRef.current, keep);
    writeSpecialtyStore(storeRef.current, [...deletedIdsRef.current], destKeepsRef.current);
  }, []);

  const gcDeleted = useCallback((remote: SpecialtyStore) => {
    const remoteIds = new Set(
      Object.values(remote)
        .flat()
        .map((s) => s.id),
    );
    for (const id of [...deletedIdsRef.current]) {
      if (!remoteIds.has(id)) deletedIdsRef.current.delete(id);
    }
    destKeepsRef.current = gcSpecialtyDestKeeps(remote, destKeepsRef.current);
  }, []);

  const pullRemote = useCallback(async (): Promise<SpecialtyStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const { data, error } = await supabase
      .from("specialty_opens")
      .select("id, date, station_id, destination, created_at");
    if (error || !data) {
      console.warn("specialty_opens pull failed", error?.message);
      return null;
    }
    return rowsToStore(data as SpecialtyRow[]);
  }, [session]);

  const cloudDeleteIds = useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const supabase = getSupabase();
      if (!supabase) return;
      const { error } = await supabase
        .from("specialty_opens")
        .delete()
        .in("id", ids);
      if (error) console.warn("specialty consume failed", error.message);
    },
    [],
  );

  const mergeWithTombstones = useCallback(
    (left: SpecialtyStore, right: SpecialtyStore) =>
      mergeSpecialtyStores(
        left,
        right,
        deletedIdsRef.current,
        destKeepsRef.current,
      ),
    [],
  );

  const cloudDeleteUnkept = useCallback(
    async (
      date: string,
      stationId: string,
      destination: string,
      keepIds: string[],
    ) => {
      const supabase = getSupabase();
      if (!supabase || !session) return;
      const { data, error } = await supabase
        .from("specialty_opens")
        .select("id, date, station_id, destination")
        .eq("date", specialtyDateKey(date));
      if (error || !data) {
        if (error) console.warn("specialty unkept lookup failed", error.message);
        return;
      }
      const keep = new Set(keepIds);
      const extra = (data as SpecialtyRow[])
        .filter(
          (row) =>
            sameSpecialtyStation(row.station_id, stationId) &&
            sameSpecialtyDest(row.destination, destination) &&
            !keep.has(row.id),
        )
        .map((row) => row.id);
      if (extra.length) await cloudDeleteIds(extra);
    },
    [cloudDeleteIds, session],
  );

  const idsToDeleteFromRemote = useCallback((remote: SpecialtyStore): string[] => {
    const lingering = [...deletedIdsRef.current].filter((id) =>
      Object.values(remote)
        .flat()
        .some((s) => s.id === id),
    );
    const extras = destKeepsRef.current.flatMap((keep) =>
      unkeptSpecialtyIds(
        remote,
        keep.date,
        keep.stationId,
        keep.destination,
        keep.keepIds,
      ),
    );
    return [...new Set([...lingering, ...extras])];
  }, []);

  const uploadMissingLocal = useCallback(
    async (remote: SpecialtyStore, local: SpecialtyStore) => {
      const deleted = deletedIdsRef.current;
      const supabase = getSupabase();
      if (!supabase || !session || uploadingRef.current) {
        return mergeWithTombstones(local, remote);
      }
      uploadingRef.current = true;
      try {
        const remoteIds = new Set(
          Object.values(remote)
            .flat()
            .map((s) => s.id),
        );
        const inserts: {
          id: string;
          date: string;
          station_id: string;
          destination: string;
          created_at: string;
          created_by: string | null;
        }[] = [];
        const keptLocal = applySpecialtyTombstones(
          local,
          deleted,
          destKeepsRef.current,
        );
        for (const [date, slots] of Object.entries(keptLocal)) {
          for (const slot of slots) {
            if (remoteIds.has(slot.id) || deleted.has(slot.id)) continue;
            inserts.push({
              id: slot.id,
              date: specialtyDateKey(date),
              station_id: slot.stationId,
              destination: slot.destination,
              created_at: slot.createdAt,
              created_by: user?.id ?? null,
            });
          }
        }

        if (!inserts.length) {
          // Nothing to upload — remote is authority (cross-device deletes apply),
          // but locally consumed/minused dests must not come back from a stale pull.
          return mergeWithTombstones({}, remote);
        }

        const { error } = await supabase.from("specialty_opens").upsert(inserts);
        if (error) {
          console.warn("specialty upload failed", error.message);
          // Never persist empty remote alone after a failed upload.
          return mergeWithTombstones(local, remote);
        }

        const pulled = await pullRemote();
        if (!pulled) {
          return mergeWithTombstones(local, remote);
        }

        const pulledCount = Object.values(pulled).flat().length;
        if (pulledCount === 0 && inserts.length > 0) {
          // Pull came back empty but we still have local slots we tried to upload.
          return mergeWithTombstones(local, remote);
        }

        // Successful upload + non-empty pull: remote/pulled is authority,
        // still filtered by UUID tombstones and dest-keeps.
        return mergeWithTombstones({}, pulled);
      } finally {
        uploadingRef.current = false;
      }
    },
    [mergeWithTombstones, pullRemote, session, user?.id],
  );

  const refreshInner = useCallback(async () => {
    if (!cloud) {
      persistLocal(readSpecialtyStore());
      return;
    }
    const epoch = epochRef.current;
    const remote = await pullRemote();
    // Pull failure: leave local store untouched.
    if (!remote) return;
    if (epoch !== epochRef.current) return;
    const toDelete = idsToDeleteFromRemote(remote);
    if (toDelete.length) await cloudDeleteIds(toDelete);
    const remoteAfter = toDelete.length ? ((await pullRemote()) ?? remote) : remote;
    if (epoch !== epochRef.current) return;
    const local = readSpecialtyStore();
    const next = await uploadMissingLocal(remoteAfter, local);
    if (epoch !== epochRef.current) return;
    // Only GC after this pull is still current, so a stale in-flight merge
    // cannot drop tombstones then persist the deleted Liberty CID row.
    gcDeleted(remoteAfter);
    persistLocal(next);
  }, [
    cloud,
    cloudDeleteIds,
    gcDeleted,
    idsToDeleteFromRemote,
    persistLocal,
    pullRemote,
    uploadMissingLocal,
  ]);

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
      .channel("specialty-opens-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "specialty_opens" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const addOpen = useCallback(
    async (date: string, stationId: string, destination: string) => {
      bumpEpoch();
      const next = addSpecialtySlot(storeRef.current, date, stationId, destination);
      const added = boardForDate(next, date).at(-1);
      // Only widen an existing dest-keep so a new + CID is not stripped;
      // do not create a keep on add (that would delete other devices' opens).
      if (
        added &&
        destKeepsRef.current.some(
          (k) =>
            specialtyDateKey(k.date) === specialtyDateKey(date) &&
            sameSpecialtyStation(k.stationId, stationId) &&
            sameSpecialtyDest(k.destination, destination),
        )
      ) {
        destKeepsRef.current = upsertSpecialtyDestKeep(
          destKeepsRef.current,
          destKeepAfterChange(next, date, stationId, destination),
        );
      }
      persistLocal(next);
      if (cloud && added) {
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase.from("specialty_opens").upsert({
            id: added.id,
            date: specialtyDateKey(date),
            station_id: added.stationId,
            destination: added.destination,
            created_at: added.createdAt,
            created_by: user?.id ?? null,
          });
          if (error) console.warn("specialty insert failed", error.message);
        }
      }
    },
    [bumpEpoch, cloud, persistLocal, user?.id],
  );

  const removeOpen = useCallback(
    async (date: string, stationId: string, destination?: string) => {
      bumpEpoch();
      const before = boardForDate(storeRef.current, date);
      let target: SpecialtySlot | undefined;
      if (destination) {
        for (let i = before.length - 1; i >= 0; i--) {
          if (
            sameSpecialtyStation(before[i].stationId, stationId) &&
            sameSpecialtyDest(before[i].destination, destination)
          ) {
            target = before[i];
            break;
          }
        }
      }
      if (!target) {
        for (let i = before.length - 1; i >= 0; i--) {
          if (sameSpecialtyStation(before[i].stationId, stationId)) {
            target = before[i];
            break;
          }
        }
      }
      const next = removeSpecialtySlot(
        storeRef.current,
        date,
        stationId,
        destination,
      );
      if (!target) {
        persistLocal(next);
        return;
      }
      const dest = destination ?? target.destination;
      rememberDeleted([target.id]);
      rememberDestKeep(destKeepAfterChange(next, date, stationId, dest));
      persistLocal(next);
      if (cloud) {
        await cloudDeleteIds([target.id]);
        await cloudDeleteUnkept(
          date,
          stationId,
          dest,
          remainingSpecialtySlotIds(next, date, stationId, dest),
        );
      }
    },
    [
      bumpEpoch,
      cloud,
      cloudDeleteIds,
      cloudDeleteUnkept,
      persistLocal,
      rememberDeleted,
      rememberDestKeep,
    ],
  );

  const consumeOpens = useCallback(
    async (
      date: string,
      stationId: string,
      destination: string,
      count: number,
    ) => {
      const opens = countSpecialtyOpens(
        storeRef.current,
        date,
        stationId,
        destination,
      );
      const burn = Math.min(opens, Math.max(0, Math.floor(count)));
      if (burn === 0) return 0;
      bumpEpoch();
      const victims = matchingSpecialtySlotIds(
        storeRef.current,
        date,
        stationId,
        destination,
        burn,
      );
      const next = consumeSpecialtyOpens(
        storeRef.current,
        date,
        stationId,
        destination,
        burn,
      );
      rememberDeleted(victims);
      rememberDestKeep(destKeepAfterChange(next, date, stationId, destination));
      persistLocal(next);
      if (cloud && victims.length) {
        await cloudDeleteIds(victims);
        await cloudDeleteUnkept(
          date,
          stationId,
          destination,
          remainingSpecialtySlotIds(next, date, stationId, destination),
        );
      }
      return burn;
    },
    [
      bumpEpoch,
      cloud,
      cloudDeleteIds,
      cloudDeleteUnkept,
      persistLocal,
      rememberDeleted,
      rememberDestKeep,
    ],
  );

  const value = useMemo<SpecialtyContextValue>(
    () => ({
      store,
      boardOn: (date) => boardForDate(store, date),
      addOpen,
      removeOpen,
      consumeOpens,
      opensFor: (date, stationId, destination) =>
        countSpecialtyOpens(store, date, stationId, destination),
      refresh,
      cloud,
    }),
    [store, addOpen, removeOpen, consumeOpens, refresh, cloud],
  );

  return (
    <SpecialtyContext.Provider value={value}>{children}</SpecialtyContext.Provider>
  );
}

export function useSpecialty() {
  const ctx = useContext(SpecialtyContext);
  if (!ctx) throw new Error("useSpecialty must be used inside SpecialtyProvider");
  return ctx;
}
