-- Full Roster assigned truck (unit), separate from EMP # (truck_number).
-- Paste-ready copy: Load-Tracker-driver-roster-assigned-truck.sql

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
