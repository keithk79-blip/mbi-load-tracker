-- Specialty open loads + station call hour grid + manual call-offs + vacation
-- calendar + daily EOD totals + driver rosters + Gone archive + loads.driver_name
-- (shared across devices).
-- Paste into Supabase SQL Editor and Run.
-- Manual call-offs are also in Load-Tracker-manual-call-offs.sql (one-shot paste).
-- Daily EOD totals are also in Load-Tracker-daily-eod-totals.sql (one-shot paste).
-- Driver rosters are also in Load-Tracker-driver-roster.sql (one-shot paste).
-- Gone archive is also in Load-Tracker-driver-gone.sql (one-shot paste).

create table if not exists public.specialty_opens (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  station_id text not null,
  destination text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists specialty_opens_date_idx on public.specialty_opens (date);
create index if not exists specialty_opens_station_idx on public.specialty_opens (date, station_id);

alter table public.specialty_opens enable row level security;

drop policy if exists "crew_select_specialty_opens" on public.specialty_opens;
create policy "crew_select_specialty_opens"
  on public.specialty_opens for select to authenticated using (true);

drop policy if exists "crew_insert_specialty_opens" on public.specialty_opens;
create policy "crew_insert_specialty_opens"
  on public.specialty_opens for insert to authenticated with check (true);

drop policy if exists "crew_update_specialty_opens" on public.specialty_opens;
create policy "crew_update_specialty_opens"
  on public.specialty_opens for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_specialty_opens" on public.specialty_opens;
create policy "crew_delete_specialty_opens"
  on public.specialty_opens for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.specialty_opens;
exception when duplicate_object then null;
end $$;

create table if not exists public.station_call_days (
  date date primary key,
  board jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.station_call_days enable row level security;

drop policy if exists "crew_select_station_call_days" on public.station_call_days;
create policy "crew_select_station_call_days"
  on public.station_call_days for select to authenticated using (true);

drop policy if exists "crew_upsert_station_call_days" on public.station_call_days;
create policy "crew_upsert_station_call_days"
  on public.station_call_days for insert to authenticated with check (true);

drop policy if exists "crew_update_station_call_days" on public.station_call_days;
create policy "crew_update_station_call_days"
  on public.station_call_days for update to authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.station_call_days;
exception when duplicate_object then null;
end $$;

-- Global (per-station) notes for Load Count By Hour — not per calendar day.
-- Keep in sync with Load-Tracker-station-call-notes.sql (paste-ready one-shot).

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

-- Manual same-day call-offs (Available drivers card).
-- Keep in sync with Load-Tracker-manual-call-offs.sql (paste-ready one-shot).

create table if not exists public.manual_call_offs (
  date date not null,
  name_key text not null,
  name text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (date, name_key)
);

alter table public.manual_call_offs
  drop constraint if exists manual_call_offs_kind_check;

alter table public.manual_call_offs
  add constraint manual_call_offs_kind_check
  check (kind in ('call-off', 'p-day', 'okd-off', 'ncns', 'late-early'));

create index if not exists manual_call_offs_date_idx
  on public.manual_call_offs (date);

alter table public.manual_call_offs enable row level security;

drop policy if exists "crew_select_manual_call_offs" on public.manual_call_offs;
create policy "crew_select_manual_call_offs"
  on public.manual_call_offs for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_manual_call_offs" on public.manual_call_offs;
create policy "crew_insert_manual_call_offs"
  on public.manual_call_offs for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_manual_call_offs" on public.manual_call_offs;
create policy "crew_update_manual_call_offs"
  on public.manual_call_offs for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_manual_call_offs" on public.manual_call_offs;
create policy "crew_delete_manual_call_offs"
  on public.manual_call_offs for delete
  to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.manual_call_offs;
exception when duplicate_object then null;
end $$;

-- Vacation calendar (week rows + driver names).
-- Keep in sync with Load-Tracker-vacation.sql (paste-ready one-shot).

create table if not exists public.vacation_weeks (
  yard text not null default 'rockford',
  week_of date not null,
  year int not null,
  capacity int,
  label text not null default '',
  kind text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (yard, week_of)
);

alter table public.vacation_weeks
  drop constraint if exists vacation_weeks_kind_check;

alter table public.vacation_weeks
  add constraint vacation_weeks_kind_check
  check (kind in ('open', 'holiday', 'blocked'));

create index if not exists vacation_weeks_year_idx on public.vacation_weeks (year);

alter table public.vacation_weeks enable row level security;

drop policy if exists "crew_select_vacation_weeks" on public.vacation_weeks;
create policy "crew_select_vacation_weeks"
  on public.vacation_weeks for select to authenticated using (true);

drop policy if exists "crew_insert_vacation_weeks" on public.vacation_weeks;
create policy "crew_insert_vacation_weeks"
  on public.vacation_weeks for insert to authenticated with check (true);

drop policy if exists "crew_update_vacation_weeks" on public.vacation_weeks;
create policy "crew_update_vacation_weeks"
  on public.vacation_weeks for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_vacation_weeks" on public.vacation_weeks;
create policy "crew_delete_vacation_weeks"
  on public.vacation_weeks for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.vacation_weeks;
exception when duplicate_object then null;
end $$;

create table if not exists public.vacation_entries (
  id uuid primary key default gen_random_uuid(),
  yard text not null default 'rockford',
  week_of date not null,
  name text not null,
  note text not null default '',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.vacation_entries
  drop constraint if exists vacation_entries_status_check;

alter table public.vacation_entries
  add constraint vacation_entries_status_check
  check (status in ('pending', 'approved', 'paid'));

create index if not exists vacation_entries_week_idx on public.vacation_entries (week_of);

alter table public.vacation_entries enable row level security;

drop policy if exists "crew_select_vacation_entries" on public.vacation_entries;
create policy "crew_select_vacation_entries"
  on public.vacation_entries for select to authenticated using (true);

drop policy if exists "crew_insert_vacation_entries" on public.vacation_entries;
create policy "crew_insert_vacation_entries"
  on public.vacation_entries for insert to authenticated with check (true);

drop policy if exists "crew_update_vacation_entries" on public.vacation_entries;
create policy "crew_update_vacation_entries"
  on public.vacation_entries for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_vacation_entries" on public.vacation_entries;
create policy "crew_delete_vacation_entries"
  on public.vacation_entries for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.vacation_entries;
exception when duplicate_object then null;
end $$;

-- Existing boards created before yard: default those rows to Rockford.
-- Safe to re-run. Same block as Load-Tracker-vacation-yard.sql.

alter table public.vacation_weeks
  add column if not exists yard text;

update public.vacation_weeks
  set yard = 'rockford'
  where yard is null or btrim(yard) = '';

alter table public.vacation_weeks
  alter column yard set default 'rockford';

alter table public.vacation_weeks
  alter column yard set not null;

alter table public.vacation_weeks
  drop constraint if exists vacation_weeks_yard_check;

alter table public.vacation_weeks
  add constraint vacation_weeks_yard_check
  check (yard in ('rockford', 'chicago'));

do $$
declare
  pk_def text;
begin
  select pg_get_constraintdef(c.oid)
    into pk_def
  from pg_constraint c
  where c.conrelid = 'public.vacation_weeks'::regclass
    and c.contype = 'p';

  if pk_def is distinct from 'PRIMARY KEY (yard, week_of)' then
    alter table public.vacation_weeks drop constraint if exists vacation_weeks_pkey;
    alter table public.vacation_weeks
      add constraint vacation_weeks_pkey primary key (yard, week_of);
  end if;
end $$;

create index if not exists vacation_weeks_yard_year_idx
  on public.vacation_weeks (yard, year);

alter table public.vacation_entries
  add column if not exists yard text;

update public.vacation_entries
  set yard = 'rockford'
  where yard is null or btrim(yard) = '';

alter table public.vacation_entries
  alter column yard set default 'rockford';

alter table public.vacation_entries
  alter column yard set not null;

alter table public.vacation_entries
  drop constraint if exists vacation_entries_yard_check;

alter table public.vacation_entries
  add constraint vacation_entries_yard_check
  check (yard in ('rockford', 'chicago'));

create index if not exists vacation_entries_yard_week_idx
  on public.vacation_entries (yard, week_of);

-- Dispatch Board Loads-tab footer EOD aggregates (no truck rows).
-- Keep in sync with Load-Tracker-daily-eod-totals.sql (paste-ready one-shot).

create table if not exists public.daily_eod_totals (
  date date primary key,
  trash int not null default 0,
  leachate int not null default 0,
  walking_floor int not null default 0,
  loads int not null default 0,
  subs int not null default 0,
  source text not null default 'sheet-import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_eod_totals'
      and column_name = 'total_loads'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_eod_totals'
      and column_name = 'loads'
  ) then
    alter table public.daily_eod_totals rename column total_loads to loads;
  end if;
end $$;

alter table public.daily_eod_totals
  add column if not exists loads int not null default 0;

alter table public.daily_eod_totals
  add column if not exists subs int not null default 0;

comment on table public.daily_eod_totals is
  'Dispatch Board Loads-tab footer EOD aggregates per America/Chicago calendar day. Overrides TRASH / LEACHATE / WF / LOADS / SUBS without inventing truck rows. Sheet snapshot wins even when some load rows exist.';
comment on column public.daily_eod_totals.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.daily_eod_totals.trash is
  'Total MSW → TRASH bubble.';
comment on column public.daily_eod_totals.leachate is
  'Total Tank Loads → LEACHATE bubble.';
comment on column public.daily_eod_totals.walking_floor is
  'Total Walking-Floor Loads → WALKING-FLOOR / WF bubble.';
comment on column public.daily_eod_totals.loads is
  'Total Loads → LOADS bubble. Equals trash + leachate + walking_floor.';
comment on column public.daily_eod_totals.subs is
  'Total Sub Loads → SUBS bubble.';

alter table public.daily_eod_totals
  drop constraint if exists daily_eod_totals_source_check;

alter table public.daily_eod_totals
  add constraint daily_eod_totals_source_check
  check (source in ('sheet-import', 'manual', 'computed'));

alter table public.daily_eod_totals
  drop constraint if exists daily_eod_totals_counts_check;

alter table public.daily_eod_totals
  add constraint daily_eod_totals_counts_check
  check (
    trash >= 0
    and leachate >= 0
    and walking_floor >= 0
    and loads >= 0
    and subs >= 0
  );

alter table public.daily_eod_totals enable row level security;

drop policy if exists "crew_select_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_select_daily_eod_totals"
  on public.daily_eod_totals for select to authenticated using (true);

drop policy if exists "crew_insert_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_insert_daily_eod_totals"
  on public.daily_eod_totals for insert to authenticated with check (true);

drop policy if exists "crew_update_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_update_daily_eod_totals"
  on public.daily_eod_totals for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_daily_eod_totals" on public.daily_eod_totals;
create policy "crew_delete_daily_eod_totals"
  on public.daily_eod_totals for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.daily_eod_totals;
exception when duplicate_object then null;
end $$;

-- Driver tab Full + Sat rosters (per yard).
-- Keep in sync with Load-Tracker-driver-roster.sql (paste-ready one-shot).
-- System of record for Today’s available count (not Burnham!L13 / Sat-* sums).

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

alter table public.driver_roster_entries
  add column if not exists assigned_truck text;

comment on table public.driver_roster_entries is
  'Driver tab Full (hired) + Sat (planning) rosters per Chicago-area yard. Sync is upsert-only. Remote DELETE is explicit UI × only — never import, Vacation VAC, or a thin/empty pull. status = optional Full Roster unavailability (oot/fmla/vac/wc); later tally hired − full-day status − day offs.';
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

create index if not exists driver_roster_entries_hire_date_idx
  on public.driver_roster_entries (hire_date)
  where hire_date is not null;

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

-- Driver tab Gone archive (terminated / left).
-- Keep in sync with Load-Tracker-driver-gone.sql (paste-ready one-shot).
-- Sync is upsert-only. Remote DELETE is explicit UI × only.

create table if not exists public.driver_gone_entries (
  id uuid primary key default gen_random_uuid(),
  employee_number text,
  name text not null,
  hire_date date,
  termination_date date,
  notes text not null default '',
  yard text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.driver_gone_entries
  drop constraint if exists driver_gone_entries_yard_check;

alter table public.driver_gone_entries
  add constraint driver_gone_entries_yard_check
  check (yard is null or yard in ('burnham', 'rockford', 'pontiac', 'arc', 'zion'));

create index if not exists driver_gone_entries_term_idx
  on public.driver_gone_entries (termination_date desc nulls last, name);

comment on table public.driver_gone_entries is
  'Driver tab Gone archive. Terminated / left drivers. Sync is upsert-only. Remote DELETE is explicit UI × only — never import or a thin/empty pull. No contact fields.';

alter table public.driver_gone_entries enable row level security;

drop policy if exists "crew_select_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_select_driver_gone_entries"
  on public.driver_gone_entries for select to authenticated using (true);

drop policy if exists "crew_insert_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_insert_driver_gone_entries"
  on public.driver_gone_entries for insert to authenticated with check (true);

drop policy if exists "crew_update_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_update_driver_gone_entries"
  on public.driver_gone_entries for update to authenticated using (true) with check (true);

create or replace function public.driver_gone_deletes_allowed()
returns boolean
language sql
stable
as $$
  select true
$$;

comment on function public.driver_gone_deletes_allowed() is
  'Kill-switch for driver_gone_entries DELETE. Default true so UI × works. Set the body to select false to freeze all Gone deletes.';

grant execute on function public.driver_gone_deletes_allowed() to authenticated;

drop policy if exists "crew_delete_driver_gone_entries" on public.driver_gone_entries;
create policy "crew_delete_driver_gone_entries"
  on public.driver_gone_entries
  for delete
  to authenticated
  using (public.driver_gone_deletes_allowed());

do $$
begin
  alter publication supabase_realtime add table public.driver_gone_entries;
exception when duplicate_object then null;
end $$;

-- Day-locked truck ↔ driver on logged loads. public.loads already exists
-- from the original loads migration. Safe to re-run. Does not backfill.
alter table public.loads
  add column if not exists driver_name text;

comment on column public.loads.driver_name is
  'Full Roster driver name snapshotted at log / truck-edit time. Null when the truck was unassigned. Not a live roster link. Not EMP #.';

-- Customer tab lanes + 5-year contract books.
create table if not exists public.customer_lanes (
  id text primary key,
  customer text not null,
  destination text not null default '',
  commodity text not null default 'Trash (MSW)',
  effective_date date not null,
  tier1 numeric(10,2),
  tier2 numeric(10,2),
  tier3 numeric(10,2),
  tier4 numeric(10,2),
  tier5 numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists customer_lanes_book_idx
  on public.customer_lanes (lower(customer), lower(destination), lower(commodity), effective_date);

create index if not exists customer_lanes_customer_idx
  on public.customer_lanes (customer, destination);

comment on table public.customer_lanes is
  'Customer tab lanes. One row per customer + dest + commodity + contract start. Tiers 1-5 are dollars per load. Empty destination is a customer shell with no dest yet.';

alter table public.customer_lanes enable row level security;

drop policy if exists "crew_select_customer_lanes" on public.customer_lanes;
create policy "crew_select_customer_lanes"
  on public.customer_lanes for select to authenticated using (true);

drop policy if exists "crew_insert_customer_lanes" on public.customer_lanes;
create policy "crew_insert_customer_lanes"
  on public.customer_lanes for insert to authenticated with check (true);

drop policy if exists "crew_update_customer_lanes" on public.customer_lanes;
create policy "crew_update_customer_lanes"
  on public.customer_lanes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_customer_lanes" on public.customer_lanes;
create policy "crew_delete_customer_lanes"
  on public.customer_lanes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.customer_lanes;
exception when duplicate_object then null;
end $$;

alter table public.driver_roster_entries
  add column if not exists phone text;

comment on column public.driver_roster_entries.phone is
  'Optional Full Roster contact. Sat rows stay null.';

notify pgrst, 'reload schema';
