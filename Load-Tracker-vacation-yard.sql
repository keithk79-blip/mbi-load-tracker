-- Vacation yard (Rockford vs Chicago). Safe to re-run.
-- Paste into Supabase SQL Editor after Load-Tracker-vacation.sql (or on a live
-- vacation board). Existing rows default to yard = 'rockford'.
-- Same DDL is in supabase/migrations/20260912053000_vacation_yard.sql
-- and folded into Load-Tracker-vacation.sql / Load-Tracker-sync-tables.sql.

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
