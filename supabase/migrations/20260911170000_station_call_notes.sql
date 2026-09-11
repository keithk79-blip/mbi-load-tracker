-- Global (per-station) notes for Load Count By Hour.
-- Notes are not dated: one row per station, shared across every calendar day.

create table if not exists public.station_call_notes (
  station_id text primary key,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.station_call_notes enable row level security;

drop policy if exists "crew_select_station_call_notes" on public.station_call_notes;
create policy "crew_select_station_call_notes"
  on public.station_call_notes for select to authenticated using (true);

drop policy if exists "crew_upsert_station_call_notes" on public.station_call_notes;
create policy "crew_upsert_station_call_notes"
  on public.station_call_notes for insert to authenticated with check (true);

drop policy if exists "crew_update_station_call_notes" on public.station_call_notes;
create policy "crew_update_station_call_notes"
  on public.station_call_notes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_station_call_notes" on public.station_call_notes;
create policy "crew_delete_station_call_notes"
  on public.station_call_notes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.station_call_notes;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
