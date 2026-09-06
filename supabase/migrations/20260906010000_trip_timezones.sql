-- Store the destination's IANA timezone so calendar and opening-hour checks
-- do not depend on the device's local timezone.
alter table public.trips
  add column if not exists timezone text;

update public.trips
set timezone = 'Asia/Taipei'
where timezone is null or btrim(timezone) = '';

alter table public.trips
  alter column timezone set default 'Asia/Taipei',
  alter column timezone set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_timezone_nonempty'
      and conrelid = 'public.trips'::regclass
  ) then
    alter table public.trips
      add constraint trips_timezone_nonempty check (btrim(timezone) <> '');
  end if;
end $$;

comment on column public.trips.timezone is
  'IANA destination timezone, for example Asia/Tokyo; defaults to Asia/Taipei.';
