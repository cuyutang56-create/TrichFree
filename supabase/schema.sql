-- TrichFree Desk pilot telemetry (optional). Insert-only for the anon key; the team reads data in the dashboard.
create table episodes (
  id uuid primary key, participant_code text not null, session_id uuid,
  started_at timestamptz, alert_at timestamptz, ended_at timestamptz,
  zone text, arm text, pilot_day int, clip_count int, outcome text,
  seconds_to_hand_down real, pinch_fraction real, r_median real, p_smooth_max real,
  pulled_during boolean, app_version text, inserted_at timestamptz default now()
);
create table sessions (
  id uuid primary key, participant_code text not null,
  started_at timestamptz, ended_at timestamptz, desk_minutes real,
  fps_avg real, delegate text, output_mode text, app_version text,
  inserted_at timestamptz default now()
);
create table events (
  id uuid primary key, participant_code text not null, session_id uuid,
  type text, t timestamptz, app_version text, inserted_at timestamptz default now()
);
create table calibrations (
  id uuid primary key, participant_code text not null, created_at timestamptz,
  zones text[], validation_pos int, validation_neg int, dwell_ms int, app_version text,
  inserted_at timestamptz default now()
);
alter table episodes enable row level security;
alter table sessions enable row level security;
alter table events enable row level security;
alter table calibrations enable row level security;
create policy "insert only" on episodes for insert to anon with check (participant_code ~ '^TF-[A-Z0-9]{4}$');
create policy "insert only" on sessions for insert to anon with check (participant_code ~ '^TF-[A-Z0-9]{4}$');
create policy "insert only" on events for insert to anon with check (participant_code ~ '^TF-[A-Z0-9]{4}$');
create policy "insert only" on calibrations for insert to anon with check (participant_code ~ '^TF-[A-Z0-9]{4}$');
-- No select/update/delete policies for anon. The team reads data in the Supabase dashboard.
