-- Vacation calendar (week rows + driver names, per yard). Shared across desktop/web/phone.
-- Paste into Supabase SQL Editor and Run once.
-- Same DDL is in supabase/migrations/20260912040000_vacation_calendar.sql
-- and Load-Tracker-sync-tables.sql. Yard add-on (existing DBs): Load-Tracker-vacation-yard.sql.
--
-- After Run: open a signed-in desktop/web client so 2025–2026 seed weeks upload,
-- then hard-refresh other devices.

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

notify pgrst, 'reload schema';
