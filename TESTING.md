# Testing

## Summary

| Suite | Command | Size | What it proves | Runs in CI |
|---|---|---|---|---|
| Unit | `npm test` | 22 files, 173 tests | Detector, engine, sync merge and orchestration, preference validation, settings migration, privacy rules, CSP, pilot codes, manifest environment, accessibility colour contrast | `test` job |
| Typecheck | `npm run typecheck` | whole repo | Types across extension, website, tests and scripts | `test` job |
| Database integration | `npm run test:integration` | 2 files, 50 tests | Row-level security between two real users, constraints (the app and the database agree), versioned writes and concurrency, an unreachable server ("offline") then reconnection, export, account deletion cascade, pilot form, pilot uploads | `full-stack` job |
| Extension browser tests | `npm run e2e` (after `npm run build`) | 9 tests | Onboarding, start/pause/stop, reminders, camera denied or missing, voice record/delete, backup and wipe, browser and service-worker restarts, axe accessibility scan of every page | `test` job |
| Cross-device browser tests | `npx playwright test e2e/cross-device.spec.ts` | 3 tests | Two independent browser profiles ("two laptops") with one account: save → database → other laptop → change → first laptop updates; same-field conflict notice; session restored after a browser restart; sign out back to guest mode; export and deletion | `full-stack` job |
| Website browser tests | `npx playwright test e2e/website.spec.ts` | 9 tests | Real security headers served and no CSP violation on any page, social/SEO files, links, phone layout, axe scan, pilot form to database, `/try/` detector, web account flow, website ↔ extension bridge | `full-stack` job |
| Detection evaluation | `npm run evaluate` | 12 fixtures × 7 conditions, plus 50 seeds | Latency, missed reaches, false alerts, alert loops on synthetic landmarks → docs/DETECTION_REPORT.md | key properties locked in by `test/evaluate.test.ts` |
| Soak / resource use | `npm run soak -- 3 --write` | 3 min | Frame rate, CPU and memory with monitoring on and off | manual (needs a real machine to mean anything) |

CI (`.github/workflows/ci.yml`) runs on every push and pull request. The `full-stack` job starts a throwaway
Supabase stack in Docker (`npx supabase start`). It ran green on GitHub's runners for this branch.

## Running everything locally

Requirements:
- Node 22;
- Docker (for the local Supabase stack);
- Chromium through Playwright (`npx playwright install chromium`), or set `CHROMIUM_PATH` to an existing build.

On a headless Linux machine, prefix browser runs with `xvfb-run -a`.

```bash
npm ci && npm run fetch-models
npm run typecheck && npm test

npm run build && npm run e2e                 # extension tests (the account tests skip without the next step)

npm run db:start                             # local Supabase: Postgres, Auth, and a mail catcher for sign-in codes
npm run test:integration
node scripts/build-e2e.mjs                   # extension + website builds pointed at the local stack
npx playwright test                          # all browser tests, including cross-device and website
npm run db:stop
```

Sign-in in the tests is real. The test asks Supabase Auth for a code, reads the email from the local mail catcher
(Mailpit) and types the code, exactly as a person would. Each test uses fresh `@example.test` addresses. The
service-role key is used only by the integration tests, to check what is really stored. It comes from the local
CLI and is never committed.

## What the main tests cover

**Sync and conflicts** (`test/sync.test.ts`, `test/integration/sync.int.test.ts`, `e2e/cross-device.spec.ts`)
- Field-level merge, both sides: one side changed; different fields on each side; same field on both, where the
  server wins and a conflict is reported; values restored from a backup.
- First link: an empty account gets the device's settings; an existing account's settings are adopted.
- Two devices creating or updating at once: exactly one wins, and the other re-merges.
- Edits made *during* a sync are kept.
- Offline, expired-session and server errors are reported without losing anything.
- The two-browser test runs the full journey:
  1. A signs in and changes a setting; it is in the database (and `updated_by` says which device).
  2. B signs in and sees it, then changes another setting.
  3. A is reopened later and shows B's change without a button press.
  4. "Sync now" works.
  5. Both change the same setting: the first to reach the server is kept, and A says so.

**Security and privacy** (`test/integration/rls.int.test.ts`, `test/privacy.test.ts`, `test/manifest.test.ts`,
`e2e/website.spec.ts`)
- User B cannot read, change, create or delete user A's rows.
- The anonymous key can do nothing with account tables.
- Server-set columns cannot be forged.
- Account deletion removes exactly the user's rows.
- The pilot form never reveals whether an email is registered.
- Only issued long codes can upload pilot data.
- Only two modules in the extension may make network requests.
- Pilot rows contain no camera, image or audio data.
- The extension and website CSPs stay strict, and pages load with no CSP violation.

**Detection** (`test/temporal.test.ts`, `test/replay.test.ts`, `test/evaluate.test.ts`, `test/health.test.ts`)
- Dwell timing, gaps, holds, hysteresis and cooldown.
- Every fixture replayed through the real pipeline.
- At 15, 8, 5 and 3 frames per second, with noise and with missed hand detections: every reach is caught and no
  everyday movement triggers a reminder.
- The documented worst case.
- Alert loops bounded by the quiet time.
- "Slow" versus "stopped" status.

**Accessibility**
- `test/a11y-tokens.test.ts` checks WCAG AA contrast for every colour pair in both themes.
- The extension and website browser tests run axe-core on every page and fail on serious or critical violations.
- Controls are real radio buttons, checkboxes and switches, with names and descriptions read once.

## Manual checklist (real laptops)

Automated tests use Chromium's fake camera, so they cannot judge detection on real people. Run this on **one Mac and
one Windows laptop**, with a real webcam, in Chrome or Edge, before a pilot and after any detection change. Record
the results in PROGRESS.md.

1. **Install:** unzip the release and use Load unpacked (or install from the store) in a clean browser profile.
   Onboarding takes at most 2 steps, and the test reminder plays within a minute.
2. **Reaches:** five real reach-to-hair movements (crown, hairline, temple; pinching and open hand) → at least 4
   reminders. Note roughly how long each took.
3. **Everyday movements**, 3 times each: drinking, chin on hand, adjusting glasses, scratching your nose, a phone call
   → no more than 2 reminders in total.
4. **Background:** put another app full-screen for 10 minutes, then do 3 reaches → reminders still play, and the
   notification shows in visual mode.
5. **Camera conflicts:** open Zoom, Teams or Photo Booth to take the camera → TrichFree says the camera is busy.
   Close the other app → it continues within about 20 s.
6. **Lock and restart:** lock the screen → the camera turns off. Restart the browser while monitoring → the camera
   does **not** start by itself, and the popup offers to start again.
7. **Voice:** record, preview, save and test a line → reminders use it. Delete it → the chime plays, and the app
   says why.
8. **Volume:** at 0 it is silent; at 100 it is clear and not distorted.
9. **Two laptops, one account:** change a setting on each → the other shows it when opened (within a minute).
   Change the same setting on both while one is offline → the notice appears, and no change is lost silently.
10. **Offline:** turn Wi-Fi off and change a setting → "Offline · will sync". Turn it on → it syncs.
11. **Data:** export the account (JSON) and a local backup (.zip); delete the account → the local data remains until
    "Delete all data on this computer".
12. **Accessibility:**
    - keyboard only through onboarding, the dashboard and settings;
    - VoiceOver (Mac) or NVDA (Windows) reads each switch and choice once, with its hint;
    - 200 % zoom loses nothing;
    - "Reduce motion" stops animations.
13. **Resources:** turn on Settings → "Show the debug page" and note the frame rate and the GPU or CPU delegate. Note
    the browser's CPU in Activity Monitor or Task Manager with monitoring on, then with "Lighter detection" on.
    Optionally, measure battery drain over an hour on battery power.
14. **Shortcuts:** Ctrl/⌘+Shift+Y and U work in Chrome. Set them to "Global" in `chrome://extensions/shortcuts` and
    check them from another app.

## Not covered by automated tests

- Detection accuracy on real people, real cameras, lighting, skin tones and hairstyles. The evaluation uses
  synthetic landmarks only (docs/DETECTION_REPORT.md). Real-world performance needs the manual checklist and,
  above all, the pilot.
- Real Chrome or Edge on macOS and Windows: CI uses Linux Chromium.
- Email deliverability from a production SMTP provider, and the hosted Supabase project's settings: these are
  checked during deployment (DEPLOYMENT.md).
- Long sessions (hours) and battery use.
- Screen readers beyond the automated accessibility checks.
