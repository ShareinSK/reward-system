-- Household scoring preferences (run in Supabase SQL Editor)

alter table public.households
  add column if not exists allow_negative_points boolean not null default false;

alter table public.households
  add column if not exists allow_decimal_points boolean not null default false;

comment on column public.households.allow_negative_points is
  'When false, managers cannot allocate negative points (grand-reward claims still work).';

comment on column public.households.allow_decimal_points is
  'When false, points are whole numbers only — easier for kids to follow.';
