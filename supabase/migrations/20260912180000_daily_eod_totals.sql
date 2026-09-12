-- Per-date End-of-Day aggregates from the Dispatch Board Loads tab footer.
-- Overrides TRASH / LEACHATE / WALKING-FLOOR / LOADS / SUBS without inventing truck rows.
-- Sheet snapshot wins even when some load rows already exist for that date.

create table if not exists public.daily_eod_totals (
  date date primary key,
  trash int not null default 0,
  leachate int not null default 0,
  walking_floor int not null default 0,
  loads int not null default 0,
  subs int not null default 0,
  source text not null default 'sheet-import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_eod_totals'
      and column_name = 'total_loads'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_eod_totals'
      and column_name = 'loads'
  ) then
    alter table public.daily_eod_totals rename column total_loads to loads;
  end if;
end $$;

alter table public.daily_eod_totals
  add column if not exists loads int not null default 0;

alter table public.daily_eod_totals
  add column if not exists subs int not null default 0;

comment on table public.daily_eod_totals is
  'Dispatch Board Loads-tab footer EOD aggregates per America/Chicago calendar day. Overrides TRASH / LEACHATE / WF / LOADS / SUBS without inventing truck rows. Sheet snapshot wins even when some load rows exist.';
comment on column public.daily_eod_totals.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.daily_eod_totals.trash is
  'Total MSW → TRASH bubble.';
comment on column public.daily_eod_totals.leachate is
  'Total Tank Loads → LEACHATE bubble.';
comment on column public.daily_eod_totals.walking_floor is
  'Total Walking-Floor Loads → WALKING-FLOOR / WF bubble.';
comment on column public.daily_eod_totals.loads is
  'Total Loads → LOADS bubble. Equals trash + leachate + walking_floor.';
comment on column public.daily_eod_totals.subs is
  'Total Sub Loads → SUBS bubble.';

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
    and loads >= 0
    and subs >= 0
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
