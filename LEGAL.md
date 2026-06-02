# ClassLoop Legal, Privacy, EULA, And School-Safety Terms

Last updated: 2026-05-24

This is founder-authored launch language for ClassLoop. It is not legal advice and does not create an attorney-client relationship. Public Terms of Use, Privacy Policy, Desktop EULA, and Support pages exist in the web app at `#/terms`, `#/privacy`, `#/eula`, and `#/support`. Have qualified counsel review final production language, school data-processing agreements, and hosted retention/deletion SLAs before broad school use or district-managed hosted accounts with real student data.

## Public Signup Status

Cloud-backed account signup may be enabled when Supabase Auth, public legal pages, privacy controls, support contact, and a hosted retention/deletion process are configured. Demo-only routes should use sample accounts only and clearly banner demo data as unsaved.

## Terms Of Use

### What ClassLoop Provides

ClassLoop turns teacher-provided class records - transcripts, notes, rosters, links, participation signals, draft tasks, and completion check-ins - into reviewable classroom follow-up workflows. ClassLoop is a teacher-review tool. It is not an official gradebook, student information system, emergency service, disciplinary record, attendance authority, special-education decision tool, or substitute for a teacher's or school's professional judgment.

### Authorized Users

Teachers, tutors, school staff, and authorized pilots may use ClassLoop for classroom follow-up. Students may use student-facing views only when a teacher or school has published approved follow-ups to them. ClassLoop should not invite children to create unsupervised public accounts.

### Teacher Review Responsibility

Teachers or authorized school staff are responsible for checking generated recaps, participation matches, assignments, resources, and student follow-ups before publishing. Do not treat generated content as fact until it has been reviewed. Do not use ClassLoop to make automated high-stakes decisions about students.

### Content And Rights

Only upload or paste records you are allowed to process for classroom follow-up. You keep ownership of classroom content you provide. You grant ClassLoop the limited permission needed to run the app, generate drafts, save local or hosted workspace state when configured, provide support, investigate abuse/security issues, and maintain the service.

### Acceptable Use

Do not use ClassLoop to harass, shame, rank publicly, surveil, discriminate, collect unnecessary sensitive data, bypass school policy, violate law, or expose student records to unauthorized people. Participation and completion signals must be framed as private teacher support context, not public rankings or grades.

### Accounts, Sync, And Billing

The local desktop app must remain useful without Supabase or Stripe credentials. Hosted sync, when configured, uses authenticated accounts and workspace authorization and can be available on Free accounts. Pro billing, when enabled, is processed through Stripe Checkout; subscription status is updated by signed Stripe webhooks and stored server-side.

### Support And Feedback

Installer reports, pilot feedback, and optional student usefulness ratings may be sent to the ClassLoop creator for debugging and product improvement. Support requests should avoid raw student transcripts unless a specific pilot agreement or support flow says otherwise. Prefer anonymized examples, screenshots with student names removed, platform/version details, and counts of affected records.

### Suspension And Changes

ClassLoop may suspend hosted access for abuse, security risk, payment failure, legal compliance, or operational risk. These terms may change as the product moves from demo to pilot to broader availability. Material changes should be reflected on the public pages before broad school or district-managed hosted signups are opened.

### Disclaimers

ClassLoop is provided as-is during launch and pilot use. It may produce incorrect matches, incomplete summaries, or misleading draft follow-ups. Review is required before classroom use.

## Privacy Policy

### Data ClassLoop Processes

ClassLoop may process account profiles, classroom transcripts, notes, rosters, student names/emails, aliases, resource links, generated recaps, action items, participation events, completion states, audit history, privacy settings, billing profile metadata, installer feedback, support messages, and optional product/pilot feedback.

Student completion-popup product feedback is sent to the ClassLoop creator, not the teacher, and may include related transcript context for product debugging. It should not add separate roster exports, student emails, teacher emails, grades, or unrelated class artifacts unless an explicit support/export flow asks for them.

### How Data Is Used

ClassLoop uses data to generate teacher-reviewed follow-ups, show student-specific dashboards, save local workspace state, run hosted sync when configured, enforce free/paid limits, process billing, provide support, diagnose bugs, protect the service, and improve product quality.

### Local Desktop Storage

Desktop data is local-first. Electron state is encrypted with ClassLoop's prompt-free local AES-GCM storage key file (`.classloop-storage-key`) next to the encrypted data file. Browser fallback storage uses encrypted `classloop:secure:*` localStorage keys. ClassLoop should not use Electron `safeStorage` or OS credential prompts for local workspace state.

### Hosted Demo And Hosted Sync

Demo-only hosted routes are sample-only and should not be used for real student records. Hosted sync, when configured, uses Supabase Auth and Row Level Security so each account can access only its own workspace state. Broad school or district-managed hosted use should remain gated until legal review, retention/deletion SLAs, and school data terms are ready.

### Third-Party Processors

ClassLoop may use Vercel for hosting, Supabase for auth/workspace sync when configured, Stripe for billing, and an email/SMTP/Gmail sender for support or product feedback notifications when configured. These services should receive only the data needed for their specific role.

### No-Training Posture

ClassLoop's default posture is no training on student data. Do not use student records to train general models unless a school, teacher, or authorized administrator explicitly enables a reviewed workflow that permits it.

### Data Retention, Export, And Deletion

Default teacher retention setting: 365 days. Teachers can export workspace data and delete class sessions/drafts from the privacy area. Hosted pilot users can request deletion by support email. Hosted production retention and deletion SLAs must be legally reviewed before broad school or district-managed hosted accounts are enabled.

Alpha trackers and support notes should store anonymized examples and counts, not raw transcripts or full student rosters. Support feedback is retained only as long as needed for debugging, safety, accounting, legal, or operational records.

### Security

ClassLoop uses local encryption, trusted-origin local desktop APIs, demo-only hosted boundaries, server-side entitlement handling, privacy-safe logging checks, IP and authenticated-user API rate limits, strict JSON content-type checks, request-size caps, schema validation, and safe API error responses. Server-only credentials must stay in server environment variables, and exposed or misplaced keys should be rotated before further use.

No software or policy text can guarantee perfect security or prevent legal claims. Treat these controls as a launch baseline for engineering review, not a substitute for qualified legal/security review. Report suspected security or privacy issues to the support contact below.

## Desktop EULA

### License

ClassLoop grants a limited, revocable, non-exclusive, non-transferable license to install and use the desktop app for classroom follow-up, review, pilot, and personal teaching workflows.

### Restrictions

Do not reverse engineer ClassLoop except where law allows, remove legal notices, redistribute modified installers as official ClassLoop builds, use the app to violate student privacy, or use the app in ways that bypass school or district policy.

### Local Data And Backups

ClassLoop stores desktop data in the user's per-user app data directory, not inside the app bundle. Users are responsible for their own backups before deleting local workspaces, replacing devices, or reinstalling the app. Backup/restore flows should preserve encrypted desktop data where supported.

### Installers And Updates

Free desktop builds may be unsigned or ad-hoc signed. Users should verify SHA256 checksums and install only from the official ClassLoop download page or GitHub release. Updates are manual install-over-replace until an updater is intentionally added. ClassLoop does not silently auto-update.

### Termination

Stop using ClassLoop and delete local app data if you no longer accept these terms, if your school policy does not allow the workflow, or if you are no longer authorized to process the classroom records you imported.

## Support

Support contact: `rushilcpm02@gmail.com` unless `VITE_CLASSLOOP_SUPPORT_EMAIL` is configured to a different public inbox.

For urgent issues, include product version/build marker, platform, browser or OS version, installer filename if relevant, and a short reproduction path. Do not include real student records unless a specific pilot support agreement requires it.

## Child-Appropriate Safety

- ClassLoop should not invite children to create unsupervised public accounts.
- Use school-authorized teacher or organization setup for real student data.
- Confirm COPPA, FERPA, PPRA, district, school, and parent/guardian requirements before production use with student records.
- Student-facing views should show only that student's approved follow-ups, resources, due dates, and completion status.
- Analytics are teacher-only private support signals, not public rankings.
- Do not use ClassLoop for emergency, disciplinary, grading, accommodation, or eligibility decisions without the school's normal human process.
