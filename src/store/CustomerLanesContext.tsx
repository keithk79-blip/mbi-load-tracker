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
import {
  CUSTOMER_LANES_TABLE,
  customerLaneToRow,
  mergeSeededLanes,
  readCustomerLanePersisted,
  removeCustomerLane,
  rowToCustomerLane,
  upsertCustomerLane,
  writeCustomerLanePersisted,
  type CustomerLane,
  type CustomerLaneInput,
  type CustomerLanePersisted,
  type CustomerLaneRow,
  type CustomerLaneStore,
} from "../lib/customerLanes";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type CustomerLanesContextValue = {
  store: CustomerLaneStore;
  cloud: boolean;
  saveLane: (input: CustomerLaneInput) => Promise<CustomerLane | null>;
  deleteLane: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const CustomerLanesContext = createContext<CustomerLanesContextValue | null>(null);

export function CustomerLanesProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<CustomerLaneStore>(() => {
    const persisted = readCustomerLanePersisted();
    if (Object.keys(persisted.lanes).length) {
      return { lanes: persisted.lanes };
    }
    const seeded = mergeSeededLanes({ lanes: {} });
    writeCustomerLanePersisted({
      version: 1,
      lanes: seeded.lanes,
      seenRemoteIds: persisted.seenRemoteIds,
      seededAt: new Date().toISOString(),
    });
    return seeded;
  });
  const storeRef = useRef(store);
  storeRef.current = store;
  const seenRef = useRef<Set<string>>(new Set(readCustomerLanePersisted().seenRemoteIds));
  const refreshTailRef = useRef(Promise.resolve());

  const persistLocal = useCallback((next: CustomerLaneStore) => {
    const snapshot: CustomerLanePersisted = {
      version: 1,
      lanes: next.lanes,
      seenRemoteIds: [...seenRef.current],
      seededAt: readCustomerLanePersisted().seededAt,
    };
    writeCustomerLanePersisted(snapshot);
    storeRef.current = next;
    setStore(next);
  }, []);

  const pullRemote = useCallback(async (): Promise<CustomerLaneStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const page = await fetchAllPaged<CustomerLaneRow>(async (from, to) => {
      const result = await supabase
        .from(CUSTOMER_LANES_TABLE)
        .select(
          "id, customer, destination, commodity, effective_date, tier1, tier2, tier3, tier4, tier5, created_at, updated_at",
        )
        .order("id", { ascending: true })
        .range(from, to);
      return { data: (result.data as CustomerLaneRow[] | null) ?? null, error: result.error };
    });
    if (page.error || !page.data) {
      console.warn("customer_lanes pull failed", pagedErrorMessage(page.error));
      return null;
    }
    const lanes: Record<string, CustomerLane> = {};
    for (const row of page.data) {
      const cleaned = rowToCustomerLane(row);
      if (cleaned) lanes[cleaned.id] = cleaned;
    }
    return { lanes };
  }, [session]);

  const cloudUpsert = useCallback(
    async (lanes: CustomerLane[]) => {
      const supabase = getSupabase();
      if (!supabase || !session || !lanes.length) return;
      const { error } = await supabase
        .from(CUSTOMER_LANES_TABLE)
        .upsert(lanes.map((lane) => customerLaneToRow(lane, user?.id ?? null)));
      if (error) console.warn("customer_lanes upsert failed", error.message);
    },
    [session, user?.id],
  );

  const cloudDelete = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from(CUSTOMER_LANES_TABLE).delete().in("id", ids);
    if (error) console.warn("customer_lanes delete failed", error.message);
  }, []);

  const refreshInner = useCallback(async () => {
    if (!cloud) return;
    const remote = await pullRemote();
    if (!remote) return;
    const local = storeRef.current;
    const merged: Record<string, CustomerLane> = { ...remote.lanes };
    const toUpload: CustomerLane[] = [];
    for (const lane of Object.values(local.lanes)) {
      const other = remote.lanes[lane.id];
      if (!other) {
        merged[lane.id] = lane;
        toUpload.push(lane);
        continue;
      }
      if (lane.updatedAt > other.updatedAt) {
        merged[lane.id] = lane;
        toUpload.push(lane);
      }
    }
    for (const id of Object.keys(remote.lanes)) seenRef.current.add(id);
    persistLocal({ lanes: merged });
    if (toUpload.length) await cloudUpsert(toUpload);
    const seeded = mergeSeededLanes(storeRef.current);
    if (Object.keys(seeded.lanes).length !== Object.keys(storeRef.current.lanes).length) {
      persistLocal(seeded);
      const extras = Object.values(seeded.lanes).filter((lane) => !remote.lanes[lane.id]);
      if (extras.length) await cloudUpsert(extras);
    }
  }, [cloud, cloudUpsert, persistLocal, pullRemote]);

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
      .channel("customer-lanes-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: CUSTOMER_LANES_TABLE },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const saveLane = useCallback(
    async (input: CustomerLaneInput) => {
      const result = upsertCustomerLane(storeRef.current, input);
      if (!result.lane) return null;
      persistLocal(result.store);
      if (cloud) await cloudUpsert([result.lane]);
      return result.lane;
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const deleteLane = useCallback(
    async (id: string) => {
      const result = removeCustomerLane(storeRef.current, id);
      if (!result.removed) return;
      persistLocal(result.store);
      if (cloud) await cloudDelete([id]);
    },
    [cloud, cloudDelete, persistLocal],
  );

  const value = useMemo<CustomerLanesContextValue>(
    () => ({ store, cloud, saveLane, deleteLane, refresh }),
    [store, cloud, saveLane, deleteLane, refresh],
  );

  return (
    <CustomerLanesContext.Provider value={value}>{children}</CustomerLanesContext.Provider>
  );
}

export function useCustomerLanes() {
  const ctx = useContext(CustomerLanesContext);
  if (!ctx) throw new Error("useCustomerLanes must be used inside CustomerLanesProvider");
  return ctx;
}
