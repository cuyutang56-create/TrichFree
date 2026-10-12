# Deployment

**Status (2026-10-12): nothing is deployed.** No Supabase project, hosting account or Chrome Web Store item was
created or configured: that needs the team's own accounts and credentials. Everything below has been rehearsed
against the local stack:

- the migrations apply cleanly to a fresh database;
- the accounts, sync and website flows pass in CI;
- the extension and website builds are reproducible.

This page is the founders' checklist for going live.

## What gets deployed

| Part | Where | Built with | Configured by |
|---|---|---|---|
| Backend | Supabase project (Postgres and Auth only) | `supabase/migrations/*.sql` | Dashboard settings below, plus `supabase db push` |
| Website (landing, `/privacy/`, `/try/`, `/app/`) | Netlify or Cloudflare Pages (static, HTTPS) | `npm run build:web` → `dist-web/` | `VITE_*` variables in the host's dashboard |
| Extension | Chrome Web Store (and/or a zip for "Load unpacked" pilot installs) | `npm run package` → `release/*.zip` | `VITE_*` variables at build time |

## Environments

Keep three, and never share a database between them.

| | Local / CI | Staging | Production |
|---|---|---|---|
| Supabase | Docker: `npm run db:start` (`supabase/config.toml`) | Its own project, for example `trichfree-staging` | Its own project, `trichfree` |
| Website | `npm run dev:web` (127.0.0.1:5174) | Host's branch or preview deploys | The public domain |
| Extension | `npm run build` / `node scripts/build-e2e.mjs` | `npx vite build --mode staging` (reads `.env.staging`), Load unpacked | `npm run package` (reads `.env.production` / `.env`), Web Store |
| Users | Test addresses only (`@example.test`, caught by the local mail catcher) | The team | Real users |

Build variables are listed and explained in `.env.example`. They are all public: the Supabase URL and
publishable/anon key are designed to ship to browsers, and access is enforced by row-level security. **Never** put
these in any `VITE_*` variable, `.env` file, repository, CI variable used by a client build, or chat message:

- the `service_role` / secret key;
- the database password;
- SMTP credentials.

## 1. Supabase (do staging first, then repeat for production)

1. **Create the project** at supabase.com, with two-factor authentication on the account.
   - Region: Southeast Asia (Singapore), close to users.
   - Save the database password in the team's password manager.
2. **Apply the schema** from this repository:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>   # asks for the database password
   npx supabase db push --dry-run                  # shows which migrations will run
   npx supabase db push
   npx supabase migration list                     # local and remote should match
   ```
   Use `db push` only. **Do not** run `supabase config push`: `supabase/config.toml` holds local test values
   (a localhost site URL, raised rate limits).
3. **Authentication.** The dashboard names below are as of 2026 and occasionally move.
   - *Sign In / Providers → Email:* enabled, with "Confirm email" on.
     - Email OTP length **6**, expiry **600** seconds.
     - Turn off phone and anonymous sign-ins.
     - Leave "Allow new users to sign up" **on**: the first sign-in creates the account.
   - *Emails → Templates:* paste `supabase/templates/otp.html` into **both** "Magic Link" and "Confirm signup",
     with the subject "Your TrichFree sign-in code". The template must show `{{ .Token }}`. The apps ask for the
     6-digit code and never use links.
   - *Emails → SMTP Settings:* **set up custom SMTP before inviting anyone.** The built-in sender is for testing
     only: it is heavily rate-limited and may only deliver to your own team.
     - Use any transactional provider (for example Resend, Postmark, Brevo or Amazon SES).
     - Send from a domain you control, with SPF and DKIM.
     - Sender name "TrichFree".
   - *Rate Limits:* keep Supabase's defaults (they limit code guessing). With custom SMTP, raise "emails per hour"
     only as far as real use needs. Keep at least 60 s between emails to one address.
   - *URL Configuration:* Site URL = the website for that environment (https). Add the same origin under Redirect
     URLs.
4. **API exposure.** In *Project Settings → Data API*, the exposed schemas must be **`public` only** (the default).
   The `private` schema holds security-definer helpers and must never be exposed.
5. **Keys.** In *Project Settings → API Keys*, copy the project URL and the **publishable** key (`sb_publishable_…`;
   the legacy anon key also works) into the website and extension build variables. Do not copy the secret or
   service-role key anywhere.
6. **Check it worked** (SQL editor):
   ```sql
   -- every table has row-level security on (expect no rows)
   select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
   -- the functions the apps call exist
   select proname from pg_proc where proname in ('export_my_data', 'delete_my_account', 'submit_pilot_interest');
   ```
7. **Backups.** Open *Database → Backups* and note what the chosen plan includes. Free projects have limited
   backups; daily backups and point-in-time recovery are paid features. Then:
   - Write the real retention period into the privacy policy (`web/privacy/index.html`, "Deletion"), which now says
     "typically within days".
   - Before every production migration, also take your own dump, stored encrypted and **outside** the repository:
     ```bash
     npx supabase db dump --linked -f ~/trichfree-backups/schema-$(date +%F).sql
     npx supabase db dump --linked --data-only -f ~/trichfree-backups/data-$(date +%F).sql
     ```

## 2. Website

**Netlify** (`netlify.toml` is included) or **Cloudflare Pages** (build command `npm run build:web`, output
`dist-web`, Node 22). Both apply the generated `dist-web/_headers`: CSP, HSTS, frame and permissions policies.
GitHub Pages and plain object storage cannot send these headers, so do not use them.

1. Connect the repository. Production branch: `main`. Preview or branch deploys go to **staging**.
2. Set the build variables per environment:
   - production on production deploys, staging on previews;
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL` (the final https URL, no trailing slash),
     `VITE_CONTACT_EMAIL`;
   - later, `VITE_EXTENSION_IDS` and `VITE_EXTENSION_STORE_URL` (section 4).
3. Add the custom domain. HTTPS is automatic.
4. Verify the live site, not just the build:
   ```bash
   curl -sI https://<domain>/ | grep -i -E "content-security-policy|strict-transport|x-frame-options|permissions-policy"
   curl -s https://<domain>/robots.txt; curl -sI https://<domain>/og-image.png | head -1
   ```
5. Smoke test:
   - open `/try/`, allow the camera and check the reminder;
   - sign in at `/app/` with a real address and change a setting;
   - export, then delete that test account;
   - submit the pilot form, then check the `pilot_interest` table in the dashboard.

## 3. Extension

1. Set the build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`. Use `.env.production`
   or the real environment; both work, and a regression test keeps the manifest in step with the app. Then:
   ```bash
   npm ci && npm run fetch-models     # models are pinned and checksum-verified
   npm run package                    # typecheck + build + checks → release/trichfree-desk-v<version>.zip
   ```
   The version comes from `package.json` and must go up for every store upload.
2. **Chrome Web Store** (Developer Dashboard; one-time US$5 registration):
   - Turn on two-factor authentication on the developer account.
   - Upload the zip. Fill the listing from `store/listing.md` and the privacy tab from `store/permissions.md`.
   - Privacy policy URL: `https://<domain>/privacy/`.
   - Start with **Unlisted** for the pilot.
   - Review can take several days, and longer for extensions that use the camera, so submit early.
   - Do not set `EXTENSION_PUBLIC_KEY` for store builds.
3. **Pilot builds without the store** (Load unpacked) need a stable ID so the website can talk to them. Generate a
   key pair once and keep it in the password manager. Only the public key goes into the build:
   ```bash
   openssl genrsa -out trichfree-pilot.pem 2048
   openssl rsa -in trichfree-pilot.pem -pubout -outform DER | base64 -w0              # → EXTENSION_PUBLIC_KEY
   openssl rsa -in trichfree-pilot.pem -pubout -outform DER | sha256sum | head -c32 | tr 0-9a-f a-p; echo   # → its extension ID
   ```
   The key in `e2e/fixtures/` is for automated tests only.
4. Microsoft Edge Add-ons can take the same zip. It is optional; Edge users can also install from the Chrome Web
   Store.

## 4. Connect the website and the extension

The extension needs the website's URL at build time, and the website needs the extension's ID:

1. Decide the domain → build the extension with `VITE_SITE_URL`.
2. Upload a draft to the Chrome Web Store → the dashboard shows the item ID.
3. Set `VITE_EXTENSION_IDS` (store ID, plus the pilot build ID if you use one) and `VITE_EXTENSION_STORE_URL`
   (`https://chromewebstore.google.com/detail/<id>`) on the website → redeploy.
4. Check: with the extension installed, `/app/` shows the extension's status, and "Sync now" from the site updates it.

## 5. Research pilot (optional)

1. Generate participant codes and the SQL that registers them:
   ```bash
   node scripts/make-pilot-codes.mjs 30
   ```
   Run the printed `insert` in the SQL editor. Keep the code-to-person list **offline**, never in the repository,
   the database or a shared drive.
2. Set `VITE_EXIT_SURVEY_URL` (shown after day 14) and `VITE_TEAM_EMAIL` (shown for deletion requests), then
   rebuild the extension.
3. A participant enters their code in Settings → Research pilot and agrees to the pilot notice:
   - days 1–3 are a silent baseline;
   - days 4–14 randomise chime and own-voice.
4. Read the data in the dashboard (`episodes`, `sessions`, `events`, `calibrations`), or with SQL, for example:
   ```sql
   select arm, count(*) filter (where outcome = 'interrupted') * 1.0 / count(*) as interrupted_rate, count(*)
   from episodes where alert_at is not null and outcome <> 'false_alarm' and pilot_day between 4 and 14 group by arm;
   ```
5. Deletion request: delete that `participant_code`'s rows from the four tables, then set the code inactive:
   `update pilot_codes set active = false where code = '…'`. The privacy policy also promises to delete pilot
   interest entries within 12 months. Put a recurring reminder in the team calendar to run
   `delete from pilot_interest where created_at < now() - interval '12 months';` (or delete sooner on request).
6. Before analysis, drop implausible rows. Anyone holding a code can upload under it (SECURITY.md).
7. Ethics: running a study with people may need approval and a consent process from your institution. Check before
   recruiting.

## Release checklist (every release)

- [ ] CI is green on the commit (unit, typecheck, builds, extension E2E, full-stack job).
- [ ] New migrations applied to **staging** first. Smoke test there: two browsers, change a setting on each,
      export, delete.
- [ ] Production backup dump taken (section 1.7), then `npx supabase db push` to production.
- [ ] Website deployed and the live headers and pages checked (section 2.4–2.5).
- [ ] `package.json` version bumped; `npm run package`; the zip tested with Load unpacked in a fresh browser
      profile; uploaded.
- [ ] Manual checklist in TESTING.md done on one Mac and one Windows laptop for detection changes.

## Rollback

- **Website:** both hosts keep every deploy. Re-publish the previous one: Netlify "Publish deploy", or Cloudflare
  Pages "Rollback to this deployment". This takes seconds.
- **Extension:** the store has no instant rollback. Rebuild the previous release's code with a **higher** version
  number and upload it; review applies again. Keep every `release/*.zip` and tag releases in git (`v0.2.0`, …). For
  unpacked pilot installs, send participants the previous zip.
- **Database:** migrations only move forward. To undo one, write a new migration that reverses it, apply it to
  staging, then production. Restore from a backup only to recover lost or damaged data: it rewinds everyone's data
  to that moment.
- **Compatibility rule:** the extension in users' hands may be weeks old. Database changes must keep older app
  versions working: add columns with defaults, and never rename or drop a column the current store version uses.
  Clients send only the fields they change, so new fields are not reset by older versions.

## Monitoring

TrichFree has no third-party analytics by design. Use:

- Supabase *Logs* (Auth, API, Postgres errors);
- *Reports* (usage);
- the hosting dashboard (deploys, bandwidth).

For simple health checks, point a free uptime monitor at the website (`https://<domain>/`) and at Supabase Auth's
health endpoint (`https://<project-ref>.supabase.co/auth/v1/health`, sent with the publishable key as the `apikey`
header). These checks touch no user data. Avoid error-tracking tools that capture page content or user input: TrichFree's
screens can reveal a health condition.

Sync problems show to users as a notice and stay on the device. Ask users to report them, using the contact
address.
