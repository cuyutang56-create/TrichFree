# TrichFree: independent release audit (12 October 2026)

**Branch audited:** `claude/affectionate-knuth-s50xg8` at `f54c8bd` (the "final report" state).
**Audit branch:** `claude/release-audit`. Every fix and test below is a separate commit on top of `f54c8bd`; the
implementation branch and `main` were not modified.

**Who audited.** The same AI coding agent that wrote most of the code, working adversarially against its own
earlier work: earlier test results were not trusted, new fixtures were written from scratch, and every finding
was reproduced before it was fixed. **This is not a third-party audit.** An external security, accessibility and
clinical-content review is still recommended (section 9).

**Method.** For every area in scope: read the code; write a test or probe that would fail if the area were
broken; run it against the code as it was at `f54c8bd`; fix what failed; run the same test again against the fix.
Exploratory probes that did not become committed tests are labelled *exploratory*.

---

## 1. Executive verdict

- **No Critical defect found.**
- **1 High defect found and fixed: the camera stayed on after "Turn camera off".** It affected the onboarding
  camera check, the 2-minute tune-up, the debug page and the website's `/try/` demo. The camera stayed on until
  the tab was closed. The product's core promise is that the user controls the camera, so this was the most
  serious finding.
- **4 Medium defects found and fixed:**
  - a hidden second camera stream on the dashboard;
  - a microphone that could keep recording, unseen, after the user left the Voice page;
  - switching off pilot data sharing did not stop rows that were already queued;
  - the pilot consent notice and privacy policy left out several fields the pilot sends, including which area of
    the head.
- **6 Low defects found and fixed:**
  - two error-handling gaps (camera permission revoked, voice save failure);
  - a packaging hazard (a dev configuration could reach a release zip);
  - a crash in replay tooling;
  - two documentation inaccuracies.
- **Areas probed adversarially with no defect found:**
  - authentication and sessions, row-level security and the exposed API surface;
  - the website ↔ extension bridge;
  - the local/cloud storage boundary and sync;
  - dependencies, secrets and logging;
  - the website at 320 px;
  - detection robustness on an independent synthetic challenge.
- Every fix has a regression test that fails on `f54c8bd` and passes now. The only exception is F-10, which is a
  documentation-only correction.
- **Full regression is green:** typecheck, 192 unit tests, 57 database integration tests against a real local
  Postgres + Auth stack, and 34 browser tests in Chromium. That totals 283 automated tests, 38 of them new.
- **What is still unproven** is everything that needs real people, real hardware or real accounts:
  - detection accuracy on real users;
  - usability with first-time users;
  - whether reminders are acceptable or reduce pulling;
  - Mac/Windows hardware behaviour;
  - production deployment.

**Recommendations**

| Decision | Recommendation |
|---|---|
| **16 October 2026 incubator demonstration** | **CONDITIONAL GO.** The demo must use the audited build. It needs one full rehearsal on the demo laptop's real webcam. It must be presented as a tested prototype that is not deployed and not user-validated, without clinical or accuracy claims. Conditions are in §10.A. |
| **Real-user pilot deployment** | **NO-GO for now.** The pilot first needs: ethics approval with consent materials matching the corrected notice; a verified production deployment; the real-hardware checklist on Mac and Windows; observed sessions with 3–5 first-time users; and a defined retention period for research data. After that, re-assess for a small feasibility pilot. Blockers are in §9. |

## 2. Verified architecture

Verified by reading the code and by the tests named in brackets (section 6 lists them).

**Browser extension (Chrome MV3, `src/`)**
- **Service worker (`src/background/sw.ts`)**
  - Runs the monitoring state machine (`deskState` in `chrome.storage.local`), alarms, keyboard commands and badge.
  - Implements the website bridge (`chrome.runtime.onMessageExternal`, exact-origin check in `src/shared/bridge.ts`).
  - Recovers after a browser restart without restarting the camera [extension.spec].
  - Runs the account service (`src/background/account.ts`): supabase-js with its session in
    `chrome.storage.local` (`tf-auth`).
  - Runs the field-level sync engine (`src/sync/`).
- **Offscreen document (`src/offscreen/offscreen.ts`)**
  - The only place monitoring opens the camera.
  - Runs `VisionClient` → web worker (`src/workers/vision.worker.ts`: MediaPipe hands, face and hair segmenter;
    models and WASM bundled, checksum-pinned).
  - Then the pipeline (`src/core/pipeline.ts`), the temporal filter (`src/core/temporal.ts`) and the reminder
    engine (`src/core/engine.ts`), which plays the chime/voice and shows notifications.
  - Also: logging to IndexedDB and the pilot upload queue.
- **Extension pages (`src/app/`, `src/popup/`)**
  - Onboarding (2 screens), dashboard, voice, settings, tune-up and debug.
  - Pages open the camera only for the onboarding check, tune-up, debug and the dashboard preview
    [media-lifecycle.spec].
- **Local storage**
  - IndexedDB (Dexie, `src/shared/db.ts`): settings, voice clips, calibration, sessions, episodes, events, feature
    samples, landmark records, upload queue and meta.
  - `chrome.storage.local`: `deskState`, `accountState`, `tf-auth`.
  - `chrome.storage.sync` is not used.
- **Network access**
  - Only `src/shared/uploadQueue.ts` (pilot, anonymous key) and `src/background/account.ts` (account) may make
    requests [privacy.test].
  - The extension CSP limits `connect-src` to `'self'` and the configured backend.
  - The guest build has no host permissions and no `externally_connectable`.

**Website (`web/`, static, Vite multi-page)**
- Pages:
  - landing page;
  - `/privacy/`;
  - `/try/`: the detector runs in the page and nothing is uploaded [website.spec];
  - `/app/`: the account page, with supabase-js and the session in the site's `localStorage`.
- Bridge client: `web/src/bridge.ts`.
- Security headers are generated into `_headers` and served by `vite preview` in tests [website.spec].
- Unset configuration hides features rather than faking them. A build without a backend says "Accounts are not
  available" and hides the pilot form (*exploratory*, 320 px probe).

**Backend (Supabase: Postgres + Auth, `supabase/migrations/`)**
- **Account tables:** `profiles`, `user_preferences` (versioned, `schema_version`, `updated_by`) and
  `reflections`, all with owner-only RLS and column-level grants.
- **RPCs:**
  - `export_my_data` and `delete_my_account`, authenticated only;
  - `submit_pilot_interest`, anonymous: validated, throttled, and it never reveals whether an email is registered.
- **Pilot tables:** `episodes`, `sessions`, `events` and `calibrations` are anonymous INSERT only, with an issued
  `pilot_codes` allowlist and no SELECT.
- **Private helpers** live in the `private` schema and are not reachable through the API [session.int].
- **Anonymous API surface** is exactly `/`, `/calibrations`, `/episodes`, `/events`, `/sessions` and
  `/rpc/submit_pilot_interest` [session.int].

**Data boundary (verified)**
- **Leaves the device:**
  - the account email;
  - the synced preference columns (exactly `COLUMN` in `src/sync/prefs.ts`) plus metadata;
  - reflections the user saves;
  - pilot rows, only for consenting participants with sharing on.
- **Never leaves the device:**
  - camera frames;
  - voice recordings;
  - detection history (except opt-in pilot rows);
  - landmarks;
  - the personal model.

  [storage-boundary.int, privacy.test, disclosure.test]

## 3. Threat model

**Assets**
1. **Live camera and microphone.** The user must always be able to turn them off.
2. **Voice recordings.**
3. **Behavioural history.** When, and where on the head, possible pulls happen; this is health-related.
4. **Account data:** email, preferences and reflections.
5. **Session tokens:** access JWT and refresh token.
6. **Pilot telemetry and the pilot interest list.**
7. **Control of monitoring:** start and stop.

| # | Threat (actor → entry point) | Mitigation | Evidence | Result |
|---|---|---|---|---|
| T1 | Any website → `chrome.runtime.sendMessage(TrichFree)` | `externally_connectable` lists only the configured site; `bridgeAllowed` exact-origin check | bridge-attack: an untrusted origin gets "could not establish connection" | Holds |
| T2 | Trusted website (or XSS on it) → unauthorized commands (start camera, sign out, delete, export, send code, pause, feedback, offscreen commands) | Allowlist of four commands: PING, SYNC_NOW, OPEN, STOP. STOP can only turn the camera *off*; there is no start command | bridge-attack: 14 unauthorized commands rejected, no state change | Holds; residual R-5 |
| T3 | Trusted website → malformed input (null, numbers, arrays, `__proto__`/`constructor` types, a 200 KB type, nesting 200/1000/5000 deep) | Type check before dispatch; `switch` on a string | bridge-attack | Holds |
| T4 | Trusted website → parameter smuggling (`OPEN` with a URL or hash) | `OPEN` ignores every field and opens `#/home` | bridge-attack | Holds |
| T5 | Trusted website → token or identity disclosure via PING | PING returns exactly `{ok, version, monitoring, status, signedIn}` | bridge-attack: no email, user id, JWT or refresh token | Holds |
| T6 | Another installed extension → TrichFree | Extension origins never pass `bridgeAllowed` (guest build: no `externally_connectable`, so Chrome delivers the message but it is ignored) | bridge-attack with an attacker extension, guest and strict builds | Holds |
| T7 | Dev configuration (`VITE_DEV_BRIDGE`, localhost backend) shipped in a release | `scripts/release-check.mjs` blocks `npm run package` | release-check.test | Was F-08; fixed |
| T8 | Another signed-in user → read or change someone else's rows | Owner-only RLS, column grants, server-set columns | rls.int (B cannot read, change, create or delete A's rows; forged columns ignored) | Holds |
| T9 | Anonymous caller → account tables, private helpers, RPC abuse | No anon grants on account tables; `private` schema not exposed; RPC input validation | session.int: exact anon OpenAPI surface; `is_issued_pilot_code` unreachable; bad email, role, consent flags and a 501-char note rejected | Holds; residual R-6 |
| T10 | Stolen or leftover session after sign-out or account deletion | Sign-out revokes the refresh token server-side; deletion cascades to auth sessions | session.int: a revoked or rotated refresh token cannot be replayed; a deleted user's token cannot refresh or write | Holds; residual R-1, R-2 |
| T11 | Pilot upload from a non-participant, or reading pilot data back | INSERT only, issued-code allowlist, no SELECT; duplicates idempotent | rls.int | Holds |
| T12 | Participant withdraws consent → data still sent | Sharing checked when queuing **and when sending** | pilot-withdrawal.test | Was F-04; fixed |
| T13 | Consent based on an incomplete description | Notice and policy list every uploaded column; a test maps each column to disclosed text | disclosure.test | Was F-05; fixed |
| T14 | Camera or microphone left on without the user knowing | Every page-level stream and clone is owned and stopped; late streams are released; monitoring never restarts the camera after a browser restart | media-lifecycle, website, extension specs | Was F-01–F-03; fixed |
| T15 | Media leaving the device | Two network modules only; `assertNoMedia` before every upload; CSP | privacy.test; `/try/` makes no third-party requests | Holds |
| T16 | Website XSS → account session theft | No `innerHTML`/`dangerouslySetInnerHTML`; CSP `script-src 'self' 'wasm-unsafe-eval'`, no inline scripts, no third-party scripts; OTP emails carry a code, no link | website.spec (CSP served, no violations); code search | Holds (no external pen test) |
| T17 | Person with access to the same browser profile | Out of scope by design (the privacy policy tells users to use their own profile); local backups are unencrypted | — | Residual R-9 |
| T18 | Crafted local backup file imported by the user | Settings validated (`cleanSettingRows`); other tables imported as-is; uploads now need current consent; the server validates pilot rows | Code review | Residual R-7 |
| T19 | Supply chain | Lockfile; `npm audit`: 0 vulnerabilities (production and dev); models checksum-pinned; no CDN at runtime | `npm audit` 12 Oct 2026 | Holds at audit time |

## 4. Confirmed defects

Severity scale:
- **Critical:** data exposure or loss across users, or covert recording.
- **High:** the camera or microphone on against the user's explicit action, or a security boundary broken.
- **Medium:** a privacy or consent failure in a narrower case, or hidden media use.
- **Low:** misleading status, a silent failure, a tooling crash or a documentation inaccuracy.

### F-01 · High · Camera stays on after "Turn camera off" or leaving the page

- **Affected:**
  - `src/shared/visionClient.ts` (`VisionClient.attach`, `terminate`);
  - every caller that passes a cloned track:
    - `useLocalVision` in `src/app/calibrationSession.ts`, used by the onboarding camera check, `#/tune` and
      `#/debug`;
    - `web/src/try/main.tsx`.
- **Reproduction:**
  1. Open the extension and press **Continue**, then **Turn on camera**.
  2. Press **Turn camera off**.
  3. The page still holds a live camera track until the tab is closed.

  The same happens when leaving the tune-up, and with **Turn camera off** on `/try/`. In automation, after "off",
  the page held one live track (the clone).

  Not separately tested, but the same mechanism: leaving the onboarding step another way (for example **Start
  monitoring**) and the debug page run the same `useLocalVision` cleanup.
- **Root cause:** pages give the detector `track.clone()`. `VisionClient.terminate()` stopped the worker but
  never stopped the clone, and a live clone keeps the camera device open.
- **Impact:** the camera, and on most laptops its light, stays on after the user has explicitly turned it off. It
  stays on independently of Pause and Stop. This breaks the product's central privacy promise and its users'
  trust. No frames were stored or sent.
- **Proposed fix:** the client owns the track it is given and stops it on terminate.
- **Implemented fix:** `VisionClient` keeps the attached track and stops it in `terminate()` (commit `daba8b3`).
- **Regression tests:** `e2e/media-lifecycle.spec.ts`: "onboarding camera try: 'Turn camera off' releases the
  camera, including the detector's copy" and "tune-up: leaving the page releases the camera…". Also
  `e2e/website.spec.ts`: "try page: 'Turn camera off' really turns the camera off…".
- **Verification:** all three failed on `f54c8bd` (one live track remained) and pass now.

### F-02 · Medium · Hidden camera stream on the dashboard

- **Affected:** `src/app/screens/Home.tsx` (preview panel); `src/app/components/Preview.tsx` (effect cleanup).
- **Reproduction:**
  1. Start monitoring and stay on the dashboard.
  2. With "Show what TrichFree sees" **closed**, the page held its own live camera stream, in addition to the
     offscreen document's.
  3. With a slow camera start (1.2 s), opening and then closing the panel during the start left that stream live
     permanently.
- **Root cause:**
  - `<Preview>` was rendered inside a closed `<details>` whenever monitoring was on, and a closed `<details>` still
    mounts its children.
  - The effect's cleanup ran before `getUserMedia` resolved, so a late stream was never stopped.
- **Impact:** a second, invisible camera stream costing CPU and battery. In the race, a stream outlived the panel
  and could outlive monitoring. Nothing was stored or sent.
- **Implemented fix (`daba8b3`):**
  - The preview is mounted only while the panel is open (`previewOpen`).
  - A `closed` flag stops a stream that arrives after unmount.
- **Regression tests:** `e2e/media-lifecycle.spec.ts`: "dashboard: no camera stream in the page while … closed",
  "dashboard preview: closing it while the camera is still starting leaves the camera off" and "open, then close".
- **Verification:** all three failed on `f54c8bd` and pass now.

### F-03 · Medium · Microphone keeps recording after leaving the Voice page during start-up

- **Affected:** `src/app/recorder.ts` (`ClipRecorder.start`, `cancel`); `src/app/components/VoiceRecorder.tsx`.
- **Reproduction:** on Voice, press **Record**, then navigate away before the microphone has started (for example
  while the permission prompt or a slow device is pending). The microphone opens after the page has gone and
  records unseen until the 15 s automatic stop.
- **Root cause:** `cancel()` called `stop()` while `start()` was still awaiting `getUserMedia`. `start()` then
  carried on and built a `MediaRecorder` on the late stream.
- **Impact:** up to 15 s of microphone use with no visible control, against the user's action of leaving. The
  audio was discarded (never saved or sent), but the user could not know that.
- **Implemented fix (`daba8b3`):**
  - `cancel()` marks the recorder cancelled.
  - `start()` stops a late stream and throws `AbortError`.
  - The UI ignores that error silently.
- **Regression tests:** `e2e/media-lifecycle.spec.ts`: "microphone: leaving the Voice page while the microphone is
  still starting leaves it off", plus "leaving mid-recording turns it off", which already passed and is kept as a
  guard.
- **Verification:** the first failed on `f54c8bd` and passes now.

### F-04 · Medium · Switching pilot sharing off did not stop rows already queued

- **Affected:** `src/shared/uploadQueue.ts` (`flush`).
- **Reproduction:**
  1. Join the pilot with a participant code (build with a backend).
  2. While rows are queued (offline, or within the 60 s between flushes), untick "Send pilot data to the research
     team".
  3. The next flush, at the next minute of monitoring or at session end, uploads the queued rows anyway.
- **Root cause:** consent was checked when rows were *queued* (`sharingEnabled()` at each call site) but not when
  they were *sent*.
- **Impact:** pseudonymous behavioural data, including the head area and timings, sent after the participant
  withdrew consent. No media. The pilot has not started, so no real data was affected.
- **Implemented fix (`93777f5`):** `flush()` checks current consent first. Unsent rows stay on the computer and are
  sent only if sharing is switched back on; they were collected while the participant agreed.
- **Regression test:** `test/pilot-withdrawal.test.ts`. It uses a real (fake-indexeddb) database and a recording
  stand-in client.
- **Verification:** failed on `f54c8bd` (the queued row was inserted after withdrawal); passes now.

### F-05 · Medium · Pilot consent notice and privacy policy understated what the pilot sends

- **Affected:**
  - `src/shared/copy.ts` (`COPY.pilotNotice`, the text participants agree to);
  - `web/privacy/index.html` (#research);
  - `store/privacy-policy.md` and `store/permissions.md`.
- **Reproduction:** compare the notice with the columns produced by `src/shared/telemetry.ts`.
- **What was missing:**
  - which area of the head;
  - session start and stop times, and pauses and resumes;
  - app events;
  - detector measurements;
  - the number of voice clips played;
  - the chosen reminder type;
  - detection speed and GPU/CPU;
  - the pilot day;
  - the app version;
  - calibration zones and timing.
- **Root cause:** the telemetry grew after the notice was written, and nothing tied the two together.
- **Impact:** participants would consent to a description that leaves out health-related fields (the head area) and
  usage timings. This is an informed-consent and ethics problem. No data has been collected yet.
- **Implemented fix (`c306489`):** the notice, the policy and the store summaries now list every category.
  Collection is unchanged: removing fields would be a research-design decision for the founder (§10).
- **Regression test:** `test/disclosure.test.ts`.
  - Every uploaded column must map to a phrase present in both the in-extension notice and the policy.
  - A new column without a mapping fails the test.
  - It also checks "never sends video, images or your voice" and what stopping means.
- **Verification:** failed on `f54c8bd`: in each text, 24 column entries lacked a disclosed phrase. A few of these
  were only worded differently (episode times were described as "the times episodes were detected"); the rest are
  the missing categories listed above. Passes now.

### F-06 · Low · Revoking camera permission mid-session showed "Waiting for the camera" for up to 5 minutes

- **Affected:** `src/offscreen/offscreen.ts` (`onCameraLost`; new `permissionRemoved`, `cameraPermissionDenied`).
- **Reproduction:** monitoring on → remove TrichFree's camera permission in the browser's site settings. The status
  showed "camera busy / waiting for the camera" and retried every 10 s for 5 minutes. The permission error never
  appeared.
- **Root cause:** a track ended by revocation was treated like a camera taken by another app, and the retry
  swallowed `NotAllowedError`.
- **Impact:** a misleading status. The camera was correctly off.
- **Implemented fix (`daba8b3`):**
  - When the camera is lost, check `navigator.permissions` at once.
  - Treat `NotAllowedError`/`SecurityError` during retries as a permission problem.
  - Show "TrichFree needs permission to use the camera".
- **Regression test:** `e2e/media-lifecycle.spec.ts`: "camera permission revoked mid-session…". It uses real
  permission handling through `Browser.setPermission`.
- **Verification:** failed on `f54c8bd` (status `camera_busy`); passes now (status `error` with the permission
  message within 8 s).

### F-07 · Low · Voice recording silently lost when it could not be stored

- **Affected:** `src/app/components/VoiceRecorder.tsx` (`save`).
- **Reproduction:**
  1. Record, then Save.
  2. Make IndexedDB writes to `clips` fail (`QuotaExceededError`, as on a full disk).
  3. Re-record and Save: no message appears. The Save button seems to do nothing, and the new recording is not
     stored; it is lost when the user leaves the page.
- **Root cause:** the save transaction's rejection was not handled.
- **Impact:** a user can believe their new own-voice reminder was saved. The old recording was safe (same
  transaction).
- **Implemented fix (`2cec5a7`):**
  - Show "This recording could not be saved[: the computer seems to be out of storage space]. Your earlier
    recording is unchanged…".
  - Keep the preview so Save can be retried.
- **Regression test:** `e2e/storage-failure.spec.ts`. It injects `QuotaExceededError`, then checks that the message
  appears, there is still exactly 1 clip, and Save works after space is freed.
- **Verification:** failed on `f54c8bd`; passes now.

### F-08 · Low · A development configuration could produce a release zip

- **Affected:** `scripts/package.mjs`; new `scripts/release-check.mjs`.
- **Reproduction:** with a `.env` containing `VITE_DEV_BRIDGE=true` or a `127.0.0.1` backend, `npm run package`
  produced a zip whose manifest let any page on `http://localhost/*` / `http://127.0.0.1/*` message the
  extension, or pointed the extension at a local backend.
- **Root cause:** packaging did not inspect the built manifest.
- **Impact:** local pages could send the four bridge commands (they cannot start the camera or read data), or the
  release would not work. Requires a developer mistake.
- **Implemented fix (`0dc725b`):** `releaseProblems()` refuses to package any of the following:
  - local or non-HTTPS `externally_connectable` origins;
  - local or HTTP `host_permissions` or CSP `connect-src`;
  - the end-to-end test key.

  `--allow-local` overrides it, explicitly.
- **Regression test:** `test/release-check.test.ts` (5 tests). It includes a check that the manifest generated
  from the end-to-end build's settings is refused for all three reasons.
- **Verification:** passes. On `f54c8bd` the test cannot run, because the guard did not exist; the previous
  `package.mjs` had no check at all.

### F-09 · Low · Malformed hand landmarks crashed the detector pipeline

- **Affected:** `src/core/pipeline.ts` (`DetectorPipeline.process`).
- **Reproduction:** replay a recording with a hand of fewer than 21 points, a `null` hand or no `hands` array. The
  pipeline threw `TypeError: Cannot read properties of undefined (reading '0')`.
- **Root cause:** the code assumed MediaPipe's shape.
- **Impact:** only replayed or corrupted recordings (`npm run replay`, debug tooling). Live MediaPipe output always
  has 21 points.
- **Implemented fix (`c642e11`):** malformed hands are skipped; a missing array counts as "no hand".
- **Regression test:** `test/detection-challenge.test.ts`, "malformed input … never crashes".
- **Verification:** failed on `f54c8bd` (`TypeError`); passes now.

### F-10 · Low (documentation) · Quiet time overstated

- **Affected:** `scripts/evaluate.ts` → `docs/DETECTION_REPORT.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `AUDIT.md`,
  `docs/FINAL_REPORT.md`; a stale test reference in `src/sync/prefs.ts`.
- **Reproduction:** the docs said the quiet time could be set up to 10 minutes. The app offers 5 s to 5 min (the
  database accepts up to 10 min).
- **Implemented fix (`2cec5a7`):** corrected in all six places.
- **Regression test:** none. The accepted range (5–600 s) is pinned by `test/sync.test.ts` and by the database
  constraint tests in `rls.int`. The 5 s–5 min choices offered in Settings are not pinned by any test.
- **Verification:** re-read against `src/app/screens/Settings.tsx` options and the SQL `CHECK`.

### F-11 · Low (documentation) · Account device identifier and pilot exception not disclosed

- **Affected:** `web/privacy/index.html` (#account); `web/index.html` ("Stays on your device").
- **Reproduction:**
  - The policy's "What an account stores" did not mention `updated_by`: a random identifier for the browser that
    last changed the settings, `extension:<id>` or `web:<id>`.
  - The landing page said reminder history stays on the device without the opt-in pilot exception.
- **Implemented fix (`c306489`):** a row was added to the policy, and the exception was added to the landing page.
- **Regression test:** `test/disclosure.test.ts` (two tests).
- **Verification:** failed on `f54c8bd`; passes now.

### Investigated and *not* counted as defects

These are listed so nobody re-investigates them. Each was checked and found to be intended behaviour, a known
limitation or residual risk (section 8), or not reachable.

- **Backwards timestamps.** The worker uses monotonic time (`performance.timeOrigin + now`), so not reachable.
- **Signing out does not stop monitoring.** This is by design: guest mode is fully functional.
- **Ponytail gathering and scalp scratching cause reminders.** A known detection limitation, see R-3.
- **The privacy table on `/privacy/` at 320 px is 2 px wider than the screen.** It sits in a scrollable wrapper,
  which is allowed for data tables, and the page itself does not scroll sideways.

## 5. Fixes implemented

| Commit | Content |
|---|---|
| `0dc725b` | Bridge attack suite, session and API-surface tests, release packaging guard (F-08), strict end-to-end build |
| `daba8b3` | Camera and microphone lifecycle fixes F-01, F-02, F-03, F-06 with lifecycle tests |
| `2cec5a7` | Storage-boundary test (no defect), voice save failure F-07, quiet-time documentation F-10 |
| `c642e11` | Independent detection challenge; malformed-input guard F-09 |
| `93777f5` | Pilot sharing withdrawal F-04 |
| `c306489` | Pilot notice, privacy policy and landing-page disclosures F-05, F-11 |
| `a4d7c0e` | CI: the `full-stack` job also builds the guest extension and runs `e2e/bridge-attack.spec.ts`; 320 px website test |
| (report commit) | This report. Also updated: TESTING.md (new suites and counts, camera-light manual check); IMPACT_READINESS.md (evidence table, audit results, corrected pilot data list); SECURITY.md (audit findings, new residual risks); ARCHITECTURE.md (consent checked before upload); README.md; the final report's status note |

**What was not changed:**
- detection thresholds;
- clinical or outcome claims;
- what data is collected;
- RLS policies, grants or other security boundaries;
- test expectations other than the new tests.

**The one workflow change** adds a build step and a test file to the existing `full-stack` job. It has no
permission changes.

## 6. Independent regression results

All runs are from 12 October 2026, in this container. They use the local Supabase stack (Postgres + GoTrue +
Mailpit) in Docker, and Chromium with fake camera and microphone devices under Xvfb.

| Suite | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p .` | ✅ clean |
| Unit | `npm test` | ✅ 26 files, **192 passed** (was 22 files / 174) |
| Database integration | `npm run test:integration` | ✅ 4 files, **57 passed** (was 2 / 50) |
| Builds | `npm run build`, `npm run build:web`, `node scripts/build-e2e.mjs` | ✅ extension (guest), website (production, no backend), end-to-end extension + website + strict |
| Browser | `xvfb-run -a npx playwright test` | ✅ **34 passed**: bridge-attack 2, cross-device 3, extension 9, media-lifecycle 8, storage-failure 1, website 11 |
| Dependencies | `npm audit` and `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| Secrets | pattern scan of tracked files and built bundles (JWTs, `sb_secret_`, service-role, private keys, cloud keys) | ✅ none; the only bundle matches are supabase-js's own key-prefix check |

**New tests and what they proved.** The "against `f54c8bd`" column comes from two sources:
- **Re-run at the end of the audit:** the unit tests and the lifecycle and storage-failure suites. The new test
  files were placed in a clean worktree of `f54c8bd` and run against its own build.
- **Run during the audit, against the code before the fix:** the `/try/` test and the suites that found nothing.

| Test | Against `f54c8bd` | Now |
|---|---|---|
| `e2e/media-lifecycle.spec.ts` (8) | 7 of 8 failed (F-01, F-02, F-03, F-06); only "leaving mid-recording" already passed | ✅ 8 |
| `e2e/website.spec.ts`: `/try/` camera off | failed: 1 live track (F-01) | ✅ |
| `e2e/storage-failure.spec.ts` (1) | failed (F-07) | ✅ |
| `test/pilot-withdrawal.test.ts` | failed (F-04) | ✅ |
| `test/disclosure.test.ts` (4) | 4 failed (F-05, F-11) | ✅ |
| `test/detection-challenge.test.ts` (8) | malformed-input test failed (F-09); 7 passed | ✅ 8 |
| `test/release-check.test.ts` (5) | could not run: guard absent (F-08) | ✅ |
| `e2e/bridge-attack.spec.ts` (2) | passed: no bridge defect | ✅ |
| `test/integration/session.int.test.ts` (6) | passed: no session or API-surface defect | ✅ |
| `test/integration/storage-boundary.int.test.ts` (1) | passed: no boundary defect | ✅ |
| `e2e/website.spec.ts`: 320 px | passed | ✅ |

**Independent detection challenge** (`test/detection-challenge.test.ts`)
- **Fixtures:** a new generator built from general anthropometric proportions (`test/challenge/`), not the
  development fixtures.
- **Variations:** head roll −8° to +12°, three distances, 4:3 and 16:9 frames, left and right hands, and two-hand
  scenes.
- **Conditions:** 15, 8, 5 and 3 fps; ±30 and ±80 ms timing jitter; landmark noise; combinations.
- **Synthetic only:** this shows robustness of the logic, **not real-world accuracy.**

| Scenario | Result |
|---|---|
| 7 pulls (crown pinch with a tilted head; hairline twirl further back; eyebrow; temple; one hand typing while the other pulls; slow approach; strand beside the face) | **7/7 caught under all 8 conditions.** Latency 0.80–1.00 s after the hand reaches the hair at 15 fps (test bound 1.5 s) |
| 8 everyday movements (typing, chin on hand, drinking, glasses ×2, nose scratch, 10 s phone call at the ear, stretching, reaching up with no face in view) | **0 reminders under all 8 conditions** |
| 6 ordinary hair touches (tuck behind the ear, fingers through the hair, head resting on a hand at the temple for 10 s, ponytail, scalp scratch, headphones) | **2 of 6 remind:** ponytail gathering and scalp scratching. Known limitation (R-3) |
| One continuous 60 s pull | One reminder plus the single follow-up, then quiet |
| Camera freeze between two short touches | No reminder (touches are not stitched across the gap) |
| Malformed input (short or empty hands, missing face points, zero-size frames, NaN) | No crash; detection continues (F-09) |
| 30 min of pulls every 20 s | 45 reminders, never closer than the quiet time (minimum gap 40 s with the 30 s default) |
| 30 min with a hand resting in the hair | 1 reminder (2 sounds); internal buffers capped (`rValues` ≤ 2000) |
| *Exploratory:* 2 h idle (Node) | 0 reminders; heap growth 3.3 MB; about 4–11 µs per frame of pipeline cost |
| *Exploratory:* face landmarks only every 10th frame | Still reminds |

**Clean-profile first run** (*exploratory*, 3 runs, fresh profile, fake camera; times from browser launch;
human reading time not included)

| Step | Time |
|---|---|
| Onboarding shown | ≈ 0.45–0.50 s |
| Test reminder played (step 2 of 2) | ≈ 0.60–0.67 s |
| Dashboard | ≈ 0.74–0.79 s |
| "Watching" (models loaded, camera running) | ≈ 1.8 s |

The run is 2 screens and 3 clicks: **Continue → Test reminder → Start monitoring**. That is within the "at most
three steps (preferably two)" requirement. Locked in by `e2e/extension.spec.ts` "first run".

**Website**

All checks below passed:
- production build, both with and without a backend;
- every internal link and anchor;
- security headers served and no CSP violation on any page;
- axe (WCAG 2.1 AA rules): no serious or critical violations on any page;
- no sideways scrolling at 375 px and at 320 px, including the signed-in account page and the delete dialog
  (exploratory probe for the signed-in state);
- the pilot form stores to the database and never reveals existing registrations;
- `/try/` makes no third-party requests and releases the camera.

## 7. Unverified requirements

These cannot be verified in this environment, or need people. They are **not** claimed as done.

**The founder's evidence table** (incorporated as given):

| Question | Current evidence | Next action |
|---|---|---|
| Do people need it? | Research and practitioner correspondence | Conduct structured user interviews |
| Can people use it? | Automated onboarding tests | Observe 3–5 first-time users |
| Does detection work? | Synthetic tests | Consent-based real-world feasibility testing |
| Are interventions acceptable? | Feature implemented | Collect user preferences and feedback |
| Does it reduce unwanted pulling? | No outcome evidence | Design an appropriately reviewed pilot |
| Will users return? | No retention evidence | Measure voluntary continued use |
| Can the venture sustain itself? | Proposed revenue hypotheses | Test distribution and willingness to support/pay |

**Engineering items not verified**
- **Real hardware:** Chrome and Edge on macOS and Windows with real webcams, including that the camera light really
  goes off (tests count live tracks, not LEDs). Lock screen, sleep, external webcams, other apps taking the
  camera. TESTING.md manual checklist, not yet run.
- **Detection on real people:** lighting, skin tones, hairstyles, head coverings, glasses, real pulling behaviour.
- **Production deployment:**
  - hosted Supabase settings: rate limits, OTP expiry, exposed schemas, SMTP deliverability;
  - website hosting headers on the real domain;
  - Chrome Web Store review;
  - a pinned pilot build ID matching the production website.
- **Bridge on the real production origin.** Tested with an exact-origin build against `http://127.0.0.1:5174`.
- **Screen readers and keyboard-only use** by a person; 200 % zoom; reduced motion. Only automated axe and contrast
  checks have run.
- **IndexedDB full during monitoring** (episode and event logging). Not tested. Expected: reminders continue and
  history is not saved.
- **Long real-browser sessions** (hours), CPU and battery on typical student laptops.
- **Backup restore** from a hosted project (DEPLOYMENT.md §1.7, "Rollback") has not been rehearsed.
- **Research data retention** is not yet defined (see R-10).

## 8. Remaining risks

| ID | Risk | Likelihood / impact | Mitigation or decision needed |
|---|---|---|---|
| R-1 | After sign-out, the *access* JWT stays valid until it expires (≤ 1 h; `jwt_expiry = 3600`). The refresh token is revoked | Low / Medium: needs the token to have been stolen already | Supabase design. Optionally shorten the JWT expiry in production (trade-off: more refreshes) |
| R-2 | Signing out while offline clears the device but cannot revoke the server session | Low / Low | The session expires; "sign out everywhere" could be added later |
| R-3 | Ordinary hair touching can remind (ponytail, scalp scratch: 2 of 6 synthetic touches); real-world false and missed reminders are unknown | Medium / Medium (annoyance, lost trust) | Stated in the product and the store listing; "Not a pull" feedback and the personal model; measure in the pilot |
| R-4 | Detection accuracy on real users is unknown | — | Real-hardware checklist; consent-based feasibility testing |
| R-5 | XSS on the trusted website could send OPEN, STOP or SYNC_NOW (open a tab, stop monitoring, trigger a sync); it cannot start the camera or read data | Low / Low | Strict CSP and no third-party scripts already; keep it that way |
| R-6 | The pilot interest form has a global cap (60 per 10 min): a flood could block genuine sign-ups for a while and add junk entries | Low / Low | Host-level rate limiting or a CAPTCHA if abused; entries are reviewed by hand anyway |
| R-7 | A crafted local backup file is imported mostly unvalidated (except settings) | Low / Low: the user must choose the file; uploads need consent; the server validates pilot rows | Validate all tables on import, if backups are ever shared |
| R-8 | Pilot rows the server keeps rejecting are retried hourly without limit (the queue can grow) | Low / Low | Drop rows after N days or attempts, if seen in the pilot |
| R-9 | Local backup files are not encrypted; anyone with the browser profile can see local data | By design (documented in SECURITY.md and the privacy policy) | Users are told; OS account separation |
| R-10 | Retention periods: provider backups depend on the plan; research telemetry has no stated retention; pilot-interest deletion after 12 months is a manual task | Medium / Medium (compliance) | Founder actions 10.B.5–6 |
| R-11 | OTP guessing is bounded by Supabase rate limits, which are production settings outside this repository | Low / High | Keep the defaults (DEPLOYMENT.md §1.3) and verify after deploying |
| R-12 | This audit was performed by the agent that wrote the code | — | Independent external review before a public launch |
| R-13 | The CI workflow declares no `permissions:`, so jobs get the repository's default token permissions (SECURITY.md risk 9) | Low / Medium | Set `permissions: contents: read`, or make read-only the repository default. Not changed here: the brief forbids changing workflow permissions |

## 9. Production release blockers

None of these is a code defect. All of them block a real-user pilot or a public release.

1. **Not deployed.** There is no hosted Supabase project, no live website, no store listing or pinned pilot build.
   Nothing may be described as live until the URL is verified.
2. **Production email (SMTP)** for sign-in codes is not configured or tested for deliverability.
3. **Ethics approval and consent materials** for the pilot. They must match the corrected notice (F-05), or the
   telemetry must be reduced first.
4. **The real-hardware manual checklist** (TESTING.md) has not been run on one Mac and one Windows laptop.
5. **No observed first-time users.** 3–5 sessions are needed before inviting participants.
6. **Retention periods** for backups and research data are not written into the privacy policy (R-10).
7. **Contact address** (`VITE_CONTACT_EMAIL`) is not set; the policy falls back to GitHub.
8. **Before a public (non-pilot) launch:** an independent security and accessibility review (R-12).

## 10. Exact founder actions

**A. Before the 16 October demonstration (conditions for the CONDITIONAL GO)**
1. **Use the audited code.** Review `claude/release-audit`. Merge it into `claude/affectionate-knuth-s50xg8`, or
   check it out directly. Then run `npm ci && npm run fetch-models && npm run build`.
2. **Load the build on the demo laptop.** Load `dist/` with "Load unpacked" in a fresh Chrome profile.
3. **Rehearse the five-minute script** (docs/FINAL_REPORT.md) twice on that laptop's real webcam, in the demo
   room's lighting. Check each of the following:
   - onboarding is two screens;
   - the test reminder plays;
   - a reach to the hairline reminds;
   - chin-on-hand, drinking and glasses do not remind;
   - Pause turns the camera light off;
   - "Turn camera off" in onboarding turns the light off (F-01).
4. **Decide how accounts are shown.** If you show them live, use a staging Supabase project (DEPLOYMENT.md §1)
   with SMTP working; otherwise demo in guest mode and show the green CI run or a recording of the two-browser
   test.
5. **Present it honestly.** Say it is a tested prototype, not deployed and not user-validated. Present detection
   numbers only as synthetic. Make no claims of clinical effect or accuracy.
6. **Use the evidence table in §7** as the "what we know / what's next" slide.

**B. Before any real-user pilot (to lift the NO-GO)**
1. **Deploy** (DEPLOYMENT.md §1–4):
   1. Create the staging Supabase project, then production. Use `public` schema exposure only, keep the default
      rate limits, OTP length 6 and expiry 600 s, and custom SMTP.
   2. Deploy the website with the `VITE_*` values.
   3. Package with `npm run package` (the new release guard must pass without `--allow-local`).
   4. Publish an unlisted store listing or a pinned pilot build.
   5. Verify the live URLs, the headers (`curl -I`) and that the bridge works on the production origin.
2. **Run the TESTING.md manual checklist** on one Mac and one Windows laptop with real webcams. Record the results
   in PROGRESS.md.
3. **Observe 3–5 first-time users** installing and onboarding without help. Note where they hesitate; fix before
   the pilot.
4. **Ethics review.** Submit the protocol with the exact consent text from `src/shared/copy.ts` (`pilotNotice`).
   If the research team does not need some fields (for example detector measurements or detection speed), remove
   them from `src/shared/telemetry.ts` and the notice together; `test/disclosure.test.ts` enforces the match.
5. **Write the retention periods** into `web/privacy/index.html`:
   - provider backup retention for the chosen plan ("Deletion");
   - research telemetry retention ("Research pilot").
6. **Calendar the 12-month deletion** of pilot-interest entries (DEPLOYMENT.md §5).
7. **Set `VITE_CONTACT_EMAIL`** and re-check the support contacts (verified 2026-10-12).
8. **Decide on `jwt_expiry`** for production (R-1).
9. **Optional but recommended before a public launch:** an external security, accessibility and clinical-content
   review.

**C. Housekeeping**
1. Keep CI green on the merged branch. The `full-stack` job now also runs the bridge-attack suite.
2. When telemetry or account columns change, update the notice and the policy. The disclosure test will fail
   until you do.

## 11. Final status for each major requirement

Key:
- **PASS:** verified with the evidence named;
- **PARTIAL:** verified in part, with the rest unverified or blocked;
- **FAIL:** not met.

| # | Requirement | Status | Evidence / what is missing |
|---|---|---|---|
| 1 | Public website (content, navigation, sign-up, privacy, responsive, accessible) | **PARTIAL** | Production build, links, headers, axe, 320/375 px, pilot form to the database: all pass. **Not deployed**; no manual accessibility review |
| 2 | Website ↔ extension integration and its security | **PASS** (local) | bridge-attack (2), website + extension test; not yet exercised on the production origin |
| 3 | Authentication, sessions, refresh tokens | **PASS** (local stack) | session.int, cross-device. Residual R-1, R-2. Production SMTP and rate limits unverified |
| 4 | Authorization, RLS, exposed endpoints | **PASS** (local stack) | rls.int, session.int (exact anon surface, private helpers unreachable, RPC validation) |
| 5 | Account deletion and export | **PASS** (local stack) | rls.int cascade, session.int (tokens dead after deletion), cross-device and website end-to-end tests. Backup retention text pending (R-10) |
| 6 | Cross-device sync (conflicts, offline, migration) | **PASS** (local stack) | sync unit + integration tests, two-profile end-to-end test, storage-boundary.int; Dexie migration test |
| 7 | Local and cloud storage boundary | **PASS** | storage-boundary.int, privacy.test, disclosure.test; `chrome.storage.sync` unused |
| 8 | Storage failure handling (quota) | **PARTIAL** | Voice save fixed and tested (F-07); quota during monitoring not tested |
| 9 | Camera and microphone lifecycle (pause, stop, leave, restart, worker restart, revocation, reinstall) | **PARTIAL** | Fixed F-01–F-03 and F-06. 8 lifecycle tests, plus the pause/stop, browser-restart and service-worker-restart tests, pass with fake devices. Update and reinstall were checked by reading `onInstalled` / `recoverAfterRestart` (no dedicated test). **Not verified on real hardware** (camera light) |
| 10 | Onboarding ≤ 3 steps (preferably 2), fast | **PASS** (software) / not observed with people | 2 screens, 3 clicks, test reminder ≈ 0.6 s in automation. Human observation pending (§7) |
| 11 | Detection reliability | **PARTIAL** | Independent synthetic challenge passes (all pulls caught, no everyday false alarms; 2 of 6 hair touches remind). **Real-world accuracy unknown** |
| 12 | Interventions (voice, chime, visual, off; quiet time; follow-up; no loops) | **PASS** (function) / acceptability **not tested** | Engine tests, 60 s and 30 min challenge runs, voice end-to-end test |
| 13 | Pilot research mode and consent | **PARTIAL** | Withdrawal fixed (F-04); disclosure fixed and enforced (F-05). Ethics approval and retention pending |
| 14 | Security (dependencies, secrets, logging, CSP, packaging) | **PASS** | `npm audit` 0; no secrets; logging contains no behavioural data or tokens; CSP enforced in tests; release guard (F-08). No external review (R-12) |
| 15 | Backups, recovery, retention | **PARTIAL** | Procedures documented (DEPLOYMENT.md §1.7, Rollback); not rehearsed on a hosted project; retention periods not yet stated |
| 16 | Accuracy of claims (README, website, privacy policy, investor documents) | **PASS** (after fixes) | F-05, F-10, F-11 corrected. No clinical, prevalence, endorsement or accuracy claims found. The UK practitioner is not presented as an advisor. "Our story" still needs founder review |
| 17 | Automated tests and manual verification | **PARTIAL** | 283 automated tests green; the manual checklist has not been run |
| 18 | Production build and deployability | **PARTIAL** | All builds pass and packaging is guarded; nothing is deployed |
| 19 | Live production deployment | **FAIL** | Not deployed: needs the team's accounts and credentials. Nothing is claimed live |
| 20 | Evidence of user need, usability, acceptability, effect, retention, sustainability | **FAIL** (not yet evidenced) | See the evidence table in §7: research and correspondence only, no user studies yet |
