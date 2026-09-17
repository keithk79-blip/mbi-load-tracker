-- Per-date manual dispatch tallies shown next to "+ Log load" on Today.
-- batavia_preload: trailers a driver preloaded at Batavia the night before,
--   counted down by 1 each time one gets picked up.
-- evanston_asking: loads Evanston's transfer station said the night before
--   they need picked up the next day.

create table if not exists public.day_dispatch_tallies (
  date date primary key,
  batavia_preload int not null default 0,
  evanston_asking int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.day_dispatch_tallies
  add column if not exists batavia_preload int not null default 0;

alter table public.day_dispatch_tallies
  add column if not exists evanston_asking int not null default 0;

comment on table public.day_dispatch_tallies is
  'Manual per-day dispatch tallies shown on Today next to + Log load. Not derived from Loads.';
comment on column public.day_dispatch_tallies.date is
  'America/Chicago calendar day (YYYY-MM-DD).';
comment on column public.day_dispatch_tallies.batavia_preload is
  'Trailers preloaded at Batavia the night before, counted down as picked up.';
comment on column public.day_dispatch_tallies.evanston_asking is
  'Loads Evanston said the night before they need picked up.';

alter table public.day_dispatch_tallies
  drop constraint if exists day_dispatch_tallies_counts_check;

alter table public.day_dispatch_tallies
  add constraint day_dispatch_tallies_counts_check
  check (batavia_preload >= 0 and evanston_asking >= 0);

alter table public.day_dispatch_tallies enable row level security;

drop policy if exists "crew_select_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_select_day_dispatch_tallies"
  on public.day_dispatch_tallies for select to authenticated using (true);

drop policy if exists "crew_insert_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_insert_day_dispatch_tallies"
  on public.day_dispatch_tallies for insert to authenticated with check (true);

drop policy if exists "crew_update_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_update_day_dispatch_tallies"
  on public.day_dispatch_tallies for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_day_dispatch_tallies" on public.day_dispatch_tallies;
create policy "crew_delete_day_dispatch_tallies"
  on public.day_dispatch_tallies for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.day_dispatch_tallies;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
