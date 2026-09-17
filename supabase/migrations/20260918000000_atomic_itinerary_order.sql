-- Persist a complete day reorder atomically. The client sends the ordered
-- item ids/positions once instead of issuing one PATCH per card.
create or replace function public.update_itinerary_items_order(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_trip_id uuid;
  v_first_item_id uuid;
  v_expected integer;
  v_found integer;
  v_distinct_ids integer;
  v_distinct_positions integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  v_expected := jsonb_array_length(p_items);
  if v_expected = 0 then
    return;
  end if;

  select (entry->>'id')::uuid
    into v_first_item_id
  from jsonb_array_elements(p_items) as entry
  limit 1;

  select item.trip_id
    into v_trip_id
  from public.itinerary_items as item
  where item.id = v_first_item_id;

  if v_trip_id is null or not private.can_edit_trip(v_trip_id) then
    raise exception 'Not authorized to reorder this trip';
  end if;

  select count(*)
    into v_found
  from public.itinerary_items as item
  join jsonb_array_elements(p_items) as entry
    on item.id = (entry->>'id')::uuid
  where item.trip_id = v_trip_id;

  select count(distinct entry->>'id'), count(distinct (entry->>'position')::integer)
    into v_distinct_ids, v_distinct_positions
  from jsonb_array_elements(p_items) as entry;

  if v_found <> v_expected or v_distinct_ids <> v_expected or v_distinct_positions <> v_expected then
    raise exception 'Invalid itinerary order payload';
  end if;

  update public.itinerary_items as item
  set position = (entry->>'position')::integer
  from jsonb_array_elements(p_items) as entry
  where item.id = (entry->>'id')::uuid
    and item.trip_id = v_trip_id;
end;
$$;

revoke all on function public.update_itinerary_items_order(jsonb) from public;
grant execute on function public.update_itinerary_items_order(jsonb) to authenticated;
