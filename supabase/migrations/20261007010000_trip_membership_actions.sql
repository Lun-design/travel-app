create or replace function public.leave_trip(p_trip_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select tm.role into v_role
  from public.trip_members tm
  where tm.trip_id = p_trip_id and tm.user_id = auth.uid();

  if v_role is null then
    return false;
  end if;
  if v_role = 'owner' then
    raise exception 'Trip owner cannot leave without transferring ownership';
  end if;

  delete from public.trip_members
  where trip_id = p_trip_id and user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.leave_trip(uuid) from public;
grant execute on function public.leave_trip(uuid) to authenticated;
