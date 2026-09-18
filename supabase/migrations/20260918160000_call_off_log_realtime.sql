-- call_off_log was created with RLS but never added to supabase_realtime.
-- CallOffLogContext subscribed to postgres_changes, so device B never saw
-- Call-Off's tab edits until a hard reload.

do $$
begin
  alter publication supabase_realtime add table public.call_off_log;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;
