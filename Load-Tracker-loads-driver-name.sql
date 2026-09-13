-- Optional snapshotted driver name on each load (day-locked truck ↔ driver).
-- Paste into Supabase SQL Editor and Run once. Safe to re-run.
-- Same DDL is in supabase/migrations/20260913180000_loads_driver_name.sql
-- and Load-Tracker-sync-tables.sql.
--
-- Does NOT backfill old rows from current Full Roster (that would rewrite
-- history). Existing loads stay without a name until Keith edits the truck
-- on that load. Sync never deletes remote loads.

alter table public.loads
  add column if not exists driver_name text;

comment on column public.loads.driver_name is
  'Full Roster driver name snapshotted at log / truck-edit time. Null when the truck was unassigned. Not a live roster link. Not EMP #.';

notify pgrst, 'reload schema';
