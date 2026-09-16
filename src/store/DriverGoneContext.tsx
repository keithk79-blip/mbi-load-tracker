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
  addGoneEntry,
  applyGoneTombstones,
  cleanDriverGoneEntry,
  collapseDuplicateGoneEntries,
  readDriverGonePersisted,
  reconcileDriverGoneCloud,
  removeGoneEntriesForPerson,
  updateGoneEntry,
  writeDriverGonePersisted,
  type DriverGoneEntry,
  type DriverGoneInput,
  type DriverGonePersisted,
  type DriverGoneStore,
} from "../lib/driverGone";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type EntryRow = {
  id: string;
  employee_number: string | null;
  name: string;
  hire_date: string | null;
  termination_date: string | null;
  notes: string | null;
  yard: string | null;
  created_at: string;
  updated_at: string;
};

export type DriverGoneImportResult = {
  added: number;
  skipped: boolean;
  error: string | null;
};

type DriverGoneContextValue = {
  store: DriverGoneStore;
  cloud: boolean;
  importing: boolean;
  lastImport: DriverGoneImportResult | null;
  refresh: () => Promise<void>;
  importFromSheet: () => Promise<DriverGoneImportResult>;
  addGone: (input: DriverGoneInput) => Promise<DriverGoneEntry | null>;
  updateGone: (
    id: string,
    patch: Partial<Pick<DriverGoneEntry, "employeeNumber" | "name" | "hireDate" | "terminationDate" | "notes" | "yard">>,
  ) => Promise<void>;
  removeGone: (id: string) => Promise<void>;
};

const DriverGoneContext = createContext<DriverGoneContextValue | null>(null);

function rowsToStore(rows: EntryRow[]): DriverGoneStore {
  const store: DriverGoneStore = { entries: {} };
  for (const row of rows) {
    const cleaned = cleanDriverGoneEntry({
      id: row.id,
      employeeNumber: row.employee_number,
      name: row.name,
      hireDate: row.hire_date,
      terminationDate: row.termination_date,
      notes: row.notes,
      yard: row.yard,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    if (cleaned) store.entries[cleaned.id] = cleaned;
  }
  return store;
}

function entryToRow(entry: DriverGoneEntry, userId: string | null) {
  return {
    id: entry.id,
    employee_number: entry.employeeNumber,
    name: entry.name,
    hire_date: entry.hireDate,
    termination_date: entry.terminationDate,
    notes: entry.notes,
    yard: entry.yard,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    created_by: userId,
  };
}

function persistSnapshot(next: DriverGonePersisted): DriverGoneStore {
  const collapsed = collapseDuplicateGoneEntries(
    applyGoneTombstones({ entries: next.entries }, next.deletedEntryIds),
  );
  const deletedEntryIds = [...new Set([...next.deletedEntryIds, ...collapsed.droppedIds])];
  writeDriverGonePersisted({
    ...next,
    entries: collapsed.store.entries,
    deletedEntryIds,
  });
  return collapsed.store;
}

export function DriverGoneProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<DriverGoneStore>(() => {
    const persisted = readDriverGonePersisted();
    return collapseDuplicateGoneEntries(
      applyGoneTombstones({ entries: persisted.entries }, persisted.deletedEntryIds),
    ).store;
  });
  const storeRef = useRef(store);
  storeRef.current = store;
  const deletedRef = useRef<Set<string>>(new Set(readDriverGonePersisted().deletedEntryIds));
  const seenRef = useRef<Set<string>>(new Set(readDriverGonePersisted().seenRemoteEntryIds));
  const importedAtRef = useRef<string | null>(readDriverGonePersisted().importedAt);
  const epochRef = useRef(0);
  const refreshTailRef = useRef(Promise.resolve());
  const uploadingRef = useRef(false);

  const persistLocal = useCallback((next: DriverGoneStore) => {
    const collapsed = collapseDuplicateGoneEntries(next);
    for (const id of collapsed.droppedIds) deletedRef.current.add(id);
    const snapshot: DriverGonePersisted = {
      version: 1,
      entries: collapsed.store.entries,
      deletedEntryIds: [...deletedRef.current],
      seenRemoteEntryIds: [...seenRef.current],
      importedAt: importedAtRef.current,
    };
    const stripped = persistSnapshot(snapshot);
    storeRef.current = stripped;
    setStore(stripped);
  }, []);

  const pullRemote = useCallback(async (): Promise<DriverGoneStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const page = await fetchAllPaged<EntryRow>(async (from, to) => {
      const result = await supabase
        .from("driver_gone_entries")
        .select(
          "id, employee_number, name, hire_date, termination_date, notes, yard, created_at, updated_at",
        )
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data as EntryRow[] | null, error: result.error };
    });
    if (page.error || !page.data) {
      console.warn("driver_gone_entries pull failed", pagedErrorMessage(page.error));
      return null;
    }
    return rowsToStore(page.data);
  }, [session]);

  const cloudDeleteEntries = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    // Explicit × and retry of those tombstones are the only path that may DELETE a cloud Gone row.
    const { error } = await supabase.from("driver_gone_entries").delete().in("id", ids);
    if (error) console.warn("driver gone delete failed", error.message);
  }, []);

  const cloudUpsert = useCallback(
    async (entries: DriverGoneEntry[]) => {
      const supabase = getSupabase();
      if (!supabase || !session || !entries.length) return;
      const rows = entries.map((entry) => entryToRow(entry, user?.id ?? null));
      const { error } = await supabase.from("driver_gone_entries").upsert(rows);
      if (error) console.warn("driver gone upsert failed", error.message);
    },
    [session, user?.id],
  );

  const seedIfEmpty = useCallback(async () => {
    if (importedAtRef.current) return;
    importedAtRef.current = new Date().toISOString();
    persistLocal(storeRef.current);
  }, [persistLocal]);

  const refreshInner = useCallback(async () => {
    if (!cloud) {
      persistLocal(storeRef.current);
      await seedIfEmpty();
      return;
    }
    const epoch = epochRef.current;
    const remote = await pullRemote();
    if (epoch !== epochRef.current) return;

    if (remote) {
      const result = reconcileDriverGoneCloud({
        local: storeRef.current,
        remote,
        deletedEntryIds: deletedRef.current,
        seenRemoteEntryIds: seenRef.current,
      });
      if (epoch !== epochRef.current) return;
      if (result.toUploadEntries.length && !uploadingRef.current) {
        uploadingRef.current = true;
        try {
          await cloudUpsert(result.toUploadEntries);
        } finally {
          uploadingRef.current = false;
        }
      }
      if (epoch !== epochRef.current) return;
      if (result.toDeleteRemoteEntries.length) {
        await cloudDeleteEntries(result.toDeleteRemoteEntries);
      }
      if (epoch !== epochRef.current) return;
      deletedRef.current = new Set(result.deletedEntryIds);
      seenRef.current = new Set(result.seenRemoteEntryIds);
      persistLocal(result.next);
    }

    await seedIfEmpty();
  }, [cloud, cloudDeleteEntries, cloudUpsert, persistLocal, pullRemote, seedIfEmpty]);

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
      .channel("driver-gone-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_gone_entries" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const importFromSheet = useCallback(async (): Promise<DriverGoneImportResult> => {
    return { added: 0, skipped: true, error: null };
  }, []);

  const addGone = useCallback(
    async (input: DriverGoneInput) => {
      epochRef.current += 1;
      const result = addGoneEntry(storeRef.current, input);
      if (!result.entry) return null;
      persistLocal(result.store);
      if (cloud) await cloudUpsert([result.entry]);
      return result.entry;
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const updateGone = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<DriverGoneEntry, "employeeNumber" | "name" | "hireDate" | "terminationDate" | "notes" | "yard">
      >,
    ) => {
      epochRef.current += 1;
      const next = updateGoneEntry(storeRef.current, id, patch);
      const entry = next.entries[id];
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([entry]);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const removeGone = useCallback(
    async (id: string) => {
      epochRef.current += 1;
      const result = removeGoneEntriesForPerson(storeRef.current, id);
      if (!result.removed.length) return;
      for (const row of result.removed) deletedRef.current.add(row.id);
      persistLocal(result.store);
      if (cloud) await cloudDeleteEntries(result.removed.map((row) => row.id));
    },
    [cloud, cloudDeleteEntries, persistLocal],
  );

  const value = useMemo<DriverGoneContextValue>(
    () => ({
      store,
      cloud,
      importing: false,
      lastImport: null,
      refresh,
      importFromSheet,
      addGone,
      updateGone,
      removeGone,
    }),
    [store, cloud, refresh, importFromSheet, addGone, updateGone, removeGone],
  );

  return <DriverGoneContext.Provider value={value}>{children}</DriverGoneContext.Provider>;
}

export function useDriverGone() {
  const ctx = useContext(DriverGoneContext);
  if (!ctx) throw new Error("useDriverGone must be used inside DriverGoneProvider");
  return ctx;
}
