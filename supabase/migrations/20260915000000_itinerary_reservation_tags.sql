alter table public.itinerary_items
  add column if not exists reservation_tags jsonb not null default '[]'::jsonb;

alter table public.itinerary_items
  drop constraint if exists itinerary_items_reservation_tags_array_check;
alter table public.itinerary_items
  add constraint itinerary_items_reservation_tags_array_check
  check (jsonb_typeof(reservation_tags) = 'array');
