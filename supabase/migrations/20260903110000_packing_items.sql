create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade not null,
  category text not null default '未分類', name text not null, is_checked boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.packing_items enable row level security;
grant select, insert, update, delete on public.packing_items to authenticated;
drop policy if exists "Trip members can view and manage packing items" on public.packing_items;
create policy "Trip members can view and manage packing items" on public.packing_items
  for all to authenticated using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id));
create index if not exists packing_items_trip_category_idx on public.packing_items(trip_id, category, created_at);
