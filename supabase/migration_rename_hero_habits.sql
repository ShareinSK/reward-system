-- Rename public brand to Hero Habits (one b)
-- Safe to re-run.

update public.households
set name = 'Hero Habits'
where name in ('HeroHabbits', 'Hero Habits');

update public.notification_templates
set
  subject = replace(subject, 'HeroHabbits', 'Hero Habits'),
  body = replace(body, 'HeroHabbits', 'Hero Habits')
where coalesce(subject, '') like '%HeroHabbits%'
   or body like '%HeroHabbits%';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  preferred_name text;
begin
  preferred_name := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, display_name)
  values (new.id, preferred_name);

  insert into public.households (name, invite_code, created_by, experience_mode)
  values (
    'Hero Habits',
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
  values ('Hero Habits', public.generate_invite_code(), auth.uid())
  returning id into hid;

  insert into public.household_members (household_id, user_id, role)
  values (hid, auth.uid(), 'owner');

  update public.profiles
  set active_household_id = hid, last_active_at = now()
  where id = auth.uid();

  return hid;
end;
$$;
