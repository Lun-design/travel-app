-- Ensure every authenticated trip member can load trips on the home screen.
grant usage on schema public, private to authenticated;
grant select on table public.trips, public.trip_members, public.profiles to authenticated;
grant execute on function private.is_trip_member(uuid) to authenticated;

drop policy if exists trips_select_member on public.trips;
drop policy if exists trips_select_policy on public.trips;
drop policy if exists trips_select_authenticated_member on public.trips;

create policy trips_select_authenticated_member
on public.trips
for select
to authenticated
using (
  (select auth.uid()) = created_by
  or private.is_trip_member(id)
);

drop policy if exists members_select_member on public.trip_members;
drop policy if exists members_select_authenticated on public.trip_members;
create policy members_select_authenticated
on public.trip_members
for select
to authenticated
using (private.is_trip_member(trip_id));

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);
