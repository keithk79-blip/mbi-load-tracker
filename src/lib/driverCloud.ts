import { fetchAllPaged } from "./cloud";
import { callOffNameKey, type ManualCallOff } from "./driverAvailability";
import { type DayStore, type LockedDay, isDriverTallyDay } from "./driverDays";
import { asLockedDay } from "./driverStore";
import {
  cleanManualOffs,
  type ManualOffsStore,
} from "./manualCallOffs";
import { getSupabase } from "./supabase";

type RemoteRow = {
  date: string;
  base: number;
  offs: number;
  available: number;
  locked: boolean;
  locked_at: string;
  oot_names?: string[] | null;
};

function daysFromRows(rows: RemoteRow[]): DayStore {
  const store: DayStore = {};
  for (const row of rows) {
    if (!isDriverTallyDay(row.date)) continue;
    store[row.date] = asLockedDay(row);
  }
  return store;
}

export async function fetchRemoteDays(): Promise<DayStore | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await fetchAllPaged<RemoteRow>(async (from, to) => {
    const page = await supabase
      .from("driver_availability")
      .select("date, base, offs, available, locked, locked_at, oot_names")
      .order("date", { ascending: true })
      .range(from, to);
    return { data: page.data as RemoteRow[] | null, error: page.error };
  });
  if (!error && data) return daysFromRows(data);
  // Older DBs without oot_names: fall back so headcount sync still works.
  const fallback = await fetchAllPaged<RemoteRow>(async (from, to) => {
    const page = await supabase
      .from("driver_availability")
      .select("date, base, offs, available, locked, locked_at")
      .order("date", { ascending: true })
      .range(from, to);
    return { data: page.data as RemoteRow[] | null, error: page.error };
  });
  if (fallback.error || !fallback.data) return null;
  return daysFromRows(fallback.data);
}

function toRow(day: LockedDay) {
  return {
    date: day.date,
    base: day.base,
    offs: day.offs,
    available: day.available,
    locked: day.locked,
    locked_at: day.lockedAt,
    oot_names: Array.isArray(day.ootNames) ? day.ootNames : [],
  };
}

export async function pushDayStore(store: DayStore): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const rows = Object.values(store)
    .filter((day) => isDriverTallyDay(day.date))
    .map(toRow);
  if (rows.length === 0) return;

  const dates = rows.map((r) => r.date);
  const { data: existing } = await supabase
    .from("driver_availability")
    .select("date, locked")
    .in("date", dates);
  const byDate = new Map(
    (existing ?? []).map((r) => [r.date as string, Boolean(r.locked)]),
  );

  const inserts = rows.filter((r) => !byDate.has(r.date));
  const updates = rows.filter((r) => byDate.has(r.date) && byDate.get(r.date) === false);

  if (inserts.length) {
    await supabase.from("driver_availability").insert(inserts);
  }
  for (const row of updates) {
    await supabase.from("driver_availability").update(row).eq("date", row.date);
  }
}

type ManualRemoteRow = {
  date: string;
  name: string;
  kind: string;
};

/** PostgREST / supabase-js error fields we actually read. */
export type CloudErrorLike = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

export type ManualOffsWriteResult = {
  ok: boolean;
  error: string | null;
};

export type ManualOffsFetchResult = {
  store: ManualOffsStore | null;
  error: string | null;
};

export function describeManualOffsCloudError(error: CloudErrorLike): string {
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  const code = typeof error?.code === "string" ? error.code : "";
  const missingTable =
    code === "PGRST205" ||
    /schema cache/i.test(raw) ||
    (/manual_call_offs/i.test(raw) &&
      (/does not exist/i.test(raw) || /could not find the table/i.test(raw)));
  if (missingTable) {
    return "Call-offs did not reach the cloud — run Load-Tracker-manual-call-offs.sql in Supabase once.";
  }
  return raw
    ? `Call-offs did not reach the cloud — ${raw}`
    : "Call-offs did not reach the cloud.";
}

export function manualOffsResultFromError(
  op: string,
  error: CloudErrorLike,
): ManualOffsWriteResult {
  if (!error) return { ok: true, error: null };
  const message = describeManualOffsCloudError(error);
  console.warn(`manual_call_offs ${op} failed`, error.message ?? message);
  return { ok: false, error: message };
}

export async function fetchRemoteManualOffs(): Promise<ManualOffsFetchResult> {
  const supabase = getSupabase();
  if (!supabase) return { store: null, error: null };
  const { data, error } = await fetchAllPaged<ManualRemoteRow>(async (from, to) => {
    const page = await supabase
      .from("manual_call_offs")
      .select("date, name, kind")
      .order("date", { ascending: true })
      .order("name_key", { ascending: true })
      .range(from, to);
    return { data: page.data as ManualRemoteRow[] | null, error: page.error };
  });
  if (error) {
    const failed = manualOffsResultFromError("fetch", error);
    return { store: null, error: failed.error };
  }
  if (!data) {
    const failed = manualOffsResultFromError("fetch", {
      message: "empty response",
    });
    return { store: null, error: failed.error };
  }
  const byDate: Record<string, unknown[]> = {};
  for (const row of data as ManualRemoteRow[]) {
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    if (!date) continue;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ name: row.name, kind: row.kind });
  }
  return { store: cleanManualOffs(byDate), error: null };
}

export async function upsertRemoteManualOff(
  date: string,
  off: ManualCallOff,
): Promise<ManualOffsWriteResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: true, error: null };
  const name = off.name.trim();
  if (!name) return { ok: true, error: null };
  const { error } = await supabase.from("manual_call_offs").upsert(
    {
      date,
      name_key: callOffNameKey(name),
      name,
      kind: off.kind,
    },
    { onConflict: "date,name_key" },
  );
  return manualOffsResultFromError("upsert", error);
}

export async function deleteRemoteManualOff(
  date: string,
  name: string,
): Promise<ManualOffsWriteResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: true, error: null };
  const key = callOffNameKey(name);
  if (!key) return { ok: true, error: null };
  const { error } = await supabase
    .from("manual_call_offs")
    .delete()
    .eq("date", date)
    .eq("name_key", key);
  return manualOffsResultFromError("delete", error);
}

/** Push names that exist locally but not on the remote snapshot (unsynced adds). */
export async function pushMissingManualOffs(
  local: ManualOffsStore,
  remote: ManualOffsStore,
): Promise<ManualOffsWriteResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: true, error: null };
  const rows: { date: string; name_key: string; name: string; kind: string }[] = [];
  for (const [date, list] of Object.entries(local)) {
    const remoteKeys = new Set(
      (remote[date] ?? []).map((row) => callOffNameKey(row.name)),
    );
    for (const off of list) {
      const key = callOffNameKey(off.name);
      if (!key || remoteKeys.has(key)) continue;
      rows.push({
        date,
        name_key: key,
        name: off.name.trim(),
        kind: off.kind,
      });
    }
  }
  if (!rows.length) return { ok: true, error: null };
  const { error } = await supabase
    .from("manual_call_offs")
    .upsert(rows, { onConflict: "date,name_key" });
  return manualOffsResultFromError("push-missing", error);
}
