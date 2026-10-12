-- Optional reflections (user-written notes), data export and self-service account deletion.

-- ---------- reflections ----------
-- Written only when the user explicitly saves one. Never generated from detection data.
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  usefulness smallint check (usefulness between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reflections_user_created on public.reflections (user_id, created_at desc);
alter table public.reflections enable row level security;

create policy "reflections: read own" on public.reflections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "reflections: create own" on public.reflections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "reflections: update own" on public.reflections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reflections: delete own" on public.reflections for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.reflections from anon, authenticated;
grant select, insert, delete on table public.reflections to authenticated;
grant update (body, usefulness) on table public.reflections to authenticated;

create function private.reflections_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger reflections_touch before insert or update on public.reflections
  for each row execute function private.reflections_touch();

-- ---------- export ----------
-- Everything the account stores, as one JSON document. Runs with the caller's rights, so RLS applies.
create function public.export_my_data() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'trichfree-account-export',
    'version', 1,
    'exported_at', now(),
    'account', jsonb_build_object('id', auth.uid(), 'email', auth.jwt() ->> 'email'),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'preferences', (select to_jsonb(u) from public.user_preferences u where u.user_id = auth.uid()),
    'reflections', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.created_at) from public.reflections r where r.user_id = auth.uid()),
      '[]'::jsonb)
  );
$$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ---------- account deletion ----------
-- Deletes the caller's auth user. Profiles, preferences and reflections are removed by on-delete-cascade,
-- as are the user's sessions and refresh tokens. Hosted backups may keep a copy until they expire
-- (documented in PRIVACY.md).
create function public.delete_my_account() returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
