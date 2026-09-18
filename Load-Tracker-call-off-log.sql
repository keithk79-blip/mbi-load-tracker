-- Run once in the Supabase SQL editor if the Call-Off's tab cannot sync.
-- Spreadsheet-style call-off / P-Day / notation log.

create table if not exists public.call_off_log (
  id text primary key,
  name text not null,
  start_date date not null,
  end_date date,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists call_off_log_start_idx
  on public.call_off_log (start_date);

alter table public.call_off_log enable row level security;

drop policy if exists "crew_select_call_off_log" on public.call_off_log;
create policy "crew_select_call_off_log"
  on public.call_off_log for select
  to authenticated
  using (true);

drop policy if exists "crew_insert_call_off_log" on public.call_off_log;
create policy "crew_insert_call_off_log"
  on public.call_off_log for insert
  to authenticated
  with check (true);

drop policy if exists "crew_update_call_off_log" on public.call_off_log;
create policy "crew_update_call_off_log"
  on public.call_off_log for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "crew_delete_call_off_log" on public.call_off_log;
create policy "crew_delete_call_off_log"
  on public.call_off_log for delete
  to authenticated
  using (true);
