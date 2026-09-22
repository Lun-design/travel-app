-- Ticket category labels used by the reservation panel.
alter table public.vouchers
  add column if not exists category text not null default 'other';

alter table public.vouchers
  drop constraint if exists vouchers_category_check;

alter table public.vouchers
  add constraint vouchers_category_check
  check (category in ('flight', 'hotel', 'ticket', 'transport', 'other'));
