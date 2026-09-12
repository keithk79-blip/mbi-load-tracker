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
import { VACATION_SEEDS_BY_YEAR } from "../data/vacationSeed";
import { fetchAllPaged, pagedErrorMessage } from "../lib/cloud";
import { getSupabase } from "../lib/supabase";
import {
  addVacationEntry,
  applySeedWeeks,
  applyVacationTombstones,
  buildEmptyYearWeeks,
  cycleVacationEntryStatus,
  emptyVacationStore,
  readVacationPersisted,
  reconcileVacationCloud,
  removeVacationEntry,
  updateVacationEntry,
  upsertWeek,
  writeVacationPersisted,
  yearHasWeeks,
  type VacationEntry,
  type VacationPersisted,
  type VacationStatus,
  type VacationStore,
  type VacationWeek,
  type VacationWeekKind,
} from "../lib/vacationBoard";
import { useAuth } from "./AuthContext";

type WeekRow = {
  week_of: string;
  year: number;
  capacity: number | null;
  label: string;
  kind: string;
  created_at: string;
  updated_at: string;
};

type EntryRow = {
  id: string;
  week_of: string;
  name: string;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type VacationContextValue = {
  store: VacationStore;
  cloud: boolean;
  refresh: () => Promise<void>;
  addDriver: (
    weekOf: string,
    name: string,
    opts?: { note?: string; status?: VacationStatus },
  ) => Promise<VacationEntry | null>;
  editDriver: (
    id: string,
    patch: Partial<Pick<VacationEntry, "name" | "note" | "status">>,
  ) => Promise<void>;
  cycleDriverStatus: (id: string) => Promise<void>;
  removeDriver: (id: string) => Promise<void>;
  editWeek: (
    weekOf: string,
    patch: Partial<Pick<VacationWeek, "capacity" | "label" | "kind" | "year">>,
  ) => Promise<void>;
  createYear: (year: number) => Promise<boolean>;
};

const VacationContext = createContext<VacationContextValue | null>(null);

function rowsToStore(weeks: WeekRow[], entries: EntryRow[]): VacationStore {
  const store = emptyVacationStore();
  for (const row of weeks) {
    store.weeks[row.week_of] = {
      weekOf: row.week_of,
      year: row.year,
      capacity: row.capacity,
      label: row.label ?? "",
      kind: (row.kind as VacationWeekKind) ?? "open",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  for (const row of entries) {
    store.entries[row.id] = {
      id: row.id,
      weekOf: row.week_of,
      name: row.name,
      note: row.note ?? "",
      status: (row.status as VacationStatus) ?? "approved",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  return store;
}

function weekToRow(week: VacationWeek, userId: string | null) {
  return {
    week_of: week.weekOf,
    year: week.year,
    capacity: week.capacity,
    label: week.label,
    kind: week.kind,
    created_at: week.createdAt,
    updated_at: week.updatedAt,
    updated_by: userId,
  };
}

function entryToRow(entry: VacationEntry, userId: string | null) {
  return {
    id: entry.id,
    week_of: entry.weekOf,
    name: entry.name,
    note: entry.note,
    status: entry.status,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    created_by: userId,
  };
}

function bootstrapStore(base: VacationStore): VacationStore {
  let next = base;
  for (const [yearText, seeds] of Object.entries(VACATION_SEEDS_BY_YEAR)) {
    const year = Number(yearText);
    if (!yearHasWeeks(next, year)) {
      next = applySeedWeeks(next, year, seeds);
    }
  }
  return next;
}

function persistSnapshot(next: VacationPersisted): VacationStore {
  const stripped = applyVacationTombstones(
    { weeks: next.weeks, entries: next.entries },
    next.deletedWeekOfs,
    next.deletedEntryIds,
  );
  writeVacationPersisted({ ...next, weeks: stripped.weeks, entries: stripped.entries });
  return stripped;
}

export function VacationProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [store, setStore] = useState<VacationStore>(() => {
    const persisted = readVacationPersisted();
    const bootstrapped = bootstrapStore({
      weeks: persisted.weeks,
      entries: persisted.entries,
    });
    const snapshot: VacationPersisted = {
      ...persisted,
      weeks: bootstrapped.weeks,
      entries: bootstrapped.entries,
    };
    writeVacationPersisted(snapshot);
    return bootstrapped;
  });
  const storeRef = useRef(store);
  storeRef.current = store;
  const deletedWeeksRef = useRef<Set<string>>(new Set(readVacationPersisted().deletedWeekOfs));
  const deletedEntriesRef = useRef<Set<string>>(new Set(readVacationPersisted().deletedEntryIds));
  const seenWeeksRef = useRef<Set<string>>(new Set(readVacationPersisted().seenRemoteWeekOfs));
  const seenEntriesRef = useRef<Set<string>>(new Set(readVacationPersisted().seenRemoteEntryIds));
  const epochRef = useRef(0);
  const refreshTailRef = useRef(Promise.resolve());
  const uploadingRef = useRef(false);

  const persistLocal = useCallback((next: VacationStore) => {
    const snapshot: VacationPersisted = {
      version: 1,
      weeks: next.weeks,
      entries: next.entries,
      deletedWeekOfs: [...deletedWeeksRef.current],
      deletedEntryIds: [...deletedEntriesRef.current],
      seenRemoteWeekOfs: [...seenWeeksRef.current],
      seenRemoteEntryIds: [...seenEntriesRef.current],
    };
    const stripped = persistSnapshot(snapshot);
    storeRef.current = stripped;
    setStore(stripped);
  }, []);

  const rememberDeletedEntries = useCallback((ids: string[]) => {
    if (!ids.length) return;
    for (const id of ids) deletedEntriesRef.current.add(id);
    persistLocal(storeRef.current);
  }, [persistLocal]);

  const pullRemote = useCallback(async (): Promise<VacationStore | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const weeksPage = await fetchAllPaged<WeekRow>(async (from, to) => {
      const page = await supabase
        .from("vacation_weeks")
        .select("week_of, year, capacity, label, kind, created_at, updated_at")
        .order("week_of", { ascending: true })
        .range(from, to);
      return { data: page.data as WeekRow[] | null, error: page.error };
    });
    if (weeksPage.error || !weeksPage.data) {
      console.warn("vacation_weeks pull failed", pagedErrorMessage(weeksPage.error));
      return null;
    }
    const entriesPage = await fetchAllPaged<EntryRow>(async (from, to) => {
      const page = await supabase
        .from("vacation_entries")
        .select("id, week_of, name, note, status, created_at, updated_at")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: page.data as EntryRow[] | null, error: page.error };
    });
    if (entriesPage.error || !entriesPage.data) {
      console.warn("vacation_entries pull failed", pagedErrorMessage(entriesPage.error));
      return null;
    }
    return rowsToStore(weeksPage.data, entriesPage.data);
  }, [session]);

  const cloudDeleteWeeks = useCallback(async (weekOfs: string[]) => {
    if (!weekOfs.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("vacation_weeks").delete().in("week_of", weekOfs);
    if (error) console.warn("vacation week delete failed", error.message);
  }, []);

  const cloudDeleteEntries = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from("vacation_entries").delete().in("id", ids);
    if (error) console.warn("vacation entry delete failed", error.message);
  }, []);

  const cloudUpsert = useCallback(
    async (weeks: VacationWeek[], entries: VacationEntry[]) => {
      const supabase = getSupabase();
      if (!supabase || !session) return;
      if (weeks.length) {
        const { error } = await supabase
          .from("vacation_weeks")
          .upsert(weeks.map((week) => weekToRow(week, user?.id ?? null)));
        if (error) console.warn("vacation week upsert failed", error.message);
      }
      if (entries.length) {
        const { error } = await supabase
          .from("vacation_entries")
          .upsert(entries.map((entry) => entryToRow(entry, user?.id ?? null)));
        if (error) console.warn("vacation entry upsert failed", error.message);
      }
    },
    [session, user?.id],
  );

  const refreshInner = useCallback(async () => {
    if (!cloud) {
      persistLocal(bootstrapStore(storeRef.current));
      return;
    }
    const epoch = epochRef.current;
    const remote = await pullRemote();
    if (!remote) return;
    if (epoch !== epochRef.current) return;

    const local = bootstrapStore(storeRef.current);
    const result = reconcileVacationCloud({
      local,
      remote,
      deletedWeekOfs: deletedWeeksRef.current,
      deletedEntryIds: deletedEntriesRef.current,
      seenRemoteWeekOfs: seenWeeksRef.current,
      seenRemoteEntryIds: seenEntriesRef.current,
    });

    if (result.toDeleteRemoteWeeks.length) await cloudDeleteWeeks(result.toDeleteRemoteWeeks);
    if (result.toDeleteRemoteEntries.length) {
      await cloudDeleteEntries(result.toDeleteRemoteEntries);
    }
    if (epoch !== epochRef.current) return;

    if (
      (result.toUploadWeeks.length || result.toUploadEntries.length) &&
      !uploadingRef.current
    ) {
      uploadingRef.current = true;
      try {
        await cloudUpsert(result.toUploadWeeks, result.toUploadEntries);
      } finally {
        uploadingRef.current = false;
      }
    }
    if (epoch !== epochRef.current) return;

    deletedWeeksRef.current = new Set(result.deletedWeekOfs);
    deletedEntriesRef.current = new Set(result.deletedEntryIds);
    seenWeeksRef.current = new Set(result.seenRemoteWeekOfs);
    seenEntriesRef.current = new Set(result.seenRemoteEntryIds);
    persistLocal(result.next);
  }, [cloud, cloudDeleteEntries, cloudDeleteWeeks, cloudUpsert, persistLocal, pullRemote]);

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
      .channel("vacation-calendar-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_weeks" },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vacation_entries" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const addDriver = useCallback(
    async (
      weekOf: string,
      name: string,
      opts?: { note?: string; status?: VacationStatus },
    ) => {
      epochRef.current += 1;
      const result = addVacationEntry(storeRef.current, weekOf, name, opts);
      if (!result.entry) return null;
      persistLocal(result.store);
      if (cloud) await cloudUpsert([], [result.entry]);
      return result.entry;
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const editDriver = useCallback(
    async (
      id: string,
      patch: Partial<Pick<VacationEntry, "name" | "note" | "status">>,
    ) => {
      epochRef.current += 1;
      const next = updateVacationEntry(storeRef.current, id, patch);
      const entry = next.entries[id];
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([], [entry]);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const cycleDriverStatus = useCallback(
    async (id: string) => {
      epochRef.current += 1;
      const next = cycleVacationEntryStatus(storeRef.current, id);
      const entry = next.entries[id];
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([], [entry]);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const removeDriver = useCallback(
    async (id: string) => {
      epochRef.current += 1;
      const result = removeVacationEntry(storeRef.current, id);
      if (!result.removed) return;
      rememberDeletedEntries([id]);
      persistLocal(result.store);
      if (cloud) await cloudDeleteEntries([id]);
    },
    [cloud, cloudDeleteEntries, persistLocal, rememberDeletedEntries],
  );

  const editWeek = useCallback(
    async (
      weekOf: string,
      patch: Partial<Pick<VacationWeek, "capacity" | "label" | "kind" | "year">>,
    ) => {
      epochRef.current += 1;
      const next = upsertWeek(storeRef.current, { weekOf, ...patch });
      const week = next.weeks[weekOf] ?? Object.values(next.weeks).find((row) => row.weekOf === weekOf);
      persistLocal(next);
      if (cloud && week) await cloudUpsert([week], []);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const createYear = useCallback(
    async (year: number) => {
      if (!Number.isInteger(year) || year < 2000 || year > 2100) return false;
      if (yearHasWeeks(storeRef.current, year)) return false;
      epochRef.current += 1;
      const next = applySeedWeeks(
        storeRef.current,
        year,
        VACATION_SEEDS_BY_YEAR[year] ?? [],
      );
      persistLocal(next);
      if (cloud) {
        const created = buildEmptyYearWeeks(year)
          .map((week) => next.weeks[week.weekOf])
          .filter((week): week is VacationWeek => Boolean(week));
        await cloudUpsert(created, []);
      }
      return true;
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const value = useMemo<VacationContextValue>(
    () => ({
      store,
      cloud,
      refresh,
      addDriver,
      editDriver,
      cycleDriverStatus,
      removeDriver,
      editWeek,
      createYear,
    }),
    [
      store,
      cloud,
      refresh,
      addDriver,
      editDriver,
      cycleDriverStatus,
      removeDriver,
      editWeek,
      createYear,
    ],
  );

  return <VacationContext.Provider value={value}>{children}</VacationContext.Provider>;
}

export function useVacation() {
  const ctx = useContext(VacationContext);
  if (!ctx) throw new Error("useVacation must be used inside VacationProvider");
  return ctx;
}
