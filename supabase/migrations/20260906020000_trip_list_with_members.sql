-- Aggregate the home-screen trip cards and their member previews in one request.
-- SECURITY INVOKER keeps the existing trips/trip_members/profiles RLS policies active.
create or replace function public.list_trips_with_members()
returns table (
  id uuid,
  title text,
  destination text,
  start_date date,
  end_date date,
  invite_code text,
  created_by uuid,
  default_departure_time time,
  timezone text,
  members jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id,
    t.title,
    t.destination,
    t.start_date,
    t.end_date,
    t.invite_code,
    t.created_by,
    t.default_departure_time,
    t.timezone,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'trip_id', tm.trip_id,
          'user_id', tm.user_id,
          'role', tm.role,
          'joined_at', tm.joined_at,
          'profile', jsonb_build_object(
            'display_name', p.display_name,
            'avatar_url', p.avatar_url
          )
        ) order by tm.joined_at
      ) filter (where tm.user_id is not null),
      '[]'::jsonb
    ) as members
  from public.trips t
  left join public.trip_members tm on tm.trip_id = t.id
  left join public.profiles p on p.id = tm.user_id
  where private.is_trip_member(t.id)
  group by t.id, t.title, t.destination, t.start_date, t.end_date,
    t.invite_code, t.created_by, t.default_departure_time, t.timezone
  order by t.start_date asc, t.id asc;
$$;

grant execute on function public.list_trips_with_members() to authenticated;
