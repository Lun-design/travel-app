-- Production hardening: keep legacy columns/tables for compatibility while
-- making every cross-user relationship trip-scoped.

create or replace function private.is_trip_member_for_user(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.trip_members
    where trip_id = p_trip_id
      and user_id = p_user_id
  );
$$;

create or replace function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_profile_id = auth.uid()
    or exists (
      select 1
      from public.trip_members viewer_member
      join public.trip_members profile_member
        on profile_member.trip_id = viewer_member.trip_id
       and profile_member.user_id = p_profile_id
      where viewer_member.user_id = auth.uid()
    );
$$;

revoke all on function private.is_trip_member_for_user(uuid, uuid) from public;
revoke all on function private.can_view_profile(uuid) from public;
grant execute on function private.is_trip_member_for_user(uuid, uuid) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

-- Profiles are visible to the current user and their trip companions only.
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (private.can_view_profile(id));

-- Expenses: retain member read/write behavior, but require payer_id to belong
-- to the same trip whenever the compatibility column is populated.
drop policy if exists expenses_select_member on public.expenses;
drop policy if exists expenses_insert_editor on public.expenses;
drop policy if exists expenses_insert_member on public.expenses;
drop policy if exists expenses_update_editor on public.expenses;
drop policy if exists expenses_update_member on public.expenses;
drop policy if exists expenses_delete_editor on public.expenses;
drop policy if exists expenses_delete_member on public.expenses;

create policy expenses_select_member on public.expenses
  for select to authenticated
  using (private.is_trip_member(trip_id));
create policy expenses_insert_member on public.expenses
  for insert to authenticated
  with check (
    private.is_trip_member(trip_id)
    and private.is_trip_member_for_user(trip_id, created_by)
    and private.is_trip_member_for_user(trip_id, payer)
    and (payer_id is null or private.is_trip_member_for_user(trip_id, payer_id))
  );
create policy expenses_update_member on public.expenses
  for update to authenticated
  using (private.is_trip_member(trip_id))
  with check (
    private.is_trip_member(trip_id)
    and private.is_trip_member_for_user(trip_id, created_by)
    and private.is_trip_member_for_user(trip_id, payer)
    and (payer_id is null or private.is_trip_member_for_user(trip_id, payer_id))
  );
create policy expenses_delete_member on public.expenses
  for delete to authenticated
  using (private.is_trip_member(trip_id));

drop policy if exists expense_splits_select_member on public.expense_splits;
drop policy if exists expense_splits_insert_member on public.expense_splits;
drop policy if exists expense_splits_update_member on public.expense_splits;
drop policy if exists expense_splits_delete_member on public.expense_splits;

create policy expense_splits_select_member on public.expense_splits
  for select to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and private.is_trip_member(e.trip_id)
    )
  );
create policy expense_splits_insert_member on public.expense_splits
  for insert to authenticated
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and private.is_trip_member(e.trip_id)
        and private.is_trip_member_for_user(e.trip_id, user_id)
    )
  );
create policy expense_splits_update_member on public.expense_splits
  for update to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and private.is_trip_member(e.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and private.is_trip_member(e.trip_id)
        and private.is_trip_member_for_user(e.trip_id, user_id)
    )
  );
create policy expense_splits_delete_member on public.expense_splits
  for delete to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and private.is_trip_member(e.trip_id)
    )
  );

create index if not exists expense_splits_user_id_idx on public.expense_splits(user_id);

-- Packing items: explicit policies replace the old FOR ALL/USING-only policy.
drop policy if exists "Trip members can view and manage packing items" on public.packing_items;
drop policy if exists packing_items_select_member on public.packing_items;
drop policy if exists packing_items_insert_member on public.packing_items;
drop policy if exists packing_items_update_member on public.packing_items;
drop policy if exists packing_items_delete_member on public.packing_items;

create policy packing_items_select_member on public.packing_items
  for select to authenticated
  using (private.is_trip_member(trip_id));
create policy packing_items_insert_member on public.packing_items
  for insert to authenticated
  with check (
    private.is_trip_member(trip_id)
    and (assigned_to is null or private.is_trip_member_for_user(trip_id, assigned_to))
  );
create policy packing_items_update_member on public.packing_items
  for update to authenticated
  using (private.is_trip_member(trip_id))
  with check (
    private.is_trip_member(trip_id)
    and (assigned_to is null or private.is_trip_member_for_user(trip_id, assigned_to))
  );
create policy packing_items_delete_member on public.packing_items
  for delete to authenticated
  using (private.is_trip_member(trip_id));

create index if not exists packing_items_assigned_to_idx on public.packing_items(assigned_to);

-- Legacy documents remain readable, but metadata updates are intentionally
-- denied until the UI has an explicit edit flow. Deletion is owner/editor or
-- the uploader, matching the storage-object policy below.
drop policy if exists documents_update_member on public.documents;
drop policy if exists documents_delete_member on public.documents;
create policy documents_delete_member on public.documents
  for delete to authenticated
  using (
    private.is_trip_member(trip_id)
    and (uploaded_by = auth.uid() or private.can_edit_trip(trip_id))
  );

-- Vouchers are the canonical reservation/ticket table used by the current UI.
drop policy if exists vouchers_update_editor on public.vouchers;
create policy vouchers_update_editor on public.vouchers
  for update to authenticated
  using (private.can_edit_trip(trip_id))
  with check (
    private.can_edit_trip(trip_id)
    and (
      item_id is null
      or exists (
        select 1 from public.itinerary_items
        where itinerary_items.id = vouchers.item_id
          and itinerary_items.trip_id = vouchers.trip_id
      )
    )
  );

-- Storage object names are generated as {trip_id}/{user_id}/{file}.
drop policy if exists travel_documents_select_member on storage.objects;
drop policy if exists travel_documents_insert_member on storage.objects;
drop policy if exists travel_documents_delete_member on storage.objects;
create policy travel_documents_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'travel-documents'
    and private.is_trip_member(((storage.foldername(name))[1])::uuid)
  );
create policy travel_documents_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'travel-documents'
    and private.is_trip_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
  );
create policy travel_documents_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'travel-documents'
    and private.is_trip_member(((storage.foldername(name))[1])::uuid)
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or private.can_edit_trip(((storage.foldername(name))[1])::uuid)
    )
  );

comment on table public.documents is 'Legacy compatibility table; new clients should use public.vouchers.';
comment on table public.packing_items is 'Legacy name/item_name and is_checked/is_packed columns are retained for compatibility.';
