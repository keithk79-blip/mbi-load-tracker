-- Chicago-area driver rosters (Full + Sat, per yard). Shared across desktop/web/phone.
-- Paste into Supabase SQL Editor and Run once.
-- Same DDL is in supabase/migrations/20260912210000_driver_roster.sql
-- and Load-Tracker-sync-tables.sql.
--
-- This is the Driver tab system of record. Today’s available count reads
-- Full Roster here (hired − status − Vacation VAC − leftover manuals),
-- not Burnham!L13 or Sat-* sheet sums.
--
-- After Run: open a signed-in desktop/web client and use Import empty lists
-- (or first-open seed) so empty stores upload, then hard-refresh other devices.

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
  'Driver tab Full (hired) + Sat (planning) rosters per Chicago-area yard. Sync is upsert-only. Remote DELETE is explicit UI × only — never import, Vacation VAC, or a thin/empty pull.';
comment on column public.driver_roster_entries.kind is
  'full = hired master roster at the yard; sat = Saturday planning subset.';
comment on column public.driver_roster_entries.yard is
  'burnham | rockford | pontiac | arc | zion. Sheet “ARC Drivers” / Sat-Arc map to arc.';
alter table public.driver_roster_entries
  add column if not exists assigned_truck text;

comment on column public.driver_roster_entries.truck_number is
  'Employee number as text (leading zeros stripped). Column name stays truck_number. Nullable. Not the unit / truck.';
comment on column public.driver_roster_entries.assigned_truck is
  'Full Roster unit / truck assignment (digits or broker code). Separate from EMP #. Sat rows stay null.';

create index if not exists driver_roster_entries_assigned_truck_idx
  on public.driver_roster_entries (assigned_truck)
  where assigned_truck is not null;

alter table public.driver_roster_entries
  add column if not exists hire_date date;

comment on column public.driver_roster_entries.hire_date is
  'Full Roster start date (America/Chicago). Null until known. Sat rows stay null.';

alter table public.driver_roster_entries
  add column if not exists phone text;

comment on column public.driver_roster_entries.phone is
  'Optional Full Roster contact. Sat rows stay null.';

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

create or replace function public.driver_roster_deletes_allowed()
returns boolean
language sql
stable
as $$
  select true
$$;

comment on function public.driver_roster_deletes_allowed() is
  'Kill-switch for driver_roster_entries DELETE. Default true so UI × works. Set the body to select false to freeze all roster deletes.';

grant execute on function public.driver_roster_deletes_allowed() to authenticated;

drop policy if exists "crew_delete_driver_roster_entries" on public.driver_roster_entries;
create policy "crew_delete_driver_roster_entries"
  on public.driver_roster_entries
  for delete
  to authenticated
  using (public.driver_roster_deletes_allowed());

do $$
begin
  alter publication supabase_realtime add table public.driver_roster_entries;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
