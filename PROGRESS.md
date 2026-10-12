# Progress

## Status on 2026-10-12

| Area | Status | Evidence / what's left |
|---|---|---|
| Extension core (camera, on-device detection, reminders, background running) | ✅ Built and tested | Unit + browser tests; soak 11–14 fps on a no-GPU machine (CPU path). **Manual checklist on real Mac and Windows laptops still to do** (TESTING.md). |
| Detection reliability | ✅ Harness + fixes | docs/DETECTION_REPORT.md: synthetic fixtures at 15–3 fps, noise and missed detections, 50-seed sweep; 4 detector bugs fixed. Real-world accuracy unknown until the pilot. |
| Reminders (own voice, chime, visual, off; volume; quiet time; follow-up; suggestions) | ✅ Built and tested | Engine and browser tests. |
| Onboarding (2 steps) and dashboard | ✅ Built and tested | Browser tests reach a test reminder in step 2; axe scans pass. Usability with real users not yet done. |
| Accounts (email code), guest mode, sync across devices | ✅ Built and tested | 50 database tests; two-browser test against a real local Supabase; CI `full-stack` job green. |
| Export and deletion (account and local) | ✅ Built and tested | Integration + browser tests. |
| Website (landing, /try, /app, privacy, pilot form) | ✅ Built and tested; ⏳ not deployed | Browser tests under the real CSP. Needs hosting + domain (DEPLOYMENT.md). |
| Security review | ✅ Done (internal) | SECURITY.md: findings fixed, remaining risks listed. No independent review yet. |
| Pilot mode | ✅ Built and tested; ⏳ needs backend, codes, ethics | Long random codes; uploads tested against the database. |
| Store package | ✅ Builds; ⏳ not submitted | `npm run package`; texts in `store/`; screenshots to capture. |
| Deployment | ⏳ Not started (needs the team's accounts) | Step-by-step in DEPLOYMENT.md. |

## 2026-10-12
- Audit of the prototype (AUDIT.md), then accounts and sync, the redesign, the website, detection reliability,
  security review and documentation. Commit history on `claude/affectionate-knuth-s50xg8` has the details.
- Tests: unit 22 files / 173 tests; database integration 50; browser 21 (extension 9, cross-device 3, website 9).
  All green locally and in CI (both jobs).
- Soak (this container: 4 vCPU, no GPU, headless, fake camera): default 11.1–14.4 fps at 165 % CPU, 541 MB;
  lighter detection 7.8–8.0 fps at 94 % CPU. Before the CPU-path fix the same machine ran at 2.4–2.7 fps at 372 % CPU.
- Still to do by hand: TESTING.md manual checklist on one Mac and one Windows laptop; re-test the strand pull with the
  user from 2026-10-05.

## Test results (2026-09-29)
- Unit: 10 files, 72 tests passing (`npm test`).
- E2E: 1 passing (`npm run e2e`), GPU delegate, ~10 fps with Chromium's fake camera.
- Real footage (the team demo video fed as a fake camera, 45 s): 14.2 fps on GPU, 27 ms inference per frame, face found on 70% of face runs (the phone often covers the face), hands on 129 frames, median r = 0.52, **0 zone hits and 0 alerts** (no reach-to-hair in that clip).
- Background soak (`node scripts/soak.mjs 5 --video=…`, desk mode on, app tab closed, another page in front, real footage as the camera): **min 14.5 fps, avg 15.0 fps, heartbeat always fresh, GPU delegate**. The first run, with the old minimum-gap limiter, got min 11.0 / avg 13.7 (fail), which led to the token-bucket fix.
- Headless only. The spec's spike acceptance (10 min behind a different **full-screen app** on real Chrome/Edge, macOS + Windows, then a gesture still alerts) still has to be run by hand.

## 2026-10-05
- First real-user test: missed a strand pull beside the face → added hair segmentation + `strands` zone (see DECISIONS). Calibration cut from ~25 clicked poses + a 10-trial exam to ~2 minutes with no repeats.
- Unit: 11 files, 82 tests passing (new: `hair.test.ts`, fixtures `pinch-strand` → alert, `chin-rest-long-hair` → none). E2E passing. Soak with real footage + hair segmenter: 14.8–15.0 fps.
- **Needs a re-test by the user** with real strand pulls: Settings → Re-calibrate, then the Desk preview (look for `hair` in the readout and orange fingertip rings).
- Personal classifier built and gated (M8 part 1). Duolingo-style redesign: Mochi mascot (squishable), show-up streak with freezes, XP + flavour levels, daily quests, session recap with mood check-in, floating desk buddy (PiP), daily reminder, Sassy/Gentle voice. 13 test files, 97 tests passing; E2E passing.
