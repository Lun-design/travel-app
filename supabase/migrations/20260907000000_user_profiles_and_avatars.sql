-- User profile display names and custom avatar support.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists email text;

-- Backfill profile fallback fields without overwriting a user's custom name.
update public.profiles p
set
  full_name = coalesce(p.full_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  email = coalesce(p.email, u.email)
from auth.users u
where u.id = p.id;

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email
  )
  on conflict (id) do update set
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    email = coalesce(public.profiles.email, excluded.email);
  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_select on storage.objects;
create policy profile_avatars_select on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists profile_avatars_insert on storage.objects;
create policy profile_avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists profile_avatars_update on storage.objects;
create policy profile_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists profile_avatars_delete on storage.objects;
create policy profile_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Include profile fallback fields in the existing home aggregation RPC.
create or replace function public.list_trips_with_members()
returns table (
  id uuid,
  title text,
  destination text,
  start_date date,
  end_date date,
  invite_code text,
  created_by uuid,
  default_departure_time time,
  timezone text,
  members jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id,
    t.title,
    t.destination,
    t.start_date,
    t.end_date,
    t.invite_code,
    t.created_by,
    t.default_departure_time,
    t.timezone,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'trip_id', tm.trip_id,
          'user_id', tm.user_id,
          'role', tm.role,
          'joined_at', tm.joined_at,
          'profile', jsonb_build_object(
            'display_name', p.display_name,
            'full_name', p.full_name,
            'email', p.email,
            'avatar_url', p.avatar_url
          )
        ) order by tm.joined_at
      ) filter (where tm.user_id is not null),
      '[]'::jsonb
    ) as members
  from public.trips t
  left join public.trip_members tm on tm.trip_id = t.id
  left join public.profiles p on p.id = tm.user_id
  where private.is_trip_member(t.id)
  group by t.id, t.title, t.destination, t.start_date, t.end_date,
    t.invite_code, t.created_by, t.default_departure_time, t.timezone
  order by t.start_date asc, t.id asc;
$$;

grant execute on function public.list_trips_with_members() to authenticated;
