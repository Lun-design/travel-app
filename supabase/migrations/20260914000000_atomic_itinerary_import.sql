-- One transaction for merge/overwrite/clear. RLS remains active, including
-- owner-only date expansion. A failed insert rolls back all earlier deletes.
create or replace function public.import_itinerary_items(
  p_trip_id uuid,
  p_mode text,
  p_items jsonb default '[]'::jsonb,
  p_day_count integer default 0
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare
  v_trip public.trips;
  v_item jsonb;
  v_day integer;
  v_time time;
  v_title text;
  v_position integer;
  v_saved integer := 0;
  v_skipped integer := 0;
  v_removed integer := 0;
  v_days integer := p_day_count;
  v_result jsonb;
begin
  if auth.uid() is null or not private.can_edit_trip(p_trip_id) then
    raise exception '只有行程擁有者或編輯者可以匯入或清空景點' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('merge', 'overwrite', 'clear') then
    raise exception 'Invalid import mode';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be an array'; end if;
  if p_mode <> 'clear' and jsonb_array_length(p_items) = 0 then raise exception 'Empty import rejected'; end if;
  if p_day_count is null or p_day_count < 0 or p_day_count > 3660 then raise exception 'Invalid day count'; end if;

  -- Serialize imports for the same trip; independent trips are unaffected.
  perform pg_advisory_xact_lock(hashtextextended(p_trip_id::text, 0));
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then raise exception 'Trip not found'; end if;

  if p_mode = 'overwrite' then
    delete from public.itinerary_items where trip_id = p_trip_id;
    get diagnostics v_removed = row_count;
  end if;

  if p_mode in ('overwrite', 'clear') then
    if p_mode = 'clear' then
      delete from public.itinerary_items where trip_id = p_trip_id;
      get diagnostics v_removed = row_count;
    end if;
  end if;

  if p_mode <> 'clear' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      v_title := nullif(btrim(v_item->>'location_name'), '');
      v_day := (v_item->>'day_number')::integer;
      v_time := nullif(v_item->>'time', '')::time;
      if v_title is null or v_day is null or v_day < 1 or v_day > 3660 then raise exception 'Invalid itinerary item'; end if;
      v_days := greatest(v_days, v_day);
      if exists (
        select 1 from public.itinerary_items i
        where i.trip_id = p_trip_id and i.day_number = v_day
          and regexp_replace(lower(i.location_name), '[[:space:][:punct:]]', '', 'g') = regexp_replace(lower(v_title), '[[:space:][:punct:]]', '', 'g')
          and i.time is not distinct from v_time
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      select coalesce(max(position), -1) + 1 into v_position from public.itinerary_items where trip_id = p_trip_id and day_number = v_day;
      insert into public.itinerary_items(trip_id, created_by, day_number, position, time, location_name, address, latitude, longitude, duration_minutes, category, notes)
      values(p_trip_id, auth.uid(), v_day, v_position, v_time, v_title,
        nullif(v_item->>'address', ''), (v_item->>'latitude')::double precision, (v_item->>'longitude')::double precision,
        coalesce((v_item->>'duration_minutes')::integer, 60), coalesce(nullif(v_item->>'category', ''), 'spot'), nullif(v_item->>'notes', ''));
      v_saved := v_saved + 1;
    end loop;
    if v_trip.start_date + (v_days - 1) > v_trip.end_date then
      update public.trips set end_date = v_trip.start_date + (v_days - 1) where id = p_trip_id;
      if not found then raise exception '延長行程天數需要擁有者權限，請先調整行程日期' using errcode = '42501'; end if;
    end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.day_number, i.time nulls last, i.position), '[]'::jsonb)
    into v_result from public.itinerary_items i where i.trip_id = p_trip_id;
  select * into v_trip from public.trips where id = p_trip_id;
  return jsonb_build_object('items', v_result, 'trip', to_jsonb(v_trip), 'saved', v_saved, 'skipped', v_skipped, 'removed', v_removed);
end;
$$;
revoke all on function public.import_itinerary_items(uuid, text, jsonb, integer) from public;
grant execute on function public.import_itinerary_items(uuid, text, jsonb, integer) to authenticated;
