-- Move one itinerary item between days and compact both day positions in one transaction.
create or replace function public.move_itinerary_item_to_day(
  p_item_id uuid,
  p_target_day_number integer
)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_trip_id uuid;
  v_source_day_number integer;
  v_trip_day_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_target_day_number is null or p_target_day_number < 1 then
    raise exception 'Invalid target day';
  end if;

  select item.trip_id, item.day_number
    into v_trip_id, v_source_day_number
  from public.itinerary_items as item
  where item.id = p_item_id;

  if v_trip_id is null then
    raise exception 'Itinerary item not found';
  end if;

  if not private.can_edit_trip(v_trip_id) then
    raise exception 'Not authorized to move this itinerary item';
  end if;

  select (trip.end_date - trip.start_date + 1)::integer
    into v_trip_day_count
  from public.trips as trip
  where trip.id = v_trip_id;

  if v_trip_day_count is null or p_target_day_number > v_trip_day_count then
    raise exception 'Target day is outside the trip date range';
  end if;

  if v_source_day_number = p_target_day_number then
    return;
  end if;

  -- Move affected positions below zero first so the final dense positions do
  -- not overlap the pre-move values if the schema later adds a uniqueness rule.
  update public.itinerary_items as item
  set position = -item.position - 1
  where item.trip_id = v_trip_id
    and item.day_number in (v_source_day_number, p_target_day_number);

  update public.itinerary_items as item
  set day_number = p_target_day_number
  where item.id = p_item_id
    and item.trip_id = v_trip_id;

  with ranked as (
    select item.id,
      (row_number() over (
        partition by item.day_number
        order by case when item.id = p_item_id then 1 else 0 end, item.position desc
      ) - 1)::integer as next_position
    from public.itinerary_items as item
    where item.trip_id = v_trip_id
      and item.day_number in (v_source_day_number, p_target_day_number)
  )
  update public.itinerary_items as item
  set position = ranked.next_position
  from ranked
  where item.id = ranked.id;
end;
$$;

revoke all on function public.move_itinerary_item_to_day(uuid, integer) from public;
grant execute on function public.move_itinerary_item_to_day(uuid, integer) to authenticated;
