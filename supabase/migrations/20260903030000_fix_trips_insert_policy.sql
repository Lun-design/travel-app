-- 確保 authenticated 具有進入 RLS 判斷前的基本權限
grant usage on schema public to authenticated;
grant insert, select on table public.trips to authenticated;

-- 以目前 session 的 auth.uid() 作為唯一建立者判斷
drop policy if exists trips_insert_creator on public.trips;
create policy trips_insert_creator
on public.trips
for insert
to authenticated
with check ((select auth.uid()) = created_by);
