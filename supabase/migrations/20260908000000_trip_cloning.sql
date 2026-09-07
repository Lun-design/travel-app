-- Atomic trip cloning for authenticated users.
-- A user may clone a trip they belong to, or a trip exposed by an active
-- public share token. Expenses, vouchers, and member rows are intentionally
-- excluded: they contain private payer/member data or private storage files.
create or replace function public.clone_trip_by_id(
  p_trip_id uuid,
  p_share_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.trips;
  v_new_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_source
  from public.trips
  where id = p_trip_id
    and (
      private.is_trip_member(id)
      or (
        nullif(trim(coalesce(p_share_token, '')), '') is not null
        and exists (
          select 1
          from public.trip_shares share
          where share.trip_id = id
            and share.share_token = trim(p_share_token)
            and share.is_active = true
        )
      )
    )
  limit 1;

  if not found then
    raise exception 'Trip not found or access denied';
  end if;

  insert into public.trips (
    created_by,
    title,
    destination,
    start_date,
    end_date,
    default_departure_time,
    timezone
  )
  values (
    auth.uid(),
    v_source.title || '（副本）',
    v_source.destination,
    v_source.start_date,
    v_source.end_date,
    v_source.default_departure_time,
    v_source.timezone
  )
  returning id into v_new_trip_id;

  insert into public.itinerary_items (
    trip_id,
    created_by,
    day_number,
    position,
    time,
    location_name,
    address,
    latitude,
    longitude,
    notes,
    category,
    duration_minutes,
    difficulty,
    opening_hours
  )
  select
    v_new_trip_id,
    auth.uid(),
    item.day_number,
    item.position,
    item.time,
    item.location_name,
    item.address,
    item.latitude,
    item.longitude,
    item.notes,
    item.category,
    item.duration_minutes,
    item.difficulty,
    item.opening_hours
  from public.itinerary_items item
  where item.trip_id = v_source.id;

  insert into public.trip_places (
    trip_id,
    title,
    address,
    lat,
    lng,
    category,
    notes,
    status,
    created_by
  )
  select
    v_new_trip_id,
    place.title,
    place.address,
    place.lat,
    place.lng,
    place.category,
    place.notes,
    place.status,
    auth.uid()
  from public.trip_places place
  where place.trip_id = v_source.id;

  insert into public.packing_items (
    trip_id,
    category,
    name,
    is_checked,
    assigned_to,
    item_name,
    is_packed
  )
  select
    v_new_trip_id,
    item.category,
    item.name,
    false,
    null,
    item.item_name,
    false
  from public.packing_items item
  where item.trip_id = v_source.id;

  insert into public.trip_budgets (trip_id, total_amount, currency, updated_by)
  select v_new_trip_id, budget.total_amount, budget.currency, auth.uid()
  from public.trip_budgets budget
  where budget.trip_id = v_source.id;

  return v_new_trip_id;
end;
$$;

revoke all on function public.clone_trip_by_id(uuid, text) from public;
grant execute on function public.clone_trip_by_id(uuid, text) to authenticated;

