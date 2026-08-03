-- Google OAuth: prefer full_name / name from provider metadata for display_name
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
