alter table public.expenses add column if not exists payer_id uuid references public.profiles(id);
alter table public.expenses add column if not exists title text;
alter table public.expenses add column if not exists category text;
alter table public.expenses alter column currency set default 'TWD';

update public.expenses
set payer_id = coalesce(payer_id, payer),
    title = coalesce(title, category, '旅費');

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  unique (expense_id, user_id)
);

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
grant select, insert, update, delete on public.expenses, public.expense_splits to authenticated;

drop policy if exists expenses_select_member on public.expenses;
create policy expenses_select_member on public.expenses for select to authenticated using (private.is_trip_member(trip_id));
drop policy if exists expenses_insert_member on public.expenses;
create policy expenses_insert_member on public.expenses for insert to authenticated with check (private.is_trip_member(trip_id));
drop policy if exists expenses_update_member on public.expenses;
create policy expenses_update_member on public.expenses for update to authenticated using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id));
drop policy if exists expenses_delete_member on public.expenses;
create policy expenses_delete_member on public.expenses for delete to authenticated using (private.is_trip_member(trip_id));

drop policy if exists expense_splits_select_member on public.expense_splits;
create policy expense_splits_select_member on public.expense_splits for select to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_trip_member(e.trip_id)));
drop policy if exists expense_splits_insert_member on public.expense_splits;
create policy expense_splits_insert_member on public.expense_splits for insert to authenticated with check (exists (select 1 from public.expenses e where e.id = expense_id and private.is_trip_member(e.trip_id)));
drop policy if exists expense_splits_update_member on public.expense_splits;
create policy expense_splits_update_member on public.expense_splits for update to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_trip_member(e.trip_id)));
drop policy if exists expense_splits_delete_member on public.expense_splits;
create policy expense_splits_delete_member on public.expense_splits for delete to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_trip_member(e.trip_id)));
