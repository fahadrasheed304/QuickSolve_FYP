begin;

-- The application accesses Supabase data through its server-side service-role
-- client. Browser clients must not read or mutate public-schema tables directly.
do $$
declare
  table_row record;
begin
  for table_row in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      -- Leave extension-owned relations (for example PostGIS metadata) alone.
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    execute format('alter table public.%I enable row level security', table_row.relname);
    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_row.relname
    );
  end loop;
end $$;

commit;
