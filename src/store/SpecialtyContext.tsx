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
  boardForDate,
  consumeSpecialtyOpens,
  countSpecialtyOpens,
  matchingSpecialtySlotIds,
  mergeSpecialtyStores,
  notifySpecialtyBoardChanged,
  readSpecialtyDeletedIds,
  readSpecialtyStore,
  removeSpecialtySlot,
  resolveSpecialtyStationId,
  sameSpecialtyDest,
  sameSpecialtyStation,
  specialtyDateKey,
  writeSpecialtyStore,
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

  const persistLocal = useCallback((next: SpecialtyStore) => {
    writeSpecialtyStore(next, [...deletedIdsRef.current]);
    setStore(next);
    notifySpecialtyBoardChanged();
  }, []);

  const rememberDeleted = useCallback((ids: string[]) => {
    if (!ids.length) return;
    for (const id of ids) deletedIdsRef.current.add(id);
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

  const uploadMissingLocal = useCallback(
    async (remote: SpecialtyStore, local: SpecialtyStore) => {
      const deleted = deletedIdsRef.current;
      const supabase = getSupabase();
      if (!supabase || !session || uploadingRef.current) {
        return mergeSpecialtyStores(local, remote, deleted);
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
        for (const [date, slots] of Object.entries(local)) {
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
          // but locally consumed ids must not come back from a stale pull.
          return mergeSpecialtyStores({}, remote, deleted);
        }

        const { error } = await supabase.from("specialty_opens").upsert(inserts);
        if (error) {
          console.warn("specialty upload failed", error.message);
          // Never persist empty remote alone after a failed upload.
          return mergeSpecialtyStores(local, remote, deleted);
        }

        const pulled = await pullRemote();
        if (!pulled) {
          return mergeSpecialtyStores(local, remote, deleted);
        }

        const pulledCount = Object.values(pulled).flat().length;
        if (pulledCount === 0 && inserts.length > 0) {
          // Pull came back empty but we still have local slots we tried to upload.
          return mergeSpecialtyStores(local, remote, deleted);
        }

        // Successful upload + non-empty pull: remote/pulled is authority.
        return mergeSpecialtyStores({}, pulled, deleted);
      } finally {
        uploadingRef.current = false;
      }
    },
    [pullRemote, session, user?.id],
  );

  const refresh = useCallback(async () => {
    if (!cloud) {
      persistLocal(readSpecialtyStore());
      return;
    }
    const remote = await pullRemote();
    // Pull failure: leave local store untouched.
    if (!remote) return;
    const lingering = [...deletedIdsRef.current].filter((id) =>
      Object.values(remote)
        .flat()
        .some((s) => s.id === id),
    );
    if (lingering.length) await cloudDeleteIds(lingering);
    const remoteAfter = lingering.length ? ((await pullRemote()) ?? remote) : remote;
    gcDeleted(remoteAfter);
    const local = readSpecialtyStore();
    const next = await uploadMissingLocal(remoteAfter, local);
    persistLocal(next);
  }, [cloud, cloudDeleteIds, gcDeleted, persistLocal, pullRemote, uploadMissingLocal]);

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
      const next = addSpecialtySlot(storeRef.current, date, stationId, destination);
      const added = boardForDate(next, date).at(-1);
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
    [cloud, persistLocal, user?.id],
  );

  const removeOpen = useCallback(
    async (date: string, stationId: string, destination?: string) => {
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
      if (target) rememberDeleted([target.id]);
      persistLocal(next);
      if (cloud && target) {
        await cloudDeleteIds([target.id]);
      }
    },
    [cloud, cloudDeleteIds, persistLocal, rememberDeleted],
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
      persistLocal(next);
      if (cloud && victims.length) {
        await cloudDeleteIds(victims);
      }
      return burn;
    },
    [cloud, cloudDeleteIds, persistLocal, rememberDeleted],
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
