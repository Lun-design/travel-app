-- Allow general commonly-used places in the existing shared trip information list.
begin;
alter table public.trip_info_pins drop constraint if exists trip_info_pins_kind_check;
alter table public.trip_info_pins
  add constraint trip_info_pins_kind_check check (kind in ('hotel', 'meeting', 'place'));
notify pgrst, 'reload schema';
commit;
