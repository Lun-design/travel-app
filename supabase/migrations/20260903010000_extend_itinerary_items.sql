alter table public.itinerary_items add column if not exists duration_minutes integer check (duration_minutes is null or duration_minutes > 0);
alter table public.itinerary_items add column if not exists difficulty text;
alter table public.itinerary_items drop constraint if exists itinerary_items_category_check;
alter table public.itinerary_items add constraint itinerary_items_category_check check (category in ('flight', 'food', 'spot', 'hotel', 'trail', 'outdoor'));
alter table public.itinerary_items add constraint itinerary_items_difficulty_check check (difficulty is null or difficulty in ('easy', 'moderate', 'hard'));
