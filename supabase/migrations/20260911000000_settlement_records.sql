-- Persist individual payments so settlement suggestions remain synchronized across devices.
create table if not exists public.settlement_records (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete restrict,
  to_user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'TWD',
  note text,
  settled_by uuid not null references public.profiles(id) on delete restrict,
  settled_at timestamptz not null default timezone('utc', now()),
  check (from_user_id <> to_user_id)
);

create index if not exists settlement_records_trip_settled_at_idx
  on public.settlement_records(trip_id, settled_at desc);

alter table public.settlement_records enable row level security;
grant select, insert on public.settlement_records to authenticated;

drop policy if exists settlement_records_select_member on public.settlement_records;
create policy settlement_records_select_member on public.settlement_records
  for select to authenticated
  using (private.is_trip_member(trip_id));

drop policy if exists settlement_records_insert_member on public.settlement_records;
create policy settlement_records_insert_member on public.settlement_records
  for insert to authenticated
  with check (
    private.is_trip_member(trip_id)
    and private.is_trip_member_for_user(trip_id, from_user_id)
    and private.is_trip_member_for_user(trip_id, to_user_id)
    and settled_by = auth.uid()
  );

alter table public.settlement_records replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.settlement_records;
exception when duplicate_object then null;
end;
$$;
