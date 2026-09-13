-- Optional snapshotted driver name on each load (day-locked truck ↔ driver).
-- Paste-ready copy: Load-Tracker-loads-driver-name.sql

alter table public.loads
  add column if not exists driver_name text;

comment on column public.loads.driver_name is
  'Full Roster driver name snapshotted at log / truck-edit time. Null when the truck was unassigned. Not a live roster link. Not EMP #.';

notify pgrst, 'reload schema';
