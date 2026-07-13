-- Reward System App — Supabase PostgreSQL schema
-- Paste into the Supabase SQL Editor and run once.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Participants (family/team members who earn points — may or may not have auth)
-- ---------------------------------------------------------------------------
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  auth_user_id uuid references auth.users (id) on delete set null,
  avatar_color text not null default '#0d9488',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activities master list
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  default_points numeric(10, 2) not null default 1.0,
  allow_negative boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint activities_title_not_blank check (char_length(trim(title)) > 0)
);

-- ---------------------------------------------------------------------------
-- Grand Rewards master list
-- ---------------------------------------------------------------------------
create table if not exists public.grand_rewards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  points_required numeric(10, 2) not null check (points_required > 0),
  description text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint grand_rewards_title_not_blank check (char_length(trim(title)) > 0)
);

-- ---------------------------------------------------------------------------
-- Points Ledger
-- ---------------------------------------------------------------------------
create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  grand_reward_id uuid references public.grand_rewards (id) on delete set null,
  points numeric(10, 2) not null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ledger_points_nonzero check (points <> 0),
  constraint ledger_source_xor check (
    (activity_id is not null and grand_reward_id is null)
    or (activity_id is null and grand_reward_id is not null)
    or (activity_id is null and grand_reward_id is null and note <> '')
  )
);

create index if not exists points_ledger_participant_created_idx
  on public.points_ledger (participant_id, created_at desc);

create index if not exists points_ledger_created_at_idx
  on public.points_ledger (created_at desc);

-- ---------------------------------------------------------------------------
-- DB guard: negative points only when the linked activity allows it,
-- or when the entry is a grand-reward claim (expected to be negative).
-- ---------------------------------------------------------------------------
create or replace function public.enforce_negative_points_rule()
returns trigger
language plpgsql
as $$
declare
  activity_allows boolean;
begin
  if new.points >= 0 then
    return new;
  end if;

  -- Grand reward claims are always allowed as negative ledger entries
  if new.grand_reward_id is not null then
    return new;
  end if;

  if new.activity_id is null then
    raise exception 'Negative points require an activity with allow_negative = true (or a grand reward claim)';
  end if;

  select allow_negative into activity_allows
  from public.activities
  where id = new.activity_id;

  if coalesce(activity_allows, false) is not true then
    raise exception 'Activity % does not allow negative points', new.activity_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_negative_points on public.points_ledger;
create trigger trg_enforce_negative_points
  before insert or update of points, activity_id, grand_reward_id
  on public.points_ledger
  for each row
  execute function public.enforce_negative_points_rule();

-- ---------------------------------------------------------------------------
-- Helper views for dashboard metrics
-- ---------------------------------------------------------------------------
create or replace view public.participant_balances as
select
  p.id as participant_id,
  p.name,
  coalesce(sum(l.points), 0)::numeric(10, 2) as total_points
from public.participants p
left join public.points_ledger l on l.participant_id = p.id
group by p.id, p.name;

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security (authenticated family members can manage everything)
-- Tighten further if you add multi-household tenancy later.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.participants enable row level security;
alter table public.activities enable row level security;
alter table public.grand_rewards enable row level security;
alter table public.points_ledger enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

create policy "participants_all_authenticated" on public.participants
  for all to authenticated using (true) with check (true);

create policy "activities_all_authenticated" on public.activities
  for all to authenticated using (true) with check (true);

create policy "grand_rewards_all_authenticated" on public.grand_rewards
  for all to authenticated using (true) with check (true);

create policy "points_ledger_all_authenticated" on public.points_ledger
  for all to authenticated using (true) with check (true);

-- Grant view access
grant select on public.participant_balances to authenticated;
