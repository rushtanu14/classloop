# ClassLoop

ClassLoop turns class transcripts, notes, rosters, and links into teacher-reviewed student follow-ups. It also includes a personal meeting-minutes mode for individual follow-through without class rosters or student accounts.

Teachers get a clean review workflow after class. Students get a simple dashboard with the recap, tasks, resources, due dates, and completion check-ins meant for them.

Live site: https://classloop-followup.vercel.app

## Why ClassLoop

Teachers already know what happened in class, who participated, who missed something, and what needs to happen next. The hard part is turning that memory into clear follow-up for every student.

ClassLoop helps with that after-class cleanup:

- Import a Zoom-style transcript, notes, roster, and links.
- Review the generated class recap, tasks, resources, and participation signals.
- Publish student-specific follow-ups only after teacher approval.
- Give students clear next steps without making the teacher rebuild context by hand.
- Track completion and private support signals in one place.

## What It Does

### For Teachers

- Import transcripts, pasted notes, rosters, and resource links.
- Use CSV roster import/export and saved roster templates.
- Review matched speakers, unmatched participants, action items, resources, and follow-ups.
- Edit the class recap before anything is published.
- Preview what each student will see.
- Publish approved follow-ups.
- Track participation, quiet students, missed-session catch-up, overdue work, and completion.
- Export session reports as print, JSON, or CSV-friendly records.

### For Students

- See a personalized recap for the latest class.
- View assigned tasks, resources, and due dates.
- Mark work complete with an optional note or file link.
- See teacher-reviewed completion status.
- Keep follow-up work separate from teacher-only analytics.

### For Individual Meeting Notes

- Create an individual account for paste-only personal meeting minutes.
- Generate a personal recap, resources, questions, and tasks from plain meeting notes.
- Track task status and due-date text across saved personal meetings.
- Use separate personal navigation and local persistence from teacher/student classroom data.

### For Hosted And Mobile Use

- Public landing pages for features, screenshots, docs, privacy, terms, EULA, support, and downloads.
- Hosted web demo with sample teacher and student accounts.
- Installable PWA shell with manifest, service worker, app icons, and Add to Home Screen flow.
- Supabase-backed hosted account and sync scaffold.
- Stripe Checkout-based Pro subscription scaffold.
- Google Classroom and Zoom workflow surfaces for roster/course and transcript-first classroom follow-up.

## Demo Accounts

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

1. Open the hosted site or run the desktop app.
2. Sign in as the sample teacher.
3. Import or review a class session.
4. Generate a draft and review the recap, tasks, resources, and student follow-ups.
5. Publish the session.
6. Switch to the student view and mark a task complete.
7. Return to the teacher view to review completion and analytics.

## Public Beta Packet

Use [docs/public-beta-packet.md](docs/public-beta-packet.md) for teacher onboarding, the alpha script, release notes, support FAQ, download links and fallbacks, the short launch announcement, and the verification checklist before inviting a real teacher.

## Run Locally

Requirements:

- Node.js
- npm

Start the desktop app:

```bash
./run.sh
```

Start the browser dev server:

```bash
./run.sh --dev
```

Validate launcher setup:

```bash
./run.sh --check-env
```

Install or repair dependencies directly:

```bash
npm run bootstrap
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 |
| Language | TypeScript 5 |
| Desktop | Electron 41 |
| Build | Vite 6 |
| Icons | Lucide React |
| Styling | CSS |
| Hosted shell | Vercel PWA |
| Hosted auth/sync scaffold | Supabase |
| Billing scaffold | Stripe Checkout |

## Project Structure

```text
src/
  App.tsx        Main app UI and flows
  cloud.ts       Hosted auth, sync, and billing helpers
  data.ts        Transcript, roster, resource, and follow-up parsing
  types.ts       Core ClassLoop domain types
  styles.css     Product styling
desktop/
  main.cjs       Electron main process
api/
  billing/       Stripe checkout, portal, and webhook routes
  cloud-state.js Hosted workspace sync route
  feedback.js    Product feedback route
  profile.js     Hosted profile and entitlement route
public/
  manifest.webmanifest
  sw.js
tests/
  browser/       Playwright product and accessibility tests
```

## Pricing

- Free: 1 generated session per day, transcript import, Google/Zoom workflow surfaces, student accounts, recap email delivery, CSV roster tools, and local desktop storage.
- Pro: `$3.99/month` for unlimited generated sessions plus private analytics and JSON/CSV/print report exports.

## Privacy And Safety

ClassLoop is designed around teacher review and student privacy.

- Teachers approve before publishing.
- Students see their own follow-ups, not teacher-only analytics.
- Analytics are private support signals, not public rankings.
- Local desktop state is encrypted with ClassLoop local storage keys.
- Hosted sync uses account-scoped state and server-owned billing entitlements.
- Terms, Privacy Policy, EULA, Support, and Download pages are included in the hosted app.

## Testing

Run the core checks:

```bash
npm run build
npm run test:security
npm run test:import
npm run test:cloud
npm run test:entitlements
npm run test:browser
npm run test:web
```

Useful focused checks:

```bash
npm run test:web:local
npm run test:stripe
npm run test:desktop:state
npm run test:desktop:first-run
npm run test:release:distribution
npm run drill:incidents
```

The test suite covers import parsing, noisy transcripts and rosters, teacher/student workflows, individual meeting minutes, workspace isolation, hosted sync states, Free/Pro boundaries, Stripe-owned entitlement updates, desktop encrypted state, mobile/PWA readability, accessibility, user-visible errors, Swift macOS packaging, and release checks.

## Desktop Packaging

All desktop packaging commands run `npm run package:prepare` first. That rebuilds the shared Vite `dist/` output and verifies that macOS, Windows, Linux, and the Swift macOS app are wired to that same local build, so local changes are not left behind in one platform version.

Build the Apple silicon macOS package:

```bash
npm run package:mac
```

`npm run package:mac` now builds the native Swift macOS app bundle, DMG, and ZIP. The legacy Electron macOS fallback is still available when needed:

```bash
npm run package:mac:electron
```

Run the Swift macOS app against the local web build:

```bash
npm run swift:mac:run
```

Build Windows or Linux packages:

```bash
npm run package:win
npm run package:linux
```

Build every desktop target from the same prepared local source when the host has the required platform tooling:

```bash
npm run package:all
```

Generate checksums:

```bash
npm run release:checksums
```

## Environment Setup

Use `.env.example` as the checklist for optional hosted services.

Common hosted variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

VITE_STRIPE_PRO_PRICE_ID=
VITE_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PRO_PRICE_ID=
STRIPE_WEBHOOK_SECRET=

CLASSLOOP_PUBLIC_URL=
CLASSLOOP_FEEDBACK_NOTIFY_EMAIL=
```

Keep server-only secrets in Vercel or local environment files. Do not commit real credentials.

## What Is Next

- Real teacher pilot sessions with redacted classroom data.
- Live Stripe checkout and webhook entitlement proof.
- Clean-host installer verification for public desktop downloads.
- Google Classroom OAuth and posting flow.
- Zoom transcript import integration.
- More onboarding polish for teachers and students.
- More accessibility testing with real assistive-tech usage.
