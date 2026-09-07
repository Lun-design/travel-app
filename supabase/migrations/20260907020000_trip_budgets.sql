-- Per-trip budget target used by the expenses dashboard.
create table if not exists public.trip_budgets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null unique references public.trips(id) on delete cascade,
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  currency text not null default 'TWD' check (currency in ('TWD', 'JPY', 'KRW', 'USD', 'EUR')),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.trip_budgets enable row level security;
grant select, insert, update, delete on public.trip_budgets to authenticated;

drop policy if exists trip_budgets_select_member on public.trip_budgets;
create policy trip_budgets_select_member on public.trip_budgets
  for select to authenticated using (private.is_trip_member(trip_id));

drop policy if exists trip_budgets_insert_member on public.trip_budgets;
create policy trip_budgets_insert_member on public.trip_budgets
  for insert to authenticated with check (private.is_trip_member(trip_id) and updated_by = auth.uid());

drop policy if exists trip_budgets_update_member on public.trip_budgets;
create policy trip_budgets_update_member on public.trip_budgets
  for update to authenticated
  using (private.is_trip_member(trip_id))
  with check (private.is_trip_member(trip_id) and updated_by = auth.uid());

drop policy if exists trip_budgets_delete_member on public.trip_budgets;
create policy trip_budgets_delete_member on public.trip_budgets
  for delete to authenticated using (private.is_trip_member(trip_id));
