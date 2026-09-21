-- Optional reservation metadata for tickets and bookings.
alter table public.vouchers add column if not exists reservation_number text;
alter table public.vouchers add column if not exists usage_at timestamptz;
alter table public.vouchers add column if not exists notes text;
