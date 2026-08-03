-- HeroHabbits soft-launch + monetization foundation
-- Run in Supabase SQL Editor after prior migrations.

-- ---------------------------------------------------------------------------
-- Profiles: staff roles, test markers, notification prefs
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists app_role text not null default 'user'
    check (app_role in ('user', 'admin', 'super_admin')),
  add column if not exists is_test boolean not null default false,
  add column if not exists email_opt_in boolean not null default true,
  add column if not exists push_opt_in boolean not null default true,
  add column if not exists last_active_at timestamptz;

-- ---------------------------------------------------------------------------
-- Households: experience mode
-- ---------------------------------------------------------------------------
alter table public.households
  add column if not exists experience_mode text not null default 'kids'
    check (experience_mode in ('kids', 'goals')),
  add column if not exists disabled boolean not null default false;

update public.households set name = 'HeroHabbits' where name = 'Family Rewards';

-- ---------------------------------------------------------------------------
-- Entitlements (one row per household)
-- ---------------------------------------------------------------------------
create table if not exists public.household_entitlements (
  household_id uuid primary key references public.households (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'trial', 'pro')),
  status text not null default 'active'
    check (status in ('active', 'canceled', 'past_due', 'grace', 'expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  admin_override boolean not null default false,
  admin_notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists household_entitlements_stripe_customer_idx
  on public.household_entitlements (stripe_customer_id);

-- Backfill entitlements for existing households
insert into public.household_entitlements (household_id, plan, status)
select h.id, 'free', 'active'
from public.households h
on conflict (household_id) do nothing;

-- ---------------------------------------------------------------------------
-- Feature flags
-- ---------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key,
  description text not null default '',
  enabled boolean not null default false,
  rollout text not null default 'off' check (rollout in ('off', 'on', 'allowlist')),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flag_targets (
  flag_key text not null references public.feature_flags (key) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_id is not null or household_id is not null)
);

create unique index if not exists feature_flag_targets_user_uidx
  on public.feature_flag_targets (flag_key, user_id) where user_id is not null;
create unique index if not exists feature_flag_targets_hh_uidx
  on public.feature_flag_targets (flag_key, household_id) where household_id is not null;

insert into public.feature_flags (key, description, enabled, rollout) values
  ('goals_theme', 'Elegant goals / habit tracking UI', false, 'allowlist'),
  ('billing_checkout', 'Stripe checkout / upgrade enabled', false, 'off'),
  ('engagement_emails', 'Engagement email nudges', true, 'on'),
  ('engagement_push', 'Engagement web push nudges', true, 'on'),
  ('weekly_digest', 'Weekly progress digest', false, 'off')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Plan prices (country / currency mapping for Stripe)
-- ---------------------------------------------------------------------------
create table if not exists public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  country_or_region text not null,
  currency text not null,
  stripe_price_id text,
  amount_display text not null,
  interval text not null default 'month',
  active boolean not null default true,
  unique (country_or_region, currency, interval)
);

insert into public.plan_prices (country_or_region, currency, stripe_price_id, amount_display, interval)
values
  ('US', 'usd', null, '$4.99', 'month'),
  ('IN', 'inr', null, '₹49', 'month'),
  ('DEFAULT', 'usd', null, '$4.99', 'month')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Push subscriptions + notification log / templates
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.notification_templates (
  key text primary key,
  channel text not null check (channel in ('email', 'push', 'in_app')),
  subject text,
  body text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.notification_templates (key, channel, subject, body) values
  ('trial_started', 'email', 'Your HeroHabbits Pro trial has started', 'You have 15 days of Pro. Invite co-managers and add more participants, activities, and goals.'),
  ('trial_3d', 'email', '3 days left on your HeroHabbits trial', 'Your Pro trial ends in 3 days. Upgrade to keep higher limits.'),
  ('trial_1d', 'email', '1 day left on your HeroHabbits trial', 'Tomorrow you move to the Free plan unless you upgrade.'),
  ('trial_expired', 'email', 'Your HeroHabbits trial ended', 'You are now on Free. Existing data stays; new adds are limited until you upgrade.'),
  ('inactive_nudge', 'push', null, 'Log today’s habits or award points in HeroHabbits.'),
  ('feedback_ask', 'email', 'How is HeroHabbits going?', 'We would love your feedback while we soft-launch. Reply to this email or use the in-app feedback link.')
on conflict (key) do nothing;

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  household_id uuid references public.households (id) on delete set null,
  template_key text,
  channel text not null,
  status text not null default 'sent',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Plan limits helpers
-- ---------------------------------------------------------------------------
create or replace function public.household_has_pro_access(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_entitlements e
    left join public.profiles owner_p on owner_p.id = (
      select hm.user_id from public.household_members hm
      where hm.household_id = p_household_id and hm.role = 'owner'
      limit 1
    )
    where e.household_id = p_household_id
      and (
        e.admin_override = true
        or coalesce(owner_p.is_test, false) = true
        or e.plan = 'pro'
        or (
          e.plan = 'trial'
          and e.status in ('active', 'grace')
          and (e.trial_ends_at is null or e.trial_ends_at > now())
        )
      )
  );
$$;

create or replace function public.household_plan_limits(p_household_id uuid)
returns table (
  max_members int,
  max_participants int,
  max_activities int,
  max_rewards int,
  plan text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pro boolean;
  p text;
begin
  pro := public.household_has_pro_access(p_household_id);
  select e.plan into p from public.household_entitlements e where e.household_id = p_household_id;
  if pro then
    return query select 3, 10, 50, 20, coalesce(p, 'pro');
  else
    return query select 1, 2, 5, 3, coalesce(p, 'free');
  end if;
end;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.app_role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.app_role = 'super_admin'
  );
$$;

-- Cap enforcement triggers
create or replace function public.enforce_participant_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  cnt int;
begin
  select max_participants into lim from public.household_plan_limits(new.household_id);
  select count(*)::int into cnt from public.participants where household_id = new.household_id;
  if cnt >= lim then
    raise exception 'PLAN_LIMIT:participants:%', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_participant_cap on public.participants;
create trigger trg_enforce_participant_cap
  before insert on public.participants
  for each row execute function public.enforce_participant_cap();

create or replace function public.enforce_activity_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  cnt int;
begin
  select max_activities into lim from public.household_plan_limits(new.household_id);
  select count(*)::int into cnt from public.activities where household_id = new.household_id;
  if cnt >= lim then
    raise exception 'PLAN_LIMIT:activities:%', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_activity_cap on public.activities;
create trigger trg_enforce_activity_cap
  before insert on public.activities
  for each row execute function public.enforce_activity_cap();

create or replace function public.enforce_reward_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  cnt int;
begin
  select max_rewards into lim from public.household_plan_limits(new.household_id);
  select count(*)::int into cnt from public.grand_rewards where household_id = new.household_id;
  if cnt >= lim then
    raise exception 'PLAN_LIMIT:rewards:%', lim
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_reward_cap on public.grand_rewards;
create trigger trg_enforce_reward_cap
  before insert on public.grand_rewards
  for each row execute function public.enforce_reward_cap();

-- Update join to enforce member seat cap
create or replace function public.join_household_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  normalized text;
  lim int;
  cnt int;
  already boolean;
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
  where h.invite_code = normalized
    and h.disabled = false;

  if hid is null then
    raise exception 'Invalid invite code';
  end if;

  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid and hm.user_id = auth.uid()
  ) into already;

  if not already then
    select max_members into lim from public.household_plan_limits(hid);
    select count(*)::int into cnt from public.household_members where household_id = hid;
    if cnt >= lim then
      raise exception 'PLAN_LIMIT:members:%', lim
        using errcode = 'P0001';
    end if;

    insert into public.household_members (household_id, user_id, role)
    values (hid, auth.uid(), 'manager');
  end if;

  update public.profiles
  set active_household_id = hid
  where id = auth.uid();

  return hid;
end;
$$;

-- Ensure entitlements row when household is created
create or replace function public.ensure_household_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.household_entitlements (household_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (household_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_ensure_household_entitlement on public.households;
create trigger trg_ensure_household_entitlement
  after insert on public.households
  for each row execute function public.ensure_household_entitlement();

-- Update default household name on signup
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

  insert into public.households (name, invite_code, created_by, experience_mode)
  values (
    'HeroHabbits',
    public.generate_invite_code(),
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'experience_mode', ''), 'kids')
  )
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, new.id, 'owner');

  update public.profiles
  set active_household_id = hid
  where id = new.id;

  return new;
end;
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
    update public.profiles set last_active_at = now() where id = auth.uid();
    return hid;
  end if;

  select hm.household_id into hid
  from public.household_members hm
  where hm.user_id = auth.uid()
  order by hm.joined_at asc
  limit 1;

  if hid is not null then
    update public.profiles
    set active_household_id = hid, last_active_at = now()
    where id = auth.uid();
    return hid;
  end if;

  insert into public.households (name, invite_code, created_by)
  values ('HeroHabbits', public.generate_invite_code(), auth.uid())
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  update public.profiles
  set active_household_id = hid, last_active_at = now()
  where id = auth.uid();

  return hid;
end;
$$;

-- Feature flag check
create or replace function public.is_feature_enabled(p_key text, p_household_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f public.feature_flags%rowtype;
  uid uuid := auth.uid();
begin
  select * into f from public.feature_flags where key = p_key;
  if not found or not f.enabled then
    return false;
  end if;
  if f.rollout = 'on' then
    return true;
  end if;
  if f.rollout = 'off' then
    return false;
  end if;
  -- allowlist
  return exists (
    select 1 from public.feature_flag_targets t
    where t.flag_key = p_key
      and (
        (t.user_id is not null and t.user_id = uid)
        or (t.household_id is not null and t.household_id = p_household_id)
      )
  ) or exists (
    select 1 from public.profiles p where p.id = uid and p.is_test = true
  );
end;
$$;

-- Admin RPCs
create or replace function public.admin_set_entitlement(
  p_household_id uuid,
  p_plan text,
  p_admin_override boolean default false,
  p_trial_ends_at timestamptz default null,
  p_notes text default null
)
returns public.household_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.household_entitlements;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;
  if p_plan not in ('free', 'trial', 'pro') then
    raise exception 'Invalid plan';
  end if;

  insert into public.household_entitlements as e (
    household_id, plan, status, admin_override, trial_ends_at, admin_notes, updated_at
  ) values (
    p_household_id, p_plan, 'active', p_admin_override, p_trial_ends_at, p_notes, now()
  )
  on conflict (household_id) do update set
    plan = excluded.plan,
    status = 'active',
    admin_override = excluded.admin_override,
    trial_ends_at = excluded.trial_ends_at,
    admin_notes = excluded.admin_notes,
    updated_at = now()
  returning * into row;

  return row;
end;
$$;

create or replace function public.admin_set_profile_flags(
  p_user_id uuid,
  p_app_role text default null,
  p_is_test boolean default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
  my_role text;
begin
  select app_role into my_role from public.profiles where id = auth.uid();
  if my_role is null or my_role not in ('admin', 'super_admin') then
    raise exception 'Not authorized';
  end if;
  if p_app_role is not null then
    if my_role <> 'super_admin' then
      raise exception 'Only super_admin can change roles';
    end if;
    if p_app_role not in ('user', 'admin', 'super_admin') then
      raise exception 'Invalid role';
    end if;
  end if;

  update public.profiles
  set
    app_role = coalesce(p_app_role, app_role),
    is_test = coalesce(p_is_test, is_test)
  where id = p_user_id
  returning * into row;

  if row.id is null then
    raise exception 'User not found';
  end if;
  return row;
end;
$$;

create or replace function public.start_household_trial(p_days int default 15)
returns public.household_entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  row public.household_entitlements;
  is_owner boolean;
begin
  hid := public.ensure_my_household();
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  ) into is_owner;
  if not is_owner then
    raise exception 'Only the household owner can start a trial';
  end if;

  update public.household_entitlements
  set
    plan = 'trial',
    status = 'active',
    trial_ends_at = now() + make_interval(days => greatest(p_days, 1)),
    updated_at = now()
  where household_id = hid
    and plan = 'free'
    and coalesce(stripe_subscription_id, '') = ''
  returning * into row;

  if row.household_id is null then
    select * into row from public.household_entitlements where household_id = hid;
  end if;
  return row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.household_entitlements enable row level security;
alter table public.feature_flags enable row level security;
alter table public.feature_flag_targets enable row level security;
alter table public.plan_prices enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_log enable row level security;
alter table public.in_app_notifications enable row level security;

drop policy if exists "entitlements_select_member" on public.household_entitlements;
create policy "entitlements_select_member" on public.household_entitlements
  for select to authenticated
  using (public.is_household_member(household_id) or public.is_staff());

drop policy if exists "flags_select_auth" on public.feature_flags;
create policy "flags_select_auth" on public.feature_flags
  for select to authenticated using (true);

drop policy if exists "flags_write_staff" on public.feature_flags;
create policy "flags_write_staff" on public.feature_flags
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "flag_targets_select_staff" on public.feature_flag_targets;
create policy "flag_targets_select_staff" on public.feature_flag_targets
  for select to authenticated using (public.is_staff() or user_id = auth.uid());

drop policy if exists "flag_targets_write_staff" on public.feature_flag_targets;
create policy "flag_targets_write_staff" on public.feature_flag_targets
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "plan_prices_select" on public.plan_prices;
create policy "plan_prices_select" on public.plan_prices
  for select to authenticated using (active = true or public.is_staff());

drop policy if exists "plan_prices_write_staff" on public.plan_prices;
create policy "plan_prices_write_staff" on public.plan_prices
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "push_own" on public.push_subscriptions;
create policy "push_own" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "templates_select" on public.notification_templates;
create policy "templates_select" on public.notification_templates
  for select to authenticated using (true);

drop policy if exists "templates_write_staff" on public.notification_templates;
create policy "templates_write_staff" on public.notification_templates
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "notif_log_staff" on public.notification_log;
create policy "notif_log_staff" on public.notification_log
  for select to authenticated using (public.is_staff() or user_id = auth.uid());

drop policy if exists "notif_log_insert_own" on public.notification_log;
create policy "notif_log_insert_own" on public.notification_log
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- Allow anonymous feedback insert via authenticated users only (above).
-- Service role used by Edge Functions bypasses RLS for cron sends.

drop policy if exists "in_app_own" on public.in_app_notifications;
create policy "in_app_own" on public.in_app_notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Staff can read all households/profiles for admin console
drop policy if exists "households_select_member" on public.households;
create policy "households_select_member" on public.households
  for select to authenticated
  using (public.is_household_member(id) or public.is_staff());

drop policy if exists "households_update_member" on public.households;
create policy "households_update_member" on public.households
  for update to authenticated
  using (public.is_household_member(id) or public.is_staff());

drop policy if exists "profiles_select_household" on public.profiles;
create policy "profiles_select_household" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_staff()
    or exists (
      select 1
      from public.household_members me
      join public.household_members them on them.household_id = me.household_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (
    id = auth.uid()
    or public.is_staff()
  );

grant execute on function public.household_has_pro_access(uuid) to authenticated;
grant execute on function public.household_plan_limits(uuid) to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_feature_enabled(text, uuid) to authenticated;
grant execute on function public.admin_set_entitlement(uuid, text, boolean, timestamptz, text) to authenticated;
grant execute on function public.admin_set_profile_flags(uuid, text, boolean) to authenticated;
grant execute on function public.start_household_trial(int) to authenticated;
