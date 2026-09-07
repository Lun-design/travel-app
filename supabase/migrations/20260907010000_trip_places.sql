-- Inspiration / bucket-list places that are not assigned to a day yet.
create table if not exists public.trip_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  address text,
  lat double precision,
  lng double precision,
  category text not null default 'spot',
  notes text,
  status text not null default 'saved' check (status in ('saved', 'scheduled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists trip_places_trip_status_idx
  on public.trip_places(trip_id, status, created_at desc);

alter table public.trip_places enable row level security;
grant select, insert, update, delete on public.trip_places to authenticated;

drop policy if exists trip_places_select_member on public.trip_places;
create policy trip_places_select_member on public.trip_places
  for select to authenticated
  using (private.is_trip_member(trip_id));

drop policy if exists trip_places_insert_member on public.trip_places;
create policy trip_places_insert_member on public.trip_places
  for insert to authenticated
  with check (
    private.is_trip_member(trip_id)
    and created_by = auth.uid()
  );

drop policy if exists trip_places_update_member on public.trip_places;
create policy trip_places_update_member on public.trip_places
  for update to authenticated
  using (private.is_trip_member(trip_id))
  with check (private.is_trip_member(trip_id));

drop policy if exists trip_places_delete_member on public.trip_places;
create policy trip_places_delete_member on public.trip_places
  for delete to authenticated
  using (private.is_trip_member(trip_id));
