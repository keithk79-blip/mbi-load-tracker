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
import { attachCloudRefresh } from "../lib/cloudRefresh";
import {
  addRosterEntry,
  applyRosterTombstones,
  cleanAssignedTruck,
  cleanDriverRosterKind,
  cleanDriverRosterYard,
  DRIVER_ROSTER_YARDS,
  cleanDriverTabGroup,
  findAssignedTruckConflict,
  moveRosterEntry,
  collapseDuplicateRosterEntries,
  phonesNeedingUpload,
  preservePhones,
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
import { assignedTrucksNeedingUpload, preserveAssignedTrucks } from "../lib/rosterAssignedTruck";
import {
  applyKnownHireDates,
  hireDatesNeedingUpload,
  preserveHireDates,
} from "../lib/rosterHireDate";
import { enforceOneYardPerDriver } from "../lib/rosterYardOwnership";
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
  hire_date?: string | null;
  phone?: string | null;
  sort_order: number;
  for_date: string | null;
  created_at: string;
  updated_at: string;
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
  refresh: () => Promise<void>;
  addDriver: (
    input: Omit<DriverRosterInput, "kind" | "yard">,
  ) => Promise<{ entry: DriverRosterEntry | null; conflictName?: string }>;
  setDriverStatus: (id: string, status: string | null) => Promise<void>;
  setDriverAssignedTruck: (
    id: string,
    assignedTruck: string | null,
  ) => Promise<{ ok: boolean; conflictName?: string }>;
  setDriverProfile: (
    id: string,
    patch: { hireDate?: string | null; phone?: string | null },
  ) => Promise<void>;
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
      hireDate: cleanDriverRosterKind(row.kind) === "full" ? row.hire_date ?? null : null,
      phone: cleanDriverRosterKind(row.kind) === "full" ? row.phone ?? null : null,
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
    hire_date: entry.hireDate,
    phone: entry.phone,
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
    const owned = enforceOneYardPerDriver({
      entries: persisted.entries,
    });
    return applyRosterTombstones(owned.store, [
      ...persisted.deletedEntryIds,
      ...owned.removed.map((row) => row.id),
    ]);
  });
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
    const owned = enforceOneYardPerDriver(next);
    const collapsed = collapseDuplicateRosterEntries(owned.store);
    for (const row of owned.removed) deletedRef.current.add(row.id);
    for (const id of collapsed.droppedIds) deletedRef.current.add(id);
    const snapshot: DriverRosterPersisted = {
      version: 1,
      entries: collapsed.store.entries,
      deletedEntryIds: [...deletedRef.current],
      seenRemoteEntryIds: [...seenRef.current],
      importedAt: importedAtRef.current,
      satInitializedYards: [...satInitializedRef.current],
    };
    const stripped = persistSnapshot(snapshot);
    storeRef.current = stripped;
    setStore(stripped);
    return [
      ...owned.removed,
      ...collapsed.droppedIds
        .map((id) => owned.store.entries[id] ?? next.entries[id])
        .filter((row): row is DriverRosterEntry => Boolean(row)),
    ];
  }, []);

  const pullRemote = useCallback(async (): Promise<DriverRosterStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const page = await fetchAllPaged<EntryRow>(async (from, to) => {
      const selects = [
        "id, kind, yard, truck_number, assigned_truck, name, status, hire_date, phone, sort_order, for_date, created_at, updated_at",
        "id, kind, yard, truck_number, assigned_truck, name, status, hire_date, sort_order, for_date, created_at, updated_at",
        "id, kind, yard, truck_number, assigned_truck, name, status, sort_order, for_date, created_at, updated_at",
        "id, kind, yard, truck_number, name, status, sort_order, for_date, created_at, updated_at",
      ];
      let lastError: { message?: string; code?: string } | null = null;
      for (const columns of selects) {
        const result = await supabase
          .from("driver_roster_entries")
          .select(columns)
          .order("id", { ascending: true })
          .range(from, to);
        if (!result.error) {
          return { data: (result.data as unknown as EntryRow[] | null) ?? null, error: result.error };
        }
        lastError = result.error;
        const missingCol =
          result.error.code === "42703" ||
          /hire_date|assigned_truck|phone/i.test(result.error.message ?? "");
        if (!missingCol) {
          return { data: result.data as EntryRow[] | null, error: result.error };
        }
      }
      return { data: null, error: lastError };
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
    // Explicit × and Sat Reset are the only paths that may DELETE a cloud roster row.
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
      const msg = error.message ?? "";
      const missingHire = /hire_date/i.test(msg);
      const missingAssigned = /assigned_truck/i.test(msg);
      const missingPhone = /\bphone\b/i.test(msg);
      if (error.code !== "42703" && !missingHire && !missingAssigned && !missingPhone) {
        console.warn("driver roster upsert failed", error.message);
        return;
      }
      let payload: Record<string, unknown>[] = rows;
      if (missingHire) {
        payload = payload.map(({ hire_date: _h, ...row }) => row);
      }
      if (missingAssigned) {
        payload = payload.map(({ assigned_truck: _a, ...row }) => row);
      }
      if (missingPhone) {
        payload = payload.map(({ phone: _p, ...row }) => row);
      }
      const retry = await supabase.from("driver_roster_entries").upsert(payload);
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
    const removed = persistLocal(result.store);
    if (cloud && removed.length) await cloudDeleteEntries(removed.map((row) => row.id));
    if (cloud && result.added) {
      const seeded = new Set(result.seededYards);
      await cloudUpsert(
        Object.values(storeRef.current.entries).filter(
          (entry) => entry.kind === "sat" && seeded.has(entry.yard),
        ),
      );
    }
  }, [cloud, cloudDeleteEntries, cloudUpsert, persistLocal]);

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
    try {
      importedAtRef.current = new Date().toISOString();
      persistLocal(storeRef.current);
      await seedEmptySatFromFull();
    } finally {
      seedingRef.current = false;
    }
  }, [persistLocal, seedEmptySatFromFull]);

  const refreshInner = useCallback(async () => {
    if (!cloud) {
      const stamped = applyKnownHireDates(storeRef.current);
      persistLocal(stamped.store);
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
      const next = preservePhones(
        prior,
        preserveHireDates(
          prior,
          preserveAssignedTrucks(prior, result.next),
        ),
      );
      const toUpload = [...result.toUploadEntries];
      for (const row of assignedTrucksNeedingUpload(next, remote)) {
        if (!toUpload.some((item) => item.id === row.id)) toUpload.push(row);
      }
      for (const row of hireDatesNeedingUpload(next, remote)) {
        if (!toUpload.some((item) => item.id === row.id)) toUpload.push(row);
      }
      for (const row of phonesNeedingUpload(next, remote)) {
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
      if (result.toDeleteRemoteEntries.length) {
        await cloudDeleteEntries(result.toDeleteRemoteEntries);
      }
      const removed = persistLocal(next);
      if (removed.length) await cloudDeleteEntries(removed.map((row) => row.id));
    }

    await seedIfEmpty();
    await seedEmptySatFromFull();
    const stamped = applyKnownHireDates(storeRef.current);
    if (stamped.updated.length) {
      persistLocal(stamped.store);
      if (cloud) await cloudUpsert(stamped.updated);
    }
  }, [cloud, cloudDeleteEntries, cloudUpsert, persistLocal, pullRemote, seedEmptySatFromFull, seedIfEmpty]);

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

  useEffect(() => {
    if (!cloud) return;
    return attachCloudRefresh(refresh);
  }, [cloud, refresh]);

  const addDriver = useCallback(
    async (input: Omit<DriverRosterInput, "kind" | "yard">) => {
      if (ui.kind === "full") {
        const conflict = findAssignedTruckConflict(storeRef.current, input.assignedTruck ?? null);
        if (conflict) return { entry: null, conflictName: conflict.name };
      }
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
      if (!result.entry) return { entry: null };
      if (result.entry.kind === "sat") satInitializedRef.current.add(result.entry.yard);
      const removed = persistLocal(result.store);
      if (cloud && removed.length) await cloudDeleteEntries(removed.map((row) => row.id));
      const kept = storeRef.current.entries[result.entry.id];
      if (cloud && kept) await cloudUpsert([kept]);
      return { entry: kept ?? result.entry };
    },
    [cloud, cloudDeleteEntries, cloudUpsert, persistLocal, ui.kind, ui.yard],
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
      const conflict = findAssignedTruckConflict(storeRef.current, assignedTruck, id);
      if (conflict) return { ok: false, conflictName: conflict.name };
      epochRef.current += 1;
      const next = updateRosterEntry(storeRef.current, id, { assignedTruck });
      const entry = next.entries[id];
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([entry]);
      return { ok: true };
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const setDriverProfile = useCallback(
    async (id: string, patch: { hireDate?: string | null; phone?: string | null }) => {
      epochRef.current += 1;
      const next = updateRosterEntry(storeRef.current, id, patch);
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
    const satRows = Object.values(storeRef.current.entries).filter(
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
      refresh,
      addDriver,
      setDriverStatus,
      setDriverAssignedTruck,
      setDriverProfile,
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
      refresh,
      addDriver,
      setDriverStatus,
      setDriverAssignedTruck,
      setDriverProfile,
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
