create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;
grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

alter table public.trip_members
  add constraint trip_members_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;

create or replace function public.join_trip_by_invite(p_invite_code text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare trip_uuid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into trip_uuid from public.trips where invite_code = trim(p_invite_code);
  if trip_uuid is null then raise exception 'invalid invite code'; end if;
  insert into public.trip_members (trip_id, user_id, role)
  values (trip_uuid, auth.uid(), 'editor')
  on conflict (trip_id, user_id) do nothing;
  return trip_uuid;
end;
$$;
grant execute on function public.join_trip_by_invite(text) to authenticated;
