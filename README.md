# TrichFree Desk

A Chrome/Edge extension (Manifest V3) for people with trichotillomania. While you study or work, it watches the webcam **on your device** with MediaPipe hand and face landmarks. When a hand stays at one of your pulling zones for about 1.5 s, it plays a soft chime and one of **your own** recorded voice clips. Every episode is logged (timestamps only, never video) with whether the hand came down within 10 s. A pilot mode randomises "chime only" vs "chime + own voice".

The spec is `../TrichFree_Desk_MVP_Build_Spec.md`. Choices the spec left open are in [DECISIONS.md](DECISIONS.md), and milestone status is in [PROGRESS.md](PROGRESS.md).

## Setup

```bash
npm install            # also copies MediaPipe WASM into public/mediapipe/wasm (postinstall)
npm run fetch-models   # downloads hand_landmarker.task + face_landmarker.task (float16) into public/mediapipe/models
npm run build          # → dist/
```

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | Vitest unit tests (all of `src/core`, privacy, messages, replay fixtures) |
| `npm run e2e` | Playwright: loads `dist/` in Chromium with a fake camera, onboards, runs desk mode, checks offscreen doc, fps and badge (build first) |
| `npm run replay -- test/fixtures/*.json` | Runs detector + engine headlessly over landmark recordings and prints events |
| `npm run fixtures` | Regenerates the 4 synthetic fixtures |
| `node scripts/soak.mjs 10 [--video=clip.mjpeg]` | Background soak: desk mode on, app tab closed, another page in front; reports min/avg fps |
| `node scripts/make-icons.mjs` | Regenerates the icons |
| `npm run package` | Builds and zips `release/trichfree-desk-vX.Y.Z.zip` for the Web Store |

### Load unpacked (development and pilot fallback)
1. Run `npm run build` (or unzip a release zip into a folder).
2. Open `chrome://extensions` (Edge: `edge://extensions`) and switch on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `dist/` folder (or the unzipped folder).
4. Pin **TrichFree Desk** from the puzzle-piece menu so the toolbar badge is visible.
5. The setup page opens by itself. When asked for the camera and microphone, choose **Allow** (not "Allow this time"), so desk mode can use the camera in the background.

### Environment variables (all optional, read at build time)
Copy `.env.example` to `.env`.

| Variable | Effect |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Enables pilot uploads. The URL is added to `host_permissions` and CSP `connect-src`. Without them the pilot log stays local (CSV export). |
| `VITE_EXIT_SURVEY_URL` | The link shown after pilot day 14. |
| `VITE_TEAM_EMAIL` | Shown in "Delete all my data" for deleting uploaded pilot rows. |

## Architecture

```
Service worker (src/background/sw.ts)  owns the on/off intent; offscreen lifecycle; commands; notifications;
   │                                   alarms (30 s heartbeat, 3 h auto-stop, pause); idle/lock stop; badge
   ▼
Offscreen document (src/offscreen)     getUserMedia → MediaStreamTrackProcessor ──transfer──► Vision worker
   │                                   AudioContext player (pre-decoded clips + synth chime)
   │                                   core/engine reducer → Dexie logs → upload queue
Vision worker (src/workers)            MediaPipe Hand + Face landmarkers (bundled WASM/models, GPU→CPU fallback)
                                       → core/pipeline (face frame → features → scorer → temporal) → DetectorEvents
```

- `src/core/` is pure TypeScript with no DOM-only APIs and no `chrome.*`, and runs in Node for tests and replay. Files: `faceIndices`, `faceFrame`, `zones`, `features`, `scorer`, `temporal`, `pipeline`, `engine`, `arms`, `clipPicker`, `audioProcess`, `calibration`, `replay`, `detectorConfig`.
- `src/shared/` holds the Dexie schema, typed messages, telemetry mapper, upload queue, backup, CSV export and copy.
- `src/app/` is the full UI (hash routes: welcome, consent, safety, record, calibrate, desk, progress, settings, debug), and `src/popup/` is the toolbar popup.
- No content scripts, no `tabs`/`history`/`<all_urls>`. Video frames never leave the worker. Only JSON landmarks move between contexts.

## Chrome Web Store (Unlisted)
1. `npm run package`, then test the zip in a fresh profile: unzip it and use Load unpacked.
2. Developer Dashboard → New item → upload the zip.
3. Fill the listing from `store/listing.md`, the privacy tab from `store/permissions.md`, and host `store/privacy-policy.md` and link it.
4. Set visibility to **Unlisted** and submit. Review can take several days, longer for camera extensions, so submit early.

## Pilot runbook
1. **Issue codes:** generate codes `TF-XXXX` (4 uppercase letters or digits), for example `TF-7K2M`. Keep the code↔person list **offline**. The app never stores names.
2. **Backend (optional):** create a Supabase project and run `supabase/schema.sql` in the SQL editor (tables are insert-only for `anon`). Build with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set, then package.
3. **Enrol:** the participant installs, enters the code on the consent screen and agrees to the pilot notice. The enrolment date is day 1.
4. **Schedule:** days 1–3 are baseline (detect and log only, silent). Days 4–14 randomise each episode to CHIME or VOICE in permuted blocks of 4, seeded on the code. After day 14 it is always VOICE, with a banner and the exit-survey link.
5. **Read the data:** Supabase dashboard → Table editor (`episodes`, `sessions`, `events`, `calibrations`), or SQL, for example:
   ```sql
   select arm, count(*) filter (where outcome in ('interrupted')) * 1.0 / count(*) as interrupted_rate, count(*)
   from episodes where alert_at is not null and outcome <> 'false_alarm' and pilot_day between 4 and 14
   group by arm;
   ```
6. **No backend:** participants use Settings → **Export pilot log (CSV)** (`episodes.csv`, `sessions.csv`, `events.csv`, same columns) and email the files.
7. **Deletion requests:** delete rows by `participant_code` in the dashboard.

## Manual checklist (run on your own laptops, one Mac and one Windows)
1. Five real reach-to-hair gestures → at least 4 alerts.
2. Drink water, rest your chin, adjust glasses and scratch your nose, 3× each → no more than 2 alerts in total.
3. Switch to another app full-screen for 10 minutes and do 3 gestures → alerts still fire. Record the fps from the debug log (or the popup pill).
4. Alert-to-sound latency is under 300 ms (event `alert_latency` in the events table or the Debug page).
5. Export, delete all data, then import → clips and history are restored.
6. Global shortcuts and notification buttons log feedback while another app is focused.
7. Open Zoom or Photo Booth to take the camera → badge shows `II`. Close it → detection resumes within 20 s.
8. Close and reopen Chrome while desk mode was on → desk mode is off and the popup offers a restart (the camera must not auto-start silently).

## Debugging and tuning
- Settings → Advanced → **Show the debug page** opens `#/debug`: a live overlay (landmarks, zones in face units, r, pinch, pSmooth, state), plus **Record 60 s** (landmarks only), which you can download and replay with `npm run replay -- file.json`.
- Thresholds live in `src/core/detectorConfig.ts` (Section 15 of the spec).
