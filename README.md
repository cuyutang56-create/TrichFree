# TrichFree

**A little reminder, right when you need it.**

TrichFree is a privacy-first companion for people with trichotillomania. While you study or work, a browser
extension watches your webcam **on your own device**. When your hand stays at your hair, it gives you the gentle
reminder you chose: a line in **your own recorded voice**, a soft chime, or a quiet visual cue. Video never leaves
your computer. An optional free account keeps your settings in sync across computers.

TrichFree is a self-help tool, not a medical device or a treatment.

| | |
|---|---|
| **Status** | Working end to end and tested (see below); **not yet deployed** and **not yet user-validated**. |
| **Extension** | Chrome and Edge (Manifest V3) |
| **Website** | Landing page, `/try/` (the detector in your browser), `/app/` (account), `/privacy/` |
| **Backend** | Supabase (Postgres with row-level security, email-code sign-in) |

## Documentation

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data map, accounts, cross-device sync and the conflict policy |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Going live: environments, Supabase, hosting, Chrome Web Store, pilot, rollback, backups |
| [TESTING.md](TESTING.md) | Automated suites, how to run them, the manual checklist for real laptops |
| [SECURITY.md](SECURITY.md) | Threat model, controls, review findings and the remaining risks |
| [docs/DETECTION_REPORT.md](docs/DETECTION_REPORT.md) | How the detector behaves: latency, misses, false alerts, resource use, limits |
| [IMPACT_READINESS.md](IMPACT_READINESS.md) | Problem, users, product, evidence (implemented / tested / user-validated / proposed), pilot plan, metrics |
| [AUDIT.md](AUDIT.md) | The audit of the original prototype that this release started from |
| [DECISIONS.md](DECISIONS.md), [PROGRESS.md](PROGRESS.md) | Design decisions and milestone log |

## Quick start (development)

```bash
npm ci                 # also copies the MediaPipe WebAssembly files (postinstall)
npm run fetch-models   # hand, face and hair models: pinned versions, SHA-256 checked
npm run build          # extension → dist/
```

Then open `chrome://extensions` (or `edge://extensions`):
1. Turn on **Developer mode**.
2. Click **Load unpacked** and pick `dist/`.
3. Onboarding opens by itself.

This build has no backend configured, so it runs in guest mode: everything stays on the computer.

With accounts, against a local backend (needs Docker):

```bash
npm run db:start                 # local Supabase: Postgres, Auth, and a mail catcher for sign-in codes
node scripts/build-e2e.mjs       # extension (dist-e2e/) + website (dist-web-e2e/) pointed at the local stack
WEB_OUT_DIR=dist-web-e2e npm run preview:web    # the website on http://127.0.0.1:5174
```

Sign-in codes appear in the local mail catcher at http://127.0.0.1:54324. Build variables are explained in
[.env.example](.env.example).

### Scripts

| Script | What it does |
|---|---|
| `npm test` / `npm run typecheck` | Unit tests / type checking |
| `npm run test:integration` | Database tests against the local stack (row-level security, sync, deletion, …) |
| `npm run e2e` | Browser tests (Playwright). Account and website tests need `node scripts/build-e2e.mjs` first |
| `npm run build:web` / `npm run dev:web` | Website build (`dist-web/`) / dev server |
| `npm run package` | Typecheck, build and zip the extension → `release/trichfree-desk-v<version>.zip` |
| `npm run evaluate` | Detection evaluation → `docs/DETECTION_REPORT.md` |
| `npm run replay -- <file.json>` | Replay a landmark recording through the detector and print events |
| `npm run soak -- 3 [--lighter] [--write]` | Frame rate, CPU and memory with monitoring on (Linux for CPU and memory) |
| `npm run fixtures` | Regenerate the synthetic landmark fixtures |
| `node scripts/make-pilot-codes.mjs 30` | Participant codes for the research pilot, plus the SQL to register them |
| `node scripts/make-og-image.mjs`, `node scripts/make-icons.mjs` | Regenerate the social preview image and the icons |

## Five-minute demo

Before the demo, set up a computer with a webcam:
- the extension loaded from `dist-e2e/`;
- the website preview running against the local stack, or the deployed site and backend;
- one test account ready;
- a second browser profile, set up the same way, for the sync step.

Rehearse once, and check that the room's lighting lets the camera see your face.

1. **0:00 The problem (30 s).** Pulling often starts without full awareness, at a desk, while studying. The person
   notices afterwards. TrichFree aims to make the moment visible, gently and privately.
2. **0:30 Onboarding (60 s).** Install, and onboarding opens. Show the **two steps**:
   - what TrichFree does, with privacy in plain words;
   - choose a reminder, then press **Test reminder** and hear it at once;
   - optionally record a voice line ("Hey, it's me. Hands down, you're doing fine.").

   No account is needed: the chip says **Guest**.
3. **1:30 Live detection (60 s).**
   - Press **Start**: the dashboard shows "Watching", the camera status and the chosen reminder.
   - Rest your chin on your hand, take a sip of water, touch your glasses briefly: nothing happens.
   - Reach to your hairline and hold it there: your own voice plays.
   - Click **Not a pull** to show feedback.
   - Press **Pause**: the camera light goes off.
4. **2:30 Privacy (30 s).** Open Settings → "Data on this computer":
   - video is analysed in memory and never stored;
   - voice recordings never leave the computer;
   - only settings sync.

   Mention the tests that check the extension cannot send anything else (SECURITY.md).
5. **3:00 Cross-device (60 s).**
   - Click **Save across devices** and sign in with an emailed 6-digit code (no password).
   - Change the quiet time.
   - In the second browser profile ("Laptop B"), sign in: the setting is there. Change the sensitivity.
   - Back on Laptop A, click into TrichFree: B's change arrives within a moment, and the notice says so. If the
     network is slow, press **Sync now**.
   - Open `/app/` on the website to show the same settings, export, and account deletion.
6. **4:00 Evidence and honesty (45 s).**
   - Show docs/DETECTION_REPORT.md: synthetic fixtures at 15 to 3 fps, four bugs found and fixed, known limits
     such as scalp scratching.
   - Show CI green, including the two-browser test against a real database.
   - Say clearly: **no evidence of benefit yet**. That is what the 14-day pilot (chime versus own voice) is for.
7. **4:45 Ask (15 s).** Support for the pilot (ethics, participants) and introductions to people with lived
   experience who would like to try it.

**If something fails during the demo:** use `/try/` on the website. It runs the same detector in the page with no
install and no account.

## Repository layout

`src/core` detection and reminder logic (pure TypeScript) · `src/sync` preference sync · `src/background`
service worker and account session · `src/offscreen` camera and audio · `src/workers` MediaPipe ·
`src/app`, `src/popup`, `src/ui` extension pages and design system · `web/` website · `supabase/` migrations and
local stack · `test/`, `e2e/` tests · `scripts/` build, evaluation and operations helpers · `store/` Chrome Web
Store texts. Details in [ARCHITECTURE.md](ARCHITECTURE.md).

## Support

If you are struggling, please reach out. In Singapore:
- National mindline **1771** (24 hours; WhatsApp +65 6669 1771);
- Samaritans of Singapore **1767**;
- emergency **995**.

The TLC Foundation for BFRBs (bfrb.org) and Trichotillomania Support (trichotillomania.co.uk) have information and
communities.
