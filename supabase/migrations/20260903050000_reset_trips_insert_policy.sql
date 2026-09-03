-- 清除 public.trips 上所有既有 INSERT policy，避免不同 migration 造成設定漂移。
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trips'
      and cmd = 'INSERT'
  loop
    execute format('drop policy if exists %I on public.trips', policy_record.policyname);
  end loop;
end
$$;

create policy trips_insert_policy
on public.trips
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = created_by);

grant usage on schema public to authenticated;
grant insert, select on table public.trips to authenticated;
