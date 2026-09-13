-- Full Roster assigned truck (unit), separate from EMP # (truck_number).
-- Paste into Supabase SQL Editor and Run once. Safe to re-run.
-- Same DDL is in supabase/migrations/20260913150000_driver_roster_assigned_truck.sql
-- and Load-Tracker-sync-tables.sql.
--
-- truck_number stays the employee number. assigned_truck is the unit Keith
-- types on Full Roster and looks up from day / truck search.

alter table public.driver_roster_entries
  add column if not exists assigned_truck text;

comment on column public.driver_roster_entries.truck_number is
  'Employee number as text (leading zeros stripped). Column name stays truck_number. Nullable. Not the unit / truck.';
comment on column public.driver_roster_entries.assigned_truck is
  'Full Roster unit / truck assignment (digits or broker code). Separate from EMP #. Sat rows stay null.';

create index if not exists driver_roster_entries_assigned_truck_idx
  on public.driver_roster_entries (assigned_truck)
  where assigned_truck is not null;

notify pgrst, 'reload schema';
