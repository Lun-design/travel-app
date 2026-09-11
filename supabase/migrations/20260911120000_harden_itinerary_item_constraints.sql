-- Keep the editor's advanced categories compatible with every environment,
-- including databases created before the itinerary extension migration.
-- Invalid legacy values are normalized before the CHECK constraints are
-- re-applied so deployment remains safe and atomic.
update public.itinerary_items
set category = 'spot'
where category is null
   or category not in ('flight', 'food', 'spot', 'hotel', 'trail', 'outdoor');

update public.itinerary_items
set difficulty = null
where difficulty is not null
  and difficulty not in ('easy', 'moderate', 'hard');

alter table public.itinerary_items
  drop constraint if exists itinerary_items_category_check;
alter table public.itinerary_items
  add constraint itinerary_items_category_check
  check (category in ('flight', 'food', 'spot', 'hotel', 'trail', 'outdoor'));

alter table public.itinerary_items
  drop constraint if exists itinerary_items_difficulty_check;
alter table public.itinerary_items
  add constraint itinerary_items_difficulty_check
  check (difficulty is null or difficulty in ('easy', 'moderate', 'hard'));

alter table public.itinerary_items
  drop constraint if exists itinerary_items_duration_minutes_check;
alter table public.itinerary_items
  add constraint itinerary_items_duration_minutes_check
  check (duration_minutes is null or duration_minutes > 0);
