# Testing Strategy

## Test Structure

**File**: `tests/import-flow.test.ts`
**Frameworks**: TypeScript import regression runner + Playwright browser tests
**Run Commands**:
- `npm run test:import`
- `npm run test:cloud`
- `npm run test:entitlements`
- `npm run test:stripe`
- `npm run test:security`
- `npm run test:package:init`
- `npm run test:browser`
- `npm run test:web`
- `npm run test:web:local`
- `npm run test:desktop:state`
- `npm run test:manual`
- `npm run test:manual:write`
- `npm run drill:rollback`
- `npm run drill:incidents`

## Test Categories

### End-to-End Parsing Tests
- **Compressed Roster**: 18 students glued format (`1Aaliyah Carteracarter@cs4all.nyc...`)
- **Speaker Matching**: `Student (Jalen Thompson)` → roster match
- **Participation Extraction**: Questions, answers, chat messages
- **Resource Detection**: YouTube URLs in chat
- **Metadata Filtering**: Skip teacher names, headers

### Regression Tests
- **Format Variations**: Comma-sep, pipe-sep, semicolon-sep, tabular, numbered angle-bracket, compressed glued, headerless CSV, and alias-column rosters.
- **Google Classroom CSV**: First name, last name, email exports.
- **Noisy Zoom/Transcript Variations**: Bracketed timestamps, plain timestamps, Zoom chat lines, Zoom VTT voice tags, dotted VTT voice tags, generic participant labels, Microsoft Teams transcript blocks, and Google Meet captions.
- **Naming Inconsistencies**: Aliases, case variations, first-name, first-name/last-initial, first-initial/last-name, and saved roster display names.
- **Malformed Inputs**: Duplicate emails, duplicate names with different emails, empty rows, rows without deliverable emails, teacher/metadata rows, missing roster, and transcript-only roster estimation for teacher confirmation.
- **Compliance Label Noise**: Legal, privacy, support, retention, EULA, and child-safety note labels are treated as metadata instead of false speakers.
- **CS4ALL/Scratch Stress-Test Chaos**: Reconstructed Scratch Club artifacts combine aliases, duplicate roster rows, metadata labels, unknown observers, late/quiet/absent signals, homework mentions, and punctuated resource URLs.
- **Realistic Scale**: Large transcript with 128 valid rostered students, noisy roster rows, dropped caption warnings, unknown observers, and multiple resources still produces complete students, follow-ups, participation signals, and unmatched review warnings.
- **Repeated Imports**: Multiple back-to-back large imports produce unique session ids and preserve full roster/follow-up/signal counts without sharing parser state.

### Desktop State Reliability Tests
- **Encrypted Local State**: `npm run test:desktop:state` launches the Electron app with a temporary `CLASSLOOP_USER_DATA_DIR`, writes state through `/api/state`, verifies the desktop data file is encrypted, and reads it back through the app.
- **Crash Recovery / Partial Failure**: The desktop state smoke corrupts the encrypted data file, verifies `/api/state` returns a read-only `423` instead of silently resetting, verifies writes are blocked while the file is unreadable, and checks recovery errors are actionable without exposing account/transcript payloads.
- **Backup / Restore**: The same smoke backs up the encrypted data file, restores it after corruption, relaunches ClassLoop, and verifies the restored session is readable.

### Hosted Auth / Cloud Sync Tests
- **Supabase Auth State**: `npm run test:cloud` covers signed-out, signed-in, logout, token-expired, and credential-absent states without requiring live Supabase credentials.
- **Credential-Absent Desktop Mode**: The cloud test verifies missing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` produces graceful hosted-sync messages while local/desktop state remains usable.
- **Conflict Resolution**: The cloud test verifies newer remote snapshots win, newer local snapshots win, and same/missing timestamps preserve local edits instead of silently overwriting.
- **Network Loss / Offline Queue**: The cloud test verifies mutating cloud sync requests are queueable, duplicate queued writes are deduped, successful queue flushes are removed, and failed flushes remain queued with incremented attempts.

### Entitlement Gate Tests
- **Free / Paid Boundaries**: `npm run test:entitlements` verifies Free, paid active Pro, trialing, past-due, canceled, unpaid, paused, and incomplete subscription states map to the right feature access. Trialing/no-payment states stay locked until Stripe reports an accepted payment.
- **Stripe Embedded Checkout Smoke**: `npm run test:stripe` clicks the real Pro upgrade button with mocked cloud auth and checkout APIs, verifies ClassLoop routes to the hidden `#/checkout` page instead of the left nav, verifies `/api/billing/checkout` requests embedded mode and mounts the Stripe embedded frame, verifies the hosted Checkout fallback still opens `checkout.stripe.com`, and verifies returning to ClassLoop still keeps Pro locked while webhook/profile confirmation is pending.
- **Webhook-Owned Updates**: Entitlement tests verify Stripe checkout/subscription/invoice webhook payload mapping updates `classloop_profiles` with `plan_tier`, `subscription_status`, customer id, subscription id, and current period end.
- **Client Tampering Guard**: Entitlement tests verify `/api/profile` PATCH helpers ignore client-submitted paid fields like `plan_tier`, camelCase paid entitlement fields, `subscription_status`, Stripe customer ids, nested billing profiles, invalid roles, and snake-case privacy tampering.
- **Locked UI Behavior**: Browser tests verify live capture stays available in the Free workflow, Free one-session-per-day copy appears, second draft generation is disabled for Free accounts, verified Stripe-owned Pro unlocks paid controls, and unpaid/local entitlement attempts keep paid analytics/export locks.

### Package Init / Startup Failure Tests
- **Missing Packaged Executable**: `npm run test:package:init` runs the packaged first-run smoke against a missing executable and verifies the failure explains what artifact is absent without logging classroom/account data.
- **Missing App Build Guard**: The same smoke verifies desktop startup has a stable support log prefix and clear `dist/index.html` recovery guidance for package/init failures.
- **App Boot Loader / Data Outline**: Browser error-state tests delay `/api/state` and verify the loading screen names the workspace data that will appear next: accounts, sessions, rosters, follow-ups, settings, and startup status.

### Security / Secrets / Legal Baseline
- **Local Data Tracking**: `npm run test:security` verifies `.env.local`, `.classloop-data.json`, `.classloop-storage-key`, and legacy local data files are ignored and not tracked.
- **Secret Scanning**: The same script scans tracked text files for high-confidence Stripe, OpenAI, GitHub, private-key, and non-empty server-secret env assignments.
- **Storage Hardening**: The script verifies browser data uses `classloop:secure:*` AES-GCM storage keys, demo data is filtered before persistence, and the cloud offline queue is ClassLoop-namespaced.
- **Desktop / Hosted Boundaries**: The script verifies prompt-free desktop AES-GCM state encryption, restrictive desktop data permissions, trusted-origin local APIs, local API rate limiting, server-side email session lookup, Supabase auth requirements, Stripe webhook signature verification, and workspace RLS markers.
- **Public API Hardening**: `tests/api-security.test.mjs`, run through `npm run test:security`, verifies IP rate limiting, `Retry-After`/`RateLimit-*` headers, strict schema rejection for feedback/profile/cloud-state/checkout payloads, JSON content-type enforcement, safe 500 error copy, and rejection of client-submitted entitlement fields.
- **Logging / Legal Baseline**: The script blocks runtime debug/info logs and requires [LEGAL.md](LEGAL.md) plus public privacy, Terms, EULA, and Support copy to cover Terms, Privacy, EULA, support, retention, local encryption, no-training posture, public signup boundaries, school-safety expectations, and child-appropriate safety. It also asserts durable public hosted signups stay sample-only until final legal review and hosted retention/deletion SLAs are complete.

### Browser Access Tests
- **Login**: Teacher and student sample accounts can sign in.
- **Import Flow**: Teacher can load the geometry sample and generate a draft.
- **Import Error Recovery**: Bad transcript format and malformed resource URLs show visible, non-blocking warnings; teachers can still generate a reviewable draft and corrected URLs are preserved while malformed lines are ignored.
- **Startup / Storage Recovery**: Browser tests verify shared-state outages, non-JSON API responses, corrupt encrypted browser state, and browser storage write failures all produce visible recovery copy while keeping the app usable where possible.
- **Publish Preview**: Teacher can open the preview, toggle recap email recipients, edit the class-wide Google Classroom post composer, and publish student follow-ups.
- **Google Classroom / Zoom Scaffold**: Teacher can import one scaffolded Classroom course roster/resources, import a transcript-ready Zoom cloud transcript file, and verify raw Zoom transcript text is removed from the saved session while structured outputs remain.
- **Per-Student Preview Diffs**: Publish preview explains why each student receives different follow-up content.
- **Roster Manager**: Publishing prompts the teacher to save the roster; saved rosters appear in the Rosters tab and auto-load for matching session templates.
- **CSV Roster Import/Export**: Saved rosters and class groups accept CSV files and expose CSV export controls.
- **Class Manager**: Saved classes show reusable rosters, default templates, and linked session history.
- **Student View**: Published sessions appear in the student-facing portal.
- **Student Completion**: Students can mark work complete with an optional note/file link, which moves the follow-up into a submitted state for teacher review.
- **Student Feedback Popup**: After marking a follow-up complete, students can rate ClassLoop usefulness from the bottom-right popup; low ratings request improvement notes, post transcript-attached product feedback to the creator feedback endpoint, disclose that the teacher will not see it, and do not appear in teacher analytics or action queues.
- **Multi-Session E2E**: Fresh teacher/student accounts run Math review, CS workshop, and Club meeting imports through review, publish, student dashboard, completion, and teacher report export.
- **Workspace Isolation**: Browser tests verify another teacher cannot see the first teacher's sessions, saved roster, or class group, and each student account sees only sessions rostered to that student's email.
- **Teacher Review Loop**: Teacher preview can mark submitted student check-ins as reviewed.
- **Capture Modes**: New session flow exposes transcript, in-person class, online meeting capture, and Zoom cloud transcript import choices without biometric voice identification claims.
- **Analytics Hiding And Direct Route Blocking**: Student navigation does not expose teacher analytics, and direct hashes for analytics, classes, rosters, report, billing, privacy, new-session, and review routes return to the student dashboard.
- **Publish Audit**: Preview/report pages show publish audit evidence for class-wide and per-student follow-ups.
- **Report Exports**: Session report exposes JSON, CSV, and print actions.
- **Appearance**: Students can change appearance while signed in; logout returns the login screen to the default theme; sign-in restores the saved account theme.
- **Responsive Layout**: Core controls remain visible at phone-sized width without horizontal overflow.
- **WCAG-Targeted Accessibility Smoke**: Browser tests cover keyboard tab order, visible focus indicators, accessible names for controls, contrast ratios on key app and landing surfaces, screen-reader status announcements, and phone-width PWA readability.

### Hosted Web Smoke Tests
- **Landing Page**: Hosted root page loads ClassLoop marketing UI, with separate `#/features`, `#/screenshots`, `#/docs`, `#/privacy`, `#/terms`, `#/eula`, `#/support`, `#/donate`, and `#/download` routes instead of one scroll-through page.
- **Screenshots / Workflow**: `#/screenshots` shows ClassLoop teacher review, student dashboard, and analytics screenshots with readable explanations.
- **Public Privacy / Legal Boundary**: `#/privacy`, `#/terms`, `#/eula`, and `#/support` expose local desktop storage, no-training, retention/deletion, desktop license, support contact, and sample-only hosted-demo boundary copy without revealing sign-in form fields.
- **Installer Feedback**: `#/download` and `#/support` include a report form for clean-machine install, checksum, first-run, checkout, and sync failures. The form posts to `/api/feedback` with installer metadata and should notify the configured creator inbox when SMTP/Gmail feedback notification env vars are set.
- **Desktop Downloads**: macOS, Windows, and Linux download controls are visible; missing installer URLs show packaging/demo fallback copy.
- **Download Manifest Recovery**: Browser tests verify missing, malformed, or Vercel Blob-backed `public/classloop-downloads.json` manifests keep installers marked `Packaging pending` with visible recovery copy.
- **Donation Path**: Donate route exposes support amounts and clearly reports when `VITE_CLASSLOOP_DONATE_URL` has not been connected.
- **Mobile/PWA Access**: Hosted root and Download route expose the "Add to phone" action, standalone web app manifest, app icon, and service worker shell.
- **Sample-Only Demo**: Hosted demo exposes teacher/student demo choices instead of editable email/password fields.
- **Demo Walkthrough**: Teacher sample demo starts the guided walkthrough and shows the unsaved demo banner after skip.
- **Hosted WCAG/PWA Checks**: Hosted smoke tests verify landing controls have accessible names, key text/buttons meet contrast targets, add-to-home-screen feedback is announced with a live status region, and mobile PWA content avoids horizontal overflow or clipped primary controls.

### Release And Incident Drills
- **Bad Release Rollback**: `npm run drill:rollback` checks packaged release artifacts, `latest*.yml` metadata, and unpacked `app.asar` contents for macOS arm64 plus Windows/Linux x64 and arm64 where packaged. It writes a non-destructive quarantine simulation for restoring known-good download URLs or falling back to `Packaging pending`.
- **Billing / Auth / Sync Outages**: `npm run drill:incidents` verifies hosted API syntax, protected API fail-closed behavior when credentials are unavailable, public config outage reporting, Stripe webhook missing-credential copy, and Supabase RLS/policies.
- **Parser Regression Rehearsal**: The incident drill runs `npm run test:import` after cloud and entitlement checks so parser regressions are part of the same incident-response gate.

## Test Data Sources

**Real Transcripts**:
- CS4All Zoom export (47 minutes, 18 students)
- Includes: PB&J activity, Nearpod poll, homework assignments
- Chat messages with YouTube links
- Reconstructed CS4ALL/Scratch Club stress fixture with fake student identities for parser hardening

**Roster Formats**:
- Compressed: No delimiters, numbered
- Standard: CSV-style with headers
- Mixed/noisy: Empty rows, duplicate emails/names, alias columns, malformed rows, and teacher/class metadata

## Validation Checks

**Student Matching**:
- All 18 students correctly identified
- No false matches on teacher names
- Confidence scores applied

**Participation Events**:
- Correct type classification (question/answer/chat)
- Full text preserved
- Student attribution accurate

**Action Items**:
- Homework extracted with due dates
- Overdue items flagged
- Source attribution (transcript)

**Resources**:
- URLs extracted and typed
- Related topics assigned
- Titles generated from context

## Test Execution

**Build First**: `tsc -p tsconfig.test.json`
**Run Tests**: `node --experimental-specifier-resolution=node .test-build/tests/import-flow.test.js`
**Run Cloud Sync Tests**: `node --experimental-specifier-resolution=node .test-build/tests/cloud-sync.test.js`
**Run Entitlement Tests**: `node tests/entitlement-gates.test.mjs`
**Expected**: All assertions pass, no errors

## Browser Test Setup

Playwright is installed in the repo through `@playwright/test`.

**Install browsers**: `npx playwright install chromium`
**Automated install**: `npm install` runs `playwright install chromium` through `postinstall`.
**Run cloud sync tests**: `npm run test:cloud`
**Run entitlement tests**: `npm run test:entitlements`
**Run Stripe Embedded Checkout smoke**: `npm run test:stripe`
**Run security baseline**: `npm run test:security`
**Run package init failure smoke**: `npm run test:package:init`
**Run browser tests**: `npm run test:browser`
**Run hosted web smoke**: `npm run test:web`
**Run current-code web/PWA smoke locally**: `npm run test:web:local`
**Verify live asset hashes after deploy**: `npm run verify:deploy:assets` (optional `CLASSLOOP_DEPLOY_URL=https://...`)
**Run desktop state smoke**: `npm run build && npm run test:desktop:state`
**Run packaged first-run smoke**: `npm run test:desktop:first-run`
**Run release distribution verifier**: `npm run test:release:distribution`
**Print full manual QA checklist**: `npm run test:manual`
**Write full manual QA checklist**: `npm run test:manual:write`
**Run rollback drill**: `npm run drill:rollback`
**Run incident drill**: `npm run drill:incidents`

Playwright starts the Vite dev server on `127.0.0.1:5177` and runs Chromium checks across desktop and mobile-sized projects, including WCAG-targeted keyboard, focus, labels, contrast, status-announcement, and mobile PWA readability checks.
Hosted web tests use `playwright.web.config.ts` and default to `https://classloop-followup.vercel.app/`; they include the same landing/PWA accessibility smoke on desktop and phone-sized viewports. `npm run test:web:local` runs the same web/PWA smoke against a temporary local Vite server so `npm run test:all` verifies the current code without mutating the public deployment. Override the hosted target with:

Network-restricted or loopback-restricted sandboxes may block `npm ci` or prevent Playwright's Vite web server from binding `127.0.0.1:5177`. Use `npm run bootstrap` to reuse a valid existing dependency tree when installation cannot reach Electron/Playwright download hosts. For browser tests, start the dev server in an unrestricted shell with `npm run dev -- --host 127.0.0.1 --port 5177 --strictPort`, then run `CLASSLOOP_REUSE_PLAYWRIGHT_SERVER=1 npm run test:browser` so Playwright reuses the existing server instead of binding a new port.

```bash
CLASSLOOP_WEB_TEST_URL=https://your-domain.com npm run test:web
```

For desktop state QA, run `npm run build && npm run test:desktop:state`; this covers encrypted local state read/write, corrupt-file crash recovery, read-only overwrite protection, and encrypted backup restore against the local Electron app. The smoke uses configurable startup guards (`CLASSLOOP_DESKTOP_LAUNCH_TIMEOUT_MS`, `CLASSLOOP_DESKTOP_FIRST_WINDOW_TIMEOUT_MS`, and `CLASSLOOP_DESKTOP_LOGIN_READY_TIMEOUT_MS`) so slow Electron launches fail with a specific launch/window/login readiness reason. For desktop release QA, run the package command for the current OS first, then `npm run test:desktop:first-run`. The first-run smoke uses a temporary `CLASSLOOP_USER_DATA_DIR` to simulate a clean packaged launch, creates a local teacher account, confirms state writes outside the app bundle, relaunches, and signs back in. Cross-platform launch still needs an actual macOS, Windows, or Linux host for the matching binary; building artifacts alone does not prove a foreign OS can launch them.

For installer publication QA, run `npm run test:release:distribution` after packaging. Free mode is the default: it accepts unsigned/ad-hoc macOS artifacts with explicit warnings and does not require paid Apple Developer ID notarization. The public download manifest should put the Apple silicon arm64 DMG in both `macos.url` and `macos.arm64Url`, omit Intel Mac URLs, and the browser smoke checks should show `macOS (Apple silicon DMG)` as the recommended default when installer URLs are live. Linux desktop downloads should default to AppImage from `npm run package:linux`; only offer `.deb` packages after building them on a Linux host with `npm run package:linux:deb` and re-running release verification. Add `npm run release:checksums` before publishing so visitors can verify downloads. Set `CLASSLOOP_DISTRIBUTION_MODE=developer-id` to enforce paid Developer ID signing, Gatekeeper assessment, stapled notarization tickets on DMGs, and ignored clean-host evidence in `test-results/clean-host-verification.json` for each packaged macOS arm64, Windows, and Linux target, using `ops/clean-host-verification.example.json` as the template.

For ops readiness, run `npm run drill:rollback` after packaging and `npm run drill:incidents` before alpha or release handoff. The runbooks live in `ops/rollback-drill.md` and `ops/incident-response.md`, with a reusable log template in `ops/drill-log-template.md`.

For manual all-feature QA, run `npm run test:manual` after the automated gate. Use Browser/Chrome for web-only inspection and Computer Use for Electron installers, OS prompts, file pickers, microphone/screen capture, PWA install behavior, and clean-machine launch. The required report separates correctness errors, feature issues, suggested new features, cohesion improvements, and remaining gaps.

## Testing Script Response

When the user says "use the testing script," run the saved ClassLoop QA sequence and report:
- pass/fail by command
- browser workflow result
- anything not verifiable without the configured Gmail/SMTP sender
- whether paid/API-key/external-platform features remain honest scaffolds or absent, with no fake live Classroom/Zoom/LMS/OpenAI posting/transcription and Gmail/SMTP email through the configured ClassLoop sender only
- whether class manager, CSV roster import/export, Classroom roster/resource scaffold import, Zoom cloud transcript scaffold import, publish audit, recipient toggles, student submitted/reviewed states, note/file links, and report exports are reachable
- whether student feedback popups stay hidden until completion, capture high and low usefulness ratings as transcript-attached creator product feedback, request improvement notes for low ratings, disclose creator/transcript routing, avoid separate roster/email/grade payloads, and stay out of teacher analytics/action queues
- whether every supported noisy Zoom/CSV import variation still parses, including malformed rows, duplicate emails/names, mixed aliases, and transcript-only roster estimation
- whether Supabase auth transitions, token expiry handling, conflict resolution, network-loss queueing, and missing-credential desktop fallback pass
- whether Free/Pro entitlement boundaries, webhook-driven entitlement updates, upgrade/downgrade flows, Free live capture access, and unpaid paid-feature locks pass
- whether clicking Upgrade to Pro opens the hidden embedded Stripe Checkout page, keeps the hosted Checkout fallback working, and still keeps Pro locked until the paid webhook/profile state is verified
- whether local data files and `.env.local` are ignored/untracked, no high-confidence tracked secrets are present, runtime debug/info logs are absent, startup/error logging is actionable without sensitive payloads, and the legal baseline is present
- whether public hosted signups remain gated/sample-only until Terms of Use, Privacy Policy, desktop EULA, hosted retention/deletion SLAs, support contact, and child-safety expectations have final legal review
- whether bad transcript format, malformed URLs, sync API outage, package init failures, and desktop storage corruption show recoverable user-visible states
- whether realistic-scale import, repeated large imports, partial transcript failures, and 100+ student rosters pass
- whether multi-session teacher/student E2E coverage passes for Math review, CS workshop, and Club meeting without cross-user workspace leakage
- whether desktop encrypted-state read/write, corrupt-state recovery, write blocking, and backup/restore pass
- whether the hosted web demo still hides editable login fields and exposes platform download controls
- whether missing desktop installer links visibly show "Packaging pending" before click and show a pending fallback after click
- whether the Download and Docs routes explain the free unsigned/ad-hoc install path, checksum file, macOS Open Anyway flow, and Windows/Linux unsigned-app warning
- whether the hosted web demo exposes mobile/PWA install controls and passes the manifest/service-worker checks
- whether WCAG-targeted keyboard navigation, focus order, visible focus, screen-reader labels/status announcements, contrast, and mobile PWA readability checks pass
- whether rollback and incident drills passed, including clear behavior for bad release quarantine, billing outage, auth outage, sync outage, and parser regression
- whether `npm run test:release:distribution` passed in free mode, or in Developer ID mode remains blocked on paid signing/notarization credentials or missing clean-host Windows/Linux evidence
- whether the manual QA checklist was run, which operator mode was used, and what evidence was captured
- correctness errors found, clearly separated from feature issues
- suggested new features and functions that would improve ClassLoop
- cohesion improvements for copy, layout, workflow order, naming, role boundaries, and cross-feature polish
- concise feedback on how the run went
- what could be improved
- feature ideas that would improve user experience

## Test Maintenance

**When Adding Features**:
1. Add test case to `import-flow.test.ts` first
2. Add browser coverage in `tests/browser/classloop.spec.ts` when the feature changes access, routing, or user workflow
3. Update parser logic in `src/data.ts` or UI logic in `src/App.tsx`
4. Verify tests pass
5. Update the feature QA prompt in `codexsecondbrain-sync-2026-04-30.md` so future browser QA includes the new workflow and obvious formatting checks

**When Fixing Bugs**:
1. Add failing test case reproducing the bug
2. Fix parser logic
3. Verify test now passes

## Coverage Goals

- All roster format variations
- All transcript speaker patterns
- All participation event types
- All resource URL types
- Error conditions and edge cases
