-- Interactive onboarding guide: track completion per user
-- Run after migration_herohabits.sql

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;
