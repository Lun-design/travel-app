alter table public.itinerary_items
  add column if not exists is_backup boolean not null default false;

alter table public.itinerary_items
  add column if not exists backup_for_id uuid references public.itinerary_items(id) on delete set null;

create index if not exists itinerary_items_backup_for_id_idx
  on public.itinerary_items(backup_for_id)
  where backup_for_id is not null;

comment on column public.itinerary_items.is_backup is
  'Whether this itinerary item is an alternate plan hidden from the primary schedule.';
comment on column public.itinerary_items.backup_for_id is
  'Primary itinerary item this alternate plan replaces when weather changes.';
