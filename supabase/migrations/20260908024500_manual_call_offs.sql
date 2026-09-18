-- Ad-hoc same-day call-offs entered on the Available drivers card.
-- Manual same-day call-offs stored in the app / Supabase.
-- Additive to Full Roster status; not a spreadsheet pull.

create table if not exists public.manual_call_offs (
  date date not null,
  name_key text not null,
  name text not null,
  kind text not null check (kind in ('call-off', 'p-day', 'okd-off', 'ncns', 'late-early')),
  created_at timestamptz not null default now(),
  primary key (date, name_key)
);

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
