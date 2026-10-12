# Progress

| # | Milestone | Status | Evidence / what's left |
|---|---|---|---|
| M0 | Scaffold (CRXJS/Vite/React/TS, SW, offscreen, worker, popup, app, typed messages, Dexie, CI) | ✅ Done | `npm run build` loads cleanly in Chromium 153; the popup opens the app page; Vitest runs in CI (`.github/workflows/ci.yml`). |
| M1 | Background spike (permission via app page → offscreen → MSTP → worker → both landmarkers from bundled assets → fps → heartbeat → badge) | ✅ Automated part / ⏳ manual | E2E passes (offscreen doc exists, ≥ 5 fps, badge `•`). Automated soak with the app tab closed and another page in front: see the soak results below. **Still to do by hand:** 10 min in a different full-screen app on real Chrome on macOS and Windows, then a reach-to-hair gesture must still alert. |
| M2 | Vision core + debug overlay + recorder + replay CLI + synthetic fixtures | ✅ Done | zones/features/temporal/replay tests pass; `npm run replay` works; the Debug page draws zones following the head. |
| M3 | Engine + audio in offscreen (reducer, chime synth, pre-decoded clips, notifications with buttons, global commands) | ✅ Built / ⏳ manual | Engine tests cover every transition + feedback in every state. Latency is logged as the `alert_latency` event. Needs a real "hand at crown → chime + clip < 300 ms" check with Chrome in the background. |
| M4 | Voice library (record, trim/normalise, WAV, prompts, re-record) | ✅ Done | audioProcess tests pass (trim, −3 dBFS ± 0.2, 22.05 kHz 16-bit WAV). The offscreen doc decodes WAV clips (E2E uses stub WAVs). |
| M5 | Onboarding, calibration + validation, popup, settings, idle/lock stop, camera conflicts, backup, delete-all | ✅ Built / ⏳ manual | Onboarding UI is exercised in E2E. Manual checklist 1–8 (README) still needs one Mac and one Windows laptop. |
| M6 | Pilot mode (code, schedule, permuted blocks, upload queue, schema, CSV, progress screen) | ✅ Built / ⏳ backend | arms tests pass; `supabase/schema.sql` is ready. "Rows appear in Supabase" needs a real project + env vars. |
| M7 | Store package (icons, listing, permissions, privacy policy, zip script, checklist) | ✅ Done | `npm run package` → `release/trichfree-desk-v0.1.0.zip`; docs in `store/`. Screenshots still to capture. |
| M8 | Personal classifier, web demo | ⛔ Not started (by design) | Spec: only after M0–M7 and real-user testing. Feature samples are already logged. |

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
