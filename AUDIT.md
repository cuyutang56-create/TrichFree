# TrichFree repository audit

Date: 2026-10-12. Commit audited: `0566bc7` (branch `claude/affectionate-knuth-s50xg8`, identical to `main`).

Everything below is based on reading the code and running it. Each finding cites a file and line, or a command and its output. Anything that was not run is marked **not verified**.

## 1. Method

- I read every file under `src/` (core, workers, offscreen, background, shared, app, popup), plus `test/`, `e2e/`, `scripts/`, `supabase/schema.sql`, `store/`, `.github/workflows/ci.yml`, `README.md`, `DECISIONS.md` and `PROGRESS.md`.
- Commands run on Ubuntu 24.04 with Node 22.22, 4 vCPU Xeon @ 2.1 GHz, **no GPU**:
  - `npm ci`: OK; 1 high-severity advisory (see S3).
  - `npm run typecheck` (TypeScript 7): 0 errors.
  - `npm test` (Vitest): **14 files, 99 tests, all passing**.
  - `npm run fetch-models`, then `npm run build`: OK.
  - `npm run e2e` against the pre-installed Chromium 141 via `executablePath`, with xvfb and a fake camera: the extension loaded, onboarding pages rendered, desk mode created the offscreen document and the worker processed frames. The test **failed** on its `fps ≥ 5` assertion with **2.76 fps** measured. This is CPU-only inference on this machine, not a functional failure (see R4).

## 2. Current architecture

```
Chrome / Edge MV3 extension "TrichFree Desk" (the only deliverable)
├─ Service worker  src/background/sw.ts
│    owns desk on/off intent, offscreen lifecycle, alarms (heartbeat 30 s, auto-stop 3 h, pause, reminder),
│    chrome.idle stop, notifications + buttons, global commands, toolbar badge; sole writer of chrome.storage.local
├─ Offscreen document  src/offscreen/offscreen.ts (+ player.ts)
│    getUserMedia → MediaStreamTrackProcessor → transfers the frame stream to the worker
│    core/engine reducer → Web Audio chime + pre-decoded voice clips → Dexie logs → optional upload queue
├─ Vision worker  src/workers/vision.worker.ts
│    MediaPipe HandLandmarker + FaceLandmarker + hair segmenter (bundled WASM + models, GPU→CPU fallback)
│    → core/pipeline (face frame → features → scorer → temporal filter) → DetectorEvents (JSON only)
├─ App page  src/app (React 18, hash routes: welcome, consent, safety, record, calibrate, home, progress, settings, debug)
└─ Popup  src/popup
Storage: IndexedDB via Dexie (settings, clips, calibration, sessions, episodes, events, featureSamples,
         landmarkRecords, uploadQueue) + chrome.storage.local (deskState).
Backend (optional, pilot only): Supabase, 4 tables insert-only for `anon`, keyed by participant code (TF-XXXX).
```

`src/core/` is pure TypeScript (no DOM, no `chrome.*`) and runs in Node for tests and replay. This separation is good and is kept.

## 3. Working features (evidence)

| Feature | Evidence |
|---|---|
| Build, typecheck, unit tests | Commands above. 99/99 tests pass. |
| On-device detection pipeline (hand, face, hair contact → zones → score → EMA/dwell/hysteresis) | Replay fixtures: `pinch-at-crown` and `pinch-strand` produce 1 alert each; `chin-rest`, `chin-rest-long-hair`, `drinking-cup` and `glasses-adjust` produce 0 (`test/replay.test.ts`). |
| Real-time engine (ALERT_1 → ALERT_2 after 10 s → PERSIST, cooldown, outcomes) | `test/engine.test.ts` covers every transition. |
| Offscreen camera + worker in the background | E2E: offscreen context created, STATUS heartbeats arrive, worker processes frames (2.76 fps CPU-only here). |
| Voice clip processing (trim, −3 dBFS peak, 22.05 kHz WAV) | `test/audioProcess.test.ts`. |
| Pilot arms (permuted blocks, baseline, forced chime) | `test/arms.test.ts`. |
| Personal classifier with hold-out gate | `test/classifier.test.ts`. |
| No media in telemetry; network limited to the upload queue | `test/privacy.test.ts`. |
| Local backup / import / delete-all | Code: `src/shared/backup.ts`. **Not verified end to end** (no test). |

## 4. Broken, incomplete or at-risk features

| # | Severity | Finding | Evidence |
|---|---|---|---|
| B1 | **P0 (requirement)** | No accounts, no authentication, no cloud persistence, no cross-device synchronisation. All user data is in one browser profile's IndexedDB. | `src/shared/db.ts`; the only network path is `src/shared/uploadQueue.ts` (anonymous pilot inserts). |
| B2 | **P0 (requirement)** | No public website or web app exists. | Repository tree. |
| B3 | **P1 (requirement)** | Onboarding has **5 required screens** (welcome → consent → safety → record → calibrate), and calibrate has 4 sub-steps. A voice recording is required before continuing (`Record.tsx:121`). A first reminder takes several minutes, against a limit of 3 steps / about 1 minute. | `src/app/App.tsx:19`, `src/app/screens/*.tsx`. |
| B4 | **P0** | In **silent modes a visible "Hands down?" notification still appears**: the engine emits `notifyAlert` for every alert, including arm `SILENT` (pilot baseline days 1–3 and the user's "Silent (log only)" mode). The offscreen document forwards it whenever notifications are on. This contaminates the pilot baseline and breaks the "log only" promise. | `src/core/engine.ts:86`, `src/offscreen/offscreen.ts:243-246`. |
| B5 | **P0** | **False "Detection stopped responding" watchdog on slow computers.** fps < 3 for 10 s is treated as a stall: status becomes `problem`, the badge shows `!` and a sticky notification fires, even though frames are still being processed. Measured here: 2.76 fps, which would trigger it. | `src/offscreen/offscreen.ts:296-299`, `src/background/sw.ts:143,194-200`. |
| B6 | **P1** | **Monitoring stops after 10 minutes without keyboard or mouse input**, even while the user is at the desk (for example watching a lecture, a common time for pulling). `chrome.idle` measures input, not presence. | `src/background/sw.ts:70,224-231`. |
| B7 | P1 | Starting from the popup without a persistent camera grant ends in a generic "Something went wrong" pill. The offscreen document cannot show a permission prompt, and the popup gives no path to fix it. | `src/offscreen/offscreen.ts:125`, `src/app/components/StatusPill.tsx:12`. |
| B8 | P1 | Voice clips cannot be deleted (only replaced), and there is no preview before saving. | `src/app/screens/Record.tsx`. |
| B9 | P1 | No user-configurable cooldown, chime volume, visual-only mode or "disabled" mode distinct from logging. Cooldown is fixed at 5 s, so a hand resting near the detection boundary can re-alert about every 7.5 s (1.5 s dwell + 1 s hand-left + 5 s cooldown). | `src/core/detectorConfig.ts:42`, `src/core/temporal.ts:105`. |
| B10 | P1 | **Unverified safety content is shown to users**: "Singapore helpline (to be confirmed by the team)" with an empty number. | `src/shared/safety.ts:13-16`, rendered by `SupportCard.tsx`. |
| B11 | P2 | A daily reminder notification is **on by default at 19:00**, with streak-pressure copy ("our streak ends at midnight"). This is opt-out nagging in a mental-health context. | `src/shared/db.ts:94`, `src/shared/mochi.ts:26-29`. |
| B12 | P2 | E2E asserts an absolute `fps ≥ 5`, which depends on the hardware (it fails on this CPU-only runner). Only one E2E test exists; there is no UI test of settings, recording, pause/resume, camera denial or export/delete. | `e2e/extension.spec.ts:74`. |
| B13 | P2 | `APP_VERSION` is hard-coded and duplicated from `package.json`. | `src/shared/telemetry.ts:6`. |

## 5. Security and privacy findings

| # | Severity | Finding | Evidence / note |
|---|---|---|---|
| S1 | **Medium** | **Pilot telemetry can be spoofed.** The anon key ships inside the extension, and the insert policies only check the *format* of the participant code. Anyone can insert fabricated episodes for any code. | `supabase/schema.sql:28-31`. Fix: an allowlist of issued codes checked by a `SECURITY DEFINER` function. |
| S2 | Low–Medium | The extension CSP has no `default-src`. Only `script-src`, `object-src` and `connect-src` are restricted, so `img-src`, `media-src` and `frame-src` are unrestricted. | `manifest.config.ts:24-26`. |
| S3 | High (advisory) / Low (effective) | `npm audit`: `source-map-js` 1.0.0–1.2.1, event-loop DoS (GHSA-68fv-2mgg-jv7q). Build-time transitive dependency, not shipped in the extension. | `npm audit`. Fix: `npm audit fix`. |
| S4 | Low | `importBackup` writes rows from a user-chosen zip without validating their shape. It only touches whitelisted tables and is local and user-initiated. | `src/shared/backup.ts:24-41`. |
| S5 | Medium (privacy UX) | See B4: a visible cue in modes the user chose to be silent. | — |
| S6 | Info | No secrets, tokens, real user records or personal emails in the repo. `.env` is git-ignored. Only the public anon key is expected at build time. | `grep` over the repository. |
| S7 | Medium (accuracy of public claims) | `store/listing.md` says "No streaks, no shame" (the app has streaks), "Record five short lines" (one is needed) and "calibrate in about 5 minutes" (about 2 minutes now). The privacy policy says nothing about accounts, because none exist yet. | `store/listing.md:13-16`. |
| S8 | Low | Deleting pilot rows already uploaded requires emailing the team. There is no self-service deletion. | `README.md` pilot runbook. |
| S9 | Info | Strengths: no content scripts, no `tabs`/`history`/`<all_urls>`, landmarks only between contexts, `assertNoMedia` before every upload, MV3 with no remote code. | `test/privacy.test.ts`. |

## 6. Data persistence limitations

- Everything lives in one Chrome profile: IndexedDB plus `chrome.storage.local`. Uninstalling the extension, clearing site data or using another profile or computer starts from zero.
- The only portability is a manual backup zip (`Settings → Export backup`).
- No schema versioning beyond Dexie `version(1)`, and no migration path for synced data.
- The pilot upload queue retries with backoff, but it is anonymous and insert-only, so it cannot restore anything.

## 7. Cross-device limitations

- No identity, so nothing ties two devices together.
- Calibration and the personal model are camera- and device-specific by nature. They **should not** be synced blindly; this is a design constraint, not only a gap.
- Voice clips are device-local. Syncing them would mean uploading recordings of a sensitive nature, so cross-device must work **without** uploading audio. The user re-records on the new device, and this must be explained.

## 8. Detection reliability risks

1. **Touching vs pulling is not separable from a 2D webcam alone.** Scratching the scalp, fixing hair or resting the head on a hand can look like a reach. The rule-based zones plus dwell reduce this, but cannot remove it. Product copy must say "possible hand-to-hair movement", not "pulling detected".
2. **Depth ambiguity:** `r = handScale / faceW` within 0.45–0.85 (±15%) is a heuristic depth check, validated on one demo video (median r 0.52) and synthetic fixtures.
3. **Occlusion:** hands behind the head or out of frame are invisible. The face can be lost while the hand covers it (handled with a 1.5 s hold, then a 5 s episode hold).
4. **Low frame rates:** CPU-only devices may run at about 3 fps (measured here). Dwell times of 0.6–1.5 s then rest on very few frames, and the watchdog mislabels this as a stall (B5).
5. **Evidence base:** six synthetic fixtures, one demo video and **one real-user test** (2026-10-05, which found the missed strand pull later fixed). There is no measured real-world precision or recall. The hair threshold was tuned on 8 masks from one video.
6. **Lifecycle:** offscreen survival over 60 min behind a full-screen app on real macOS/Windows Chrome is **not verified**, as PROGRESS.md itself states.

## 9. UI/UX problems

- Onboarding is long (B3). Consent, safety and a pilot code sit in the critical path. Calibration is mandatory although uncalibrated defaults exist and work (`thresholdsFrom(null)` in `core/features.ts:15-19`).
- The mascot dominates every screen: full-screen saturated indigo and lime colour fields, random idle animations every 14–26 s and a "Sassy" default tone. The brief asks for calm, trustworthy, low-stimulation design with an optional, unobtrusive Mochi.
- The dashboard does not show camera status, the selected intervention or account/sync status at a glance, and there is no "Test reminder".
- Accessibility gaps: segmented controls use `role="radio"` without arrow-key handling. Symbols are used as button labels ("●", "▶", "■"). Modals have no focus management or Escape. Some state is shown by colour only (week strip).
- Feedback buttons ("Not a pull" / "I just pulled") appear even when monitoring is off, with no explanation.

## 10. Recommended architecture

1. **Keep** the extension's proven core: the offscreen camera, the worker and `src/core`.
2. **Add Supabase** (already a dependency): Auth with passwordless **email one-time codes**. Codes work across devices; magic links with PKCE fail when opened on another device. Use Postgres with **row-level security** on every user table, one versioned `user_preferences` row per user with CHECK constraints, opt-in `reflections`, an anon insert-only `pilot_interest` table with a rate cap, and a `delete_my_account()` RPC that cascades.
3. **Sync engine** in shared, pure TypeScript: a field-level three-way merge with optimistic concurrency (`version`), so a stale device can never overwrite newer data. Combine non-conflicting edits; on a true conflict the server copy wins and the user sees a notice. Offline changes are queued.
4. **The extension service worker owns its own session** (stored in `chrome.storage.local`) and runs sync. This avoids two contexts racing on refresh tokens.
5. **Website**: a static Vite multi-page build (landing, privacy, web app, try-it demo) on any static host with strict security headers. The web app uses the same Supabase project, so preferences edited on the web reach the extension through the database. The `/try` demo reuses `src/core` and the vision worker in the page, so "Try TrichFree" works with nothing installed.
6. **Local Supabase stack** (`supabase start`, Docker) for real integration tests: RLS isolation, persistence, OTP sign-in through the local mail catcher, and a **two-profile cross-device E2E**.

## 11. Prioritised implementation plan

**P0 (release blockers):** fix B4 silent-mode notifications, B5 slow-device watchdog and B10 unverified safety content; harden S1 pilot spoofing, S2 CSP and S3 dependency advisory; correct misleading claims (S7); auth; persistence with RLS and isolation tests; working builds.

**P1 (essential):** cross-device sync with conflict policy; 2-step onboarding; dashboard with monitoring/camera/intervention/account status and Start/Pause/Stop/Test; intervention modes (voice/chime/visual/off), volume, cooldown, follow-up toggle and voice delete/preview; presence-aware idle stop (B6); camera-permission recovery (B7); website, web app, try-it demo and pilot interest form; export and account deletion; deployment configuration; E2E and integration tests; documentation.

**P2 (only after P0/P1):** Mochi refinements, opt-in activity summaries, extra insights, animation polish.

## 12. Resolution (2026-10-12)

What happened to each finding in this release. The evidence is in the tests named, which run in CI.

| # | Resolution | Evidence |
|---|---|---|
| B1 | **Fixed.** Accounts (email one-time codes), Postgres with row-level security, cross-device sync with a documented conflict policy, guest mode by default. | `test/integration/*.int.test.ts` (50), `e2e/cross-device.spec.ts` (two independent browser profiles) |
| B2 | **Fixed.** Website: landing page, privacy policy, `/try/` demo, `/app/` account page, pilot form. Not deployed (needs the team's hosting). | `e2e/website.spec.ts` |
| B3 | **Fixed.** Onboarding is 2 steps. Voice recording and calibration are optional; the test reminder comes in step 2. | `e2e/extension.spec.ts` (first run) |
| B4 | **Fixed.** Silent modes never notify. The new "visual" mode is the explicit, quiet notification. | `test/engine.test.ts` |
| B5 | **Fixed.** "Slow" and "stalled" are separate states, and the slow threshold scales with the target rate. On machines without GPU acceleration the CPU path is used (2.4 → 11–14 fps here). | `test/health.test.ts`, docs/DETECTION_REPORT.md |
| B6 | **Fixed.** Presence-aware: lock stops monitoring; keyboard idle stops it only if nobody was seen for 2 minutes; nobody in view for 10 minutes stops it. | `test/health.test.ts` |
| B7 | **Fixed.** The popup opens a visible camera-access page when permission is needed; the denied and no-camera states have clear messages. | `e2e/extension.spec.ts` |
| B8 | **Fixed.** Record, preview, save or discard, replace, delete, test. | `e2e/extension.spec.ts` (voice) |
| B9 | **Fixed.** Reminder type voice, chime, visual or off; volume; quiet time 5 s–10 min (default 30 s); optional follow-up; suggestion prompts. | `test/engine.test.ts`, `test/evaluate.test.ts` (alert loop) |
| B10 | **Fixed.** Verified Singapore helplines and international BFRB organisations (checked 2026-10-12; re-check before launch). | `src/shared/safety.ts` |
| B11 | **Fixed.** The daily reminder is off by default; companion copy has no guilt or loss framing (guarded by a test). | `test/gamify.test.ts` |
| B12 | **Fixed.** The frame-rate threshold is configurable; there are 21 browser tests (extension, cross-device, website) plus axe scans. | `e2e/` |
| B13 | **Fixed.** The version comes from `package.json`. | `src/shared/config.ts` |
| S1 | **Fixed.** An allowlist of issued codes, checked by a security-definer function. The codes are now long and random (`TF-XXXX-XXXX`, about 39 bits) so they cannot be guessed. | `test/integration/rls.int.test.ts`, `test/pilot.test.ts` |
| S2 | **Fixed.** `default-src 'self'` and a full directive set for the extension; a strict CSP and security headers for the website, exercised by the browser tests. | `test/privacy.test.ts`, `test/manifest.test.ts`, `e2e/website.spec.ts` |
| S3 | **Fixed.** `npm audit fix`; 0 vulnerabilities. | `npm audit` |
| S4 | **Partly fixed.** Imported settings are migrated and validated (invalid preference values dropped); other tables are restored as-is. The import is local, user-initiated and limited to known tables. | `test/settings.test.ts` |
| S5 | Fixed with B4. | — |
| S6 | **Still true** (no secrets in the repository or its history, re-checked). | SECURITY.md |
| S7 | **Fixed.** The listing, permission justifications and privacy policy are rewritten for the current product. | `store/` |
| S8 | **Open (accepted).** Deleting uploaded pilot rows still goes through the team, because rows are pseudonymous and keyed by code, not by account. The runbook is in DEPLOYMENT.md. | — |
| S9 | Kept, and extended: no web-accessible resources; the manifest environment is tested. | `test/privacy.test.ts` |

Found during the work (not in the original audit), all fixed:
- the pilot upsert needed a SELECT policy, so every upload would have failed;
- a browser relaunch could wipe "monitoring was on";
- a stale heartbeat alarm could reopen the camera;
- at about 3 fps no reach was ever caught, plus three related timing bugs;
- builds configured through `.env` files had their backend blocked by the extension's CSP;
- keyboard shortcuts were never assigned;
- the website's social preview image was missing;
- the extension did not show changes from another device until its 15-minute sync.

Details are in the commit history and DECISIONS.md.
