# ClassLoop

ClassLoop is an AI-assisted classroom follow-up platform prototype. It turns class transcripts, pasted notes, roster details, and resource links into a teacher review workflow plus student-facing follow-up dashboards.

The product goal is simple: connect what happened in class, what each student needs to do next, and whether they actually followed through.

## Run

ClassLoop runs as a desktop application. The hosted Vercel version also works as a mobile web app that can be added to a phone home screen.

```bash
./run.sh
```

The launcher installs or repairs missing dependencies with `npm ci` when `package-lock.json` is present, then opens ClassLoop in a native Electron window.

For a browser-based dev server instead of Electron:

```bash
./run.sh --dev
```

Useful launcher environment variables:

```bash
HOST=127.0.0.1 FRONTEND_PORT=5177 OPEN_BROWSER=0 ./run.sh --dev
```

Other launcher modes:

```bash
./run.sh --check-env
./run.sh --packaged
./run.sh --package-mac
./run.sh --help
```

`./run.sh --check-env` validates launcher env loading without opening Electron. `./run.sh --packaged` opens the current platform's packaged build when one exists. On macOS, ClassLoop now expects the Apple silicon build at `release/mac-arm64/ClassLoop.app`; Intel Mac release builds are intentionally not part of the public/package path. `./run.sh --package-mac` wraps the Apple silicon-only macOS package command. The launcher reads `.env.local` as plain `KEY=VALUE` entries instead of sourcing it as shell code, runs the dependency bootstrap path when runtime packages are missing, and then opens ClassLoop in the requested desktop/dev mode.

You can also install dependencies directly:

```bash
npm run bootstrap
npm install
```

`npm run bootstrap` tries the locked install path, repairs the cached Electron runtime when possible, and continues with the existing dependency tree when a network-restricted sandbox blocks `npm ci` but the local packages are already usable. `npm install` also downloads the Playwright Chromium browser through the project `postinstall` script.

## Tech Stack

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![CSS](https://img.shields.io/badge/CSS-1572B6?style=for-the-badge&logo=css3&logoColor=white)

| Layer | Technology |
|---|---|
| **Framework** | React 18 |
| **Language** | TypeScript 5 |
| **Desktop Shell** | Electron 41 |
| **Build Tool** | Vite 6 |
| **Icons** | Lucide React |
| **Styling** | CSS |
| **Package Manager** | npm |

## Current Main Experience

- Original classroom visual style: clean white surfaces with green education-focused accents.
- Desktop app shell powered by Electron.
- Teacher and student sign-in screens.
- Teacher-side session dashboard, import flow, AI review draft, session report, and analytics.
- Student-side dashboard and session detail views.
- Student and teacher appearance customization, saved only to the signed-in account.
- Transcript paste/upload, transcript-ready Zoom cloud import scaffolding, plus best-effort in-person microphone capture and browser online-meeting capture when available.
- Manual roster entry or Google Classroom course import scaffolding for one selected course, including roster, course metadata, and teacher-confirmed recent assignments/resources.
- Teacher-assisted speaker matching for live capture: ClassLoop creates unknown voice segments for review instead of using biometric voiceprints.
- Publish preview with editable class-wide Google Classroom post copy, recap email recipient toggles, and one-click recap email delivery through a ClassLoop-owned Gmail/SMTP sender when configured.
- Per-student preview differences that explain why each student receives different follow-ups.
- Saved roster manager with CSV import/export and alias cleanup.
- Class/course manager that stores reusable class rosters, default session templates, and linked session history.
- Publish audit showing what will be shared with the class and why each student receives different follow-ups.
- Student dashboard prioritizing tasks due soon, with completion flow from to do to submitted to teacher reviewed plus optional student note/file link.
- Print, JSON, and CSV-friendly session reports for sharing or local recordkeeping.
- Privacy controls for retention settings, workspace export/delete, and audit history.
- Explicit sample accounts and sample session data for demonstrations.
- Checked-in app build under `dist/`, wrapped by the desktop launcher.

## Free-First External Services

ClassLoop should work without paid services. Transcript paste/upload, local accounts, review, publishing, student preview, analytics, and roster management are local-first.

External service support is intentionally narrow:

- Google Sign-In and Supabase/Auth email are the planned hosted account path. Student magic links/email codes should use hosted auth email when configured, not a made-up sender.
- Google Classroom: launch surfaces should let a teacher pick one course, import roster/course metadata/recent assignments/resources, edit a class-wide post, and only then post through a real OAuth-backed Classroom API connection. Until OAuth is configured, the app must say the post is ready but not connected.
- Zoom: launch surfaces should show transcript-ready cloud meetings, allow date/title search, and let the teacher choose a transcript file. Raw Zoom transcript text should be removed after recap generation; structured recap, tasks, resources, participation, and follow-ups remain.
- Email: recap emails use a ClassLoop-owned Gmail/SMTP sender when configured, such as `classloop.noreply@gmail.com`. ClassLoop cannot generate Gmail accounts or send from unauthenticated domains.
- Audio notes: use browser live speech recognition when available, with transcript paste/upload as the reliable fallback.

Removed/deferred because they require paid API keys, school platform credentials, or external integration setup:

- OpenAI/custom transcription.
- Canvas/LMS posting.
- Live Zoom bot attendance/call capture. ClassLoop uses free browser capture/speech APIs where available and still treats platform transcript paste/upload or Zoom cloud transcripts as the reliable path.

## Hosted Backend And Freemium MVP

The local desktop app still works without paid services or cloud credentials. For a public browser version and multi-device access, ClassLoop now includes a Supabase + Stripe backend scaffold:

- Supabase Auth for hosted teacher/student accounts.
- Supabase workspace state sync for browser/desktop continuity.
- Row Level Security SQL in `supabase/schema.sql` so each account can only read and write its own ClassLoop state.
- Stripe Checkout for Pro subscriptions.
- Stripe webhook endpoint for server-owned subscription status updates.
- Pilot feedback endpoint for collecting early user feedback.
- A Vercel landing page at `/` with routed Home, Features, Screenshots, Docs, Privacy, Terms, EULA, Support, Donate, and Download pages instead of a single scroll-through site.
- A PWA/mobile shell with `manifest.webmanifest`, a service worker, mobile meta tags, and an "Add to phone" landing action.

Hosted route behavior:

- `https://your-domain.com/` shows the public ClassLoop landing page.
- `https://your-domain.com/#/features`, `#/screenshots`, `#/docs`, `#/privacy`, `#/terms`, `#/eula`, `#/support`, `#/donate`, and `#/download` open separate public landing pages.
- `https://your-domain.com/#/dashboard` opens the safe web demo sign-in flow.
- The hosted web demo uses sample teacher/student accounts only. Account creation and durable personal workspaces belong in the downloaded desktop app.
- Sample account changes are ephemeral and should not be treated as saved data.
- `https://your-domain.com/api/config` returns safe booleans that confirm whether server-only Supabase and Stripe env vars were picked up by Vercel.
- Set desktop installer URLs in `public/classloop-downloads.json` when release assets are ready. Use GitHub Releases, Cloudflare R2, S3, or another large-file download host for these binaries; do not use Vercel Blob for installer artifacts because it quickly fills the Vercel storage quota. Until external installer URLs are ready, the landing page clearly says installers are still being packaged and directs visitors to the web demo.
- Set `VITE_CLASSLOOP_DONATE_URL` to a public donation page when donations are ready. Until then, the Donate page explains that the donation link has not been connected.
- Student follow-up usefulness ratings and installer issue reports are product feedback for the ClassLoop creator. Hosted builds post the rating/report, optional note, app context, and relevant transcript or installer metadata to `/api/feedback`; set `CLASSLOOP_FEEDBACK_NOTIFY_EMAIL` plus SMTP/Gmail env vars for creator notifications. Desktop builds can set `VITE_CLASSLOOP_PRODUCT_FEEDBACK_URL` to the hosted feedback endpoint.
- Phone and tablet access runs through the hosted web app. Visitors can open the Vercel URL in Safari/Chrome and use Add to Home Screen or Install app for app-like access.

Suggested pricing:

- Free: `$0`, 1 generated session per day, transcript import, Google/Zoom workflow scaffolding, student accounts, recap email delivery, CSV roster tools, and local desktop storage.
- Pro: `$3.99/month`, unlimited generated sessions plus private analytics and JSON/CSV/print report exports.

Configure hosted mode from `.env.example`. Public Vite variables are safe for the browser build; `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` must only live in Vercel/server environment variables.

### Hosted API Security Baseline

- Public serverless endpoints use centralized JSON security headers, `Cache-Control: no-store`, safe error messages, and graceful `429` responses with `Retry-After` plus `RateLimit-*` headers.
- `/api/config`, `/api/feedback`, `/api/profile`, `/api/cloud-state`, `/api/billing/checkout`, `/api/billing/portal`, and `/api/billing/webhook` all have IP-based rate limits. Authenticated hosted endpoints also apply Supabase user-id rate limits after token validation.
- JSON write endpoints require `application/json`, enforce request-size caps, validate against strict schemas, type-check fields, cap string/array/object sizes, sanitize control characters, and reject unexpected fields instead of silently storing them.
- Server-only keys must stay in Vercel/server env vars. `VITE_*` values are intentionally public browser configuration only; do not put service-role keys, Stripe secret keys, webhook secrets, Gmail app passwords, SMTP passwords, or private tokens in `VITE_*`.
- Rotate any key that may have been pasted into chat, committed, exposed in a public deployment log, or used on the wrong environment. After rotating, redeploy and rerun `npm run test:security`.

### Mobile Web App

ClassLoop includes a lightweight PWA layer for phones and tablets:

- `public/manifest.webmanifest` defines the installable app name, standalone display mode, theme color, SVG/PNG app icons, and shortcuts.
- `public/sw.js` caches the browser shell and static assets but skips `/api/*` so cloud sync and billing stay network-backed.
- `index.html` includes mobile web app and theme metadata.
- The landing page has an "Add to phone" action plus short setup steps for iPhone and Android users.

The mobile version is best for checking dashboards, student follow-ups, and quick reviews. Heavy transcript editing and large roster cleanup are still more comfortable on desktop or tablet.

### Stripe Setup

ClassLoop creates Stripe Checkout sessions on the server. Plan options link to a hidden `#/checkout` page that mounts Stripe Embedded Checkout inside ClassLoop when `VITE_STRIPE_PUBLISHABLE_KEY` is configured, and keeps a hosted Checkout fallback if Stripe.js cannot load or the publishable key is missing.

1. In Stripe, stay in **Test mode** while setting this up.
2. Go to **Product catalog** and create `ClassLoop Pro`.
3. Add a recurring monthly price, recommended `$3.99/month`.
4. Copy the recurring price ID that starts with `price_`.
5. Put that same price ID in both `VITE_STRIPE_PRO_PRICE_ID` and `STRIPE_PRO_PRICE_ID`.
6. Copy your Stripe publishable key into `VITE_STRIPE_PUBLISHABLE_KEY`; it starts with `pk_` and is safe for browser code.
7. Copy your Stripe secret key into `STRIPE_SECRET_KEY`. Never commit it.
8. Add a webhook endpoint for `https://your-domain.com/api/billing/webhook`.
9. Subscribe the webhook to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
10. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
11. Set `CLASSLOOP_PUBLIC_URL` to your deployed app URL, such as `https://classloop-followup.vercel.app`.

Use Stripe live mode only when you are ready to accept real payments from real teachers. Live mode requires a separate live product/price, live secret key, live webhook endpoint/signing secret, and an activated Stripe account. Do not reuse sandbox/test keys in production Vercel variables. A good rollout is:

1. Finish end-to-end sandbox checkout and webhook testing.
2. Activate the Stripe account and complete business/banking/tax details.
3. Toggle Stripe to live mode.
4. Recreate or copy the `ClassLoop Pro` product and `$3.99/month` recurring price in live mode.
5. Replace Vercel production env vars with live `STRIPE_SECRET_KEY`, live `STRIPE_PRO_PRICE_ID`, live `VITE_STRIPE_PRO_PRICE_ID`, live `VITE_STRIPE_PUBLISHABLE_KEY`, and live `STRIPE_WEBHOOK_SECRET`.
6. Add a live webhook endpoint at `https://your-domain.com/api/billing/webhook` with `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
7. Redeploy and run one low-risk live checkout with your own account, then cancel/refund it from Stripe if needed.

After editing Vercel environment variables, redeploy the latest `main` branch. If `/api/config` still includes old fields such as `stripeSchoolConfigured`, Vercel is serving an older deployment.

Your Stripe publishable key starts with `pk_`. It is safe for browser code and is required for the embedded checkout page. Keep `STRIPE_SECRET_KEY` server-only.

For secure production billing, Stripe Pro access should be tied to a hosted Supabase account. The full cloud sync login panel is shown only after Pro is active, but the deployed checkout flow still needs backend auth available so the webhook can attach the subscription to the right account.

### Desktop Packaging And Downloads

ClassLoop can package desktop installers with Electron Builder:

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

These scripts build desktop artifacts with Electron Builder. macOS is Apple silicon arm64 only; do not publish Intel Mac builds. Windows and Linux may keep x64 and arm64 artifacts where Electron Builder supports them. The default Linux package is AppImage because macOS cross-built `.deb` output is not trustworthy enough to publish; build Debian packages separately on a Linux host with `npm run package:linux:deb` before offering `.deb` downloads. Generated installers are written to `release/` and are not committed. After packaging on a clean machine, run the first-run smoke for that host OS:

```bash
npm run test:desktop:first-run
```

The smoke test launches the packaged app with a temporary clean desktop data directory, creates a teacher account, verifies the desktop state file is written outside the app bundle, relaunches, and signs back in. ClassLoop does not ship an automatic desktop updater yet; current update behavior is manual install-over-replace, with user data stored in Electron's per-user app data directory so it survives app replacement. Electron Builder may generate `latest*.yml` release metadata, but the app does not auto-download updates until an updater is intentionally added.

Free distribution is the default ClassLoop path. It costs $0 and uses Electron Builder's unsigned/ad-hoc macOS output, plus checksums and honest install copy. macOS users may see a Gatekeeper warning and may need to use right-click -> Open or System Settings -> Privacy & Security -> Open Anyway. Do not describe this build as Developer ID signed, notarized, or stapled.

```bash
npm run package:mac
npm run release:checksums
npm run test:release:distribution
```

Paid Developer ID distribution is optional later. If you decide to pay for the Apple Developer Program, build with a Developer ID Application certificate and notarization credentials in the environment:

```bash
CLASSLOOP_DISTRIBUTION_MODE=developer-id \
CLASSLOOP_REQUIRE_MAC_RELEASE_SIGNING=true \
APPLE_ID=you@example.com \
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx \
APPLE_TEAM_ID=TEAMID1234 \
npm run package:mac
```

ClassLoop's macOS build config enables hardened runtime entitlements and runs the notarization hook after signing. In free mode, missing Apple credentials are allowed. In Developer ID mode, missing credentials fail packaging instead of silently producing an ad-hoc app.

For public distribution, upload signed/notarized release files to GitHub Releases, Cloudflare R2, S3, or another trusted large-file download host, then set `public/classloop-downloads.json`. For macOS, set only the Apple silicon DMG/ZIP fields; leave Intel Mac fields absent so the public site does not advertise unsupported Mac installers.

```json
{
  "checksumsUrl": "https://example.com/SHA256SUMS.txt",
  "macos": {
    "url": "https://example.com/ClassLoop-0.1.0-arm64.dmg",
    "arm64Url": "https://example.com/ClassLoop-0.1.0-arm64.dmg",
    "arm64ZipUrl": "https://example.com/ClassLoop-0.1.0-arm64-mac.zip"
  },
  "windows": {
    "x64Url": "https://example.com/ClassLoop-Setup-0.1.0.exe",
    "x64ZipUrl": "https://example.com/ClassLoop-0.1.0-win.zip",
    "arm64ZipUrl": "https://example.com/ClassLoop-0.1.0-arm64-win.zip"
  },
  "linux": {
    "x64Url": "https://example.com/ClassLoop-0.1.0.AppImage",
    "arm64Url": "https://example.com/ClassLoop-0.1.0-arm64.AppImage"
  }
}
```

Keep these Vercel/server variables separate:

```bash
VITE_CLASSLOOP_DONATE_URL=
VITE_CLASSLOOP_PRODUCT_FEEDBACK_URL=
VITE_CLASSLOOP_SUPPORT_EMAIL=
CLASSLOOP_FEEDBACK_NOTIFY_EMAIL=
```

Free macOS builds are allowed, but they must be labeled as unsigned/ad-hoc and include the checksum file. Developer ID signing/notarization is a paid optional upgrade to reduce Gatekeeper friction. Windows builds can remain unsigned for the free path, but may show SmartScreen friction until a paid code-signing certificate is used. If one of the installer URLs is missing, the landing page must visibly show "Packaging pending" for that platform and route visitors to the hosted demo instead of implying a download succeeded. If the donation URL is missing, the donation path must be visible but clearly marked as not connected.

Keep Vercel storage light: Vercel should serve the web/PWA shell and API routes, not the desktop installer binaries. The landing page reads a tiny `public/classloop-downloads.json` manifest and intentionally ignores `*.blob.vercel-storage.com` installer/checksum URLs, so stale Vercel Blob links fall back to `Packaging pending`. If you previously uploaded release files to Vercel Blob, remove them with `vercel blob del <pathname>` or `vercel blob empty-store` before uploading replacement installers to the external download host.

Before publishing installers, run the distribution verifier:

```bash
npm run test:release:distribution
```

The verifier defaults to free mode, accepts unsigned/ad-hoc macOS artifacts with explicit warnings, and treats clean-host evidence as optional unless `CLASSLOOP_REQUIRE_CLEAN_HOST_EVIDENCE=true` is set. Set `CLASSLOOP_DISTRIBUTION_MODE=developer-id` to require Developer ID signing, Gatekeeper assessment, stapled DMG notarization tickets, and clean-host evidence. Store real per-target evidence in ignored `test-results/clean-host-verification.json` using [ops/clean-host-verification.example.json](ops/clean-host-verification.example.json) as the template.

Before opening public downloads, rehearse rollback:

```bash
npm run drill:rollback
```

The rollback drill validates the packaged artifacts and writes a non-destructive bad-release quarantine simulation. Use [ops/rollback-drill.md](ops/rollback-drill.md) for the real rollback checklist.

## Privacy And School Readiness

- Retention settings, export/delete workspace data, and audit logs live in the teacher-only privacy area.
- Public Terms, Privacy, EULA, and Support pages are available from `#/terms`, `#/privacy`, `#/eula`, and `#/support`; treat them as the launch baseline until legal counsel reviews final production language.
- Student usefulness ratings are product feedback for the ClassLoop creator, not the teacher. They include the related transcript context for product debugging, but should not add separate roster exports, student emails, teacher emails, grades, or non-transcript class artifacts unless an explicit support/export flow asks for them.
- Recording or live capture should require clear consent before use.
- Student data is marked as “no training” by default unless a school or teacher explicitly allows otherwise.
- Analytics stay teacher-only and should be framed as private support signals, not public rankings.
- Local desktop data files such as `.classloop-data.json` and `.classloop-storage-key` are ignored by git and should never be committed.
- Desktop state is encrypted with ClassLoop's local AES-GCM storage key file instead of Electron `safeStorage`, so ClassLoop should not trigger macOS Keychain or OS password prompts while saving.
- See [LEGAL.md](LEGAL.md) for the pre-launch Terms, Privacy, EULA, support, retention, and child-safety baseline. The public pages exist now; get final legal review before enabling durable hosted public signups.

## Sample Accounts

Teacher:

```text
teacher@classloop.demo
classloop-teacher
```

Student:

```text
maya@classloop.demo
classloop-student
```

## Demo Path

1. Run `./run.sh`.
2. Sign in with the sample teacher account.
3. Review the teacher dashboard and session follow-up flow.
4. Open the student view to show personalized recaps, tasks, resources, and completion check-ins.
5. Use analytics to explain how ClassLoop tracks participation and follow-through.

## Alpha Usage

Use [ALPHA.md](ALPHA.md) for the 1-2 day teacher alpha. The alpha focuses on:

- teacher usability from first run to publish preview
- interpretation quality for recaps, tasks, resources, and student follow-ups
- false positives in roster matching and participation detection
- support burden signals such as install, import, review, publish, and student-access confusion

The alpha kit includes a teacher script, day-end synthesis template, support triage rubric, and CSV tracker under [alpha/](alpha/). Keep student data redacted in the tracker; record counts and anonymized examples instead of raw transcripts.

## Testing

```bash
npm install
npm run build
npm run test:security
npm run test:import
npm run test:cloud
npm run test:entitlements
npm run test:browser
npm run test:web
npm run drill:incidents
```

`npm run test:security` checks that local data and `.env.local` are not tracked, high-confidence secret patterns are absent from tracked files, local storage uses the secure ClassLoop key namespace, desktop state uses encryption and trusted-origin local APIs, runtime debug logs are not present, and the legal baseline exists. `npm run test:cloud` covers Supabase auth/sync state handling without requiring live credentials. `npm run test:entitlements` covers Free/Pro boundaries and webhook-driven entitlement mapping without requiring live Stripe credentials. `npm run test:browser` covers the local Vite app. `npm run test:web` checks the deployed hosted web demo. Override the target with `CLASSLOOP_WEB_TEST_URL=https://your-domain.com npm run test:web`.

`npm run drill:incidents` rehearses billing, auth, sync, and parser-regression incident response by checking hosted API fail-closed behavior, Supabase schema guards, cloud sync tests, entitlement tests, and parser import tests. Use [ops/incident-response.md](ops/incident-response.md) for response steps and [ops/drill-log-template.md](ops/drill-log-template.md) to record drill results.

Hosted web tests now run both desktop and Pixel-sized projects and verify the PWA manifest/service worker, mobile install CTA, sample-only demo, and guided walkthrough entry.

## PRD Alignment

ClassLoop is designed for teachers, tutors, instructors, club leaders, and students who need clean follow-up after a class or learning session.

Core MVP promise:

- Import or paste messy class records.
- Generate a structured teacher-editable review.
- Publish approved student-specific follow-ups.
- Show students their recap, tasks, resources, due dates, and check-ins.
- Give teachers private insight into attendance, participation, quiet students, missed sessions, overdue work, and completion.

## High-Value Next Changes

1. Add teacher notes templates for recurring lesson styles, such as exit tickets, lab workshops, club meetings, and tutoring sessions.
2. Add local version history for publish changes so teachers can compare what changed between draft, published, and revised follow-ups.
3. Add a lightweight student inbox showing unread class updates and teacher-reviewed submissions.
4. Add explicit font-size and reduced-motion controls; high contrast should continue to follow device/browser settings.
5. Add a local backup/restore workflow for moving ClassLoop data between devices without a hosted backend.
6. Configure and verify live Supabase, Stripe, and Vercel credentials when the hosted version is ready for a pilot.
7. Run a real teacher/student pilot and use the feedback endpoint to prioritize the next polish pass.

## Monetization Direction

- Free: 1 generated session per day, transcript import, Google/Zoom workflow scaffolding, student accounts, recap email delivery, CSV roster tools, and local desktop storage.
- Pro: `$3.99/month` for unlimited generated sessions plus private analytics and JSON/CSV/print report exports.
- School/team features stay future-only until the product has real pilot demand and a privacy/legal review path.
