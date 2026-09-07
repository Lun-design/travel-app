-- Realtime collaboration metadata and publication wiring.
-- Every collaborative row carries a server timestamp and the user that last
-- changed it, allowing clients to resolve concurrent edits deterministically.

create or replace function private.set_updated_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, timezone('utc', now()));
    new.updated_by := coalesce(new.updated_by, auth.uid());
  else
    new.updated_at := timezone('utc', now());
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

alter table public.itinerary_items add column if not exists updated_at timestamptz;
alter table public.itinerary_items add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.trip_places add column if not exists updated_at timestamptz;
alter table public.trip_places add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.expenses add column if not exists updated_at timestamptz;
alter table public.expenses add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.packing_items add column if not exists updated_at timestamptz;
alter table public.packing_items add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.itinerary_items set updated_at = coalesce(updated_at, created_at, timezone('utc', now())) where updated_at is null;
update public.trip_places set updated_at = coalesce(updated_at, created_at, timezone('utc', now())) where updated_at is null;
update public.expenses set updated_at = coalesce(updated_at, created_at, timezone('utc', now())) where updated_at is null;
update public.packing_items set updated_at = coalesce(updated_at, created_at, timezone('utc', now())) where updated_at is null;

alter table public.itinerary_items alter column updated_at set default timezone('utc', now());
alter table public.itinerary_items alter column updated_at set not null;
alter table public.trip_places alter column updated_at set default timezone('utc', now());
alter table public.trip_places alter column updated_at set not null;
alter table public.expenses alter column updated_at set default timezone('utc', now());
alter table public.expenses alter column updated_at set not null;
alter table public.packing_items alter column updated_at set default timezone('utc', now());
alter table public.packing_items alter column updated_at set not null;

drop trigger if exists itinerary_items_updated_metadata on public.itinerary_items;
create trigger itinerary_items_updated_metadata
before insert or update on public.itinerary_items
for each row execute function private.set_updated_metadata();

drop trigger if exists trip_places_updated_metadata on public.trip_places;
create trigger trip_places_updated_metadata
before insert or update on public.trip_places
for each row execute function private.set_updated_metadata();

drop trigger if exists expenses_updated_metadata on public.expenses;
create trigger expenses_updated_metadata
before insert or update on public.expenses
for each row execute function private.set_updated_metadata();

drop trigger if exists packing_items_updated_metadata on public.packing_items;
create trigger packing_items_updated_metadata
before insert or update on public.packing_items
for each row execute function private.set_updated_metadata();

alter table public.itinerary_items replica identity full;
alter table public.trip_places replica identity full;
alter table public.expenses replica identity full;
alter table public.packing_items replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.itinerary_items;
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.trip_places;
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.expenses;
exception when duplicate_object then null;
end;
$$;
do $$
begin
  alter publication supabase_realtime add table public.packing_items;
exception when duplicate_object then null;
end;
$$;
