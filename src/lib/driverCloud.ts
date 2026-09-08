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

export async function fetchRemoteDays(): Promise<DayStore | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("driver_availability")
    .select("date, base, offs, available, locked, locked_at, oot_names");
  if (error || !data) {
    // Older DBs without oot_names: fall back so headcount sync still works.
    const fallback = await supabase
      .from("driver_availability")
      .select("date, base, offs, available, locked, locked_at");
    if (fallback.error || !fallback.data) return null;
    const store: DayStore = {};
    for (const row of fallback.data as RemoteRow[]) {
      if (!isDriverTallyDay(row.date)) continue;
      store[row.date] = asLockedDay(row);
    }
    return store;
  }
  const store: DayStore = {};
  for (const row of data as RemoteRow[]) {
    if (!isDriverTallyDay(row.date)) continue;
    store[row.date] = asLockedDay(row);
  }
  return store;
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

export async function fetchRemoteManualOffs(): Promise<ManualOffsStore | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("manual_call_offs")
    .select("date, name, kind");
  if (error || !data) return null;
  const byDate: Record<string, unknown[]> = {};
  for (const row of data as ManualRemoteRow[]) {
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : "";
    if (!date) continue;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ name: row.name, kind: row.kind });
  }
  return cleanManualOffs(byDate);
}

export async function upsertRemoteManualOff(
  date: string,
  off: ManualCallOff,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const name = off.name.trim();
  if (!name) return;
  await supabase.from("manual_call_offs").upsert(
    {
      date,
      name_key: callOffNameKey(name),
      name,
      kind: off.kind,
    },
    { onConflict: "date,name_key" },
  );
}

export async function deleteRemoteManualOff(
  date: string,
  name: string,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const key = callOffNameKey(name);
  if (!key) return;
  await supabase
    .from("manual_call_offs")
    .delete()
    .eq("date", date)
    .eq("name_key", key);
}

/** Push names that exist locally but not on the remote snapshot (unsynced adds). */
export async function pushMissingManualOffs(
  local: ManualOffsStore,
  remote: ManualOffsStore,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
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
  if (!rows.length) return;
  await supabase.from("manual_call_offs").upsert(rows, { onConflict: "date,name_key" });
}
