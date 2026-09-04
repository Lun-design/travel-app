alter table public.trips
  add column if not exists default_departure_time time;

alter table public.itinerary_items
  add column if not exists opening_hours jsonb;

alter table public.itinerary_items
  alter column duration_minutes set default 60;

comment on column public.itinerary_items.opening_hours is
  'Weekly hours: {"monday":{"closed":false,"periods":[{"open":"09:00","close":"18:00"}]}}';
