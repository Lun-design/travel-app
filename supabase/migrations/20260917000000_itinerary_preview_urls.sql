-- Keep user-selected itinerary photos in the database so every device can
-- render the same preview without relying on a local React state value.
alter table public.itinerary_items
  add column if not exists preview_url text;

comment on column public.itinerary_items.preview_url is
  'User-selected preview/full image URL for an itinerary spot';
