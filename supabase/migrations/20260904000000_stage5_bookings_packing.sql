-- Stage 5: reservation/ticket vouchers and backwards-compatible packing fields.

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  item_id uuid references public.itinerary_items(id) on delete set null,
  title text not null,
  file_url text,
  file_type text not null check (file_type in ('image', 'pdf')),
  file_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists vouchers_trip_created_idx on public.vouchers(trip_id, created_at desc);
create index if not exists vouchers_item_idx on public.vouchers(item_id);

alter table public.vouchers enable row level security;
grant select, insert, update, delete on public.vouchers to authenticated;

drop policy if exists vouchers_select_member on public.vouchers;
create policy vouchers_select_member on public.vouchers
  for select to authenticated
  using (private.is_trip_member(trip_id));

drop policy if exists vouchers_insert_editor on public.vouchers;
create policy vouchers_insert_editor on public.vouchers
  for insert to authenticated
  with check (
    private.can_edit_trip(trip_id)
    and uploaded_by = auth.uid()
    and (
      item_id is null
      or exists (
        select 1 from public.itinerary_items
        where itinerary_items.id = vouchers.item_id
          and itinerary_items.trip_id = vouchers.trip_id
      )
    )
  );

drop policy if exists vouchers_update_editor on public.vouchers;
create policy vouchers_update_editor on public.vouchers
  for update to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

drop policy if exists vouchers_delete_editor on public.vouchers;
create policy vouchers_delete_editor on public.vouchers
  for delete to authenticated
  using (private.can_edit_trip(trip_id));

-- Keep the original names used by the current app while exposing the requested
-- item_name/is_packed names for new clients and future migrations.
alter table public.packing_items add column if not exists item_name text;
alter table public.packing_items add column if not exists is_packed boolean;
update public.packing_items
set item_name = coalesce(nullif(item_name, ''), name),
    is_packed = coalesce(is_packed, is_checked, false)
where item_name is null or item_name = '' or is_packed is null;
alter table public.packing_items alter column item_name set default '未命名項目';
alter table public.packing_items alter column item_name set not null;
alter table public.packing_items alter column is_packed set default false;
alter table public.packing_items alter column is_packed set not null;
