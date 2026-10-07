-- Public URLs allow a shared itinerary to display a member-selected cover.
-- Only a member with trip edit permission may upload or remove objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('itinerary-photos', 'itinerary-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists itinerary_photos_read on storage.objects;
create policy itinerary_photos_read on storage.objects
  for select to public
  using (bucket_id = 'itinerary-photos');

drop policy if exists itinerary_photos_insert_editor on storage.objects;
create policy itinerary_photos_insert_editor on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'itinerary-photos'
    and private.can_edit_trip(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists itinerary_photos_delete_editor on storage.objects;
create policy itinerary_photos_delete_editor on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'itinerary-photos'
    and private.can_edit_trip(((storage.foldername(name))[1])::uuid)
  );
