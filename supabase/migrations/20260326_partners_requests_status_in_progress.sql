-- Allow an in-progress state for partner applications.
do $$
declare
  status_constraint text;
begin
  if to_regclass('public.partners_requests') is null then
    return;
  end if;

  for status_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'partners_requests'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.partners_requests drop constraint if exists %I', status_constraint);
  end loop;
end $$;

update public.partners_requests
set status = case
  when status in ('pending', 'in_progress', 'approved', 'rejected') then status
  when status in ('in_review', 'under_review', 'processing', 'under_execution') then 'in_progress'
  else 'pending'
end;

alter table if exists public.partners_requests
  drop constraint if exists partners_requests_status_check;

alter table if exists public.partners_requests
  add constraint partners_requests_status_check
  check (status in ('pending', 'in_progress', 'approved', 'rejected'));
