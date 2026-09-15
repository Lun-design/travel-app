-- Persist the first Google Places photo reference so cards can resolve images
-- consistently across devices without storing a large image payload.
alter table public.itinerary_items
  add column if not exists photo_reference text;

alter table public.trip_places
  add column if not exists photo_reference text;

comment on column public.itinerary_items.photo_reference is
  'Google Places photo reference used to build a thumbnail URL at render time';

comment on column public.trip_places.photo_reference is
  'Google Places photo reference used to build a thumbnail URL at render time';
