-- Driver roster DELETE kill-switch (safe to re-run).
-- Paste into Supabase SQL Editor if public.driver_roster_entries already exists.
-- Same DDL is in supabase/migrations/20260912220000_driver_roster_no_auto_delete.sql
-- and Load-Tracker-sync-tables.sql / Load-Tracker-driver-roster.sql.
--
-- App sync / sheet import / Vacation auto-VAC must never DELETE roster rows.
-- The only client DELETE is an explicit UI ×. Flip this function to
-- `select false` to block every roster delete (including UI) while
-- investigating a wipe.

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

comment on table public.driver_roster_entries is
  'Driver tab Full (hired) + Sat (planning) rosters per Chicago-area yard. Sync is upsert-only. Remote DELETE is explicit UI × only — never import, Vacation VAC, or a thin/empty pull. status = optional Full Roster unavailability (oot/fmla/vac/wc).';

notify pgrst, 'reload schema';
