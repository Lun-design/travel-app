create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  file_url text,
  file_type text not null check (file_type = 'application/pdf' or file_type like 'image/%'),
  file_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.documents enable row level security;
grant select, insert, update, delete on public.documents to authenticated;
create index if not exists documents_trip_created_idx on public.documents(trip_id, created_at desc);

drop policy if exists documents_select_member on public.documents;
create policy documents_select_member on public.documents for select to authenticated using (private.is_trip_member(trip_id));
drop policy if exists documents_insert_member on public.documents;
create policy documents_insert_member on public.documents for insert to authenticated with check (private.is_trip_member(trip_id) and uploaded_by = auth.uid());
drop policy if exists documents_delete_member on public.documents;
create policy documents_delete_member on public.documents for delete to authenticated using (private.is_trip_member(trip_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel-documents', 'travel-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists travel_documents_select_member on storage.objects;
create policy travel_documents_select_member on storage.objects for select to authenticated using (
  bucket_id = 'travel-documents' and private.is_trip_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists travel_documents_insert_member on storage.objects;
create policy travel_documents_insert_member on storage.objects for insert to authenticated with check (
  bucket_id = 'travel-documents' and private.is_trip_member(((storage.foldername(name))[1])::uuid) and (storage.foldername(name))[2] = auth.uid()::text
);
drop policy if exists travel_documents_delete_member on storage.objects;
create policy travel_documents_delete_member on storage.objects for delete to authenticated using (
  bucket_id = 'travel-documents' and private.is_trip_member(((storage.foldername(name))[1])::uuid)
);
