-- Track expense-level settlement state and link each transfer to its expense.
alter table public.expenses
  add column if not exists is_settled boolean not null default false;

alter table public.settlement_records
  add column if not exists expense_id uuid references public.expenses(id) on delete cascade;

create index if not exists settlement_records_expense_id_idx
  on public.settlement_records(expense_id, settled_at desc);

grant update, delete on public.settlement_records to authenticated;

drop policy if exists settlement_records_delete_member on public.settlement_records;
create policy settlement_records_delete_member on public.settlement_records
  for delete to authenticated
  using (private.is_trip_member(trip_id));
