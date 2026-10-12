# Decisions

One line each, in the order they were made. See `TrichFree_Desk_MVP_Build_Spec.md` for the spec.

- Build tool: Vite 8 + `@crxjs/vite-plugin` 3.0 (CRXJS worked; WXT not needed). React 18, TypeScript strict.
- The vision worker is an ES module worker, which cannot `importScripts`, so it loads MediaPipe's **module** WASM loader (`forVisionTasks(base, true)`).
- tasks-vision clears `self.ModuleFactory` after creating each task and an ES module only runs once, so the worker keeps the factory from the first import and restores it before each `createFromOptions` (without this, FaceLandmarker fails with "ModuleFactory not set").
- The release zip ships only the module WASM (`vision_wasm_module_internal.*`); the classic and no-SIMD variants are unused (Chrome ≥ 120 always has WASM SIMD).
- Offscreen documents only get `chrome.runtime`, so the offscreen doc sends `STATUS` (1 Hz, which is also the heartbeat) to the service worker, and **only the SW writes `chrome.storage.local`** (spec 4.7 rule 4 said the offscreen doc writes `lastHeartbeat`).
- The SW serialises its read-modify-write of `deskState` through a promise chain so concurrent STATUS messages can't overwrite each other.
- The SW starts the engine only after the offscreen doc announces `OFFSCREEN_READY`, and any SW restart re-sends `OFF_START` if `wanted` is true. The SW keeps no state in globals.
- All timestamps are epoch ms (`performance.timeOrigin + performance.now()` in the worker), so worker, offscreen and Dexie agree.
- `faceMissingPolicy = "hold"` is the only policy implemented, as in the spec. pSmooth freezes for up to 5 s while an episode is ongoing, then the episode ends as if the hand had left.
- Uncalibrated depth band for `r = |wrist→middleMCP| / faceW` is 0.45–0.85. On the real demo footage the median `r` for hands near the face was 0.52, which is inside the band.
- Face edge landmarks 234/454 sit slightly below the nose bridge, so face units are measured along the chin→forehead axis (as specified), not perpendicular to the edge line.
- The zone rectangles use exclusive lower / inclusive upper bounds on v and exclusive bounds on |u|. Midline zones use `uMin = -1` internally so |u| = 0 counts as inside.
- Calibration zone widening is stored per zone as `{du, dvUp, dvDown}` (≤ 0.15 each, 80th percentile of miss distances); it applies to every rectangle in the zone.
- Risky negatives add 300 ms of dwell **each**, capped at +900 ms.
- `custom` clips are allowed in both ALERT_1 and ALERT_2 sets (they are the user's own words). If no clip is allowed, fall back to any other clip; with one clip only, it won't repeat, so the alert plays the chime.
- ALERT_2 in the VOICE arm plays only the next clip (no second chime), per "chime again, **or** next own-voice clip".
- `brief_touch` episodes have `arm = null`, because the arm is decided at ALERT_1 and a brief touch never reaches it.
- Pilot randomisation consumes a block slot only when the arm is actually randomised (speakers/earbuds). `chime_only` logs `FORCED_CHIME`, and `silent_log` logs `SILENT`, without using a slot, so blocks stay balanced.
- The random-episode counter `pilotEpisodeIndex` is kept in settings and incremented by the offscreen engine only.
- "Not a pull" / "I just pulled" with desk mode off are logged by the SW directly (`missed: true`, `deskOff: true`).
- Desk-page live preview uses its own `getUserMedia` for the video and draws the landmark overlay streamed from the offscreen doc (JSON, ≤ 10 Hz, only while subscribed). No pixels are ever sent between contexts.
- The Calibrate and Debug pages run their own camera and worker (`calibrationSession.ts`) and re-run `core/pipeline` on the page. The worker's camera track is a `clone()`, so the preview `<video>` keeps playing.
- Camera check luminance is measured locally from a 32×32 downscale of the face box and discarded right away.
- Validation: 5 positives cycle through the chosen zones and 5 negatives are the first five negative poses. "Alert within 3 s" is measured from the start of each 4 s capture.
- Feature samples (M4.8 data) are logged from day 1: calibration frames, "Not a pull" (3 s, label 0), "I just pulled" (5 s, label 1), and interrupted episodes (weak label 1). The classifier itself is M8 and not built.
- Recordings keep only the face indices the core reads (`USED_FACE_INDICES`), not all 478, to stay small.
- Global shortcuts `Ctrl/Cmd+Shift+Y/U` loaded without errors in Chromium 153. If a platform rejects them as global, users rebind them at `chrome://extensions/shortcuts` (linked from Settings).
- "Pause 15 min" fully stops the camera and offscreen doc, then a `resume` alarm restarts desk mode.
- The E2E uses Playwright's bundled Chromium (`channel: 'chromium'`), because branded Chrome ≥ 137 ignores `--load-extension`.
- **Offscreen lifetime (spike):** in headless Chromium 153 the offscreen doc (reasons USER_MEDIA + AUDIO_PLAYBACK) stayed alive for the whole soak with no audio playing, and the heartbeat alarm never had to recreate it. This still needs confirming on real Chrome/Edge on macOS and Windows over 60 min (README manual checklist #3).
- The enabled zones come from Settings (`settings.zones`). Calibration stores its own zone list for telemetry and only widens bounds, so toggling a zone in Settings takes effect right away.
- Frame limiter is a token bucket (earn `targetFps` tokens/s, cap 1.5, a frame costs 1) instead of a minimum gap between frames. The minimum-gap version dropped frames that arrived a few ms early: a 20 fps fake camera gave 10 fps, and the 5-min soak dipped to 11 fps. With the bucket the soak holds 14.5–15.6 fps.

## 2026-10-05: after the first real-user test
- **Missed pull, root cause:** the user pulled a lock of hair held beside her face at mouth height. Every zone was a box relative to the scalp, so `zone` was empty and p = 0 (even though pinch = 0.16 and r = 0.63 were right).
- **Fix: hair contact.** The worker now runs MediaPipe's hair segmenter (`hair_segmenter.tflite`, 780 KB, category 1 = hair). It runs only while a hand is visible, every 3rd frame (≈ 5 fps), with the mask reused for ≤ 450 ms. `core/hair.ts` measures the fraction of hair on two rings around the thumb tip, index tip and pinch midpoint (radii 0.25× and 0.45× hand size). The mask was checked on the demo video and covers hair down to the shoulders.
- **New zone `strands`** ("Strands / ends", on by default): fingers in hair (contact ≥ 0.25) outside every scalp zone. It has its own weights (base 0.3, depth ±, pinch +0.35), so only a **pinch at face depth** crosses candidateOn. A hand resting near long hair stays quiet (fixture `chin-rest-long-hair`). Scalp zones get +0.1 when the fingers are in hair.
- The occlusion veto doesn't apply to a pinched strand held across the face.
- Hair contact is computed in the worker and stored on `HandObs.hairContact`, so `core/` stays pure and recordings replay exactly.
- With the segmenter on, the soak with real footage still holds 14.8–15.0 fps.
- **Calibration shortened (replaces spec 7.3/7.5 at the founder's request).** The old flow was 3 reaches per zone + 6 everyday moves, each behind an "I'm ready" click, then a 10-trial exam that restarted from scratch on failure. People did 25+ poses. The new flow is: camera check that moves on by itself → zones → one **auto-advancing** run (1 pinch reach per zone + 3 everyday moves, 1.8 s prep + 3.5 s hold, a missed reach is repeated once automatically) → **Try it** free play that plays the real chime + own clip on each catch, with live speed switching ("It's missing me" → Sensitive, "It went off by mistake" → Relaxed). `validationPos` = catches (≤ 5), `validationNeg` = "went off by mistake" taps.

## 2026-10-05: personal model and playful redesign
- **Personal classifier is on (M8 part 1, pulled forward at the founder's request).** `core/classifier.ts` is logistic regression with balanced class weights and L2, trained on the user's own feature samples (zone frames only), with zones one-hot and pSmooth dropped. The 90%-trained model ships, and its 10% hold-out balanced accuracy is the gate (≥ 40 per class and ≥ 0.8). 5k samples train in ~60 ms. When active, `pFinal = 0.5·pRule + 0.5·pModel`. Outside every zone the rule score is 0, so the model can never trigger an alert on its own; it can only confirm or veto.
- New labels: "Try it" catches (2 s before the alert → 1) and "went off by mistake" (last 3 s → 0), in addition to the desk-mode feedback labels. The model retrains every 50 new labels and right after calibration, and is pushed to the worker live.
- **Mascot: Mochi**, a squishable rice-cake. The character has a job: squeezing it is a practised competing response (the research's helper #3, "something with your hands", 16%). Squeezes count toward a daily quest. This is a deliberate answer to "AI character apps fail": the character is not a chatbot and not decoration, it's part of the intervention.
- **Two-register voice:** sass (Duolingo-style, user can choose Sassy/Gentle) only about showing up; about pulling, Mochi is always kind, whatever the setting (unit-tested). All lines are hand-written, none generated.
- **Streak = days with ≥ 10 desk minutes (showing up), never pull-free days.** Every 7 counted days earn a freeze (max 2), auto-spent on a missed day. XP: 1/desk minute, 10/catch, 5/honest tap, 2/check-in, 1 per 10 squeezes, plus quest bonuses. Levels are mochi flavours (cosmetic unlocks).
- Onboarding needs only the **Notice** clip (value first); the other clips are encouraged later.
- **Desk buddy** uses Document Picture-in-Picture from the app tab (Chrome ≥ 116). It closes if the app tab closes. Stylesheets are copied into the PiP document, with root-relative font URLs made absolute.
- Fonts: Fredoka and Gochi Hand (SIL OFL), bundled in `public/fonts`, so there are no runtime font requests.
- Daily reminder: a `chrome.alarms` alarm at the chosen time; it notifies only if today's streak isn't done and desk mode is off.

## 2026-10-05: hair tuning, animations, full-screen pages
- **Hair contact tuned on real data.** `scripts/tune-hair.mjs` and `test/hair-real.test.ts` use 8 hair-confidence masks (160×120, plus 7 face points; no pixels) from the team's demo video. Simulated pinching hands, with the hand cutting its own shape out of the mask, are placed on hair (positive) and on the face, chin, background and "near hair" 0.15–0.35 face widths away (negatives). Ring sampling beat disk coverage (≤ 90% vs 97% balanced accuracy). Final: confidence mask ≥ **0.4** (was argmax ≈ 0.5), contact ≥ **0.175** (was 0.25). On-hair fingertips caught: **82% → 97%**; face 0%, background 0%, near-hair 18%. Near-hair contact alone can't alert: the strands zone still needs a pinch at face depth plus dwell.
- The worker now uses the confidence mask and smooths contact per hand (fast attack, slow release).
- **Animations:** Mochi tracks the pointer with its eyes and blinks. One-shot actions: cheer ("Yeahh!" jump, arms up, star burst), roll, spin, wiggle, hop, roll-in, plus sleepy z's and a Line Rider scooter ride on a self-drawing track. Triggers: hand came down after an alert, quest completed, every 10th squeeze → cheer; session start → ride; double-click → spin; "Not a pull" → wiggle ("oops"); idle every 14–26 s → a random move. A pull gets **no** animation (calm and kind). Everything respects `prefers-reduced-motion`.
- **Every page is full-screen colour:** Home, Voice and Calibrate are indigo; Journey is lilac; Settings is lime; Debug is white. Cards become soft translucent panels, coloured tiles keep dark ink, and decorative shapes hug the window edges.
- **Softer palette (founder feedback: contrast too strong).** Saturated indigo #3140d8 → dusty indigo #565fa8, neon lime → pastel #e3eda8, and pink/lilac/peach/ink are all desaturated. Key pairs still meet WCAG AA: white on indigo 5.8:1 (was 7.4), lime on indigo 4.7:1, muted text 4.8:1, ink on every pastel tile ≥ 8:1.
- Softer palette tried and **reverted** at the founder's request: back to the original saturated indigo #3140d8 / lime #d5f25a palette.
