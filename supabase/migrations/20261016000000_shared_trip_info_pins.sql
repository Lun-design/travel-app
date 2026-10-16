-- Shared lodging/meeting shortcuts. Existing device-only preferences are not deleted.
begin;
create table if not exists public.trip_info_pins (
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_id uuid not null references public.itinerary_items(id) on delete cascade,
  kind text not null check (kind in ('hotel', 'meeting')),
  created_at timestamptz not null default now(),
  primary key (trip_id, item_id, kind)
);
alter table public.trip_info_pins enable row level security;
grant select, insert, delete on public.trip_info_pins to authenticated;
drop policy if exists trip_info_pins_read on public.trip_info_pins;
create policy trip_info_pins_read on public.trip_info_pins for select to authenticated
  using (private.is_trip_member(trip_id));
drop policy if exists trip_info_pins_insert on public.trip_info_pins;
create policy trip_info_pins_insert on public.trip_info_pins for insert to authenticated
  with check (private.can_edit_trip(trip_id) and exists (
    select 1 from public.itinerary_items i where i.id = item_id and i.trip_id = trip_info_pins.trip_id
  ));
drop policy if exists trip_info_pins_delete on public.trip_info_pins;
create policy trip_info_pins_delete on public.trip_info_pins for delete to authenticated
  using (private.can_edit_trip(trip_id));
alter table public.trip_info_pins replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.trip_info_pins;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.vouchers;
exception when duplicate_object then null;
end $$;
notify pgrst, 'reload schema';
commit;
