# Security

TrichFree handles sensitive information: it watches a camera, it can hold a person's own voice, and its very use
says something about their health. This page describes what is protected, how, what was checked on 2026-10-12, and
the risks that remain. It is written for the team, reviewers and anyone deploying TrichFree.

## Reporting a vulnerability

Please report privately. Do not open a public issue.

- On GitHub: the repository's **Security** tab → **Report a vulnerability** (the owner needs to switch on private
  vulnerability reporting under Settings → Code security; see the founder actions in DEPLOYMENT.md).
- Or email the team at the contact address shown on the website.

## What is protected

| Data | Where it lives | Who can read it |
|---|---|---|
| Camera frames | Memory only, inside the extension's offscreen document and vision worker (or the `/try` page). Never stored, never sent. | Nobody else. |
| Voice recordings | IndexedDB in the browser profile that recorded them. Never synced or uploaded. | The user. Also in local backup files they export. |
| Detection history (episodes, events, sessions, calibration) | IndexedDB on the device. | The user. Uploaded only for pilot participants who opt in (below). |
| Account: email, preferences, reflections | Supabase (Postgres) with row-level security. | Only the signed-in owner. |
| Pilot telemetry (opt-in research pilot) | Supabase, keyed by a random participant code, not by account. | Insert-only for clients; only the research team (dashboard) can read it. |
| Pilot interest form | Supabase table with no client access at all. | Only the team (dashboard). |
| Sign-in sessions | Extension: `chrome.storage.local`, held by the service worker. Website: the browser's `localStorage` for the site. | The browser profile. Never sent anywhere but Supabase. |

## Controls

**Backend (supabase/migrations)**
- Row-level security is on for every table. Policies use `(select auth.uid())` and grant each signed-in user only
  their own rows. Default table grants are revoked, then granted back per column where needed. For example, the
  privacy-acceptance timestamp is set by the server and cannot be written by clients.
- Every value a client can write has a database `CHECK` constraint that mirrors the app's validation (enumerations,
  ranges, lengths, a zone allowlist, no control characters in free text). Tests check that both sides agree.
- `SECURITY DEFINER` functions pin `search_path = ''` and either live in a schema the REST API does not expose
  (`private`) or have execute rights revoked from `public` and granted narrowly.
- Preferences use optimistic concurrency: a server-side version trigger, plus updates that only succeed against the
  version they were based on. A stale device can never silently overwrite newer data.
- Account deletion (`delete_my_account`) deletes the auth user, which cascades to profile, preferences and
  reflections. Export (`export_my_data`) runs with the caller's own rights.
- Pilot uploads are accepted only for **issued** participant codes (`pilot_codes`). Codes are `TF-XXXX-XXXX` from 30
  unambiguous characters, about 39 bits each (`scripts/make-pilot-codes.mjs`), so an issued code cannot be found by
  guessing. The previous `TF-XXXX` format (1.7 million combinations) could be found by a script in hours. Clients
  can insert but never read telemetry.
- The pilot interest form goes through `submit_pilot_interest`, which validates input, never reveals whether an
  email is already registered, and has a global cap of 60 submissions per 10 minutes.
- Sign-in uses 6-digit one-time **codes** (10-minute expiry), not magic links, so no sign-in token ever travels in a
  URL.

**Extension (manifest.config.ts, src/background)**
- Permissions: `offscreen`, `storage`, `unlimitedStorage`, `notifications`, `alarms`, `idle`, and host access only to
  the project's own Supabase URL (only in builds with accounts). No content scripts, no `tabs` or `<all_urls>`, and
  no web-accessible resources, so websites cannot even detect that TrichFree is installed. Telling sites that someone
  uses a hair-pulling tool would be a privacy harm in itself.
- Content Security Policy: `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` (WebAssembly only, no
  `eval`), no inline script or style, `connect-src` limited to the extension and the project's Supabase,
  `object-src 'none'`, `frame-ancestors 'none'`. The test `test/privacy.test.ts` enforces this policy, and also that
  only two modules may make network requests.
- Internal messages are accepted only from the extension itself (`sender.id === chrome.runtime.id`).
- The website bridge (`externally_connectable`) accepts messages only from the configured site origin (exact match)
  and only `PING`, `SYNC_NOW`, `OPEN` and `STOP`. A web page can never start the camera.
- The session token never leaves the service worker: pages receive only a token-free account state.

**Website (vite.web.config.ts → `_headers`)**
- Strict CSP (no inline script or style, no third-party origins, `connect-src` only to the project's Supabase),
  `frame-ancestors 'none'` plus `X-Frame-Options: DENY`, HSTS, `nosniff`, `strict-origin-when-cross-origin`
  referrers, and a permissions policy allowing the camera and microphone only for the site itself.
- The browser tests run against `vite preview` serving these same headers and fail on any CSP violation
  (`e2e/website.spec.ts`), so a change that the policy would break in production fails in CI. We checked that the
  tripwire does catch inline script, inline style and cross-origin requests.
- No third-party analytics, fonts, CDNs or trackers. The page's text is rendered by React, with no HTML injection
  (`innerHTML`, `dangerouslySetInnerHTML` and `eval` are not used anywhere).

**Supply chain**
- `npm audit`: 0 vulnerabilities (2026-10-12; a high-severity advisory in the dev-only `source-map-js` was fixed).
- MediaPipe models are pinned to version 1 and verified by SHA-256 on download (`scripts/fetch-models.mjs`). They
  are bundled with the extension and the site and never fetched at runtime. The WebAssembly runtime comes from the
  `@mediapipe/tasks-vision` npm package, whose integrity is checked by the lockfile.
- No secrets in the repository or its history (checked for JWTs, service keys, Supabase secret keys and private
  keys). Only the public anon (publishable) key is ever built into a client; the service-role key is used only by
  the local integration tests.

## Checks run for this review (2026-10-12)

- `npm audit` (0 vulnerabilities after the fix); a search of the code for HTML injection sinks, `eval`, URL
  redirects, logging of user data and message listeners without origin checks (none found); a scan of the git
  history for secrets (none).
- Review of every migration's grants, policies and functions; 49 integration tests against a real Supabase stack:
  cross-user isolation (user B cannot read, change or delete user A's rows), constraint parity, concurrent writes,
  export, deletion cascade, the pilot form and pilot uploads.
- The built extension manifest (no web-accessible resources, no content scripts); Chrome's own report of the
  extension (no manifest errors); the website's served headers; CSP-violation tripwires in the browser tests.

### Problems found and fixed in this review

| Problem | Severity | Fix |
|---|---|---|
| Pilot participant codes (`TF-XXXX`) could be found by guessing, allowing fabricated research data under a real participant's code | Medium (research integrity) | Long random codes, enforced by the database, plus a generator |
| Model downloads used `latest` URLs with no integrity check | Medium (supply chain) | Pinned versions plus SHA-256 verification |
| Dev dependency advisory (`source-map-js`, event-loop denial of service) | High (dev only, not shipped) | `npm audit fix` |
| The website's CSP was never exercised by tests (preview served no headers) | Medium (a policy could break the site, or be loosened, unnoticed) | Preview serves the generated headers; tests fail on violations |
| Two inline `style` attributes that the CSP would block | Low | Moved to the stylesheet |
| Keyboard shortcuts marked "global" with keys Chrome only allows for Ctrl+Shift+0-9, so no shortcut was assigned while the dashboard promised them "from any app" | Low (misleading UI) | Chrome-wide shortcuts that Chrome now assigns; the dashboard explains how to make them global |

### Release audit (later on 2026-10-12)

The release audit (docs/INDEPENDENT_RELEASE_AUDIT.md) attacked the website ↔ extension bridge with an attacker
extension and an untrusted origin. It also tested sessions and the anonymous API surface against the real stack, and
checked the camera and microphone lifecycle and the data the pilot sends. It found and fixed the following (details,
reproduction steps and regression tests in the audit):

| Problem | Severity | Fix |
|---|---|---|
| The detector's copy of the camera track was never stopped, so the camera stayed on after "Turn camera off" (onboarding, tune-up, debug page, `/try/`) | High | The vision client owns and stops the track |
| A hidden second camera stream on the dashboard; a stream leaked when the preview closed during start-up | Medium | The preview exists only while open; late streams are released |
| The microphone could record unseen for up to 15 s after leaving the Voice page during start-up | Medium | Cancelled recorders stop a late stream |
| Switching pilot sharing off did not stop rows already queued | Medium | Consent is checked again before every upload |
| The pilot consent notice and privacy policy left out several uploaded fields | Medium | Text corrected; a test ties every uploaded column to the notice |
| A development configuration (localhost bridge or backend) could be packaged for release | Low | `npm run package` refuses it |

No bridge, session, row-level security or API-surface defect was found.

## Remaining risks

These are known and accepted for the pilot stage, with the reason and what would reduce each.

1. **Website session in `localStorage`.** Script running on the site (an XSS) could read the session. Mitigation:
   the strict CSP with no inline or third-party script, React escaping, no HTML injection. Residual risk: low.
   Reduce further by serving the web app from its own subdomain if the site grows.
2. **Sessions on shared computers.** Anyone with access to the same browser profile has the user's session and local
   data, as with any signed-in website. TrichFree offers sign out, "Delete all data on this computer" and account
   deletion. Settings and the privacy policy advise using your own browser profile on a shared computer.
3. **Local backup files are not encrypted.** The exported `.zip` contains voice recordings and history. It is a file
   the user chooses to create and controls; Settings and the privacy policy say what it contains.
4. **Pilot form abuse.** The global cap (60 per 10 minutes) stops floods but can be used up by a spammer, briefly
   blocking genuine sign-ups. If that happens, add a CAPTCHA (for example Cloudflare Turnstile) in front of the
   form.
5. **Pilot telemetry integrity.** Anyone holding a valid code (normally only that participant) can upload data
   under it. Rows record `app_version` and timestamps. Analysis should drop implausible rows, and codes can be
   deactivated (`pilot_codes.active`).
6. **Email delivery and sign-in limits.** Supabase's built-in email sender is for development only and is heavily
   rate-limited, so production needs custom SMTP (a founder action). Code-verification attempts are rate-limited by
   Supabase Auth; keep the hosted defaults. The raised limits in `supabase/config.toml` are for local tests only,
   and that file must not be pushed to production (it says so).
7. **Provider backups after deletion.** Deleting an account removes the data from the live database immediately.
   Copies can remain in the provider's encrypted backups until they expire. The retention period depends on the
   Supabase plan, and the privacy policy must state it once the plan is chosen.
8. **Developer and hosting accounts.** Whoever controls the Chrome Web Store developer account, the Supabase project
   or the hosting account can ship code to users. Use two-factor authentication on all three, limit who has access,
   and never put the service-role key in a client build or a CI variable that client builds can read.
9. **GitHub Actions token.** The workflow does not declare `permissions:`, so it gets the repository's default token
   permissions. Setting `permissions: contents: read` (or making read-only the repository default) is recommended.
   It was not changed here, because the brief asked not to modify workflow permissions.
10. **Not independently tested.** This review was done by the build team, not an independent tester. Get an
    external review before a broad public launch.
11. **Access token after sign-out.** Signing out revokes the refresh token on the server, but the short-lived access
    token stays valid until it expires (up to 1 hour with `jwt_expiry = 3600`). Signing out while offline cannot
    revoke the server session at all. Both need a stolen token to matter. A shorter `jwt_expiry` in production
    reduces the window.
12. **Local backup import** validates settings but imports the other tables as they are. The user must choose the
    file, pilot uploads need current consent, and the server validates pilot rows. Validate every table on import
    if backups are ever shared between people.
13. **Pilot rows the server keeps rejecting** (for example after a code is deactivated) are retried hourly without
    limit. Drop them after a set number of days or attempts if this shows up in the pilot.
