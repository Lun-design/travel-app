-- Fix trips SELECT policy for creators and members.
grant usage on schema public to authenticated;

drop policy if exists trips_select_member on public.trips;
drop policy if exists trips_select_policy on public.trips;

create policy trips_select_policy
on public.trips
for select
to authenticated
using (
  created_by = auth.uid()
  or private.is_trip_member(id)
);

grant select on table public.trips to authenticated;
