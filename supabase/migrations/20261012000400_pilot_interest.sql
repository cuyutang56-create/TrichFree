-- Pilot expression of interest from the public website.
-- Writes go through submit_pilot_interest() only: it never reveals whether an email is already on the list
-- (submitting twice looks identical), and it caps the overall submission rate to blunt spam.
-- Nobody but the team (dashboard / service role) can read the list.

create table public.pilot_interest (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role text not null check (role in ('self', 'parent', 'clinician', 'researcher', 'other')),
  age_confirmed boolean not null check (age_confirmed),
  contact_consent boolean not null check (contact_consent),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create unique index pilot_interest_email on public.pilot_interest (lower(email));
create index pilot_interest_created on public.pilot_interest (created_at);
alter table public.pilot_interest enable row level security; -- no policies: no direct client access
revoke all on table public.pilot_interest from anon, authenticated;

create function public.submit_pilot_interest(
  p_email text, p_role text, p_age_confirmed boolean, p_contact_consent boolean, p_note text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  recent int;
begin
  select count(*) into recent from public.pilot_interest where created_at > now() - interval '10 minutes';
  if recent >= 60 then
    raise exception 'too many submissions, please try again later' using errcode = 'P0001';
  end if;
  insert into public.pilot_interest (email, role, age_confirmed, contact_consent, note)
  values (lower(trim(p_email)), p_role, p_age_confirmed, p_contact_consent, nullif(trim(p_note), ''))
  on conflict ((lower(email))) do nothing;
end $$;
revoke all on function public.submit_pilot_interest(text, text, boolean, boolean, text) from public;
grant execute on function public.submit_pilot_interest(text, text, boolean, boolean, text) to anon, authenticated;
