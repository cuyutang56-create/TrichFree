# Chrome Web Store listing

**Name:** TrichFree

**Summary (at most 132 characters):** Notices when your hand goes to your hair while you work, and gives a gentle reminder in your own voice. Video stays on your device.

**Category:** Lifestyle → Well-being (or Productivity → Workflow & Planning) · **Visibility:** Unlisted for the
pilot · **Language:** English

## Description
TrichFree is a self-help companion for people with trichotillomania (hair pulling) who spend long hours at a laptop.

- **Your voice, not an alarm.** Record a short line, like "Hey, it's me. Hands down, you're doing fine." When your
  hand stays at your hair for a moment, you hear it. Or choose a soft chime, a quiet on-screen cue, or nothing.
- **Your zones.** Pick where you usually pull: crown, hairline, sides, brows, lashes, or strands of long hair.
  Everyday moves like drinking or resting your chin are designed to stay quiet. A 2-minute tune-up adapts it to
  your camera.
- **Calm, never nagging.** A quiet time between reminders (you choose it), at most one gentle follow-up, and
  optional suggestions such as "hold something comfortable". No shame, no streaks of "pull-free" days.
- **Works in the background.** Keep studying in any app. Answer "Not a pull" or "I just pulled" from the
  notification or the popup.
- **Private by design.** Detection runs on your computer with Google's MediaPipe. Video is never saved or sent, and
  voice recordings stay on your computer.
- **Optional free account.** Sign in with an emailed code (no password) to keep your settings on every computer.
  Export or delete your account at any time.

TrichFree is not a medical device or a treatment. It may not notice every pull, and ordinary hair touching can
sometimes look like a reach. If you are struggling, please talk to someone: support contacts are inside the
extension.

## Screenshots (1280×800) to capture, in `store/screenshots/`
1. Dashboard while watching: monitoring and camera status, the chosen reminder, Start/Pause/Stop.
2. Onboarding step 2: choosing a reminder, with "Test reminder".
3. The Voice page: record, preview, save.
4. Settings: reminder options and "Data on this computer".
5. The toolbar popup with the feedback buttons.

(`node scripts/screenshots.mjs` captures pages from a local build; check them before uploading.)

## Submission checklist
- [ ] `npm run package` → `release/trichfree-desk-vX.Y.Z.zip`, built with the production `VITE_*` values
      (DEPLOYMENT.md §3) and **without** `EXTENSION_PUBLIC_KEY`. It installs cleanly in a fresh Chrome profile
      (unzip, then Load unpacked).
- [ ] Privacy practices tab: the single purpose and every justification from `permissions.md`.
- [ ] Data usage. Declare conservatively:
      - **Personally identifiable information** (email address, for optional accounts);
      - **Authentication information** (one-time sign-in codes);
      - **Health information** (settings such as the areas where you pull are saved to your account; pilot data,
        for participants who opt in).

      Certify: no sale or transfer to third parties, no use unrelated to the single purpose, no use for
      creditworthiness or lending.
- [ ] Privacy policy URL: `https://<your domain>/privacy/` (the website's policy, `web/privacy/index.html`).
- [ ] Visibility **Unlisted** for the pilot. Submit early: reviews can take several days, longer for camera
      extensions.
- [ ] Pilot fallback: the same zip with a pinned ID (DEPLOYMENT.md §3.3) and the "Load unpacked" steps in README.
