-- Soft launch: auto-start Pro trial on new households; hide pricing until flagged on.
-- Run in Supabase SQL Editor after migration_herohabits.sql.

-- New households start on a 15-day Pro trial (no pricing/checkout required).
create or replace function public.ensure_household_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.household_entitlements (household_id, plan, status, trial_ends_at)
  values (new.id, 'trial', 'active', now() + interval '15 days')
  on conflict (household_id) do nothing;
  return new;
end;
$$;

-- Soft-launch backfill: existing free guilds (no Stripe) get a trial too,
-- so they are not stuck on Free while pricing UI is hidden.
update public.household_entitlements
set
  plan = 'trial',
  status = 'active',
  trial_ends_at = coalesce(trial_ends_at, now() + interval '15 days'),
  updated_at = now()
where plan = 'free'
  and coalesce(stripe_subscription_id, '') = '';

-- Feature flag: pricing / billing upgrade UI (nav, compare table, prices, checkout CTAs).
-- Keep off during soft launch; turn on (enabled=true, rollout='on') when ready to monetize.
insert into public.feature_flags (key, description, enabled, rollout)
values (
  'billing_pricing',
  'Show pricing details, plan comparison, and billing upgrade UI',
  false,
  'off'
)
on conflict (key) do nothing;
