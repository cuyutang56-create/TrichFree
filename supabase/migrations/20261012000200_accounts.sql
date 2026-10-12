-- Accounts: one profile and one preferences row per user. Every table is protected by row-level security:
-- a signed-in user can only ever see or change rows whose user id equals their own auth.uid().
-- Camera frames, landmarks, voice recordings and detection events are never stored here (see PRIVACY.md).

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or (char_length(display_name) between 1 and 60 and display_name !~ '[[:cntrl:]]')),
  privacy_policy_version text check (privacy_policy_version is null or privacy_policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_policy_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke all on table public.profiles from anon, authenticated;
grant select, update (display_name, privacy_policy_version) on table public.profiles to authenticated;

-- Server-side timestamps: clients cannot backdate a policy acceptance.
create function private.profiles_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.privacy_policy_version is distinct from old.privacy_policy_version then
    new.accepted_policy_at := case when new.privacy_policy_version is null then null else now() end;
  else
    new.accepted_policy_at := old.accepted_policy_at;
  end if;
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.profiles_touch();

-- Every new auth user gets a profile.
create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- user_preferences ----------
-- Cross-device settings. `version` is bumped by the server on every write; clients update with
-- `where version = <the version they last saw>` (optimistic concurrency), so a device holding stale data
-- can never overwrite newer settings. See src/sync/ for the client side and ARCHITECTURE.md for the policy.
create function private.valid_zones(z text[]) returns boolean language sql immutable set search_path = '' as $$
  select z is not null
    and cardinality(z) between 1 and 7
    and z <@ array['crown', 'hairline', 'sides', 'strands', 'brows', 'lashes', 'beard']::text[]
    and cardinality(z) = (select count(distinct x) from unnest(z) as x);
$$;
grant execute on function private.valid_zones(text[]) to authenticated;

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version bigint not null default 1,
  schema_version smallint not null default 1 check (schema_version between 1 and 100),
  intervention text not null default 'chime' check (intervention in ('voice', 'chime', 'visual', 'off')),
  sensitivity text not null default 'balanced' check (sensitivity in ('relaxed', 'balanced', 'sensitive')),
  zones text[] not null default array['crown', 'hairline', 'strands']::text[] check (private.valid_zones(zones)),
  cooldown_seconds integer not null default 30 check (cooldown_seconds between 5 and 600),
  follow_up boolean not null default true,
  chime_volume smallint not null default 70 check (chime_volume between 0 and 100),
  visual_notifications boolean not null default true,
  micro_prompt text not null default 'lower_hand'
    check (micro_prompt in ('none', 'lower_hand', 'hold_something', 'posture', 'break', 'rotate')),
  supportive_text text check (supportive_text is null or (char_length(supportive_text) <= 140 and supportive_text !~ '[[:cntrl:]]')),
  companion_enabled boolean not null default false,
  companion_tone text not null default 'gentle' check (companion_tone in ('gentle', 'playful')),
  daily_goal_minutes smallint not null default 30 check (daily_goal_minutes between 5 and 480),
  reminder_time text check (reminder_time is null or reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reduce_motion boolean not null default false,
  updated_by text check (updated_by is null or updated_by ~ '^(extension|web):[a-z0-9-]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;

create policy "preferences: read own" on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "preferences: create own" on public.user_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "preferences: update own" on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- No delete policy: rows go away with the account (on delete cascade).

revoke all on table public.user_preferences from anon, authenticated;
grant select, insert, update on table public.user_preferences to authenticated;

create function private.preferences_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger preferences_version before insert or update on public.user_preferences
  for each row execute function private.preferences_version();
