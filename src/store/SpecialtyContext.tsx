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
import { fetchAllPaged, pagedErrorMessage } from "../lib/cloud";
import { getSupabase } from "../lib/supabase";
import {
  addSpecialtySlot,
  applySpecialtyTombstones,
  boardForDate,
  consumeSpecialtyOpensTracked,
  countSpecialtyOpensAny,
  destKeepAfterChange,
  notifySpecialtyBoardChanged,
  readSpecialtyDeletedIds,
  readSpecialtyDestKeeps,
  readSpecialtySeenRemoteIds,
  readSpecialtyStore,
  reconcileSpecialtyCloud,
  remainingSpecialtySlotIds,
  removeSpecialtySlot,
  resolveSpecialtyStationId,
  sameSpecialtyDest,
  sameSpecialtyStation,
  specialtyDateKey,
  uniqueSpecialtyChipLabels,
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
    destination: string | readonly string[],
    count: number,
  ) => Promise<number>;
  opensFor: (
    date: string,
    stationId: string,
    destination: string | readonly string[],
  ) => number;
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
  const seenRemoteIdsRef = useRef<Set<string>>(new Set(readSpecialtySeenRemoteIds()));
  const epochRef = useRef(0);
  const refreshTailRef = useRef(Promise.resolve());

  const bumpEpoch = useCallback(() => {
    epochRef.current += 1;
  }, []);

  const persistLocal = useCallback((next: SpecialtyStore) => {
    const ids = [...deletedIdsRef.current];
    const keeps = destKeepsRef.current;
    const seen = [...seenRemoteIdsRef.current];
    // Strip UUID tombstones and dest-keeps at persist so a stale refresh cannot restore.
    const stripped = applySpecialtyTombstones(next, ids, keeps);
    writeSpecialtyStore(next, ids, keeps, seen);
    storeRef.current = stripped;
    setStore(stripped);
    notifySpecialtyBoardChanged();
  }, []);

  const rememberDeleted = useCallback((ids: string[]) => {
    if (!ids.length) return;
    for (const id of ids) deletedIdsRef.current.add(id);
    // Flush tombstones immediately so an in-flight cloud pull cannot miss them.
    writeSpecialtyStore(
      storeRef.current,
      [...deletedIdsRef.current],
      destKeepsRef.current,
      [...seenRemoteIdsRef.current],
    );
  }, []);

  const rememberDestKeep = useCallback((keep: SpecialtyDestKeep) => {
    destKeepsRef.current = upsertSpecialtyDestKeep(destKeepsRef.current, keep);
    writeSpecialtyStore(
      storeRef.current,
      [...deletedIdsRef.current],
      destKeepsRef.current,
      [...seenRemoteIdsRef.current],
    );
  }, []);

  const pullRemote = useCallback(async (): Promise<SpecialtyStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const { data, error } = await fetchAllPaged<SpecialtyRow>(async (from, to) => {
      const page = await supabase
        .from("specialty_opens")
        .select("id, date, station_id, destination, created_at")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: page.data as SpecialtyRow[] | null, error: page.error };
    });
    if (error || !data) {
      console.warn("specialty_opens pull failed", pagedErrorMessage(error));
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
      if (extra.length) {
        rememberDeleted(extra);
        await cloudDeleteIds(extra);
      }
    },
    [cloudDeleteIds, rememberDeleted, session],
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

    const result = reconcileSpecialtyCloud({
      local: readSpecialtyStore(),
      remote,
      deletedIds: deletedIdsRef.current,
      destKeeps: destKeepsRef.current,
      seenRemoteIds: seenRemoteIdsRef.current,
    });

    if (result.toDeleteRemote.length) await cloudDeleteIds(result.toDeleteRemote);
    if (epoch !== epochRef.current) return;

    if (result.toUpload.length && !uploadingRef.current) {
      const supabase = getSupabase();
      if (supabase && session) {
        uploadingRef.current = true;
        try {
          const inserts = result.toUpload.map(({ date, slot }) => ({
            id: slot.id,
            date,
            station_id: slot.stationId,
            destination: slot.destination,
            created_at: slot.createdAt,
            created_by: user?.id ?? null,
          }));
          const { error } = await supabase.from("specialty_opens").upsert(inserts);
          if (error) console.warn("specialty upload failed", error.message);
        } finally {
          uploadingRef.current = false;
        }
      }
    }
    if (epoch !== epochRef.current) return;

    deletedIdsRef.current = new Set(result.deletedIds);
    destKeepsRef.current = result.destKeeps;
    seenRemoteIdsRef.current = new Set(result.seenRemoteIds);
    persistLocal(result.next);
  }, [cloud, cloudDeleteIds, persistLocal, pullRemote, session, user?.id]);

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
      destination: string | readonly string[],
      count: number,
    ) => {
      const chips = uniqueSpecialtyChipLabels(
        typeof destination === "string" ? [destination] : destination,
      );
      const tracked = consumeSpecialtyOpensTracked(
        storeRef.current,
        date,
        stationId,
        chips,
        count,
        destKeepsRef.current,
      );
      if (tracked.burned === 0) return 0;

      bumpEpoch();
      rememberDeleted(tracked.burnedIds);
      destKeepsRef.current = tracked.destKeeps;
      writeSpecialtyStore(
        storeRef.current,
        [...deletedIdsRef.current],
        destKeepsRef.current,
        [...seenRemoteIdsRef.current],
      );
      persistLocal(tracked.store);
      if (cloud && tracked.burnedIds.length) {
        await cloudDeleteIds(tracked.burnedIds);
        for (const chip of chips) {
          await cloudDeleteUnkept(
            date,
            stationId,
            chip,
            remainingSpecialtySlotIds(tracked.store, date, stationId, chip),
          );
        }
      }
      return tracked.burned;
    },
    [
      bumpEpoch,
      cloud,
      cloudDeleteIds,
      cloudDeleteUnkept,
      persistLocal,
      rememberDeleted,
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
        countSpecialtyOpensAny(
          store,
          date,
          stationId,
          typeof destination === "string" ? [destination] : destination,
        ),
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
