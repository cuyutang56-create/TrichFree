# TrichFree: final report (12 October 2026)

**Branch:** `claude/affectionate-knuth-s50xg8`, 15 commits on top of the imported prototype: 172 files changed,
+9,975 / −2,314 lines.

**Bottom line**
- TrichFree now works end to end as a full-stack product: extension, website, accounts, cross-device sync, export
  and deletion.
- It is covered by 245 automated tests that run green in CI, including a two-browser sync test against a real
  database.
- **It is not deployed.** That needs the team's own Supabase, hosting and Chrome Web Store accounts.
- **It is not yet user-validated.** There is no evidence yet that it reduces pulling.

Status key:
- **PASS:** done and verified, with the evidence named;
- **PARTIAL:** done, but part of it is unverified or blocked;
- **FAIL:** not met;
- **NOT TESTED:** no verification was possible here.

## Requirement matrix

| # | Requirement (brief §1 and sections) | Status | Evidence |
|---|---|---|---|
| 1 | Real, deployable public website | **PARTIAL** | Built and tested: 9 browser tests run under the real security headers (`e2e/website.spec.ts`), with `netlify.toml` and `_headers`. **Not deployed; no live URL.** |
| 2 | Extension integrated with the website | **PASS** | Bridge test "website and extension in one browser" (status, sync nudge, a web change reaches the extension, the camera cannot be started from the web) |
| 3 | Secure authentication | **PASS** (local stack) | Supabase email one-time codes; tests sign in with real codes read from the mail catcher; session restored after a browser restart; sign out (`e2e/cross-device.spec.ts`). Production SMTP not configured (founder action). |
| 4 | Database-backed persistence | **PASS** (local stack) | 50 integration tests against Postgres with row-level security (`test/integration/`) |
| 5 | Cross-device account and settings sync | **PASS** | Two independent Chromium profiles, one account: A saves → database → B retrieves → B changes → A updates on reopening; same-field conflict notice. Runs in CI (`full-stack` job). |
| 6 | Local-first computer vision | **PASS** | Only 2 modules may use the network (`test/privacy.test.ts`); CSP `connect-src` limited to self and the backend; the `/try` test checks nothing is uploaded |
| 7 | Personalised interventions incl. own-voice self-talk | **PASS** (function) / **NOT TESTED** (effect) | Voice record, preview, save, delete (E2E); chime, visual, off; volume, quiet time, follow-up, suggestions (engine tests). Effect on users is untested. |
| 8 | Onboarding ≤ 3 steps (target 2) | **PASS** | 2 steps; the test reminder is in step 2 (`e2e/extension.spec.ts` first run) |
| 9 | No hard-coded user data, credentials, mock persistence or fake responses | **PASS** | Secret scan of tree and history (none); everything configured through public `VITE_*` values; unset website values are hidden, never faked; no mock fallbacks |
| 10 | Reliable install, permissions, monitoring controls | **PARTIAL** | Automated: camera denied, no camera, start/pause/resume/stop, browser restart, service-worker restart (E2E). **Real Mac and Windows hardware: NOT TESTED** (manual checklist in TESTING.md). |
| 11 | Responsive, accessible, polished UI | **PARTIAL** | axe: no serious or critical violations on every extension and website page; AA contrast test; phone layout test. No manual screen-reader or usability sessions. |
| 12 | Security, privacy, data-deletion controls | **PASS** | RLS isolation tests (B cannot read, change, create or delete A's rows), deletion cascade, export, SECURITY.md; no independent review |
| 13 | Automated tests + documented manual verification | **PARTIAL** | 245 automated tests green; the manual checklist is documented but **not yet run** on real laptops |
| 14 | Production build and deployable infrastructure | **PASS** (artifacts) / **NOT DONE** (deployment) | `npm run package` (13.7 MB zip), `npm run build:web`, migrations, env modes, CI; DEPLOYMENT.md |
| 15 | Honest documentation | **PASS** | This report, IMPACT_READINESS.md (labels), SECURITY.md (remaining risks), DETECTION_REPORT.md (synthetic only) |
| — | Audit first | **PASS** | AUDIT.md, with a resolution for every finding (§12) |
| — | Conflict policy; never silently overwrite | **PASS** | Field-level merge, server-ordered; user told of conflicts (unit, integration, E2E) |
| — | Offline fallback / reconnection | **PASS** (unit + integration) | Unreachable server → "offline", change kept and sent on reconnect (`sync.int.test.ts`). A browser-level offline test was not run. |
| — | Schema versioning and migrations | **PASS** | `schema_version`, field patches, Dexie v2 migration test, 4 SQL migrations applied from scratch |
| — | JSON export; deletion with backup caveat | **PASS** | E2E export and delete; the privacy policy states provider backup retention |
| — | Detection harness (latency, false alerts, misses, resources, limits) | **PASS** (synthetic) / **NOT TESTED** (real world) | docs/DETECTION_REPORT.md; 4 detector bugs found and fixed |
| — | Interventions without alert loops | **PASS** | Bounded loop test (`test/evaluate.test.ts`), at most one follow-up |
| — | Dashboard requirements | **PASS** | Monitoring and camera status, chosen reminder, Start/Pause/Stop, test reminder, settings, account chip (screenshots, E2E) |
| — | Website content (hero, problem, how it works, voice, privacy, Mochi, story, pilot, footer) | **PASS** (content) | "Our story" needs founder review; the pilot form stores to the database (E2E) |
| — | Fix critical and high security issues | **PASS** | No critical or high issue open; the high (dev-only) advisory fixed; 6 more issues fixed (SECURITY.md) |
| — | IMPACT_READINESS.md (13 points, 4 labels) | **PASS** | IMPACT_READINESS.md |
| — | Live production deployment | **NOT DONE** | No credentials; nothing claimed live |

## 1. Audit

AUDIT.md (written before any change) records:
- what was working, with evidence;
- 13 broken or at-risk items (B1–B13);
- 9 security and privacy findings (S1–S9);
- persistence, cross-device, detection and UX gaps;
- the recommended architecture and plan.

**Every item now has a recorded outcome** (AUDIT.md §12). All are fixed except S4 (backup import validates
settings only; partly fixed) and S8 (pilot-row deletion still goes through the team; accepted). Eight further
problems were found and fixed during the work; they are listed at the end of §12.

## 2. Architecture

```
 User's computer (Chrome / Edge)                                   Supabase (cloud)
┌───────────────────────────────────────────────┐                ┌──────────────────────────────┐
│ TrichFree extension                            │   HTTPS        │ Auth: email one-time codes   │
│  Service worker ── session, sync, alarms ─────┼───────────────►│ Postgres + row-level security│
│     │  ▲ messages (token-free)                 │                │  profiles, user_preferences, │
│  Pages (dashboard, settings, voice, insights) │                │  reflections, pilot_interest,│
│     │                                          │                │  pilot telemetry (insert-only)│
│  Offscreen doc: camera, reminder engine, audio │                └──────────────▲───────────────┘
│     │ frames (transferred, never stored)       │                               │ HTTPS
│  Vision worker: MediaPipe hands/face/hair      │                               │
│  IndexedDB: voice, history, settings (local)   │   PING/SYNC/OPEN/STOP          │
│                    ▲───────────────────────────┼── (site origin only) ──┐      │
└───────────────────────────────────────────────┘                        │      │
 Website (static: Netlify / Cloudflare Pages) ────────────────────────────┴──────┘
   /  landing   /try/  detector in the page   /app/  account, settings, export, deletion   /privacy/
```

Full detail, with a Mermaid diagram, the data map and the sync design, is in ARCHITECTURE.md.

## 3. Files changed (by area)

- **Backend:** `supabase/config.toml`, `supabase/migrations/*.sql` (4), `supabase/templates/otp.html`; the old
  `supabase/schema.sql` was removed.
- **Sync (shared):** `src/sync/prefs.ts`, `merge.ts`, `engine.ts`, `remote.ts`.
- **Extension:**
  - service worker and accounts: `src/background/sw.ts`, `account.ts`;
  - offscreen: `src/offscreen/offscreen.ts`, `player.ts`;
  - worker: `src/workers/*`;
  - shared modules: `src/shared/*` (db v2 and migration, messages, config, syncStore, uploadQueue, backup, bridge,
    safety, copy, pilot, mochi);
  - pages: `src/app/**` (new onboarding, dashboard, settings, voice, insights, camera access);
  - design system: `src/ui/*` (tokens, base, controls, preferences form, sign-in);
  - popup: `src/popup/*`;
  - `manifest.config.ts`.
- **Detection core:** `src/core/temporal.ts`, `health.ts` (new), `evaluate.ts` (new), `engine.ts`, `arms.ts`,
  `detectorConfig.ts`, `pipeline.ts`, `replay.ts`.
- **Website:** `web/**` (landing, privacy, 404, `/try/`, `/app/`, bridge, config, styles, art, social image),
  `vite.web.config.ts`, `netlify.toml`.
- **Tests:**
  - `test/*.test.ts`: 22 files, 10 new and 5 updated;
  - `test/integration/*`;
  - `test/fixtures/*`: 12, 6 new;
  - `e2e/*.spec.ts` (3), `e2e/helpers.ts`, `e2e/fixtures/*`;
  - `vitest*.config.ts`, `playwright.config.ts`.
- **Scripts:** `evaluate.ts`, `soak.mjs`, `fetch-models.mjs` (pinned and checksummed), `make-pilot-codes.mjs`,
  `make-og-image.mjs`, `make-fixtures.mjs`, `make-icons.mjs`, `screenshots.mjs`, `build-e2e.mjs`.
- **CI:** `.github/workflows/ci.yml` (website build step; `full-stack` job; permissions unchanged).
- **Docs:**
  - new: ARCHITECTURE, DEPLOYMENT, TESTING, SECURITY, IMPACT_READINESS, docs/DETECTION_REPORT, this report;
  - updated: README, AUDIT, DECISIONS, PROGRESS, `.env.example`, `store/*`.

## 4. Schema and migrations

All four run in order on a fresh database (verified with `supabase db reset`) and are applied to a hosted project
with `supabase db push`.

| Migration | Contents |
|---|---|
| `20261012000100_pilot_telemetry.sql` | `episodes`, `sessions`, `events`, `calibrations` (insert-only for anon, no read); `pilot_codes` allowlist (long random codes, check constraint); `private.is_issued_pilot_code()` |
| `20261012000200_accounts.sql` | `profiles` (created by trigger on sign-up; policy acceptance time set by the server; column grants); `user_preferences` (one row per user, CHECK constraints mirroring app validation, a server-bumped `version` for optimistic concurrency, `updated_by`, `schema_version`); RLS own-row select/insert/update, no delete |
| `20261012000300_reflections_export_delete.sql` | `reflections` (RLS own rows); `export_my_data()` (invoker rights, JSON); `delete_my_account()` (definer; deletes the auth user, which cascades) |
| `20261012000400_pilot_interest.sql` | `pilot_interest` (no client access); `submit_pilot_interest()` with validation, silent duplicates, and a global rate cap |

## 5. Authentication

- Supabase Auth with **6-digit email codes**: no passwords and no links. Codes expire after 10 minutes, and a new
  code invalidates the old one.
- Sign-up happens on first sign-in; email ownership is proven by the code.
- Sessions:
  - extension: held by the service worker in `chrome.storage.local`, refreshed on demand, operations serialised,
    never exposed to pages;
  - website: supabase-js `localStorage`, protected by a strict CSP.
- Logout clears the session; account deletion removes the user.
- Recovery means signing in again with the same email.
- **Tested:** real code sign-in, a wrong code rejected, session restored after a browser restart, sign out to
  guest, anonymous key denied everywhere.

## 6. Synchronisation

- **Settings sync** (field-level three-way merge): one-sided changes kept; different fields combined; the same
  field on two devices → first to reach the server wins and the user is told.
- Writes are version-conditional, so a stale device can never overwrite newer data.
- First sign-in adopts an existing account's settings.
- **When it syncs:**
  - extension: on change, on opening a page (if the last sync is over 15 s old), every 15 minutes, at startup,
    "Sync now", or when the website nudges it;
  - website: on load, on change and on focus.
- **Offline:** changes are queued locally and sent on reconnect, with clear status.
- Voice recordings never sync, by design: re-record on a new computer. The UI says so.
- **Tested:** 22 unit tests in `sync.test.ts`, database integration tests, and the two-browser end-to-end test (also
  run in CI).

## 7. Extension improvements

- Accounts, sync and guest mode; account export and deletion.
- **Reminders:**
  - visual reminder type;
  - volume;
  - quiet time (5 s–5 min, default 30 s; it was a fixed 5 s that re-reminded about every 10 s);
  - optional single follow-up;
  - suggestion prompts and supportive text;
  - silent modes no longer notify.
- **Health and presence:**
  - "slow" is separate from "stopped" and scales with the target rate;
  - presence-aware stops (lock, idle with nobody seen, 10 minutes away);
  - a browser restart never restarts the camera silently;
  - a stale heartbeat cannot reopen the camera.
- **Detection timing:** time-based smoothing, a gap tolerance that adapts to the frame rate, observed-frame dwell
  completion, a short missed-hand hold. At ~3 fps, no reach used to be caught.
- **Performance:** CPU delegate when WebGL is software-emulated (2.4–2.7 → 11–14 fps on a no-GPU machine, with
  less than half the CPU); optional "Lighter detection" (8 fps, 43 % less CPU).
- **Fixes:**
  - keyboard shortcuts actually assigned (they were not);
  - the manifest reads the same env files as the code (a `.env`-configured build blocked its own backend);
  - stricter CSP with no web-accessible resources;
  - the popup leads to a visible camera-permission page;
  - voice preview and delete.
- **Interface:** calm lavender and warm-white design system, accessible controls (names and descriptions read
  once), reduce motion; Mochi optional, off by default, offered after a first session.

## 8. Onboarding

**Two steps:**
1. What TrichFree does, privacy in plain words, and that the camera is only used once monitoring starts.
2. Choose a reminder, **test it in one click**, and optionally record a voice line, try the live camera, or start
   monitoring.

There is no account wall: guest mode is clearly labelled, and "Save across devices" is offered in context.
Calibration is an optional 2-minute tune-up. The browser test goes from install to a played test reminder within
step 2.

## 9. Website

- **Landing page:** hero with real CTAs, the problem (no statistics), how it works, own voice, privacy, Mochi
  (optional), our story (no endorsements), a real pilot form, and a footer with privacy, contact (from config),
  project status, GitHub and a disclaimer.
- **`/try/`:** the real detector in the page; nothing uploaded.
- **`/app/`:** sign in, settings through the same sync engine, reflections, export, deletion, and extension
  status and controls.
- **`/privacy/`:** the single-source privacy policy.
- **Technical:**
  - SEO and social tags from config, with a real social image;
  - robots and sitemap;
  - strict headers;
  - responsive, with an accessible menu.
- Tested under the real CSP.

## 10. Security fixes

- Pilot telemetry spoofing: allowlist of issued codes, now **long random codes** (the 4-character codes could be
  found by guessing).
- Extension CSP `default-src` and a full set of directives; website headers tested in the browser.
- **Fixes found in this review:**
  - dev dependency advisory fixed (`npm audit`: 0);
  - models pinned and SHA-256 verified;
  - inline styles removed;
  - misleading shortcut promise corrected;
  - the `.env` / CSP mismatch fixed.
- **Advice added to Settings and the privacy policy:**
  - use your own browser profile on a shared computer;
  - backup files contain voice recordings.
- **Remaining risks** are listed in SECURITY.md:
  - website session in `localStorage`;
  - shared profiles;
  - unencrypted local backups;
  - form spam;
  - pilot-code holders can upload junk;
  - SMTP limits;
  - provider backups;
  - account security for the developer, hosting and Supabase accounts;
  - CI token permissions;
  - no independent review.

## 11. Test results

All run on 2026-10-12 from a freshly reset database. They are also green in CI on GitHub's runners (runs 7–13 at
the time of writing).

| Suite | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ clean |
| Unit (`npm test`) | ✅ 22 files, **174 passed** |
| Database integration (`npm run test:integration`) | ✅ 2 files, **50 passed** |
| Browser (`playwright test`) | ✅ **21 passed**: extension 9, cross-device 3, website 9 |
| Detection evaluation | ✅ 7/7 reaches at 15, 8, 5 and 3 fps, with noise and with 20 % missed hands; 0 false alerts on negatives in every condition; over 50 seeds, 343/350 reaches caught in the worst condition (3 fps + noise + misses) |
| `npm audit` | ✅ 0 vulnerabilities |

## 12. Build results

- `npm run package` → `release/trichfree-desk-v0.1.0.zip` (13.7 MB: models, WebAssembly, app), with checks for
  bundled models and a matching version.
- `npm run build:web` → `dist-web/` (25 MB, mostly the MediaPipe files for `/try/`), with `_headers`, robots,
  sitemap and the social image.
- `node scripts/build-e2e.mjs` → test builds against the local stack.
- Builds read configuration from `.env` files or the environment; unset values give a guest-only build.

## 13. Deployment status

**Not deployed.**
- No Supabase project, website hosting, domain or Chrome Web Store item was created: these need the team's
  accounts and, for the store, the US$5 registration fee.
- Nothing has been claimed as live.
- DEPLOYMENT.md is the step-by-step guide, rehearsed locally and in CI.
- Reviews of camera extensions can take several days, so for 16 October plan to demo from an unpacked build (below).

## 14. Remaining risks

1. **Effect unknown.** No study has been run, and nothing shows TrichFree reduces pulling. Present it as a pilot-ready
   tool, not a proven one.
2. **Real-world detection accuracy unknown.**
   - The evaluation is synthetic.
   - Scalp scratching is a known false positive.
   - Real laptops, lighting, skin tones and hairstyles are untested.
3. **Not deployed:**
   - production SMTP is not set;
   - store review can take days;
   - the website needs a domain.
4. **Not run on real Mac and Windows hardware.** The camera, background behaviour and resource use there are
   unverified.
5. **Security residuals** are listed in SECURITY.md, and no independent review has been done.
6. **Content to confirm:**
   - "Our story" wording;
   - helplines, to be re-verified before launch;
   - the backup retention period in the privacy policy;
   - permission from anyone the team wishes to name.

## 15. Founder actions (in order)

1. **Review and merge** `claude/affectionate-knuth-s50xg8`. A pull request can be opened on request.
2. **Supabase (DEPLOYMENT.md §1):**
   - create *staging* and *production* projects (Singapore) with two-factor authentication;
   - run `npx supabase link --project-ref …` then `npx supabase db push`;
   - Auth → Email: OTP length 6, expiry 600 s; paste `supabase/templates/otp.html` into "Magic Link" and "Confirm
     signup";
   - set the Site URL;
   - keep the exposed schemas to `public` only;
   - copy the URL and the publishable key.
3. **Custom SMTP** with your own domain (SPF and DKIM) before inviting anyone.
4. **Website (§2):**
   - connect Netlify or Cloudflare Pages;
   - set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL` and `VITE_CONTACT_EMAIL`;
   - add the domain;
   - check the live headers with `curl -sI`;
   - run the smoke test.
5. **Extension (§3):**
   - build with the production values and run `npm run package`;
   - register as a Chrome Web Store developer with two-factor authentication;
   - upload, with the listing and permissions from `store/` and the privacy URL `https://<domain>/privacy/`;
   - set it to Unlisted.
6. **Connect them (§4):** set `VITE_EXTENSION_IDS` and `VITE_EXTENSION_STORE_URL` once the store shows the ID, then
   redeploy the website.
7. **Content:**
   - review "Our story";
   - re-verify the helplines;
   - write the backup retention period into `web/privacy/index.html`;
   - confirm that nothing names a practitioner without written permission.
8. **Manual checklist** (TESTING.md) on one Mac and one Windows laptop, including real reaches and everyday
   movements. Re-test the missed strand pull with the 5 October tester.
9. **Pilot:**
   - ethics approval;
   - `node scripts/make-pilot-codes.mjs 30`, then run the SQL it prints;
   - set `VITE_EXIT_SURVEY_URL` and `VITE_TEAM_EMAIL`;
   - add a calendar reminder for the 12-month pilot-interest deletion.
10. **GitHub:**
    - enable private vulnerability reporting;
    - consider `permissions: contents: read` in CI;
    - capture store screenshots with `HEADED=1 node scripts/screenshots.mjs` on a real machine.

## 16. Five-minute demo

Use a laptop with a webcam and two Chrome profiles. Either point the builds at the **staging** Supabase project
(recommended, so the demo does not depend on Docker), or use the local stack:
`npm run db:start && node scripts/build-e2e.mjs`.

Load the extension unpacked in both profiles. Open the website (deployed, or
`WEB_OUT_DIR=dist-web-e2e npm run preview:web`). Rehearse once in the demo room's lighting.

| Time | What to show |
|---|---|
| 0:00–0:30 | **Why:** pulling often starts without full awareness at a desk; TrichFree makes the moment visible, gently and privately. |
| 0:30–1:30 | **Install → 2-step onboarding:** privacy in plain words, choose a reminder, **Test reminder** plays at once, optional voice line. The chip says **Guest**: no account needed. |
| 1:30–2:30 | **Start.** The dashboard shows "Watching", the camera status and the chosen reminder. Chin on hand, a sip of water, glasses: nothing. Reach to the hairline and hold: **your own voice** plays. **Not a pull** for feedback. **Pause**: the camera stops. |
| 2:30–3:00 | **Privacy:** Settings → "Data on this computer": video never stored, voice never leaves the device, only settings sync. Tests enforce that the extension can send nothing else. |
| 3:00–4:00 | **Cross-device:** "Save across devices" → sign in with an emailed code → change the quiet time. Profile B: sign in, the setting is there; change the sensitivity. Back on A: click into TrichFree, B's change arrives with a notice ("Sync now" if the network is slow). Show `/app/` on the website: the same settings, export, delete account. |
| 4:00–4:45 | **Evidence, honestly:** DETECTION_REPORT (synthetic tests, 4 bugs found and fixed, known limits); CI green with the two-browser test against a real database. **No claim of benefit yet**: that is what the 14-day chime-versus-own-voice pilot is for. |
| 4:45–5:00 | **Ask:** help with ethics and the pilot, and introductions to people with lived experience who want to try it. |

**If anything fails:** open `/try/` on the website. It runs the same detector in the page, with no install and no
account.
