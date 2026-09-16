alter table public.driver_roster_entries
  add column if not exists hire_date date;

comment on column public.driver_roster_entries.hire_date is
  'Full Roster start date (America/Chicago). Null until known. Sat rows stay null.';

create index if not exists driver_roster_entries_hire_date_idx
  on public.driver_roster_entries (hire_date)
  where hire_date is not null;
