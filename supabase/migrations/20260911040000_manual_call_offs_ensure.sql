-- Idempotent ensure: table + late-early CHECK + RLS + realtime + PostgREST schema reload.
-- Production was missing public.manual_call_offs (PGRST205). Safe to re-run.
-- Paste-ready copy: Load-Tracker-manual-call-offs.sql

create table if not exists public.manual_call_offs (
  date date not null,
  name_key text not null,
  name text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (date, name_key)
);

alter table public.manual_call_offs
  drop constraint if exists manual_call_offs_kind_check;

alter table public.manual_call_offs
  add constraint manual_call_offs_kind_check
  check (kind in ('call-off', 'p-day', 'okd-off', 'ncns', 'late-early'));

create index if not exists manual_call_offs_date_idx
  on public.manual_call_offs (date);

alter table public.manual_call_offs enable row level security;

drop policy if exists "crew_select_manual_call_offs" on public.manual_call_offs;
create policy "crew_select_manual_call_offs"
  on public.manual_call_offs for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_manual_call_offs" on public.manual_call_offs;
create policy "crew_insert_manual_call_offs"
  on public.manual_call_offs for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_manual_call_offs" on public.manual_call_offs;
create policy "crew_update_manual_call_offs"
  on public.manual_call_offs for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_manual_call_offs" on public.manual_call_offs;
create policy "crew_delete_manual_call_offs"
  on public.manual_call_offs for delete
  to authenticated
  using (true);

do $$
begin
  alter publication supabase_realtime add table public.manual_call_offs;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
