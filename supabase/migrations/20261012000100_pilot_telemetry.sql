-- Pilot telemetry (optional research pilot). Rows are keyed by an anonymous participant code (TF-XXXX);
-- the team keeps the code-to-person list offline. Never contains video, images or audio.
-- Idempotent so it also applies cleanly to a project that ran the old supabase/schema.sql by hand.

create table if not exists public.episodes (
  id uuid primary key, participant_code text not null, session_id uuid,
  started_at timestamptz, alert_at timestamptz, ended_at timestamptz,
  zone text, arm text, pilot_day int, clip_count int, outcome text,
  seconds_to_hand_down real, pinch_fraction real, r_median real, p_smooth_max real,
  pulled_during boolean, app_version text, inserted_at timestamptz default now()
);
create table if not exists public.sessions (
  id uuid primary key, participant_code text not null,
  started_at timestamptz, ended_at timestamptz, desk_minutes real,
  fps_avg real, delegate text, output_mode text, app_version text,
  inserted_at timestamptz default now()
);
create table if not exists public.events (
  id uuid primary key, participant_code text not null, session_id uuid,
  type text, t timestamptz, app_version text, inserted_at timestamptz default now()
);
create table if not exists public.calibrations (
  id uuid primary key, participant_code text not null, created_at timestamptz,
  zones text[], validation_pos int, validation_neg int, dwell_ms int, app_version text,
  inserted_at timestamptz default now()
);

-- Issued participant codes. Only codes listed here can upload, so the public anon key cannot be used
-- to fabricate pilot data for arbitrary codes. The team inserts codes in the dashboard (see README pilot runbook).
create table if not exists public.pilot_codes (
  code text primary key check (code ~ '^TF-[A-Z0-9]{4}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.pilot_codes enable row level security; -- no policies: invisible to clients
revoke all on table public.pilot_codes from anon, authenticated;

-- Helpers live in a schema the REST API does not expose, so they cannot be called as RPCs.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_issued_pilot_code(c text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pilot_codes p where p.code = c and p.active);
$$;
revoke all on function private.is_issued_pilot_code(text) from public;
grant execute on function private.is_issued_pilot_code(text) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['episodes', 'sessions', 'events', 'calibrations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "insert only" on public.%I', t);
    execute format('drop policy if exists "pilot insert with issued code" on public.%I', t);
    execute format(
      'create policy "pilot insert with issued code" on public.%I for insert to anon with check (private.is_issued_pilot_code(participant_code))', t);
    -- Least privilege: the anon key may only insert (plain INSERT; the upload queue treats a duplicate-key
    -- error as "already uploaded"). No select/update/delete for clients, so nothing can be read back.
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant insert on table public.%I to anon', t);
  end loop;
end $$;
