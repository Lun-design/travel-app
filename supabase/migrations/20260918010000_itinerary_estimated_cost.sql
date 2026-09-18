alter table public.itinerary_items
  add column if not exists estimated_cost numeric(12, 2);

alter table public.itinerary_items
  drop constraint if exists itinerary_items_estimated_cost_check;

alter table public.itinerary_items
  add constraint itinerary_items_estimated_cost_check
  check (estimated_cost is null or estimated_cost >= 0);

comment on column public.itinerary_items.estimated_cost is
  'Optional per-stop estimated spend in the trip budget currency (normally TWD).';
