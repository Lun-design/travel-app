alter table public.itinerary_items add column if not exists position integer not null default 0;

with ranked as (
  select id, row_number() over (partition by day_number order by created_at asc, id) - 1 as new_position
  from public.itinerary_items
)
update public.itinerary_items as item
set position = ranked.new_position
from ranked
where item.id = ranked.id;

create index if not exists itinerary_items_day_position_idx
  on public.itinerary_items (trip_id, day_number, position);
