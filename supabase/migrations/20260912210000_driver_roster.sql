-- Chicago-area driver rosters (Full + Sat, per yard).
-- Paste-ready copy: Load-Tracker-driver-roster.sql
-- Also folded into Load-Tracker-sync-tables.sql.

create table if not exists public.driver_roster_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  yard text not null,
  truck_number text,
  name text not null,
  status text,
  sort_order int not null default 0,
  for_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.driver_roster_entries
  drop constraint if exists driver_roster_entries_kind_check;

alter table public.driver_roster_entries
  add constraint driver_roster_entries_kind_check
  check (kind in ('full', 'sat'));

alter table public.driver_roster_entries
  drop constraint if exists driver_roster_entries_yard_check;

alter table public.driver_roster_entries
  add constraint driver_roster_entries_yard_check
  check (yard in ('burnham', 'rockford', 'pontiac', 'arc', 'zion'));

create index if not exists driver_roster_entries_kind_yard_idx
  on public.driver_roster_entries (kind, yard, sort_order);

create index if not exists driver_roster_entries_sat_date_idx
  on public.driver_roster_entries (for_date)
  where kind = 'sat' and for_date is not null;

comment on table public.driver_roster_entries is
  'Driver tab Full (hired) + Sat (planning) rosters per Chicago-area yard. Upsert-only sync; remote rows are deleted only by explicit user removes.';
comment on column public.driver_roster_entries.kind is
  'full = hired master roster at the yard; sat = Saturday planning subset.';
comment on column public.driver_roster_entries.yard is
  'burnham | rockford | pontiac | arc | zion. Sheet “ARC Drivers” / Sat-Arc map to arc.';
comment on column public.driver_roster_entries.truck_number is
  'Unit number as text (leading zeros stripped). Nullable.';
comment on column public.driver_roster_entries.status is
  'Full Roster unavailability abbreviation (oot, fmla, vac, wc, …). Null = working. Driver stays on the hired list. Later tally: hired − full-day status − day offs.';
comment on column public.driver_roster_entries.for_date is
  'Optional Saturday this Sat roster is planning for (America/Chicago date).';

alter table public.driver_roster_entries enable row level security;

drop policy if exists "crew_select_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_select_driver_roster_entries"
  on public.driver_roster_entries for select to authenticated using (true);

drop policy if exists "crew_insert_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_insert_driver_roster_entries"
  on public.driver_roster_entries for insert to authenticated with check (true);

drop policy if exists "crew_update_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_update_driver_roster_entries"
  on public.driver_roster_entries for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_delete_driver_roster_entries"
  on public.driver_roster_entries for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.driver_roster_entries;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
