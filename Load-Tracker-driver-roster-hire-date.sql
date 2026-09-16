-- Full Roster hire / start date + Years of Service tag.
-- Paste into Supabase SQL Editor and Run once. Safe to re-run.
-- Same DDL is in supabase/migrations/20260916010000_driver_roster_hire_date.sql
-- and Load-Tracker-sync-tables.sql.

alter table public.driver_roster_entries
  add column if not exists hire_date date;

comment on column public.driver_roster_entries.hire_date is
  'Full Roster start date (America/Chicago). Null until known. Sat rows stay null.';

create index if not exists driver_roster_entries_hire_date_idx
  on public.driver_roster_entries (hire_date)
  where hire_date is not null;

notify pgrst, 'reload schema';
