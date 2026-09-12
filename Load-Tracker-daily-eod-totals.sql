-- Per-date End-of-Day aggregates from the Dispatch Board Loads tab.
-- Use this for 2026 history until truck-by-truck transfer stations are imported.
-- These four numbers override TRASH / LEACHATE / WALKING-FLOOR / LOADS bubbles.
-- They never create or delete load rows.
--
-- Paste into Supabase SQL Editor and Run once.
-- Same DDL is in supabase/migrations/20260912180000_daily_eod_totals.sql
-- and Load-Tracker-sync-tables.sql.
--
-- After Run: signed-in desktop/web/phone clients pull the table on the next
-- refresh (or immediately via Realtime). Hard-refresh other devices if needed.

create table if not exists public.daily_eod_totals (
  date date primary key,
  trash int not null default 0,
  leachate int not null default 0,
  walking_floor int not null default 0,
  total_loads int not null default 0,
  source text not null default 'sheet-import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.daily_eod_totals is
  'Dispatch Board Loads-tab EOD aggregates per America/Chicago calendar day. Overrides app TRASH / LEACHATE / WF / LOADS bubbles without inventing truck rows.';
comment on column public.daily_eod_totals.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.daily_eod_totals.trash is
  'Total MSW → TRASH bubble.';
comment on column public.daily_eod_totals.leachate is
  'Total Tank Loads → LEACHATE bubble.';
comment on column public.daily_eod_totals.walking_floor is
  'Total Walking-Floor Loads → WALKING-FLOOR / WF bubble.';
comment on column public.daily_eod_totals.total_loads is
  'Total Loads → LOADS bubble.';

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
    and total_loads >= 0
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

notify pgrst, 'reload schema';

-- Example: one Chicago calendar day from the Dispatch Board Loads tab.
-- Re-run with new numbers to update that date.
--
-- insert into public.daily_eod_totals (
--   date, trash, leachate, walking_floor, total_loads, source
-- ) values (
--   '2026-01-05',  -- America/Chicago calendar day
--   142,           -- Total MSW → TRASH
--   18,            -- Total Tank Loads → LEACHATE
--   24,            -- Total Walking-Floor Loads → WF
--   184,           -- Total Loads → LOADS
--   'sheet-import'
-- )
-- on conflict (date) do update set
--   trash = excluded.trash,
--   leachate = excluded.leachate,
--   walking_floor = excluded.walking_floor,
--   total_loads = excluded.total_loads,
--   source = excluded.source,
--   updated_at = now();
