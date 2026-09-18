-- Customer tab: lanes + 5-year contract rate books.
-- Paste into Supabase SQL Editor and Run once.
-- Same DDL is in supabase/migrations/20260917010000_customer_lanes.sql
-- and Load-Tracker-sync-tables.sql.

create table if not exists public.customer_lanes (
  id text primary key,
  customer text not null,
  destination text not null default '',
  commodity text not null default 'Trash (MSW)',
  effective_date date not null,
  tier1 numeric(10,2),
  tier2 numeric(10,2),
  tier3 numeric(10,2),
  tier4 numeric(10,2),
  tier5 numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists customer_lanes_book_idx
  on public.customer_lanes (lower(customer), lower(destination), lower(commodity), effective_date);

create index if not exists customer_lanes_customer_idx
  on public.customer_lanes (customer, destination);

comment on table public.customer_lanes is
  'Customer tab lanes. One row per customer + dest + commodity + contract start. Tiers 1-5 are dollars per load. Empty destination is a customer shell with no dest yet.';

alter table public.customer_lanes enable row level security;

drop policy if exists "crew_select_customer_lanes" on public.customer_lanes;
create policy "crew_select_customer_lanes"
  on public.customer_lanes for select to authenticated using (true);

drop policy if exists "crew_insert_customer_lanes" on public.customer_lanes;
create policy "crew_insert_customer_lanes"
  on public.customer_lanes for insert to authenticated with check (true);

drop policy if exists "crew_update_customer_lanes" on public.customer_lanes;
create policy "crew_update_customer_lanes"
  on public.customer_lanes for update to authenticated using (true) with check (true);

drop policy if exists "crew_delete_customer_lanes" on public.customer_lanes;
create policy "crew_delete_customer_lanes"
  on public.customer_lanes for delete to authenticated using (true);

do $$
begin
  alter publication supabase_realtime add table public.customer_lanes;
exception when duplicate_object then null;
end $$;

alter table public.driver_roster_entries
  add column if not exists phone text;

comment on column public.driver_roster_entries.phone is
  'Optional Full Roster contact. Sat rows stay null.';

notify pgrst, 'reload schema';
