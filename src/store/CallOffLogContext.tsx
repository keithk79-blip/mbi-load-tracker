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
import { callOffLogSeedRows } from "../data/callOffLogSeed";
import { fetchAllPaged, pagedErrorMessage } from "../lib/cloud";
import {
  addCallOffLogEntry,
  cleanCallOffLogRows,
  logEntriesToRows,
  mergeCallOffLog,
  readCallOffLogPersisted,
  reconcileCallOffLogCloud,
  removeCallOffLogEntry,
  updateCallOffLogEntry,
  writeCallOffLogPersisted,
  type CallOffLogEntry,
  type CallOffLogPersisted,
} from "../lib/callOffLog";
import type { CallOffRow } from "../lib/driverAvailability";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

type RemoteRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

type CallOffLogContextValue = {
  rows: CallOffLogEntry[];
  offs: CallOffRow[];
  cloud: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadSheet: () => Promise<number>;
  addRow: (input: {
    name: string;
    start: string;
    end?: string | null;
    reason: string;
  }) => Promise<CallOffLogEntry | null>;
  editRow: (
    id: string,
    patch: Partial<Pick<CallOffLogEntry, "name" | "start" | "end" | "reason">>,
  ) => Promise<void>;
  removeRow: (id: string) => Promise<void>;
};

const CallOffLogContext = createContext<CallOffLogContextValue | null>(null);

function remoteToEntry(row: RemoteRow): CallOffLogEntry | null {
  const cleaned = cleanCallOffLogRows([
    {
      id: row.id,
      name: row.name,
      start: typeof row.start_date === "string" ? row.start_date.slice(0, 10) : "",
      end: typeof row.end_date === "string" ? row.end_date.slice(0, 10) : null,
      reason: row.reason ?? "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ]);
  return cleaned[0] ?? null;
}

function entryToRemote(row: CallOffLogEntry, userId: string | null) {
  return {
    id: row.id,
    name: row.name,
    start_date: row.start,
    end_date: row.end,
    reason: row.reason,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    updated_by: userId,
  };
}

function bootstrap(persisted: CallOffLogPersisted): CallOffLogPersisted {
  if (persisted.rows.length) {
    return { ...persisted, seeded: true };
  }
  const seeded = callOffLogSeedRows();
  const keepDeleted = persisted.deletedIds.filter((id) => !id.startsWith("seed-"));
  return {
    ...persisted,
    rows: seeded,
    deletedIds: keepDeleted,
    seeded: true,
  };
}

export function CallOffLogProvider({ children }: { children: ReactNode }) {
  const { configured, session, user } = useAuth();
  const cloud = configured && !!session;
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CallOffLogEntry[]>(() => {
    const next = bootstrap(readCallOffLogPersisted());
    writeCallOffLogPersisted(next);
    return next.rows;
  });
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const deletedRef = useRef<Set<string>>(new Set(readCallOffLogPersisted().deletedIds));
  const seenRef = useRef<Set<string>>(new Set(readCallOffLogPersisted().seenIds));
  const epochRef = useRef(0);

  const persistLocal = useCallback((nextRows: CallOffLogEntry[]) => {
    const snapshot: CallOffLogPersisted = {
      version: 1,
      rows: nextRows,
      deletedIds: [...deletedRef.current],
      seenIds: [...seenRef.current],
      seeded: true,
    };
    writeCallOffLogPersisted(snapshot);
    rowsRef.current = snapshot.rows;
    setRows(snapshot.rows);
  }, []);

  const pullRemote = useCallback(async (): Promise<CallOffLogEntry[] | null> => {
    const supabase = getSupabase();
    if (!supabase || !session) return null;
    const page = await fetchAllPaged<RemoteRow>(async (from, to) => {
      const result = await supabase
        .from("call_off_log")
        .select("id, name, start_date, end_date, reason, created_at, updated_at")
        .order("start_date", { ascending: true })
        .range(from, to);
      return { data: result.data as RemoteRow[] | null, error: result.error };
    });
    if (page.error) {
      const message = pagedErrorMessage(page.error);
      const missing =
        /schema cache/i.test(message) ||
        (/call_off_log/i.test(message) && /does not exist|could not find/i.test(message));
      setError(
        missing
          ? "Call-Off's did not reach the cloud — run Load-Tracker-call-off-log.sql in Supabase once."
          : `Call-Off's did not reach the cloud — ${message}`,
      );
      return null;
    }
    setError(null);
    return (page.data ?? [])
      .map(remoteToEntry)
      .filter((row): row is CallOffLogEntry => Boolean(row));
  }, [session]);

  const cloudUpsert = useCallback(
    async (entries: CallOffLogEntry[]) => {
      if (!entries.length) return;
      const supabase = getSupabase();
      if (!supabase || !session) return;
      const { error: writeError } = await supabase
        .from("call_off_log")
        .upsert(entries.map((row) => entryToRemote(row, user?.id ?? null)));
      if (writeError) {
        setError(`Call-Off's did not reach the cloud — ${writeError.message}`);
      }
    },
    [session, user?.id],
  );

  const cloudDelete = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const { error: writeError } = await supabase.from("call_off_log").delete().in("id", ids);
    if (writeError) {
      setError(`Call-Off's did not reach the cloud — ${writeError.message}`);
    }
  }, []);

  const refresh = useCallback(async () => {
    const local = bootstrap(readCallOffLogPersisted());
    deletedRef.current = new Set(local.deletedIds);
    if (!cloud) {
      persistLocal(local.rows);
      return;
    }
    const epoch = epochRef.current;
    const remote = await pullRemote();
    if (!remote) {
      persistLocal(local.rows);
      return;
    }
    if (epoch !== epochRef.current) return;
    const result = reconcileCallOffLogCloud({
      local: local.rows,
      remote,
      deletedIds: [...deletedRef.current],
      seenIds: [...seenRef.current],
    });
    if (result.toUpload.length) await cloudUpsert(result.toUpload);
    if (result.toDeleteRemote.length) await cloudDelete(result.toDeleteRemote);
    if (epoch !== epochRef.current) return;
    deletedRef.current = new Set(result.deletedIds);
    seenRef.current = new Set(result.seenIds);
    persistLocal(result.next);
  }, [cloud, cloudDelete, cloudUpsert, persistLocal, pullRemote]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cloud) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel("call-off-log-crew")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_off_log" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloud, refresh]);

  const loadSheet = useCallback(async () => {
    epochRef.current += 1;
    const seeded = callOffLogSeedRows();
    for (const row of seeded) deletedRef.current.delete(row.id);
    const next = mergeCallOffLog(rowsRef.current, seeded, [...deletedRef.current]);
    persistLocal(next);
    if (cloud) await cloudUpsert(seeded);
    return next.length;
  }, [cloud, cloudUpsert, persistLocal]);

  const addRow = useCallback(
    async (input: { name: string; start: string; end?: string | null; reason: string }) => {
      epochRef.current += 1;
      const { rows: next, entry } = addCallOffLogEntry(rowsRef.current, input);
      if (!entry) return null;
      persistLocal(next);
      if (cloud) await cloudUpsert([entry]);
      return entry;
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const editRow = useCallback(
    async (
      id: string,
      patch: Partial<Pick<CallOffLogEntry, "name" | "start" | "end" | "reason">>,
    ) => {
      epochRef.current += 1;
      const next = updateCallOffLogEntry(rowsRef.current, id, patch);
      const entry = next.find((row) => row.id === id);
      persistLocal(next);
      if (cloud && entry) await cloudUpsert([entry]);
    },
    [cloud, cloudUpsert, persistLocal],
  );

  const removeRow = useCallback(
    async (id: string) => {
      epochRef.current += 1;
      const { rows: next, removed } = removeCallOffLogEntry(rowsRef.current, id);
      if (!removed) return;
      deletedRef.current.add(id);
      persistLocal(next);
      if (cloud) await cloudDelete([id]);
    },
    [cloud, cloudDelete, persistLocal],
  );

  const value = useMemo<CallOffLogContextValue>(
    () => ({
      rows,
      offs: logEntriesToRows(rows),
      cloud,
      error,
      refresh,
      loadSheet,
      addRow,
      editRow,
      removeRow,
    }),
    [rows, cloud, error, refresh, loadSheet, addRow, editRow, removeRow],
  );

  return <CallOffLogContext.Provider value={value}>{children}</CallOffLogContext.Provider>;
}

export function useCallOffLog(): CallOffLogContextValue {
  const ctx = useContext(CallOffLogContext);
  if (!ctx) throw new Error("useCallOffLog must be used inside CallOffLogProvider");
  return ctx;
}
