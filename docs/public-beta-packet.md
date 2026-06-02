# ClassLoop Controlled Pilot Packet

Last updated: 2026-05-30

This packet is the internal handoff for controlled ClassLoop teacher pilots and alpha rehearsals. It is not a public website page, public signup flow, or broad real-student hosted launch.

## Current Pilot Boundary

- Live site: https://classloop-followup.vercel.app
- Public routes: `#/features`, `#/screenshots`, `#/docs`, `#/privacy`, `#/terms`, `#/eula`, `#/support`, and `#/download`
- No public beta route: do not publish a `#/beta` page or link to one from promo content.
- Demo accounts:
  - Teacher: `teacher@classloop.demo` / `classloop-teacher`
  - Student: `maya@classloop.demo` / `classloop-student`
- Durable hosted public signups: hold until legal/public signup review, hosted retention/deletion SLAs, backend credentials, and live billing proof are complete.
- Real classroom artifacts: use a real cloud-backed account when Supabase is configured, or the desktop app's local encrypted workspace. Demo-only routes stay sample-only.

## Teacher Onboarding

### Who This Is For

ClassLoop is for teachers, tutors, and club leads who already have messy class records after a session and need to turn them into clear follow-up without rebuilding everything manually.

Best first testers:

- A teacher with a Zoom-style transcript and class roster.
- A teacher with partial notes plus resource links.
- A tutor, club lead, or workshop facilitator with a nontraditional group session.

### What To Bring

- A transcript, meeting notes, or class notes.
- A roster CSV or pasted roster when testing student-specific follow-ups.
- 1 to 3 resource links.
- A rough answer to: "What should students know or do next?"

Use sample or anonymized data for the first run. Do not send raw student transcripts or full rosters in support notes.

### First 15 Minutes

1. Open the live site and use the sample teacher account, or download the desktop app from `#/download`.
2. Choose the teacher workflow.
3. Create or import a class session.
4. Paste the transcript or notes, roster, and resources.
5. Generate a draft.
6. Review roster matches, unmatched speakers, recap, tasks, resources, and student previews.
7. Open publish preview, but do not send anything unless the teacher has reviewed it.
8. Switch to the sample student view and mark one follow-up complete.
9. Return to the teacher view and confirm the completion appears for review.

### Teacher Success Criteria

The teacher should be able to say:

- "I can tell what is sample/demo data and what is durable."
- "I can see what ClassLoop inferred and edit it before students see it."
- "The student follow-ups would save time after class."
- "I know what to do if an import, install, checkout, or sync action fails."

## Alpha Script

Use [alpha/teacher-alpha-script.md](../alpha/teacher-alpha-script.md) for the observed session. The short version:

1. Ask the teacher to open ClassLoop and narrate what they expect.
2. Have them import one realistic session.
3. Watch roster matching and participation review.
4. Ask them to rate recap accuracy, task accuracy, student usefulness, resource usefulness, and overall trust from 1 to 5.
5. Ask whether they would publish after editing.
6. Record support interventions using [alpha/support-triage.md](../alpha/support-triage.md).
7. Store only counts, ratings, and redacted examples in the alpha tracker.

Pass the alpha only if teachers reach publish preview without trust-breaking confusion, false positives are visible and editable, and the teacher can explain what each student would receive.

## Release Notes

### ClassLoop 0.1.0 Controlled Pilot

ClassLoop turns transcripts, notes, rosters, and links into teacher-reviewed class recaps, student follow-ups, tasks, resources, completion check-ins, and private teacher support signals.

Included:

- Transcript and roster import with noisy Zoom/CSV parsing support.
- Teacher review before publish.
- Student dashboard with recap, tasks, resources, due dates, and completion check-ins.
- Teacher completion review and report exports.
- Saved rosters and class groups.
- Hosted sample demo and installable PWA shell.
- Desktop app with encrypted local state.
- Public Privacy, Terms, EULA, Support, and Download routes.
- Free tier copy includes multi-device cloud sync when Supabase is configured; Pro billing scaffold is `$3.99/month` for unlimited sessions, live capture, delivery proof, analytics, and exports.
- Stripe Checkout and webhook-owned entitlement scaffolding.
- Supabase auth/sync scaffolding with credential-absent desktop fallback.

Known limits:

- Hosted demo-only routes are sample-only; broad school or district-managed hosted use still needs final legal/public signup review.
- Live Google Classroom and Zoom integrations are workflow surfaces unless real OAuth/API credentials and backend routes are configured.
- Pro should remain locked until Stripe webhook/profile state confirms an active paid entitlement.
- The business model should stay predictable: no per-minute transcript pricing, with school/team plans only after admin, privacy, support, and legal review are ready.
- Free desktop builds may be unsigned or ad-hoc signed; users should verify checksums.
- Clean-host installer proof is still required per platform before broad distribution.
- Real teacher alpha evidence is still required before treating parser quality as field-proven.

## Support FAQ

### Where Do I Get Help?

Use the public support page at `#/support`. The default support inbox is `rushilcpm02@gmail.com` unless `VITE_CLASSLOOP_SUPPORT_EMAIL` is configured.

### What Should A Support Request Include?

Include:

- Platform and OS version.
- Browser version or desktop installer filename.
- The route or action that failed.
- Exact visible error text.
- A redacted screenshot when useful.
- Counts and anonymized examples, not raw student records.

Do not include full rosters, raw transcripts, grades, passwords, Stripe secrets, Supabase keys, or private student notes unless a specific pilot support process asks for them.

### The Transcript Import Looks Wrong. What Should I Do?

Stop before publishing. Check unmatched speakers, duplicate names/emails, teacher or guest names, and generated tasks. Record a redacted example, then rerun `npm run test:import` before treating it as a parser regression fix.

### Checkout Or Pro Access Did Not Update. What Should I Do?

Do not unlock Pro from local/client state. Confirm Stripe checkout, webhook delivery, and `/api/profile` entitlement state. Pro is trusted only after server-owned webhook/profile confirmation.

### Shared Sync Is Unavailable. Can Desktop Still Work?

Yes. Desktop/local mode must remain usable without Supabase credentials. Sync outages should show a clear message, preserve local state, and queue or retry writes only when configured safely.

### The Installer Link Is Missing Or Fails.

If a platform link is missing, the Download page should show `Packaging pending`. If a link fails, remove or blank that platform URL in `public/classloop-downloads.json` until a known-good installer is available. Do not host installer binaries in Vercel Blob.

### How Do I Delete Data?

Desktop data is local-first and can be deleted from the app or by removing the local workspace data. Hosted pilot deletion requests go through support until reviewed hosted retention/deletion SLAs are complete.

## Download Links And Fallbacks

Download page: https://classloop-followup.vercel.app/#/download

Installer manifest: [public/classloop-downloads.json](../public/classloop-downloads.json)

Current configured public assets:

- Checksums: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/SHA256SUMS.txt?download=1`
- macOS Swift Apple silicon DMG: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop-Swift-0.1.0-arm64.dmg`
- macOS Swift Apple silicon ZIP: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop-Swift-0.1.0-arm64-mac.zip`
- macOS Swift app source: `https://github.com/rushtanu14/classloop/tree/main/macos-swift/ClassLoopSwift`
- Windows x64 EXE: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop.Setup.0.1.0.exe`
- Windows x64 ZIP: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop-0.1.0-win.zip`
- Windows arm64 ZIP: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop-0.1.0-arm64-win.zip`
- Linux x64 AppImage: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop-0.1.0.AppImage`
- Linux arm64 AppImage: `https://github.com/rushtanu14/classloop/releases/download/v0.1.0/ClassLoop-0.1.0-arm64.AppImage`

Fallback rules:

- If a URL is missing, show `Packaging pending` and keep the web/PWA demo available.
- If a URL points to Vercel Blob, ignore it and show `Packaging pending`.
- macOS public downloads should stay Apple silicon only unless Intel artifacts are intentionally restored.
- macOS public downloads use the Swift app. The legacy Electron Mac package is rollback-only unless explicitly restored. The free distribution path remains ad-hoc signed unless a paid Developer ID/notarization pass is added later.
- Linux public downloads should default to AppImage. Offer `.deb` only after Linux-host verification.
- Run `npm run release:checksums` before publishing new desktop artifacts.

## Short Launch Announcement

ClassLoop is preparing controlled teacher pilots for faster after-class follow-up. Paste a Zoom-style transcript, roster, notes, and links; ClassLoop turns them into a teacher-reviewed recap, student next steps, resources, and completion check-ins. The web demo uses sample accounts, and real classroom work should stay in the desktop app or a reviewed pilot. Try the public demo at https://classloop-followup.vercel.app and send install, import, checkout, or sync issues through the Support page.

## Verification Checklist

Run this before treating the packet as ready for a real teacher:

```bash
npm run test:web
npm run test:release:distribution
npm run drill:ops
git diff --check
```

Manual review:

- `#/support` shows a support contact and says not to send raw student records.
- `#/download` shows PWA access, installer controls, checksum access, unsigned install guidance, and packaging fallback copy.
- `#/privacy`, `#/terms`, and `#/eula` keep demo-only routes sample-only and school-scale hosted use gated for review.
- Demo-only public route remains sample-only.
- GitHub release asset URLs in `public/classloop-downloads.json` return successful responses.

Current open blockers before broader launch:

- Legal/public signup review.
- Clean-host packaging proof.
- Backend credentials and live billing proof.
- Support logging proof.
- Real alpha rehearsal evidence.
- Accessibility signoff.

Ops drills passed locally on 2026-05-30 with `npm run drill:ops`. Rerun them before ship if release artifacts, hosted APIs, parser behavior, billing, or sync code changes.

## Verification Evidence - 2026-05-30

- `git diff --check`: passed.
- `npm run test:release:distribution`: passed in free unsigned/ad-hoc mode; warning remains for missing optional clean-host evidence at `test-results/clean-host-verification.json`.
- `npm run drill:ops`: passed rollback and incident drills. Optional Linux `.deb` artifacts remain absent by design; public Linux downloads should stay AppImage.
- `npm run test:web`: passed 4 hosted web/PWA smoke tests.
- Hosted root and hosted `classloop-downloads.json`: HTTP 200.
- GitHub Release assets listed in `public/classloop-downloads.json`: returned GitHub download redirects for checksums, macOS Apple silicon, Windows, and Linux assets.
