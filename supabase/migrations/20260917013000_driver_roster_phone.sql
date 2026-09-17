alter table public.driver_roster_entries
  add column if not exists phone text;

comment on column public.driver_roster_entries.phone is
  'Optional Full Roster contact. Sat rows stay null.';
