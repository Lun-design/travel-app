-- Public, read-only itinerary links. The token is opaque and revocable.
create table if not exists public.trip_shares (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  share_token text not null unique,
  is_active boolean not null default true,
  include_expenses boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists trip_shares_trip_id_idx on public.trip_shares(trip_id);
create index if not exists trip_shares_active_token_idx on public.trip_shares(share_token) where is_active;

alter table public.trip_shares enable row level security;
-- Anonymous clients use the SECURITY DEFINER RPC below; do not grant direct
-- table reads, otherwise active tokens could be enumerated.
grant select on public.trip_shares to authenticated;
grant insert, update, delete on public.trip_shares to authenticated;

drop policy if exists trip_shares_member_read on public.trip_shares;
create policy trip_shares_member_read on public.trip_shares
  for select to authenticated using (private.is_trip_member(trip_id));

drop policy if exists trip_shares_member_insert on public.trip_shares;
create policy trip_shares_member_insert on public.trip_shares
  for insert to authenticated with check (private.is_trip_member(trip_id) and created_by = auth.uid());

drop policy if exists trip_shares_member_update on public.trip_shares;
create policy trip_shares_member_update on public.trip_shares
  for update to authenticated using (private.is_trip_member(trip_id))
  with check (private.is_trip_member(trip_id));

drop policy if exists trip_shares_member_delete on public.trip_shares;
create policy trip_shares_member_delete on public.trip_shares
  for delete to authenticated using (private.is_trip_member(trip_id));

-- Keep the base tables private. This function exposes only the selected fields
-- needed by the public read-only page and never accepts an arbitrary trip id.
create or replace function public.get_public_trip_by_share_token(p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.trip_shares;
  v_trip jsonb;
  v_items jsonb;
  v_expenses jsonb;
begin
  select * into v_share
  from public.trip_shares
  where share_token = trim(p_share_token) and is_active = true
  limit 1;

  if not found then return null; end if;

  select to_jsonb(t) - 'created_by' - 'invite_code' into v_trip
  from public.trips t where t.id = v_share.trip_id;
  if v_trip is null then return null; end if;

  select coalesce(jsonb_agg(to_jsonb(i) - 'created_by' order by i.day_number, i.position, i.time), '[]'::jsonb)
    into v_items
  from public.itinerary_items i where i.trip_id = v_share.trip_id;

  if v_share.include_expenses then
    select coalesce(jsonb_agg(to_jsonb(e) - 'trip_id' - 'created_by' - 'payer' - 'payer_id' order by e.created_at), '[]'::jsonb)
      into v_expenses
    from public.expenses e where e.trip_id = v_share.trip_id;
  else
    v_expenses := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'share', jsonb_build_object(
      'id', v_share.id,
      'trip_id', v_share.trip_id,
      'share_token', v_share.share_token,
      'is_active', v_share.is_active,
      'include_expenses', v_share.include_expenses
    ),
    'trip', v_trip,
    'items', v_items,
    'expenses', v_expenses
  );
end;
$$;

revoke all on function public.get_public_trip_by_share_token(text) from public;
grant execute on function public.get_public_trip_by_share_token(text) to anon, authenticated;
