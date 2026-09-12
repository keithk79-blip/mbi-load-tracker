-- Driver tab Gone archive (terminated / left). Shared across desktop/web/phone.
-- Paste into Supabase SQL Editor and Run once.
-- Same DDL is in supabase/migrations/20260912300000_driver_gone.sql
-- and Load-Tracker-sync-tables.sql.
--
-- Import only emp #, name, hire date, termination date, notes.
-- Sheet contact columns are discarded and are not persisted.
--
-- Sync is upsert-only. Remote DELETE is explicit UI × only — never a
-- thin/empty pull or a later sheet seed. Flip driver_gone_deletes_allowed()
-- to `select false` to freeze all Gone deletes while investigating a wipe.
--
-- After Run: open a signed-in client so an empty Gone list can seed from
-- the Gone 2026 sheet (or a termination write can upload), then hard-refresh
-- other devices.

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
comment on column public.driver_gone_entries.employee_number is
  'Employee number as text (leading zeros stripped). Nullable.';
comment on column public.driver_gone_entries.hire_date is
  'Hire date (America/Chicago calendar). Nullable when unknown.';
comment on column public.driver_gone_entries.termination_date is
  'Last day / termination date (America/Chicago calendar). Nullable.';
comment on column public.driver_gone_entries.notes is
  'Laid Off / Quit / Term / Retired text. Contact-looking tokens are stripped client-side.';
comment on column public.driver_gone_entries.yard is
  'Optional last yard when known (full-roster termination). Gone 2026 sheet has no yard — null.';

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

notify pgrst, 'reload schema';
