-- Preserve editable OCR line items alongside the expense total.
alter table public.expenses
  add column if not exists receipt_items jsonb not null default '[]'::jsonb;

alter table public.expenses
  drop constraint if exists expenses_receipt_items_array_check;

alter table public.expenses
  add constraint expenses_receipt_items_array_check
  check (jsonb_typeof(receipt_items) = 'array');
