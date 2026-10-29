# TrichFree: NUSC Impact Incubator pitch pack

Deck: `TrichFree_NUSC_Pitch.pptx` (editable), preview `TrichFree_NUSC_Pitch.pdf`. Speaker notes carry the script, sources and evidence for each slide.

The audit below is based on the `claude/release-audit` branch, the most complete version of the product (14 Oct 2026). `main` and this branch hold an older prototype.

**Fill in before presenting:**
- Current HabitAware price and NUS enrolment.
- Funding amounts from the Info Kit.

**Not available while preparing this pack:**
- NExT deck, application PDF, Info Kit and `trich_research.xlsx`.
- The live site (blocked by the network).

---

## A. Product audit

### What TrichFree does today
TrichFree is a Chrome/Edge extension (Manifest V3) with a companion website. While monitoring is on, it runs MediaPipe hand and face landmarkers and a hair segmenter **on the device**. When a hand pinches or rests in one of the user's chosen areas for 0.8–1.5 s, it plays a reminder: their own recorded voice, a chime, a visual cue, or nothing (log only). It logs each episode as times only, never video, and records whether the hand came down within 10 s.

### Feature classification

| Feature | Class | Where | User benefit |
|---|---|---|---|
| On-device hand, face and hair detection | **A** demonstrable | `src/workers/vision.worker.ts`, `src/core/pipeline.ts` | Uses the webcam already on the laptop; nothing to buy or wear |
| Personal areas (crown, hairline, sides, strands, brows, lashes, beard), measured in face units | **A** | `src/core/zones.ts`, `faceFrame.ts`, Settings → Detection | Matches where *this* person pulls |
| Hair contact and the "strands" area | **A**, but needs validation | `src/core/hair.ts`, `test/hair-real.test.ts` | Catches a lock held beside the face. Added after the first real-user test missed one |
| Sensitivity (Relaxed 2.5 s / Balanced 1.5 s / Sensitive 1 s) and quiet time | **A** | `src/core/detectorConfig.ts` | User trades sensitivity against false alerts |
| Own-voice reminders (6 prompt cards, trim/normalise, least-recently-played rotation) | **A** | `src/shared/prompts.ts`, `src/core/clipPicker.ts`, `audioProcess.ts` | Puts the practitioner's idea into practice |
| Chime / visual / off modes; optional suggestions | **A** | Settings → Reminder | Choice and dignity |
| "Not a pull" / "I just pulled" feedback, including global shortcuts | **A** | `src/core/engine.ts`, `manifest.config.ts` | Honest labelling while staying in the current app |
| On-device personal classifier, gated by hold-out accuracy | **B** | `src/core/classifier.ts`, `personalModel.ts` | Learns the user's own movements; never alerts on its own |
| 2-minute camera tune-up | **B** | `src/app/screens/Calibrate*` | Widens zones for this camera |
| Insights (desk minutes, reminders, hand-down rate) | **A**, empty until used | Insights page | Information, not a score |
| Optional account and cross-device settings sync (Supabase, row-level security) | **B** (built, not deployed) | `supabase/`, `web/` | Settings follow the user; voice never uploads |
| Website with an in-browser `/try/` demo and pilot interest form | **B** (built, not deployed) | `web/` | Try it without installing |
| 14-day pilot mode (3-day silent baseline, then randomised chime vs voice) | **C**: built, study not run | `src/core/arms.ts`, `supabase/schema.sql` | Ready-made within-person comparison |
| Mochi companion (off by default) | **A** | `src/app/components/Mochi.tsx` | Rewards showing up, never "pull-free days" |
| Practitioner dashboard, consent-based sharing, clinical workflows | **D**: not built | none | Long-term vision only |
| Other BFRBs (skin picking, nail biting) | **D** | none | The engine is face-relative, so in principle it could extend |

**Is the architecture ready for practitioners?** Partly.
- Already in place:
  - pure, tested core logic (`src/core`)
  - per-user settings sync with row-level security
  - a pilot upload schema keyed by pseudonymous codes
  - CSV export
- Missing:
  - practitioner accounts and roles
  - consent and sharing flows
  - any clinician view

So a consent-based sharing feature is a reasonable next build, but it doesn't exist yet. Claim nothing clinical.

### Technical evidence: what is and isn't proven

| Claim | Status | Source |
|---|---|---|
| 283 automated tests (192 unit, 57 database, 34 browser) | **Documented.** 193 unit tests re-run and passing on 29 Oct 2026; DB and browser suites not re-run here | `IMPACT_READINESS.md` §7 |
| 350/350 simulated reaches, 0 false alerts in 250 negative runs; 343/350 at 3 fps + noise + 20% hand misses | **Reproducible**, synthetic only | `docs/DETECTION_REPORT.md`, `npm run evaluate` |
| Median 0.87 s from reach to reminder (simulated) | Reproducible, synthetic | Same |
| About 15 fps in the background with real footage on a GPU machine; 11–14 fps on the CPU path | Measured on the team's machines | `PROGRESS.md`, `DETECTION_REPORT.md` |
| 100+ founder detection trials | **Founder-reported, not documented.** No logs, labels, participant counts or conditions in the repository | none |
| Real-world sensitivity, false-positive or false-negative rates | **Unknown** | none |
| Generalisation to new users, skin tones, hair types, head coverings, lighting | **Untested** | `IMPACT_READINESS.md` §8 |
| Known false positive | Scratching the scalp; 2 of 6 synthetic hair-touch scenes in the audit challenge triggered a reminder | `DETECTION_REPORT.md`, audit |
| Reduces pulling | **No evidence** | none |

From the 100+ trials, quote the *count* only, as "founder-reported". To turn them into evidence:
- Log each trial with a label (pull or reach vs everyday move), the conditions and the outcome.
- Report sensitivity, plus false alerts per hour of desk time.
- Then test on new users.

Software tests show reliability, not detection accuracy. Never use the 283 tests to argue that detection works.

### Strongest screenshots

All are in the deck, taken from the real build:
- **Settings → Areas to watch:** shows personalisation at a glance.
- **Voice cards:** "Hey, it's me. Your hand is up there."
- **Reminder choice:** chime / own voice / visual / off.
- **Detector view:** drawn by the real `zones.ts` code on a synthetic fixture.
- **Hair-segmentation mask:** real model output from the demo video.

Recommended addition: a 10-second screen recording on a real laptop, from reach to chime to own voice.

### Safe claims
- Working extension and website.
- Video never stored or sent.
- Voice clips never uploaded.
- 283 automated tests.
- 350/350 simulated reaches (say "synthetic").
- Hair segmentation added after user feedback.
- Pilot mode built in.
- A practitioner with 30+ years of experience expressed interest.

### Claims that need more evidence
- Any accuracy percentage.
- "It helps" or "it reduces pulling".
- Any number of users.
- Institutional demand.
- Clinical endorsement.
- "Better than wearables" on detection quality.

---

## B. Investor critique: the five most serious weaknesses

1. **No real-world detection evidence.** All the numbers are synthetic, and the 100+ trials are unlogged.
   - *Fix:* Say so first, before the judges ask. Present a concrete Stage 1 plan: labelled trials and 3–5 new users, measuring sensitivity and false alerts per hour. If possible, log 30–50 labelled founder trials before pitch day and quote them as "founder trials, 2 people".
2. **Business development is thin. Who pays?** "We can scale" isn't a model, and NUSC explicitly prioritises business potential.
   - *Fix (slide 6):* individuals free, institutions as payers (B2B2C).
   - Argue the near-zero marginal cost: all AI runs on the user's device.
   - Name the willingness-to-pay test as an incubation deliverable.
   - Before pitch day, try to get 1–2 conversations, for example with NUS University Health Centre or wellbeing staff, or a BFRB organisation, and report what they said.
3. **No user demand data beyond one expert and one test.**
   - *Fix:* Use the practitioner quote, but frame it as an idea, not proof.
   - Add the result of any structured interviews or the pilot interest form, if you have it.
   - Be explicit that Stage 1 includes user interviews.
4. **Desk-only scope.** Much pulling happens in bed or the bathroom too.
   - *Fix:* Own the beachhead. Students spend hours at laptops, and automatic pulling often happens during sedentary tasks.
   - Position TrichFree as complementing therapy and wearables, not replacing them.
5. **Risk of harm or distress** from false alerts, a sense of surveillance, or sensitive data.
   - *Fix:*
     - On-device processing.
     - Off and visual modes.
     - Quiet time.
     - No shame metrics; the streak counts showing up, never pull-free days.
     - Safety contacts in the extension.
     - Ethics review before any pilot.
     - The pilot's 3-day silent baseline.

Also be ready for: "Why you two?" The answer is the vision pipeline plus the statistics, and a record of shipping fixes fast. Also be ready to explain how incubation selection differs from the funding decision.

---

## C. Slide outline

The deck follows the approved outline. On-slide text, visuals, evidence and transitions are all in the PPTX and its notes.

| # | Headline | Time |
|---|---|---|
| 1 | It starts before you notice | 25 s |
| 2 | Help arrives too late (3 stat blocks, then the expert's idea) | 40 s |
| 3 | Meet TrichFree (detector view, hair mask, 3 steps with screenshots) | 50 s |
| 4 | Competitive Positioning (2×2: after vs in the moment, generic vs personal; bubble = cost) | 32 s |
| 5 | Built, tested, and ready to be proven (6 large-icon tiles) | 42 s |
| 6 | Support should not be a privilege (reach funnel, economics, 3 tiers) | 38 s |
| 7 | Every step earns the next (4-step staircase, with a metric and the NUSC role on each step) | 38 s |
| 8 | Let's ease suffering, one quiet moment at a time (team, why incubation, closing) | 40 s |

---

## D. Full script (about 640 words, about 5 minutes)

**1.** Quick question: did you touch your hair in the last five minutes? *(pause)* Most of us honestly don't know, and for most of us it doesn't matter. But for about one in sixty adults, that unnoticed touch is where trichotillomania begins: hair pulling they desperately want to stop, and often don't notice starting. We're TrichFree, and we build support for exactly that moment.

**2.** Trichotillomania affects about 1.7 percent of adults. It typically begins around seventeen, just as people arrive at university, and one in four people with it say it interferes with their work every day. The best-evidenced treatment, habit reversal training, starts with awareness. But much pulling is automatic: it happens while you read or study, and you only notice afterwards. Therapy is weekly. Urges are not. A practitioner with more than thirty years of experience wrote to us: *"If you could get each individual to record something for themselves which would help them at the moment of the behaviour and somehow AUTOMATICALLY play it back to them when they began pulling, I think it would stop them."* That is what we had already begun to build.

**3.** This is TrichFree: a browser extension that uses the webcam already on your laptop. On the left is what it sees: twenty-one points on your hand, your face as a reference frame, and a hair-segmentation model that knows where your hair is, even a lock held beside your face. You choose your areas: crown, hairline, temples, strands, brows, lashes. When your fingers pinch there for about a second, it doesn't buzz at you. It plays a soft chime, then your own voice: "Hey, it's me. Your hand is up there." Everything runs on the laptop. Video is never stored or sent.

**4.** Here's the landscape. Trackers and timers work after the moment. Wearables catch the moment, but with a generic buzz, and cost around a hundred and fifty US dollars. Therapy is deeply personal, but it lives between sessions. TrichFree sits alone in the top right: in the moment, and personal, on hardware students already own. Honestly, it only works at a desk, and we haven't yet measured real-world accuracy.

**5.** And it's real. A working extension and website. 283 automated tests. An evaluation harness that runs our real detector on simulated movements, even slow, noisy cameras: 350 of 350 simulated reaches caught, zero false alerts on drinking or resting your chin. That's synthetic, not real-world; measuring that is next. Our first real-user test failed: it missed a strand pulled beside the face. Within days we'd added hair segmentation. We listen, and we fix.

**6.** Support shouldn't depend on what you can afford. Individuals get the core tool free, and that's sustainable because all the AI runs on the user's own laptop. No cloud GPUs, no video storage: each extra user costs us almost nothing. Revenue comes from institutions, like university wellbeing services and BFRB organisations offering supported access, and later from practitioners. Our beachhead is NUS: on prevalence alone, roughly six hundred students. Whether institutions will pay is our biggest open question. Testing that is exactly why we need business mentorship.

**7.** We'll climb one step at a time. First, label our hundred-plus founder trials and test with new users, to measure real accuracy. Second, an ethics-reviewed fourteen-day pilot, already built into the extension, comparing a chime with your own voice. Third, distribution trials with institutions. Fourth, practitioner-informed personalisation. Every step has a metric, and we never confuse engagement with clinical effect.

**8.** We're Tang Caoyu, who built the vision pipeline, and Zhang Xinyi, who designed the evaluation. We kept going through hackathon setbacks because this matters to us. We can write the software. What we can't do alone is run an ethical study, reach institutions and build clinical partnerships, and that's what NUSC unlocks. Tonight at 11:42, someone's hand will drift to their hair. We want the next thing they hear to be their own voice, saying: it's okay. I've got you. Thank you.

**Delivery tips:**
- Rehearse with a timer; slide 3 is where people run long.
- Pause after the opening question and after the quote.
- Slow down for the closing line.
- If there's a live demo, cut slide 3's middle sentence to make time.

---

## E. Editable presentation
`TrichFree_NUSC_Pitch.pptx`:
- 16:9, 8 slides.
- TrichFree brand palette from `src/ui/tokens.css`.
- Real screenshots of the extension.
- Speaker notes with the script and sources.
- Passes the PPTX validation checks.

The PDF preview was rendered with LibreOffice, so fonts may differ slightly from PowerPoint.

---

## F. Judge Q&A (15 questions)

1. **How accurate is detection in the real world?**
   We don't know yet, and we won't guess.
   - On simulated movements, our harness catches 350 of 350 reaches, with no false alerts on everyday moves, even at 3 fps with noise.
   - Stage 1 measures real sensitivity and false alerts per hour, using labelled trials and new users.
2. **False positives and negatives?**
   - Known false positive: scratching the scalp.
   - Known miss, now fixed: a strand held beside the face.
   - Users control it through three sensitivities, a deliberate pause before reminding, quiet time, and a "Not a pull" button that also trains their personal model.
   - We'll report both error types separately.
3. **Isn't a webcam watching me creepy? What about privacy?**
   - Video is processed in memory on the laptop and never stored or sent.
   - Voice clips never upload.
   - The extension makes no other network calls, which automated tests enforce.
   - The camera is off whenever monitoring is off.
   - The pilot sends only the pseudonymous fields listed in the consent notice.
   - We still plan an external security review.
4. **Is this clinically validated? Is it a medical device?**
   - No. It's a self-help awareness tool, not a treatment or a diagnosis, and the extension says so.
   - Clinical claims would need clinical studies and, depending on the claims, regulatory review. We're not making any.
5. **Could reminders cause distress or shame?**
   It's a real risk, so we designed against it:
   - kind, user-chosen wording
   - no failure counts; the streak counts showing up
   - a visual or off mode
   - quiet time and at most one follow-up
   - support contacts in the extension

   The pilot will measure acceptability and distress directly. Ethics review comes first.
6. **Why not just use a wearable?**
   - Wearables are portable, which we're not.
   - We offer three things they don't: no device to buy, a cue in the user's own voice, and knowing *where* the hand is relative to the hair, which could mean fewer false alerts from ordinary arm movements. We still have to measure that.
   - Many people could use both.
7. **What stops a big company or HabitAware copying you?**
   - The code isn't the moat.
   - Our edge is focus: face-relative, hair-aware detection tuned for this behaviour, the own-voice intervention, privacy-first design, and the trust and community relationships we're starting to build.
   - Institutional channels are relationship-driven.
8. **How would practitioners use it?**
   - Long-term: as a between-session tool their client chooses to use.
   - The practitioner could help write the client's recorded lines, and the client could choose to share summaries with consent.
   - None of this is built.
   - The architecture (per-user sync with row-level security, pseudonymous pilot data) is a starting point.
9. **Will institutions actually pay?**
   - Unknown. It's our main business hypothesis.
   - Universities already fund student wellbeing, and one licence reaches many students.
   - In Stage 3 we test price, the buyer (wellbeing office, counselling service, BFRB organisation) and procurement. Business mentorship is how we do that well.
10. **How is it financially sustainable if individuals use it free?**
    - Inference runs on the user's device, so the cost of each extra user is close to zero: no GPUs, no video storage.
    - Fixed costs are small: hosting, store fees, testing devices.
    - Institutional licences, and later practitioner licences, cover them.
    - If institutions won't pay, the fallbacks are a low-cost premium tier, or grants and partners. We'd test both.
11. **What social-impact metrics will you report?**
    Each measured separately:
    - helpfulness and acceptability
    - sustained voluntary use
    - hand-down rate after a reminder, chime vs own voice
    - false alerts per hour
    - privacy incidents (target: zero)
    - number of people reached through free access

    Engagement is not clinical effectiveness, and we'll never present it as such.
12. **Are you committed beyond this competition?**
    - We kept building after hackathon setbacks and shipped a hair-aware fix within days of a failed user test.
    - The product is built to production standards: 283 automated tests and a security audit.
    - Our plan runs well past the incubation period.
13. **How do you scale?**
    - NUS first, then other Singapore universities, then BFRB communities worldwide. These are English-speaking, desk-based students and workers.
    - Distribution through institutions and BFRB organisations, not paid ads.
    - The product is a browser extension, so there's no hardware supply chain.
14. **What are the ethical considerations?**
    - Informed consent and ethics review before the pilot.
    - A pseudonymous code with the participant list kept offline.
    - Minimal data and the right to delete it.
    - No minors without a guardian.
    - Clear "not a treatment" messaging and support contacts.
    - Equity: test across skin tones, hairstyles and head coverings before claiming the tool works for everyone.
15. **Why should NUSC select you?**
    - The groundwork is done: a working, tested product, built from a NExT project.
    - An expert has engaged with us.
    - We're candid about what's unproven, and we have a staged plan to prove it.
    - What we lack is exactly what incubation provides: clinical and ethics mentorship, user access, business-model testing and introductions.
    - The problem affects about 1 in 60 people and starts at university age, so NUS is the natural place to begin.

---

## Sources
- Grant, Dougherty & Chamberlain (2020), *Psychiatry Research*: prevalence 1.7%, mean onset 17.7, n = 10,169. https://pmc.ncbi.nlm.nih.gov/articles/PMC7212053
- Woods et al. (2006), Trichotillomania Impact Project, *J Clin Psychiatry* 67(12): 23% daily interference with work. https://www.psychiatrictimes.com/view/trichotillomania-great-impact-low-clinician-recognition
- Behavioural therapy / habit-reversal meta-analysis (24 RCTs, 857 participants). https://pmc.ncbi.nlm.nih.gov/articles/PMC12854921/
- Automatic vs focused pulling subtypes. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7612152/
- HabitAware Keen2 pricing (dated listings; verify before use). https://montech.ruralinstitute.umt.edu/mtdb/item_view.asp?ID=8407
- Repository evidence (`claude/release-audit`): `IMPACT_READINESS.md`, `docs/DETECTION_REPORT.md`, `docs/INDEPENDENT_RELEASE_AUDIT.md`, `DECISIONS.md`, `PROGRESS.md`.
