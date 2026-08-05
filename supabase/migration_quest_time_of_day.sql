-- Quest time-of-day, assignee, household timezone, offline award idempotency,
-- and incomplete-quest reminder templates.

-- Activities: expected time of day + optional assignee (null = everyone)
alter table public.activities
  add column if not exists time_of_day text not null default 'all_day';

alter table public.activities
  drop constraint if exists activities_time_of_day_check;

alter table public.activities
  add constraint activities_time_of_day_check
  check (time_of_day in ('morning', 'afternoon', 'evening', 'night', 'all_day'));

alter table public.activities
  add column if not exists assignee_participant_id uuid
  references public.participants (id) on delete set null;

create index if not exists activities_assignee_idx
  on public.activities (assignee_participant_id)
  where assignee_participant_id is not null;

-- Households: IANA timezone for local-day reminders
alter table public.households
  add column if not exists timezone text not null default 'America/Chicago';

-- Ledger: idempotent client keys for offline sync
alter table public.points_ledger
  add column if not exists client_request_id uuid;

create unique index if not exists points_ledger_client_request_id_uidx
  on public.points_ledger (client_request_id)
  where client_request_id is not null;

-- Reminder template (push + in-app share this copy; Edge Function substitutes {{summary}})
insert into public.notification_templates (key, channel, subject, body) values
  (
    'quest_incomplete_reminder',
    'push',
    'Quests still open',
    '{{summary}}'
  )
on conflict (key) do nothing;
