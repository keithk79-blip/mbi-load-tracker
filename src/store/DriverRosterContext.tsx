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
  addRosterEntry,
  applyRosterTombstones,
  cleanAssignedTruck,
  cleanDriverRosterKind,
  cleanDriverRosterYard,
  DRIVER_ROSTER_YARDS,
  cleanDriverTabGroup,
  mergeImportedRows,
  moveRosterEntry,
  readDriverRosterPersisted,
  readDriverRosterUi,
  reconcileDriverRosterCloud,
  removeHiredAndMatchingSat,
  removeRosterEntry,
  resetSatRosterFromFull,
  rosterEntryCount,
  rosterStoreIsEmpty,
  seedEmptySatRostersFromFull,
  setSatDateForYard,
  updateRosterEntry,
  writeDriverRosterPersisted,
  writeDriverRosterUi,
  type DriverRosterEntry,
  type DriverRosterInput,
  type DriverRosterKind,
  type DriverRosterPersisted,
  type DriverRosterStore,
  type DriverRosterYard,
  type DriverTabGroup,
} from "../lib/driverRoster";
import { describeImportGroup, fetchRosterWorkbook } from "../lib/driverRosterSheet";
import { assignedTrucksNeedingUpload, preserveAssignedTrucks } from "../lib/rosterAssignedTruck";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type EntryRow = {
  id: string;
  kind: string;
  yard: string;
  truck_number: string | null;
  assigned_truck?: string | null;
  name: string;
  status: string | null;
  sort_order: number;
  for_date: string | null;
  created_at: string;
  updated_at: string;
};

export type DriverRosterImportResult = {
  added: number;
  skippedGroups: string[];
  error: string | null;
};

type DriverRosterContextValue = {
  store: DriverRosterStore;
  kind: DriverRosterKind;
  group: DriverTabGroup;
  yard: DriverRosterYard;
  setKind: (kind: DriverRosterKind) => void;
  setGroup: (group: DriverTabGroup) => void;
  setYard: (yard: DriverRosterYard) => void;
  cloud: boolean;
  importing: boolean;
  lastImport: DriverRosterImportResult | null;
  refresh: () => Promise<void>;
  importFromSheet: () => Promise<DriverRosterImportResult>;
  addDriver: (input: Omit<DriverRosterInput, "kind" | "yard">) => Promise<DriverRosterEntry | null>;
  setDriverStatus: (id: string, status: string | null) => Promise<void>;
  setDriverAssignedTruck: (id: string, assignedTruck: string | null) => Promise<void>;
  removeDriver: (id: string) => Promise<void>;
  removeHiredAndSat: (id: string) => Promise<void>;
  moveDriver: (id: string, delta: -1 | 1) => Promise<void>;
  setSatDate: (forDate: string | null) => Promise<void>;
  resetSatToFullRoster: () => Promise<void>;
};

const DriverRosterContext = createContext<DriverRosterContextValue | null>(null);

function rowsToStore(rows: EntryRow[]): DriverRosterStore {
  const store: DriverRosterStore = { entries: {} };
  for (const row of rows) {
    store.entries[row.id] = {
      id: row.id,
      kind: cleanDriverRosterKind(row.kind),
      yard: cleanDriverRosterYard(row.yard),
      truckNumber: row.truck_number,
      assignedTruck:
        cleanDriverRosterKind(row.kind) === "full"
          ? cleanAssignedTruck(row.assigned_truck ?? null)
          : null,
      name: row.name,
      status: row.status,
      sortOrder: row.sort_order,
      forDate: row.for_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  return store;
}

function entryToRow(entry: DriverRosterEntry, userId: string | null) {
  return {
    id: entry.id,
    kind: entry.kind,
    yard: entry.yard,
    truck_number: entry.truckNumber,
    assigned_truck: entry.assignedTruck,
    name: entry.name,
    status: entry.status,
    sort_order: entry.sortOrder,
    for_date: entry.forDate,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    created_by: userId,
  };
}

function persistSnapshot(next: DriverRosterPersisted): DriverRosterStore {
  const stripped = applyRosterTombstones(
    { entries: next.entries },
    next.deletedEntryIds,
  );
  writeDriverRosterPersisted({ ...next, entries: stripped.entries });
  return stripped;
}

export function DriverRosterProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [ui, setUi] = useState(readDriverRosterUi);
  const [store, setStore] = useState<DriverRosterStore>(() => {
    const persisted = readDriverRosterPersisted();
    return applyRosterTombstones(
      { entries: persisted.entries },
      persisted.deletedEntryIds,
    );
  });
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<DriverRosterImportResult | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const deletedRef = useRef<Set<string>>(new Set(readDriverRosterPersisted().deletedEntryIds));
  const seenRef = useRef<Set<string>>(new Set(readDriverRosterPersisted().seenRemoteEntryIds));
  const importedAtRef = useRef<string | null>(readDriverRosterPersisted().importedAt);
  const satInitializedRef = useRef<Set<DriverRosterYard>>(
    new Set(readDriverRosterPersisted().satInitializedYards),
  );
  const epochRef = useRef(0);
  const refreshTailRef = useRef(Promise.resolve());
  const uploadingRef = useRef(false);
  const seedingRef = useRef(false);

  const persistLocal = useCallback((next: DriverRosterStore) => {
    const snapshot: DriverRosterPersisted = {
      version: 1,
      entries: next.entries,
      deletedEntryIds: [...deletedRef.current],
      seenRemoteEntryIds: [...seenRef.current],
      importedAt: importedAtRef.current,
      satInitializedYards: [...satInitializedRef.current],
    };
    const stripped = persistSnapshot(snapshot);
    storeRef.current = stripped;
    setStore(stripped);
  }, []);

  const pullRemote = useCallback(async (): Promise<DriverRosterStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const page = await fetchAllPaged<EntryRow>(async (from, to) => {
      const withTruck = await supabase
        .from("driver_roster_entries")
        .select(
          "id, kind, yard, truck_number, assigned_truck, name, status, sort_order, for_date, created_at, updated_at",
        )
        .order("id", { ascending: true })
        .range(from, to);
      if (!withTruck.error) {
        return { data: withTruck.data as EntryRow[] | null, error: withTruck.error };
      }
      const missingAssigned =
        /assigned_truck/i.test(withTruck.error.message ?? "") ||
        withTruck.error.code === "42703";
      if (!missingAssigned) {
        return { data: withTruck.data as EntryRow[] | null, error: withTruck.error };
      }
      const result = await supabase
        .from("driver_roster_entries")
        .select(
          "id, kind, yard, truck_number, name, status, sort_order, for_date, created_at, updated_at",
        )
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data as EntryRow[] | null, error: result.error };
    });
    if (page.error || !page.data) {
      console.warn("driver_roster_entries pull failed", pagedErrorMessage(page.error));
      return null;
    }
    return rowsToStore(page.data);
  }, [session]);

  const cloudDeleteEntries = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("driver_roster_entries").delete().in("id", ids);
    if (error) console.warn("driver roster delete failed", error.message);
  }, []);

  const cloudUpsert = useCallback(
    async (entries: DriverRosterEntry[]) => {
      const supabase = getSupabase();
      if (!supabase || !session || !entries.length) return;
      const rows = entries.map((entry) => entryToRow(entry, user?.id ?? null));
      const { error } = await supabase.from("driver_roster_entries").upsert(rows);
      if (!error) return;
      const missingAssigned =
        /assigned_truck/i.test(error.message ?? "") || error.code === "42703";
      if (!missingAssigned) {
        console.warn("driver roster upsert failed", error.message);
        return;
      }
      const fallback = rows.map(({ assigned_truck: _assigned, ...row }) => row);
      const retry = await supabase.from("driver_roster_entries").upsert(fallback);
      if (retry.error) console.warn("driver roster upsert failed", retry.error.message);
    },
    [session, user?.id],
  );

  const seedEmptySatFromFull = useCallback(async () => {
    const pendingYards = DRIVER_ROSTER_YARDS.filter((yard) => !satInitializedRef.current.has(yard));
    if (!pendingYards.length) return;
    const initializedBefore = satInitializedRef.current.size;
    const result = seedEmptySatRostersFromFull(storeRef.current, { yards: pendingYards });
    for (const yard of DRIVER_ROSTER_YARDS) {
      if (rosterEntryCount(result.store, "sat", yard) > 0) {
        satInitializedRef.current.add(yard);
      }
    }
    for (const yard of result.seededYards) satInitializedRef.current.add(yard);
    const flagsChanged = satInitializedRef.current.size !== initializedBefore;
    if (!result.added && result.store === storeRef.current) {
      if (flagsChanged) persistLocal(storeRef.current);
      return;
    }
    persistLocal(result.store);
    if (cloud && result.added) {
      const seeded = new Set(result.seededYards);
      await cloudUpsert(
        Object.values(result.store.entries).filter(
          (entry) => entry.kind === "sat" && seeded.has(entry.yard),
        ),
      );
    }
  }, [cloud, cloudUpsert, persistLocal]);

  const seedIfEmpty = useCallback(async () => {
    if (seedingRef.current) return;
    if (importedAtRef.current) {
      await seedEmptySatFromFull();
      return;
    }
    if (!rosterStoreIsEmpty(storeRef.current)) {
      importedAtRef.current = new Date().toISOString();
      persistLocal(storeRef.current);
      await seedEmptySatFromFull();
      return;
    }
    seedingRef.current = true;
    setImporting(true);
    try {
      const { rows } = await fetchRosterWorkbook();
      const result = mergeImportedRows(storeRef.current, rows);
      importedAtRef.current = new Date().toISOString();
      persistLocal(result.store);
      if (cloud && result.added) {
        await cloudUpsert(Object.values(result.store.entries));
      }
      setLastImport({
        added: result.added,
        skippedGroups: result.skippedGroups.map(describeImportGroup),
        error: null,
      });
      await seedEmptySatFromFull();
    } catch (err) {
      importedAtRef.current = new Date().toISOString();
      persistLocal(storeRef.current);
      const message = err instanceof Error ? err.message : "Sheet import failed";
      setLastImport({ added: 0, skippedGroups: [], error: message });
      await seedEmptySatFromFull();
    } finally {
      seedingRef.current = false;
      setImporting(false);
    }
  }, [cloud, cloudUpsert, persistLocal, seedEmptySatFromFull]);

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
      const prior = storeRef.current;
      const result = reconcileDriverRosterCloud({
        local: prior,
        remote,
        deletedEntryIds: deletedRef.current,
        seenRemoteEntryIds: seenRef.current,
      });
      if (epoch !== epochRef.current) return;
      const next = preserveAssignedTrucks(prior, result.next);
      const toUpload = [...result.toUploadEntries];
      for (const row of assignedTrucksNeedingUpload(next, remote)) {
        if (!toUpload.some((item) => item.id === row.id)) toUpload.push(row);
      }
      if (toUpload.length && !uploadingRef.current) {
        uploadingRef.current = true;
        try {
          await cloudUpsert(toUpload);
        } finally {
          uploadingRef.current = false;
        }
      }
      if (epoch !== epochRef.current) return;
      deletedRef.current = new Set(result.deletedEntryIds);
      seenRef.current = new Set(result.seenRemoteEntryIds);
      persistLocal(next);
    }

    await seedIfEmpty();
    await seedEmptySatFromFull();
  }, [cloud, cloudUpsert, persistLocal, pullRemote, seedEmptySatFromFull, seedIfEmpty]);

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
      .channel("driver-roster-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_roster_entries" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const importFromSheet = useCallback(async (): Promise<DriverRosterImportResult> => {
    setImporting(true);
    try {
      const { rows } = await fetchRosterWorkbook();
      const prior = storeRef.current;
      const result = mergeImportedRows(prior, rows);
      importedAtRef.current = new Date().toISOString();
      persistLocal(preserveAssignedTrucks(prior, result.store));
      if (cloud && result.added) {
        const uploaded = Object.values(result.store.entries).filter((entry) =>
          result.store.entries[entry.id],
        );
        const newIds = new Set(
          Object.values(result.store.entries)
            .filter((entry) => !seenRef.current.has(entry.id))
            .map((entry) => entry.id),
        );
        await cloudUpsert(uploaded.filter((entry) => newIds.has(entry.id)));
      }
      const summary: DriverRosterImportResult = {
        added: result.added,
        skippedGroups: result.skippedGroups.map(describeImportGroup),
        error: null,
      };
      setLastImport(summary);
      await seedEmptySatFromFull();
      return summary;
    } catch (err) {
      const summary: DriverRosterImportResult = {
        added: 0,
        skippedGroups: [],
        error: err instanceof Error ? err.message : "Sheet import failed",
      };
      setLastImport(summary);
      return summary;
    } finally {
      setImporting(false);
    }
  }, [cloud, cloudUpsert, persistLocal, seedEmptySatFromFull]);

  const addDriver = useCallback(
    async (input: Omit<DriverRosterInput, "kind" | "yard">) => {
      epochRef.current += 1;
      const satDate =
        ui.kind === "sat"
          ? (input.forDate ??
            Object.values(storeRef.current.entries).find(
              (entry) => entry.kind === "sat" && entry.yard === ui.yard && entry.forDate,
            )?.forDate ??
            null)
          : null;
      const result = addRosterEntry(storeRef.current, {
        ...input,
        kind: ui.kind,
        yard: ui.yard,
        forDate: satDate,
      });
      if (!result.entry) return null;
      if (result.entry.kind === "sat") satInitializedRef.current.add(result.entry.yard);
      persistLocal(result.store);
      if (cloud) await cloudUpsert([result.entry]);
      return result.entry;
    },
    [cloud, cloudUpsert, persistLocal, ui.kind, ui.yard],
  );

  const setDriverStatus = useCallback(
    async (id: string, status: string | null) => {
      epochRef.current += 1;
      const next = updateRosterEntry(storeRef.current, id, { status });
      const entry = next.entries[id];
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([entry]);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const setDriverAssignedTruck = useCallback(
    async (id: string, assignedTruck: string | null) => {
      epochRef.current += 1;
      const next = updateRosterEntry(storeRef.current, id, { assignedTruck });
      const entry = next.entries[id];
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([entry]);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const removeDriver = useCallback(
    async (id: string) => {
      epochRef.current += 1;
      const result = removeRosterEntry(storeRef.current, id);
      if (!result.removed) return;
      deletedRef.current.add(id);
      if (result.removed.kind === "sat") {
        satInitializedRef.current.add(result.removed.yard);
      }
      persistLocal(result.store);
      if (cloud) await cloudDeleteEntries([id]);
    },
    [cloud, cloudDeleteEntries, persistLocal],
  );

  const removeHiredAndSat = useCallback(
    async (id: string) => {
      epochRef.current += 1;
      const result = removeHiredAndMatchingSat(storeRef.current, id);
      if (!result.removed.length) return;
      for (const entry of result.removed) {
        deletedRef.current.add(entry.id);
        if (entry.kind === "sat") satInitializedRef.current.add(entry.yard);
      }
      persistLocal(result.store);
      if (cloud) await cloudDeleteEntries(result.removed.map((entry) => entry.id));
    },
    [cloud, cloudDeleteEntries, persistLocal],
  );

  const moveDriver = useCallback(
    async (id: string, delta: -1 | 1) => {
      epochRef.current += 1;
      const next = moveRosterEntry(storeRef.current, id, delta);
      persistLocal(next);
      const current = next.entries[id];
      if (!current || !cloud) return;
      const list = Object.values(next.entries).filter(
        (entry) => entry.kind === current.kind && entry.yard === current.yard,
      );
      await cloudUpsert(list);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const setSatDate = useCallback(
    async (forDate: string | null) => {
      epochRef.current += 1;
      const next = setSatDateForYard(storeRef.current, ui.yard, forDate);
      persistLocal(next);
      if (cloud) {
        const rows = Object.values(next.entries).filter(
          (entry) => entry.kind === "sat" && entry.yard === ui.yard,
        );
        await cloudUpsert(rows);
      }
    },
    [cloud, cloudUpsert, persistLocal, ui.yard],
  );

  const resetSatToFullRoster = useCallback(async () => {
    epochRef.current += 1;
    const yard = ui.yard;
    const result = resetSatRosterFromFull(storeRef.current, yard);
    for (const id of result.addedIds) deletedRef.current.delete(id);
    for (const id of result.removedIds) deletedRef.current.add(id);
    satInitializedRef.current.add(yard);
    persistLocal(result.store);
    if (!cloud) return;
    if (result.removedIds.length) await cloudDeleteEntries(result.removedIds);
    const satRows = Object.values(result.store.entries).filter(
      (entry) => entry.kind === "sat" && entry.yard === yard,
    );
    if (satRows.length) await cloudUpsert(satRows);
  }, [cloud, cloudDeleteEntries, cloudUpsert, persistLocal, ui.yard]);

  const setGroup = useCallback(
    (group: DriverTabGroup) => {
      const nextGroup = cleanDriverTabGroup(group);
      setUi((prev) => {
        const next = {
          ...prev,
          group: nextGroup,
          kind: nextGroup === "gone" ? prev.kind : nextGroup,
        };
        writeDriverRosterUi(next);
        return next;
      });
      if (nextGroup === "sat") void seedEmptySatFromFull();
    },
    [seedEmptySatFromFull],
  );

  const setKind = useCallback(
    (kind: DriverRosterKind) => {
      setGroup(cleanDriverRosterKind(kind));
    },
    [setGroup],
  );

  const setYard = useCallback(
    (yard: DriverRosterYard) => {
      setUi((prev) => {
        const next = { ...prev, yard: cleanDriverRosterYard(yard) };
        writeDriverRosterUi(next);
        return next;
      });
      if (ui.group === "sat") void seedEmptySatFromFull();
    },
    [seedEmptySatFromFull, ui.group],
  );

  const value = useMemo<DriverRosterContextValue>(
    () => ({
      store,
      kind: ui.kind,
      group: ui.group,
      yard: ui.yard,
      setKind,
      setGroup,
      setYard,
      cloud,
      importing,
      lastImport,
      refresh,
      importFromSheet,
      addDriver,
      setDriverStatus,
      setDriverAssignedTruck,
      removeDriver,
      removeHiredAndSat,
      moveDriver,
      setSatDate,
      resetSatToFullRoster,
    }),
    [
      store,
      ui.kind,
      ui.group,
      ui.yard,
      setKind,
      setGroup,
      setYard,
      cloud,
      importing,
      lastImport,
      refresh,
      importFromSheet,
      addDriver,
      setDriverStatus,
      setDriverAssignedTruck,
      removeDriver,
      removeHiredAndSat,
      moveDriver,
      setSatDate,
      resetSatToFullRoster,
    ],
  );

  return (
    <DriverRosterContext.Provider value={value}>{children}</DriverRosterContext.Provider>
  );
}

export function useDriverRoster() {
  const ctx = useContext(DriverRosterContext);
  if (!ctx) throw new Error("useDriverRoster must be used inside DriverRosterProvider");
  return ctx;
}
