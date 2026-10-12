# Privacy policy

The privacy policy is part of the website: `web/privacy/index.html`, published at `https://<your domain>/privacy/`.
Use that URL in the Chrome Web Store, and edit that one file when the policy changes. That keeps a single source
of truth.

In short (the policy has the details):
- Camera video is analysed on the device and never saved or uploaded.
- Voice recordings and the detection history stay on the device.
- TrichFree works without an account. With a free account, Supabase stores the email address, the reminder
  settings and any reflections the user saves. Row-level security protects them, and the user can export or delete
  them at any time.
- Research pilot participants who opt in send pseudonymous rows (times, reminder type, outcomes, feedback taps),
  never video, images or audio.
- No ads, no tracking, no third-party scripts; data is never sold.

Before publishing, fill in what only the team can confirm:
- the contact address: set `VITE_CONTACT_EMAIL`; without it the page offers GitHub only;
- the backup retention period of the chosen Supabase plan ("Deletion");
- the version line at the top.

When the policy changes, also update `PRIVACY_POLICY_VERSION` in `src/sync/remote.ts`, which records the version
each account accepted.
