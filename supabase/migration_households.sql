-- Migration: household sharing for co-managers
-- Run in Supabase SQL Editor after the base schema.

-- ---------------------------------------------------------------------------
-- Households + members
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Family Rewards',
  invite_code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'manager' check (role in ('owner', 'manager')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

alter table public.profiles
  add column if not exists active_household_id uuid references public.households (id) on delete set null;

alter table public.participants
  add column if not exists household_id uuid references public.households (id) on delete cascade;

alter table public.activities
  add column if not exists household_id uuid references public.households (id) on delete cascade;

alter table public.grand_rewards
  add column if not exists household_id uuid references public.households (id) on delete cascade;

alter table public.points_ledger
  add column if not exists household_id uuid references public.households (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.ensure_my_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select p.active_household_id into hid
  from public.profiles p
  where p.id = auth.uid();

  if hid is not null and public.is_household_member(hid) then
    return hid;
  end if;

  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = auth.uid()
  order by hm.joined_at asc
  limit 1;

  if hid is not null then
    update public.profiles
    set active_household_id = hid
    where id = auth.uid();
    return hid;
  end if;

  insert into public.households (name, invite_code, created_by)
  values ('Family Rewards', public.generate_invite_code(), auth.uid())
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  update public.profiles
  set active_household_id = hid
  where id = auth.uid();

  return hid;
end;
$$;

create or replace function public.join_household_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  normalized text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  normalized := upper(trim(p_code));
  if normalized = '' then
    raise exception 'Invite code is required';
  end if;

  select h.id into hid
  from public.households h
  where h.invite_code = normalized;

  if hid is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'manager')
  on conflict (household_id, user_id) do nothing;

  update public.profiles
  set active_household_id = hid
  where id = auth.uid();

  return hid;
end;
$$;

create or replace function public.rotate_household_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  new_code text;
begin
  hid := public.ensure_my_household();
  new_code := public.generate_invite_code();

  update public.households
  set invite_code = new_code
  where id = hid
    and public.is_household_member(id);

  return new_code;
end;
$$;

-- Auto-create household when a profile is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  insert into public.households (name, invite_code, created_by)
  values ('Family Rewards', public.generate_invite_code(), new.id)
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, new.id, 'owner');

  update public.profiles
  set active_household_id = hid
  where id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill existing rows into a shared household (safe to re-run)
-- ---------------------------------------------------------------------------
do $$
declare
  hid uuid;
  uid uuid;
begin
  select id into uid from auth.users order by created_at asc limit 1;

  if uid is null then
    return;
  end if;

  select h.id into hid
  from public.households h
  where h.created_by = uid
  limit 1;

  if hid is null then
    insert into public.households (name, invite_code, created_by)
    values ('Family Rewards', public.generate_invite_code(), uid)
    returning id into hid;
  end if;

  insert into public.household_members (household_id, user_id, role)
  select hid, u.id, case when u.id = uid then 'owner' else 'manager' end
  from auth.users u
  on conflict do nothing;

  update public.profiles
  set active_household_id = coalesce(active_household_id, hid);

  update public.participants set household_id = hid where household_id is null;
  update public.activities set household_id = hid where household_id is null;
  update public.grand_rewards set household_id = hid where household_id is null;
  update public.points_ledger set household_id = hid where household_id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;

drop policy if exists "participants_all_authenticated" on public.participants;
drop policy if exists "activities_all_authenticated" on public.activities;
drop policy if exists "grand_rewards_all_authenticated" on public.grand_rewards;
drop policy if exists "points_ledger_all_authenticated" on public.points_ledger;

drop policy if exists "households_select_member" on public.households;
drop policy if exists "households_update_member" on public.households;
drop policy if exists "household_members_select" on public.household_members;
drop policy if exists "participants_member_all" on public.participants;
drop policy if exists "activities_member_all" on public.activities;
drop policy if exists "grand_rewards_member_all" on public.grand_rewards;
drop policy if exists "points_ledger_member_all" on public.points_ledger;

create policy "households_select_member" on public.households
  for select to authenticated
  using (public.is_household_member(id));

create policy "households_update_member" on public.households
  for update to authenticated
  using (public.is_household_member(id));

create policy "household_members_select" on public.household_members
  for select to authenticated
  using (public.is_household_member(household_id));

create policy "participants_member_all" on public.participants
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "activities_member_all" on public.activities
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "grand_rewards_member_all" on public.grand_rewards
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "points_ledger_member_all" on public.points_ledger
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant execute on function public.ensure_my_household() to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
grant execute on function public.rotate_household_invite_code() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;

-- Allow co-managers to see each other's display names
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_household" on public.profiles;

create policy "profiles_select_household" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.household_members me
      join public.household_members them on them.household_id = me.household_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );
