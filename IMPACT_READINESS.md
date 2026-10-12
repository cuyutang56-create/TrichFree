# Impact readiness

Prepared for the NUSC Impact Incubator (October 2026). Every claim below carries one of four labels:

| Label | Meaning |
|---|---|
| **Implemented** | Built and in this repository. |
| **Tested** | Implemented *and* checked by automated tests or a documented measurement (TESTING.md). |
| **User-validated** | Checked with real people using the product. |
| **Proposed** | A plan, not yet built or done. |

**Honest summary.** The product works end to end and is well tested on the engineering side. **Nothing is yet
user-validated in a study, and there is no evidence yet that TrichFree reduces hair pulling.** The pilot described
in section 9 exists to find out.

## At a glance

| Capability | Implemented | Tested | User-validated | Proposed next |
|---|---|---|---|---|
| On-device hand, face and hair detection with gentle reminders | ✅ | ✅ synthetic fixtures, 7 simulated conditions, browser runs | ⚠️ one informal real-user test (it missed a strand pull; fixed, not yet re-tested) | Manual checklist on real laptops; pilot |
| Reminder in the user's own recorded voice, chime, visual cue, or off | ✅ | ✅ | ❌ | Pilot compares chime and own-voice |
| Two-step onboarding, test reminder within about a minute | ✅ | ✅ browser tests | ❌ | Usability sessions |
| Guest mode; optional account with email code sign-in | ✅ | ✅ real auth in tests | ❌ | — |
| Cross-device settings sync with conflict handling | ✅ | ✅ two independent browser profiles against a real database | ❌ | — |
| Privacy: video never leaves the device; voice never uploaded | ✅ | ✅ automated checks of network code and CSP | ❌ | External security review |
| Data export and account deletion | ✅ | ✅ | ❌ | — |
| Public website, in-browser demo, pilot interest form | ✅ | ✅ | ❌ | Deploy (founder action) |
| Pilot research mode (randomised chime vs own voice) | ✅ | ✅ randomisation and upload tests | ❌ | Ethics approval, recruitment |
| Deployment (website, backend, Chrome Web Store) | Documented | Rehearsed locally and in CI | — | **Not deployed** (needs the team's accounts) |

## 1. The problem

Trichotillomania (hair-pulling disorder) is a body-focused repetitive behaviour: people repeatedly pull out their own
hair despite wanting to stop. It can cause hair loss, distress and shame, and many people hide it.

Pulling often begins without full awareness, for example while reading, studying or working at a screen. A person
may only notice once it has already happened. Desk time is when this product is meant to help.

We deliberately make no prevalence or outcome claims here, because we have not verified sources we would stand
behind. Statistics for the pitch should come from cited, reputable sources (for example the TLC Foundation for
BFRBs), reviewed by the team.

## 2. Target users

- Adults (18+, or younger with a parent or guardian) who live with trichotillomania and spend long periods at a
  laptop or desktop with a webcam: students first, then desk-based workers.
- Initial context: Singapore (NUS community), English. Chrome or Edge on Windows or macOS.
- Secondary: parents of teenagers, and clinicians who may want to suggest a self-help awareness tool. They can
  register pilot interest; TrichFree is not a clinical tool.

## 3. Why current solutions may be insufficient

These are hypotheses for the pilot to test, not established facts:

- **Behavioural therapy** (habit reversal training builds awareness and a competing response) is the most
  established approach. Access can be limited by cost, waiting times and the small number of specialists, and
  between sessions the person is on their own.
- **Habit-tracking apps** mostly log pulling after the fact. They depend on the person noticing, which is the hard
  part.
- **Wearables** that detect hand movement exist. They need buying and wearing a device, and may not tell where the
  hand is relative to the hair.
- **Generic reminders** (timers, notes) are not tied to the moment pulling starts.

TrichFree's bet: use the webcam a student already has, at the moment the hand goes to the hair, and remind them in
a way they chose — possibly in their own voice — privately and without judgement.

## 4. The product

- **Browser extension** (Chrome, Edge) — *Implemented, Tested.*
  - Watches the camera on the device while monitoring is on.
  - Notices possible hand-to-hair movements in the zones the user picks: crown, hairline, sides, brows, lashes,
    strands of long hair.
  - Gives the chosen reminder: their own recorded voice, a gentle chime, a quiet visual cue, or nothing (log only).
  - Optional suggestions: lower your hand gently, hold something comfortable, change posture, take a short break.
  - Quiet time between reminders (default 30 s) and at most one follow-up, so it never nags.
- **Website** — *Implemented, Tested; not deployed.*
  - Explains the product honestly.
  - `/try/`: the real detector running in the page, nothing to install, nothing uploaded.
  - `/app/`: account, settings, short reflections, export, deletion.
  - A real pilot interest form.
- **Accounts are optional** — *Implemented, Tested.* Guest mode works fully on one computer. A free account (sign-in
  with an emailed code, no password) keeps settings in sync across computers.
- **Mochi**, an optional companion — *Implemented.* Offered only after a first session and off by default. It
  rewards showing up and honest feedback, never "pull-free days".

## 5. Technical differentiation

- **On-device computer vision** — *Implemented, Tested.*
  - MediaPipe hand and face landmarks and a hair segmenter run inside the browser.
  - Video frames are never stored or sent, and the extension makes no other network requests (enforced by tests).
  - On computers without GPU acceleration, it switches to the faster CPU path: 11–14 fps instead of 2–3 fps on our
    test machine (docs/DETECTION_REPORT.md).
- **Hair-aware detection** — *Implemented, Tested on synthetic data.* Hand position relative to the face, pinch
  shape and hair contact, smoothed over time with a deliberate dwell. Brief touches stay quiet.
- **Robustness work with evidence** — *Tested.* A reproducible harness runs the detector over synthetic movements
  at 15 down to 3 frames per second, with landmark noise and missed detections. It found four bugs that are now
  fixed. For example, at about 3 fps no reach was ever caught before the fix. Now every simulated reach is caught
  under all but the hardest condition (343 of 350 there), with no false alerts on the everyday-movement fixtures.
  These are synthetic results, **not real-world accuracy**.
- **Privacy-preserving cross-device sync** — *Implemented, Tested.* Settings sync field by field. When two devices
  change the same setting, the user is told rather than silently overwritten. Voice recordings are deliberately
  never uploaded; users record again on a new computer.
- **Security engineering** — *Implemented, Tested.* Row-level security with cross-user isolation tests, strict
  content security policies verified in browser tests, unguessable pilot codes, checksum-pinned models
  (SECURITY.md).

## 6. Research-informed personalisation

- **Awareness at the moment it starts.** Habit reversal training starts with awareness. TrichFree aims to support
  this by noticing the hand-to-hair movement itself. *Implemented; whether it helps is untested.*
- **Own-voice self-talk.** Users can record a short supportive line in their own voice, or have someone they trust
  record it. Whether this works better than a neutral chime is the pilot's main question (section 9).
  *Implemented; the comparison is Proposed.*
- **Competing-response style suggestions.** Optional micro-actions (lower your hand, hold something, change
  posture, take a break) are offered as choices, not instructions or treatment. *Implemented.*
- **Personal pulling zones**, three sensitivity levels, quiet time, a 2-minute camera tune-up, and a small personal
  model that learns from the user's own "Not a pull" / "I just pulled" feedback, on the device only.
  *Implemented, Tested (unit); not user-validated.*
- **Non-judgemental design.** No punishment, no "failure" counts, calm copy, crisis and support contacts in the
  extension (Singapore helplines, verified 2026-10-12). *Implemented.*
- People differ: no single reminder is assumed to work for everyone, so the choice stays with the user.

## 7. Existing prototype milestones

These come from the team's own records (PROGRESS.md, DECISIONS.md, git history):

- **September 2026:** Manifest V3 extension prototype with on-device detection, own-voice clips, onboarding with
  calibration, pilot randomisation, CSV export. Background soak with real footage: about 15 fps on a GPU machine.
  *Implemented, Tested.*
- **5 October 2026:** first real-user test. It missed a strand pulled beside the face, which led to hair
  segmentation and a "strands" zone. *Partly user-validated: the problem was found with a user; the fix has not
  been re-tested with them.*
- **12 October 2026 (this release):**
  - audit (AUDIT.md);
  - accounts and cross-device sync on Supabase with row-level security;
  - two-step onboarding and a calm, accessible redesign;
  - visual reminder mode, volume, quiet time and follow-up controls;
  - public website with an in-browser demo and pilot form;
  - detection harness and slow-computer fixes;
  - security review;
  - 173 unit, 50 database and 21 browser tests, running in CI.
  *Implemented, Tested.*

## 8. Current limitations

- **No evidence of benefit yet.** No study has been run, and nothing here shows that TrichFree reduces pulling.
- **Detection accuracy on real people is unknown.**
  - The evaluation uses synthetic landmarks.
  - Real cameras, lighting, skin tones, hairstyles, head coverings and glasses are untested.
  - Scratching the scalp can look like a reach (a known false positive).
  - The extension cannot tell every genuine pulling episode apart from ordinary hair touching, and says so.
- **Desktop Chrome and Edge only**, with a webcam. No mobile, Safari or Firefox support for the extension (the
  `/try/` demo works more widely).
- **Voice recordings do not sync**, by design, so they must be recorded again on each computer.
- **Not deployed.** The website, backend and store listing need the team's accounts (DEPLOYMENT.md). The Chrome Web
  Store review for camera extensions can take days.
- **Not independently reviewed** for security or accessibility. Automated checks only, plus our own review.
- **Resource use** was measured on one machine without a GPU, not yet on typical student laptops.

## 9. Pilot validation strategy

*Mode built and tested (Implemented, Tested); the study itself is Proposed.*

- **Design.** 14 days per participant. Days 1–3 are a silent baseline: detection logs only, which measures the
  detector and natural hand-down behaviour. Days 4–14 randomise each episode to chime or own-voice, in permuted
  blocks seeded per participant (within-person comparison).
- **Data.** Pseudonymous rows keyed by a random participant code: episode times, reminder type, whether the hand
  came down within 10 s, "Not a pull" / "I just pulled" taps, desk minutes. Never video, images or audio.
  Participants can stop sharing at any time.
- **Questions.**
  1. Does a reminder interrupt a reach (hand-down rate after a reminder versus baseline)?
  2. Is own-voice better than a chime?
  3. How often are reminders wrong (false alarms) or missing ("I just pulled" with no reminder)?
  4. Do people keep using it, and how does it feel (exit questionnaire)?
- **Before recruiting.** Ethics review and consent through the appropriate institutional process; inclusion of
  adults only; a safety plan (support contacts, withdrawal at any time).
- **Scale (proposed).** A small feasibility pilot, roughly 10–20 participants, to learn about acceptability and
  detection quality. It is not powered to prove clinical benefit.
- **Expert input.** Feedback from practitioners is welcome. A practitioner the team has been in contact with
  (including the UK practitioner mentioned in the team's materials) is **not** presented as an advisor, partner or
  endorser. Anyone is named only with written permission, and only for what they actually did.

## 10. Privacy and safety

- **Privacy** (SECURITY.md, ARCHITECTURE.md, the website's privacy policy) — *Implemented, Tested.*
  - Camera analysis happens on the device and is never stored.
  - Voice recordings and history stay on the device.
  - Only settings, reflections and the account email are in the cloud, protected by row-level security and
    isolation tests.
  - No third-party analytics or trackers.
  - Export and deletion are available to every user.
- **Safety** — *Implemented.*
  - TrichFree states plainly that it is a self-help tool, not a medical device or treatment.
  - The copy is gentle and never punishes.
  - Monitoring can be paused or stopped at once.
  - The camera is never restarted silently after a browser restart.
  - Support contacts are shown in Singapore (National mindline 1771, Samaritans of Singapore 1767, emergency 995)
    and internationally (The TLC Foundation for BFRBs; Trichotillomania Support, a UK non-profit). These were
    verified on 2026-10-12 and should be re-checked before launch.

## 11. Potential sustainability model

*All Proposed. Nothing here has been agreed with anyone.*

- **Free core for individuals.** On-device detection and reminders cost almost nothing to run, because there is
  no server-side video processing.
- **Low running costs.** Static website hosting plus a small managed database. Free tiers are likely to be enough
  for a pilot; paid plans (backups, more sign-ins) cost tens of dollars a month (check current provider pricing).
- **Possible funding routes to explore:**
  - social-impact grants and incubator support;
  - university wellbeing programmes, offering TrichFree as a free self-help option (no partnership exists or is
    claimed);
  - an optional paid tier for features that genuinely cost money to run, for example end-to-end-encrypted voice
    sync across devices;
  - donations.
- **What we will not do:** sell or share data, show advertising, or charge for safety features.

## 12. Planned impact metrics

*Proposed: definitions to agree before the pilot. None has been measured yet.*

| Area | Metric | Source |
|---|---|---|
| Reach | Installs; weekly active users; desk minutes per week | Store statistics; opt-in pilot data |
| Engagement | Sessions per week; retention at 2, 4 and 8 weeks | Pilot data |
| In-the-moment effect | Share of reminders followed by the hand coming down within 10 s, versus the silent baseline; own-voice versus chime | Pilot (randomised within person) |
| Detection quality | False-alarm rate ("Not a pull" per reminder); missed reaches ("I just pulled" without a reminder) | Pilot |
| Wellbeing (self-reported) | Change in a validated hair-pulling severity scale (for example the MGH Hairpulling Scale), chosen with expert input and ethics approval | Pre/post questionnaires |
| Experience | System Usability Scale; "would you recommend"; open feedback | Exit questionnaire |

Results will be reported as pilot findings, with their limits stated, never as clinical outcomes.

## 13. Future development milestones

*All Proposed. Dates are targets.*

| When | Milestone |
|---|---|
| 16 Oct 2026 | Incubator demo (five-minute script in the final report and README). |
| Late Oct 2026 | Staging and production Supabase projects; website live on the team's domain; store listing submitted as unlisted (DEPLOYMENT.md). |
| Nov 2026 | Manual checklist on Mac and Windows laptops; fix what it finds; ethics application; recruit pilot participants. |
| Dec 2026 – Jan 2027 | 14-day pilot; weekly check of data quality; support contacts on hand. |
| Feb 2027 | Analyse and share the findings honestly, including what did not work; decide what to change. |
| 2027 (if the pilot supports it) | Detection improvements from consented landmark-only recordings; encrypted voice sync (opt-in); Firefox and Safari; an independent security and accessibility review; a clinician-informed content review. |
