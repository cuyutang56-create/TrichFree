# Detection report

Generated 2026-10-12 by `npm run evaluate` (scripts/evaluate.ts). Re-run it after any detector change; `npm test` locks the key properties in (test/evaluate.test.ts).

> **What this is and is not.** These results come from running the real detection pipeline and reminder engine over
> **synthetic** hand and face landmark recordings, made by `scripts/make-fixtures.mjs`, under simulated degradations.
> They show how the logic behaves on known movements: latency, missed simulated reaches, false alerts, alert loops.
> They are **not** a measure of real-world or clinical accuracy. Real cameras, lighting, skin tones, hair, glasses,
> occlusion and the MediaPipe models themselves are not exercised here. No user data was used.

## Fixtures

| Fixture | Kind | What happens | Expected reminders |
|---|---|---|---|
| `pinch-at-crown` | positive | Fingers pinch at the crown for 4 s | 1 |
| `pinch-at-temple` | positive | Fingers pinch at the temple (sides zone) for 3.5 s | 1 |
| `pinch-strand` | positive | Pinching a lock of long hair beside the face (strands zone) | 1 |
| `reach-hairline-open` | positive | Open hand resting at the front hairline for 3 s (no pinch) | 1 |
| `three-reaches` | positive | Three separate 3 s reaches at the crown, 7 s apart | 3 |
| `brief-touch-crown` | negative | A 0.5 s touch at the crown | 0 |
| `chin-rest` | negative | Chin resting on the hand | 0 |
| `chin-rest-long-hair` | negative | Chin on an open hand with long hair falling nearby | 0 |
| `drinking-cup` | negative | Drinking from a cup (hand close to the camera) | 0 |
| `glasses-adjust` | negative | Two brief touches at the bridge of the glasses | 0 |
| `hover-boundary` | loop | Hand drifting back to the hairline for 40 s (2 s in, 1.2 s out) | 4 |
| `scratch-scalp` | limitation | Scratching the scalp with an open hand for 3 s | 1 |

*positive*: a reminder is wanted. *negative*: an everyday movement that should stay quiet. *loop*: checks that a
hand that keeps coming back does not cause a stream of reminders. *limitation*: ordinary touching that the detector
cannot tell apart from a reach from landmarks alone (a known false positive, kept visible on purpose).

## Conditions

Each fixture is recorded at 15 frames per second. The harness degrades it the way slower computers and real cameras do:

| Condition | What changes |
|---|---|
| 15 fps | nothing (the recording as-is) |
| 8 fps | frames dropped to 8 per second (the face model runs on every 3rd processed frame) |
| 5 fps | frames dropped to 5 per second (the face model runs on every 3rd processed frame) |
| 3 fps | frames dropped to 3 per second (the face model runs on every 3rd processed frame) |
| 15 fps + noise | landmark jitter σ=0.004 (≈2.6 px at 640 px) |
| 15 fps + 20% hand misses | the hand model misses the hand in 20% of frames |
| 3 fps + noise + 20% misses | frames dropped to 3 per second (the face model runs on every 3rd processed frame); landmark jitter σ=0.004 (≈2.6 px at 640 px); the hand model misses the hand in 20% of frames |

All runs use the **balanced** sensitivity and the shortest quiet time (5 s), so repeated reminders are counted at
their most frequent; the shipped default quiet time is 30 s (see below). Randomness is seeded, so every run gives
the same numbers.

## Summary

| Condition | Reaches caught | False alerts (negatives) | Median latency | Worst latency |
|---|---|---|---|---|
| 15 fps | 7 / 7 | 0 | 0.87 s | 1.67 s |
| 8 fps | 7 / 7 | 0 | 0.90 s | 1.80 s |
| 5 fps | 7 / 7 | 0 | 0.80 s | 1.60 s |
| 3 fps | 7 / 7 | 0 | 1.00 s | 1.67 s |
| 15 fps + noise | 7 / 7 | 0 | 0.87 s | 1.67 s |
| 15 fps + 20% hand misses | 7 / 7 | 0 | 0.87 s | 1.67 s |
| 3 fps + noise + 20% misses | 7 / 7 | 0 | 1.00 s | 2.00 s |

A *reach* is one expected reminder (`three-reaches` holds three). Latency is the time from the hand arriving at the
hair to the first reminder. It is mostly the deliberate dwell (0.8 s for a pinch, 1.5 s for an open hand at
balanced sensitivity), which is what keeps brief touches quiet.

### Over 50 random seeds

The conditions with noise or missed hands depend on the random seed, so they are repeated with seeds 1–50:

| Condition | Reaches caught | False alerts in negative runs | Misses by fixture |
|---|---|---|---|
| 15 fps + noise | 350 / 350 (100.0 %) | 0 in 250 | none |
| 15 fps + 20% hand misses | 350 / 350 (100.0 %) | 0 in 250 | none |
| 3 fps + noise + 20% misses | 343 / 350 (98.0 %) | 0 in 250 | `reach-hairline-open` 4, `three-reaches` 2, `pinch-at-temple` 1 |

## Every fixture under every condition

Reminders produced (first-reminder latency for positives).

| Fixture | 15 fps | 8 fps | 5 fps | 3 fps | 15 fps + noise | 15 fps + 20% hand misses | 3 fps + noise + 20% misses |
|---|---|---|---|---|---|---|---|
| `pinch-at-crown` (expect 1) | 1 (0.77 s) | 1 (0.90 s) | 1 (0.70 s) | 1 (1.17 s) | 1 (0.77 s) | 1 (0.77 s) | 1 (1.50 s) |
| `pinch-at-temple` (expect 1) | 1 (0.87 s) | 1 (0.87 s) | 1 (0.80 s) | 1 (1.00 s) | 1 (0.87 s) | 1 (0.87 s) | 1 (1.00 s) |
| `pinch-strand` (expect 1) | 1 (0.93 s) | 1 (1.00 s) | 1 (0.80 s) | 1 (1.00 s) | 1 (0.93 s) | 1 (1.00 s) | 1 (1.00 s) |
| `reach-hairline-open` (expect 1) | 1 (1.67 s) | 1 (1.80 s) | 1 (1.60 s) | 1 (1.67 s) | 1 (1.67 s) | 1 (1.67 s) | 1 (2.00 s) |
| `three-reaches` (expect 3) | 3 (0.87 s) | 3 (0.87 s) | 3 (0.80 s) | 3 (1.00 s) | 3 (0.87 s) | 3 (0.87 s) | 3 (1.00 s) |
| `brief-touch-crown` (expect 0) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `chin-rest` (expect 0) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `chin-rest-long-hair` (expect 0) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `drinking-cup` (expect 0) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `glasses-adjust` (expect 0) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `hover-boundary` (expect 4) | 4 | 4 | 4 | 4 | 4 | 4 | 3 |
| `scratch-scalp` (expect 1) | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

## Quiet time and alert loops

Reminders at 15 fps for different quiet times (the pause after a reminder before another can fire; set in
Settings → Reminder, 5 s to 10 min, default 30 s).

| Fixture | 5 s | 15 s | 30 s | 60 s | 120 s |
|---|---|---|---|---|---|
| `three-reaches` | 3 | 2 | 1 | 1 | 1 |
| `hover-boundary` | 4 | 2 | 2 | 1 | 1 |

With the old fixed 5 s cooldown, a hand hovering at the hairline was reminded about every 10 s. The default is now
30 s and configurable; the engine never re-alerts within one episode beyond the single follow-up (which can be
turned off).

## Sensitivity presets (15 fps)

| Sensitivity | Reaches caught | False alerts (negatives) | Known false positive (scratching) | Median latency |
|---|---|---|---|---|
| relaxed | 7 / 7 | 0 | 1 | 1.33 s |
| balanced | 7 / 7 | 0 | 1 | 0.87 s |
| sensitive | 7 / 7 | 3 | 1 | 0.67 s |

## Resource use

- **Detection logic** (pipeline + reminder engine, excluding the ML models): **6.9 µs per frame**
  in Node on this machine (2160 frames × 20 repetitions). It is negligible next to the models.
- **In the browser** (`npm run soak`, 3 min each, 2026-10-12): cloud container: Linux, 4 vCPU Intel Xeon 2.1 GHz, no GPU (WebGL is software-emulated, so the CPU delegate is chosen), headless Chromium 141, fake camera.
  CPU is the sum over all browser processes (100 % = one core); memory is their proportional set size.

  | | Frame rate (min–average) | Browser CPU | Memory |
  |---|---|---|---|
  | Monitoring off | – | 0 % | 334 MB |
  | Monitoring on (default, aims for 15 fps) | 11.1–14.4 fps | 165 % | 541 MB |
  | Monitoring on, "Lighter detection" (aims for 8 fps) | 7.8–8 fps | 94 % | 543 MB |

  This machine has no GPU, so these are close to a worst case: on a laptop with working GPU acceleration the models
  run on the GPU and the CPU figure should be much lower. That has **not** been measured yet (see "What would make
  this stronger").
- **On a real computer**, turn on Settings → "Show the debug page", then open Debug to see the live frame rate and
  whether the GPU or CPU delegate is in use. The extension aims for 15 fps (8 with lighter detection); well below
  that for 10 s the dashboard says "Watching (slowly)" instead of failing silently, and it reports a stall only
  after 15 s with no frames.

## Findings and fixes from this harness

Each of these was found by this harness or the soak measurement and fixed; `test/temporal.test.ts`,
`test/evaluate.test.ts` and `test/health.test.ts` keep them fixed.

- **Fixed: computers without GPU acceleration were very slow.** MediaPipe's GPU path ran through Chrome's software
  GPU emulation: 2.4–2.7 fps at 372 % CPU on the machine above (measured 2026-10-12). The vision worker now detects a
  software WebGL renderer (SwiftShader, llvmpipe, Microsoft Basic Render Driver) and uses MediaPipe's CPU path
  instead, which gave the default-mode figures in the table above on the same machine. Machines with a real GPU are
  unaffected.
- **Added: "Lighter detection on this computer"** (Settings → Advanced, off by default): aims for 8 fps instead of 15.
  On these fixtures 8 fps catches 7/7 reaches with 0 false alerts, 0.03 s later (median), for 43 % less CPU on the machine above.
  The "running slowly" warning scales with the target, so it does not fire at 8 fps.
- **Fixed: slow computers never completed a dwell.** At about 3 frames per second, frames arrive ~333 ms apart,
  longer than the fixed 300 ms gap tolerance, so every reach reset its own dwell timer and **no reach was ever
  caught**. The tolerance now adapts to the measured frame interval (it covers one missed frame, capped at 700 ms).
- **Fixed: slow reactions on slow computers.** The smoothing constant was per frame, so at 3 fps the score took
  five times longer to rise and one missed frame cost about 0.7 s. It now scales with the real time between frames
  (identical at 15 fps). Worst-case latency in the hardest condition went from 4.0 s to the figure above.
- **Fixed: time after the hand had gone could complete a dwell.** Widening the gap tolerance exposed this: a 0.5 s
  touch at 3 fps became a reminder. Only a frame that actually sees the hand in the zone can now complete a dwell.
- **Fixed: one missed hand detection counted as the hand leaving.** At 15 fps with 20 % missed detections, the
  open-hand reach was missed in 11 of 50 seeds. A frame with no hand at all within 0.4 s of a hand in a zone is now
  "no observation" (like the existing face hold): it neither lowers the score nor counts as a gap, and it can never
  complete a dwell by itself. Now caught in 50 of 50 seeds, with no new false alerts.
- **Fixed: alert loops.** The cooldown was a fixed 5 s. It is now a user setting with a 30 s default (table above).
- **Known miss:** under the worst combined condition (3 fps + noise + 20 % missed hands), three missed frames in a
  row leave over a second unobserved, which restarts the dwell, so a few reaches are missed (see the seed table).
  The open-hand reach is the most affected, because its dwell is longest.
- **Known false positive:** scratching the scalp looks like a reach to the detector. From hand and face landmarks
  alone there is no reliable way to tell them apart. Users can switch a zone off, choose the relaxed sensitivity,
  lengthen the quiet time or run the 2-minute camera tune-up. "Not a pull" (dashboard, popup, notification or
  Ctrl/⌘+Shift+Y) records the false alarm on the device, where it counts in Insights and tunes the personal model.

## Limitations of this evaluation

- Synthetic landmarks only: the MediaPipe hand, face and hair models are not exercised, and neither are real
  cameras, lighting, skin tones, hairstyles, head coverings, glasses, or the user turning away.
- One synthetic person and head size; one camera geometry.
- No real hair-pulling or BFRB behaviour was recorded. Real behaviour is varied and often subtle.
- Resource use was measured on one machine with no GPU. It has not been measured on typical student laptops
  (Windows and macOS, integrated graphics, on battery).
- What would make this stronger: consented landmark-only recordings (no video) from pilot participants, labelled
  by the participant, replayed with `npm run replay`; `npm run soak` on a few real laptops; and the per-session
  average frame rate the pilot already records.

