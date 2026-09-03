-- 重新建立 owner trigger：由資料庫擁有者執行，避免 trip_members RLS
-- 阻擋建立 trips 後的第一筆 owner 成員資料。
create or replace function public.add_trip_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

alter function public.add_trip_owner() security definer;
alter function public.add_trip_owner() set search_path = public, pg_temp;
revoke all on function public.add_trip_owner() from public;

drop trigger if exists trips_add_owner on public.trips;
create trigger trips_add_owner
after insert on public.trips
for each row execute function public.add_trip_owner();

-- 保持成員管理安全：只有已是 owner 的使用者能手動新增成員。
drop policy if exists members_insert_owner on public.trip_members;
create policy members_insert_owner
on public.trip_members
for insert
to authenticated
with check (private.is_trip_owner(trip_id));

grant usage on schema public to authenticated;
grant insert, select on table public.trips to authenticated;
grant select on table public.trip_members to authenticated;
