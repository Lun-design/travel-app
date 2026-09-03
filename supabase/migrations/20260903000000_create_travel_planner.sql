create extension if not exists pgcrypto;

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  invite_code text not null unique default encode(gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint trips_date_order check (end_date >= start_date)
);

create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (trip_id, user_id)
);

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  day_number integer not null check (day_number > 0),
  time time,
  location_name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  notes text,
  category text not null check (category in ('flight', 'food', 'spot', 'hotel')),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  category text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'TWD',
  payer uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);

create index trip_members_user_id_idx on public.trip_members(user_id);
create index itinerary_items_trip_id_idx on public.itinerary_items(trip_id);
create index expenses_trip_id_idx on public.expenses(trip_id);

create or replace function public.add_trip_owner()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger trips_add_owner
after insert on public.trips
for each row execute function public.add_trip_owner();

create schema if not exists private;

create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid())
  );
$$;

create or replace function private.can_edit_trip(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid()) and role in ('owner', 'editor')
  );
$$;

create or replace function private.is_trip_owner(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create or replace function public.join_trip_by_invite_code(p_invite_code text)
returns public.trip_members language plpgsql security definer set search_path = public
as $$
declare
  v_trip_id uuid;
  v_member public.trip_members;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into v_trip_id from public.trips where invite_code = lower(trim(p_invite_code));
  if v_trip_id is null then raise exception 'Invalid invite code'; end if;
  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'editor')
  on conflict (trip_id, user_id) do update set role = public.trip_members.role
  returning * into v_member;
  return v_member;
end;
$$;

revoke all on function public.join_trip_by_invite_code(text) from public;
grant execute on function public.join_trip_by_invite_code(text) to authenticated;

alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.expenses enable row level security;

create policy trips_select_member on public.trips for select using (private.is_trip_member(id));
create policy trips_insert_creator on public.trips for insert with check ((select auth.uid()) = created_by);
create policy trips_update_owner on public.trips for update using (private.is_trip_owner(id)) with check (private.is_trip_owner(id));
create policy trips_delete_owner on public.trips for delete using (private.is_trip_owner(id));

create policy members_select_member on public.trip_members for select using (private.is_trip_member(trip_id));
create policy members_insert_owner on public.trip_members for insert with check (private.is_trip_owner(trip_id));
create policy members_update_owner on public.trip_members for update using (private.is_trip_owner(trip_id)) with check (private.is_trip_owner(trip_id));
create policy members_delete_owner on public.trip_members for delete using (private.is_trip_owner(trip_id));

create policy itinerary_select_member on public.itinerary_items for select using (private.is_trip_member(trip_id));
create policy itinerary_insert_editor on public.itinerary_items for insert with check (private.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy itinerary_update_editor on public.itinerary_items for update using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));
create policy itinerary_delete_editor on public.itinerary_items for delete using (private.can_edit_trip(trip_id));

create policy expenses_select_member on public.expenses for select using (private.is_trip_member(trip_id));
create policy expenses_insert_editor on public.expenses for insert with check (private.can_edit_trip(trip_id) and created_by = (select auth.uid()));
create policy expenses_update_editor on public.expenses for update using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));
create policy expenses_delete_editor on public.expenses for delete using (private.can_edit_trip(trip_id));
