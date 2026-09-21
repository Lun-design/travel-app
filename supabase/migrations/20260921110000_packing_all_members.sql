-- Allow a shared packing item to be assigned to every trip member.
alter table public.packing_items
  add column if not exists assigned_to_all boolean not null default false;
