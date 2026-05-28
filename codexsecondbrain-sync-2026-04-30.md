# ClassLoop Codex Second Brain Sync - 2026-04-30

## Project Context

ClassLoop is an AI-assisted classroom follow-up platform for teachers, tutors, instructors, club leaders, and students. The product turns transcripts, pasted notes, rosters, and resources into teacher-reviewed session recaps, personalized student follow-ups, resources, participation signals, and completion tracking.

The user wants the main branch to preserve the original clean white/green classroom UI. A separate experimental UI branch existed during the conversation, but main should be treated as the real product UI and should not inherit the dark image-heavy style.

## Major Product Decisions

- ClassLoop should behave like a real usable platform, not a hardcoded demo.
- Sample data should only appear when the user explicitly chooses a sample/demo account or sample transcript.
- Teacher and student accounts are separate.
- Teachers see teacher dashboards, review tools, session reports, roster tools, publishing controls, and analytics.
- Students see only their own student portal, assigned recaps, tasks, resources, and completion check-ins.
- Analytics must remain teacher-side only.
- The desktop experience matters: the user wants to run the app with `./run.sh`.

## Current Implementation Notes

- Main branch now has source files restored under `src/` instead of relying only on a static checked-in `dist/`.
- `package.json` supports a real build through `tsc && vite build`.
- `./run.sh` starts the Electron desktop app.
- Electron serves the built `dist/` bundle.
- Default theme storage key was changed to `classloop:theme:main:v1` so stale experimental theme state does not force main into the wrong style.
- Default theme is classroom calm: white/green.

## Latest Feature Work

The latest requested features were added in source and rebuilt into `dist`:

- Publish preview:
  - Teachers now preview the student-facing dashboard before publishing.
  - Teachers can pick a student and review exactly what that student will see.
  - Publishing happens from the preview screen.

- Roster manager:
  - Added to the AI review page.
  - Teachers can add, remove, rename, email-edit, mark attendance, and set Zoom/display-name aliases for students.

- Transcript participant resolution:
  - The parser detects Zoom-style speaker lines such as `Maya: ...` or timestamp-prefixed transcript lines.
  - If a speaker appears in the transcript but is not on the roster, ClassLoop prompts the teacher to add the speaker to the roster or link the display name to an existing student.
  - Linked names are stored as aliases on the student record for future matching within that roster/session context.

- Teacher editing from student side:
  - In teacher preview mode, teachers can edit student-visible recap, catch-up note, reminder, tasks, due date, status, and resources.
  - Student accounts do not receive these edit controls.

- Student route restrictions:
  - Student navigation now only includes the student portal/detail routes.
  - Analytics and design-system routes are not part of the student route set.

## Verification

- `npm install` completed successfully.
- `npm run build` completed successfully.
- `./run.sh` launched the Electron app successfully.
- Electron was stopped afterward with `killall Electron`.

## Files Most Relevant To Continue Work

- `src/App.tsx`: main app state, routing, auth, teacher/student views, publish preview, roster manager, student-visible editor.
- `src/data.ts`: sample data, transcript parsing, session generation, unmatched participant detection.
- `src/types.ts`: shared data types including student aliases and unmatched transcript participants.
- `src/styles.css`: white/green classroom styling plus new roster/preview/editor styles.
- `desktop/main.cjs`: desktop wrapper and local shared-state API.
- `run.sh`: one-command launcher.
- `dist/`: rebuilt production bundle served by Electron.

## User Preferences To Preserve

- Keep main branch white/green and professional.
- Avoid making main feel like a phony demo.
- Make sample/demo entry points small and explicit.
- Prioritize functionality and ease of use over flashy UI.
- Keep teacher controls private and student-facing pages simple.
- Avoid exposing implementation explanations such as role-based access text to normal users unless it helps privacy/trust.

## Good Next Improvements

- Add a full roster page separate from the review page so teachers can manage students before creating sessions.
- Add account-to-roster linking so newly created student accounts can request or accept a connection to a teacher/class.
- Add class/course objects so one teacher can manage multiple rosters.
- Add a publish audit screen showing all students, what changed, and who will receive updates.
- Add version history for teacher edits before and after publishing.
- Add real file parsing for `.txt`, `.vtt`, and `.srt` uploads.
- Add CSV roster import/export.
- Add clearer empty states for brand-new accounts.
- Add an onboarding checklist for first-time teachers.
- Add privacy copy in settings/help rather than crowding the main workflow.

## 2026-05-01 Update

Latest polish pass focused on making ClassLoop feel more like a real daily-use app instead of a demo:

- Account creation now has confirm password plus show/hide password.
- The profile pill in the topbar opens profile settings for name, email, and password changes.
- The duplicate topbar sign-out button was removed; sign-out stays in the sidebar.
- Electron now serves `/api/state` and stores account/session state in `.classloop-data.json`, so local desktop accounts can be logged into again after restarting the app.
- Passwords are hashed before storage; no plaintext passwords are stored.
- File upload now reads `.txt`, `.vtt`, and `.srt` transcripts into the import flow.
- Transcript parsing ignores Zoom/VTT metadata speakers such as `Meeting Title`, `Date`, `Duration`, `Participants`, `Question`, and similar labels.
- Generated recaps and follow-ups are more substance-driven:
  - class-wide recap remains shared,
  - student tasks vary based on questions asked, confusion/mistakes, answers, quiet flags, and absence,
  - readiness scores vary per student instead of defaulting to the same value.
- Publish flow now says `Preview and publish`, making the publishing step clearer.
- Publish preview now shows class-wide recap plus personal next steps and the participation evidence behind them.
- Roster rows include student access controls:
  - link by matching ClassLoop student account email,
  - open a prepared `mailto:` invite if the student does not have an account.
- Dashboard attention queue now uses the blank space for a support snapshot chart when there are no urgent items.
- Appearance page copy was rewritten to focus on user benefit and customization, not AI/design-system language.
- Responsive/layout fixes were added for topbar actions, profile menu, roster rows, preview columns, sidebar overflow, and narrow windows.

Verification from this pass:

- `npm run build` passed.
- `./run.sh` launched the Electron desktop app successfully.
- Electron was stopped afterward with `killall Electron`.

## Testing Prompt Library

### CS4All Compressed Roster + Zoom Transcript Import QA

Use this prompt when testing the ClassLoop import flow without making code changes:

```text
You are only testing. Do not edit files, do not patch code, do not format files, do not run build tools that write output unless absolutely necessary. If a dev server or cache writes anything, clean up only your own generated test artifacts.

Goal: verify whether ClassLoop correctly handles this exact pasted input scenario.

Test the app/import logic with this roster and transcript exactly as pasted below. Report:
- whether the app boots
- whether import/generation succeeds
- parsed student count
- parsed student names/emails
- unmatched transcript speakers
- participation event count
- follow-up count
- resource count and URLs
- exact suspected root cause, with file/function references
- a concise “passes/fails” verdict

Do not fix anything in this chat.

Here's everything:

CLASS ROSTER — CS4All Demo Session
Ms. Rivera | Period 4 | Spring 2026
#Student NameEmail1Aaliyah Carteracarter@cs4all.nyc2Danny Reyesdreyes@cs4all.nyc3Jalen Thompsonjthompson@cs4all.nyc4Keisha Brownkbrown@cs4all.nyc5Leo Fernandezlfernandez@cs4all.nyc6Marcus Williamsmwilliams@cs4all.nyc7Priya Mehtapmehta@cs4all.nyc8Brianna Owensbowens@cs4all.nyc9Caleb Nguyencnguyen@cs4all.nyc10Destiny Lewisdlewis@cs4all.nyc11Elijah Sandersesanders@cs4all.nyc12Fatima Hassanfhassan@cs4all.nyc13Gabriel Torresgtorres@cs4all.nyc14Hannah Kimhkim@cs4all.nyc15Isaiah Mooreimoore@cs4all.nyc16Jasmine Pateljpatel@cs4all.nyc17Kevin Diazkdiaz@cs4all.nyc18Lena Wulwu@cs4all.nyc

CS4ALL Zoom Demo — Full Transcript
Meeting Title: CS4All Intro to Computational Thinking — Demo Session
Date: April 28, 2026
Duration: 47 minutes
Participants: Ms. Rivera (Teacher), 18 Students

[00:00:03] Ms. Rivera: Alright everyone, I'm going to start the recording now. Can everyone give me a thumbs up in the reactions if you can hear me okay?
[00:00:11] Student (Jalen Thompson): I can hear you!
[00:00:13] Student (Priya Mehta): Yes, audio is good.
[00:00:15] Ms. Rivera: Perfect. Okay, so welcome back everyone. Today we're starting Unit 3 — Algorithms and Problem Decomposition. Before we dive in, quick check — did everyone finish the exit ticket from last Thursday?
[00:00:28] Student (Marcus Williams): I forgot 😭
[00:00:31] Ms. Rivera: Marcus, come see me after. Okay, so let's get into it. I'm going to share my screen. Can everyone see the slides?
[00:00:41] Student (Aaliyah Carter): Yes!
[00:00:42] Student (Danny Reyes): Yep.
[00:00:44] Ms. Rivera: Great. So — who can tell me, in their own words, what an algorithm is? Don't look it up, just think about it. Anyone?
[00:00:57] Student (Priya Mehta): Is it like... a set of steps to solve a problem?
[00:01:02] Ms. Rivera: Yes! Exactly. A sequence of instructions. Now here's what I want you to think about — where do you encounter algorithms in your daily life? Drop it in the chat.
[00:01:14] Student (Jalen Thompson): [Chat] TikTok algorithm lol
[00:01:15] Student (Keisha Brown): [Chat] GPS directions
[00:01:16] Student (Danny Reyes): [Chat] recipes
[00:01:17] Student (Marcus Williams): [Chat] alarm clock??
[00:01:18] Student (Priya Mehta): [Chat] found this video that explains it really well → https://www.youtube.com/watch?v=6hfOvs8pY1k
[00:01:20] Ms. Rivera: Love these. Danny — recipes, yes! That's a great one. An alarm clock is actually a really interesting case, Marcus — why do you think that might be algorithmic?
[00:01:33] Student (Marcus Williams): Uh... because it like, checks the time and then does something based on a condition?
[00:01:40] Ms. Rivera: Boom. Conditional logic. That's exactly it. Okay, let's move to the activity. I'm going to put you all into breakout rooms — groups of three. Your task is to write out the steps to make a peanut butter and jelly sandwich as if you were programming a robot. Be super literal. The robot has no common sense.
[00:02:01] Student (Aaliyah Carter): Wait do we write it in a doc?
[00:02:04] Ms. Rivera: Yes, I'm dropping a Docs link in the chat right now. You have 8 minutes. Go!
[00:02:09] [Breakout rooms opened — 6 groups]

[00:10:17] [Breakout rooms closed — all participants returned]
[00:10:22] Ms. Rivera: Okay welcome back! Let's hear from a few groups. Group 2, Keisha — can you share what your group came up with?
[00:10:31] Student (Keisha Brown): Okay so we wrote: Step 1 — Pick up the bread bag. Step 2 — Open the bread bag. Step 3 — Remove two slices of bread. Step 4 — Place slices on a flat surface...
[00:10:45] Ms. Rivera: Already I'm stopping you — "flat surface." What if the robot doesn't know what flat means? Or what surface to use?
[00:10:53] Student (Keisha Brown): Oh... we'd have to define that.
[00:10:55] Ms. Rivera: Exactly! This is what we call the precision problem in programming. Computers do exactly what you tell them — nothing more, nothing less. This is why debugging is so hard. Your logic might be right but your instructions are ambiguous. Okay Group 5, let's hear from you.
[00:11:14] Student (Leo Fernandez): We kind of went overboard — we wrote like 34 steps.
[00:11:18] [Laughter from several students]
[00:11:20] Ms. Rivera: That's not overboard, that's thorough! Can you read a few?
[00:11:24] Student (Leo Fernandez): Step 1 — Initialize hand variable. Step 2 — Assign dominant hand to variable. Step 3 — Extend arm toward bread bag...
[00:11:34] [More laughter]
[00:11:36] Ms. Rivera: I love it, Leo. This is actually really close to pseudocode. You're thinking like a programmer. Alright — let's talk decomposition. When a problem is complex, what do we do?
[00:11:48] Student (Priya Mehta): Break it into smaller parts?
[00:11:51] Ms. Rivera: Yes. We decompose it. The sandwich is actually three sub-problems: bread setup, spread application, and assembly. Each of those can be its own function. This maps directly to how we'll write Python functions next week.
[00:11:58] Student (Leo Fernandez): [Chat] yo this video breaks down decomposition perfectly https://www.youtube.com/watch?v=QXjU9qTsYCc
[00:12:02] Student (Aaliyah Carter): [Chat] omg we watched that in 8th grade lol
[00:12:04] Ms. Rivera: Leo drop the distractions 😄 but yes that's actually a solid resource, I'll add it to Classroom.
[00:12:09] Student (Danny Reyes): Wait are we actually gonna code a sandwich?
[00:12:13] Ms. Rivera: laughs Not quite. But we'll use this mental model. Okay — I want to do a quick Nearpod poll before we wrap up. Checking your understanding. One second while I launch it.
[00:12:28] [Poll launched]
Question: Which of the following is the BEST example of an algorithm?

A) A list of your favorite songs
B) Directions from your house to school
C) A photo of a map
D) The name of a city

[00:12:55] Ms. Rivera: Okay I'm seeing responses come in... 78% of you said B — directions from your house to school. That is correct! Directions are a sequence of steps with a clear start, end, and decision points. A list of songs has no sequence logic. Good job.
[00:13:14] Student (Marcus Williams): What about C though? A map kind of shows steps?
[00:13:19] Ms. Rivera: Great question. A map is a representation of space — it's data. But it's not an algorithm until you apply a process to it — like, GPS takes the map data and runs an algorithm to find the shortest path. Does that distinction make sense?
[00:13:32] Student (Marcus Williams): Yeah okay yeah.
[00:13:35] Ms. Rivera: Alright, we have about 5 minutes left. Homework for Thursday: complete the algorithm design worksheet on Google Classroom — it's the one titled "Everyday Algorithms." Also, for those of you who haven't submitted your Unit 2 reflection, that's now past due and affecting your grade.
[00:13:53] Student (Jalen Thompson): Ms. Rivera is the worksheet the one with the flowcharts?
[00:13:57] Ms. Rivera: Yes, the one with the flowcharts. There are three problems. You pick two of the three. Any other questions?
[00:14:06] Student (Aaliyah Carter): Are we going to keep using Scratch or switch to Python?
[00:14:10] Ms. Rivera: We're transitioning to Python starting next Thursday. We'll use replit — make sure your accounts are set up. I'll send a reminder on Classroom.
[00:14:19] Ms. Rivera: Okay everyone — great work today. I'll see you Thursday. Jalen, Marcus — stay on for a second.
[00:14:26] [Students begin leaving the meeting]
[00:14:31] Student (Jalen Thompson): Yes Ms. Rivera?
[00:14:33] Ms. Rivera: Jalen, you've been really engaged today, I just want to make sure you're keeping up with the written work too. Your participation is great but I need those docs submitted.
[00:14:42] Student (Jalen Thompson): Yeah I'll do it tonight I promise.
[00:14:44] Ms. Rivera: I'm going to hold you to that. Okay, have a good afternoon both of you.
[00:14:49] [Recording ended]
```

### CS4All Import Fix Prompt

Use this prompt after the QA prompt identifies the compressed roster and Zoom speaker matching issues:

```text
Fix the ClassLoop import flow based on the test results. Keep changes narrowly scoped to only affect the background logic, do not touch the ui or anything unrelated.

Expected behavior for the pasted CS4All roster + Zoom transcript:
- Parse exactly 18 students from the compressed roster.
- Ignore roster metadata/header lines such as:
  CLASS ROSTER — CS4All Demo Session
  Mr. Agrawal | Period 4 | Spring 2026
  #Student NameEmail
- Correctly extract names/emails like:
  Aaliyah Carter / acarter@cs4all.nyc
  Danny Reyes / dreyes@cs4all.nyc
  Jalen Thompson / jthompson@cs4all.nyc
  Lena Wu / lwu@cs4all.nyc
- Normalize Zoom-style transcript speakers like `Student (Jalen Thompson)` so they match roster student `Jalen Thompson`.
- Do not treat teacher speaker `Ms. Rivera` as an unmatched student.
- Generate student participation events for matched transcript lines.
- Generate 18 student follow-ups.
- Preserve detection of both YouTube links as resources.

Likely files/functions to inspect:
- `src/data.ts`
- `parseRoster`
- `normalizeSpeakerName`
- `speakerMatchesStudent`
- `lineForStudent`
- `findUnmatchedParticipants`
- `extractTranscriptSpeakers` / `isTranscriptMetadataSpeaker`

Add regression coverage for this exact scenario if the repo has a test setup. If there is no test setup, add the smallest practical verification path or document the manual verification command you used.

After fixing, verify and report:
- `students.length === 18`
- Lena Wu is parsed with `lwu@cs4all.nyc`
- `unmatchedParticipants` excludes `Ms. Rivera`
- `unmatchedParticipants` excludes matched students like `Student (Jalen Thompson)`
- `participationEvents.length > 0`
- `followUps.length === 18`
- `resources.length === 2`
- both YouTube URLs are present

Make the code changes and then summarize exactly what changed and how you verified it.
```

## 2026-05-06 Feature QA Prompt: Access, Appearance, Storage, Capture, Privacy, Rosters

Use this prompt when testing the ClassLoop feature set after appearance, storage, browser tests, live audio notes, delivery logging, privacy controls, roster templates, or sidebar navigation are changed:

```text
You are testing ClassLoop. Verify functionality; do not redesign the app.

Run:
- npm run build
- npm run test:import
- npm run test:browser
- node -c desktop/main.cjs

Feature checks:
1. Teacher login works with teacher@classloop.demo / classloop-teacher.
2. Student login works with maya@classloop.demo / classloop-student.
3. Teacher can create/import a session, load the geometry sample, generate a draft, open publish preview, publish, view student preview, and open analytics.
4. Publish preview shows per-student preview differences explaining why each student got different follow-ups.
5. After the first published session, the save-roster prompt appears, accepts a teacher-entered roster name, and saves the roster.
6. The Rosters sidebar tab opens a standalone roster manager:
   - saved roster is visible with student count
   - roster name and session type are editable
   - student names, emails, and Zoom aliases are editable without overlapping text
7. Creating a new session with a matching session template auto-offers the saved roster and loads it into Bulk roster.
8. Student can open My portal and Appearance, but cannot access Analytics or teacher-only Rosters/Privacy.
9. Student appearance settings save only while logged in:
   - Change student theme.
   - Confirm html data-theme changes.
   - Sign out.
   - Confirm the login screen returns to the default classroom theme.
   - Sign back in and confirm the student's saved theme returns.
10. Teacher appearance settings remain teacher-account scoped.
11. Image backdrop URL updates the live preview and app background when a safe HTTPS image URL is used.
12. Live capture modes require consent confirmation when privacy settings require it.
13. Paid/API-key/external-platform features do not pretend to be live: no OpenAI transcription, custom transcription endpoint, LMS posting, or live Zoom bot. Google Classroom and Zoom cloud surfaces are allowed only as honest scaffolds until OAuth/API credentials are connected.
14. Publish preview shows delivery logs after email send actions, supports teacher toggles for email recipients, and includes an editable class-wide Google Classroom post composer.
15. Privacy page is accessible to teachers and exposes retention settings, export, delete class data, consent settings, and audit log.
16. After students mark a follow-up complete, student follow-up pages can include a student note/file link and then show a bottom-right ClassLoop usefulness feedback popup; low ratings ask what would make ClassLoop better, post product feedback to the creator feedback endpoint without student names/emails, and do not appear in teacher Analytics or action queues.
17. Account/session/browser roster fallback storage uses secure classloop:secure:* localStorage keys; legacy plain classloop:accounts/session keys should migrate away.
18. Responsive layout has no horizontal overflow at a phone-sized viewport.
19. WCAG-targeted checks pass for keyboard navigation, focus order, visible focus indicators, accessible control names, live status announcements, contrast on key text/buttons, and mobile PWA/add-to-home-screen readability.
20. Error-state recovery checks pass for boot loading/data-outline delay, bad transcript format, malformed URLs, sync API outage/local fallback, non-JSON sync responses, browser storage read/write failures, download-manifest outages/malformed/Vercel Blob URLs, package init failures, desktop storage corruption, and privacy-safe actionable logging.
21. Public signup legal gate remains set: durable hosted signups stay sample-only until reviewed public Terms of Use, Privacy Policy, desktop EULA, hosted retention/deletion SLAs, support contact, and child-safety expectations are published.
22. Frontend formatting pass: no unreadable low-contrast text, overlapping form labels, clipped buttons, blank teacher-only panels, or unnecessary implementation details exposed to users.

Import regression checks:
- Compressed CS4All roster parses 18 students.
- Lena Wu parses as lwu@cs4all.nyc.
- Ms. Rivera is not an unmatched participant.
- Student (Jalen Thompson), Student (Priya Mehta), and similar Zoom names match roster students.
- participationEvents.length > 0.
- followUps.length === 18.
- resources.length === 2 and both YouTube links are present.
- Zoom .vtt, Teams transcript blocks, Google Meet captions, Google Classroom CSV roster exports, and nickname/alias matching stay covered.

Report:
- pass/fail by command
- parsed import counts
- browser test results
- any feature not fully verifiable without the Gmail sender
- exact file/function suspected for any failure
- when the user says "use the testing script," also include concise feedback on how the test run went, what could be improved, and feature ideas that would improve user experience
```

## 2026-05-06 Testing Tooling Requirement

Playwright is a required dev dependency for ClassLoop browser QA.

- Keep `@playwright/test` in `devDependencies`.
- Keep `npm run test:browser` available.
- Keep `postinstall` running `playwright install chromium` so a fresh repo install has the browser needed for tests.
- Browser tests live in `tests/browser/classloop.spec.ts`.
- Playwright config lives in `playwright.config.ts` and starts Vite on `127.0.0.1:5177`.

## 2026-05-06 Security/Storage Notes

- Desktop `.classloop-data.json` should be written encrypted with ClassLoop's prompt-free local AES-GCM storage key (`.classloop-storage-key`) rather than Electron `safeStorage`, so ClassLoop does not trigger macOS Keychain or OS password prompts while saving.
- Browser fallback storage should use `classloop:secure:*` keys with AES-GCM encryption and migrate legacy plain localStorage keys.
- This is local encryption at rest. It is not true multi-device sync. Real multi-device student access requires a backend database, server-side auth/session validation, HTTPS, and school-approved identity/OAuth.

## 2026-05-06 Live Audio Notes

- Browser live speech recognition is the only audio-to-text path kept in the working app.
- Transcript paste/upload is the reliable free fallback.
- Do not add `/api/transcribe`, OpenAI speech-to-text, custom transcription-provider APIs, or external transcription-dependent online-call capture unless the user explicitly reopens paid/external integration work.
- Live audio notes should require explicit in-app consent when privacy settings require it.

## 2026-05-06 Free-First External Services Policy

- The user does not want to pay for integrations during the prototype stage.
- ClassLoop cannot generate a Gmail account or send from an address the user does not own.
- Free email path: the user creates/owns a Gmail account such as `classloop.noreply@gmail.com`, enables 2-Step Verification, creates an app password, and configures ClassLoop to send from that mailbox with `CLASSLOOP_REPLY_TO` set to the teacher/support inbox.
- Google Classroom and Zoom cloud import can be shown as launch scaffolds only when the UI is explicit that OAuth/API connection is not live yet. Keep LMS posting, OpenAI transcription, custom transcription endpoints, and live Zoom bots removed/deferred because they require external integration setup or paid API-key paths. Browser-only online meeting capture is allowed as a free best-effort feature.
- If no external credentials are configured, ClassLoop must remain useful through transcript paste/upload, local review, publish preview, student portal, roster manager, and analytics.

## 2026-05-06 Roster Template Notes

- The consolidated main app includes a standalone Rosters sidebar tab for teachers.
- Roster templates are saved by teacher account and session type, then offered automatically when creating future sessions with the matching template.
- Publishing a session with students prompts the teacher to name and save that roster if no saved roster exists for that session type.
- The import flow should keep the saved roster behavior helpful but unobtrusive: show a saved roster selector only when a matching roster exists.
- Image backdrop URLs should update the app background and live preview for safe HTTPS/data/blob/local images; Electron CSP must allow HTTPS image loads.

## 2026-05-07 Branch-Aware Improvement Implementation

- This work originally lived on `codex/audio-session-improvements` and has since been promoted into `main`.
- `main` should remain the active clean classroom UI with stable local-first workflows.
- Consolidated main now includes:
  - shared `ClassGroup`, `RosterTemplate`, `StudentSubmission`, and `PublishAuditEntry` types in `src/types.ts`
  - Classes sidebar tab for reusable class/course rosters with default session type and linked session history
  - CSV import/export for saved rosters and class groups
  - publish audit rows on publish preview and session report
  - student completion state that moves to submitted, with teacher-reviewed state available in student-visible editor
  - student portal “Since your last visit” evidence based on personalized follow-up differences
  - JSON, CSV, and print report actions on session reports
  - Electron state persistence for class groups
- The working app still excludes paid/API-key/external-platform workflows that would imply live credentials: no OpenAI/custom transcription, LMS posting, or live Zoom bot. Classroom/Zoom UI must remain an honest scaffold until OAuth/API credentials are connected.
- Verification on the improvement branch:
  - `npm run build` passed
  - `npm run test:import` passed
  - `npm run test:browser` passed 6/6 across desktop and mobile projects
  - `node -c desktop/main.cjs` passed
  - `git diff --check` passed

### Updated Feature QA Additions

When using the ClassLoop testing script, also verify:

- Classes sidebar tab is teacher-only and shows reusable class rosters.
- Publishing/saving a roster creates or updates a reusable class group.
- New Session can load a saved class roster as well as a saved roster template.
- Saved roster and class pages support CSV import/export.
- Publish preview and session report show publish audit evidence.
- Student can submit a follow-up check-in, see the button text change to "Completed!", and get a celebratory confetti animation; teacher can mark it reviewed.
- Student usefulness feedback stays hidden until completion, captures high and low ratings as creator product feedback, asks for improvement notes on low ratings, posts to the feedback endpoint without student names/emails, and stays out of teacher analytics/action queues.
- Session report exposes JSON export, CSV export, and print actions.
- WCAG-targeted browser checks cover login keyboard/focus order, unnamed controls, contrast, student completion live announcements, hosted PWA add-to-home-screen status, and phone-width mobile readability.
- Error-state checks cover visible recovery for malformed import inputs and sync API outage, package init failure messages, desktop corrupt-state recovery, and privacy-safe support logging.
- Public signup/legal gate checks confirm Terms, Privacy Policy, support contact, EULA, retention/deletion expectations, and child-appropriate safety language are present while durable hosted signups remain sample-only until those public docs are reviewed and published.

## 2026-05-09 Backend / Freemium / Privacy Update

- Added a real hosted backend scaffold without making the local desktop app depend on paid services.
- Backend pieces:
  - Supabase Auth and `api/cloud-state.js` for multi-device workspace sync.
  - `api/profile.js` for server-owned account/billing profile reads.
  - Stripe Checkout in `api/billing/checkout.js`.
  - Stripe subscription webhooks in `api/billing/webhook.js`.
  - Pilot feedback in `api/feedback.js`.
  - RLS-backed tables in `supabase/schema.sql`.
  - Vercel browser deployment config in `vercel.json`.
- Freemium MVP:
  - Free: `$0`, 1 generated session per day, transcript import, Google/Zoom workflow scaffolding, student accounts, recap email delivery, CSV import/export, student portal preview, local desktop storage.
  - Pro: `$3.99/month`, unlimited generated sessions plus private analytics and JSON/CSV/print report exports.
- Added teacher-only Plan options and Privacy controls.
- Added `AGENT.md` operational memory at repo root.
- Consolidated `main` keeps the richer features: live audio notes, browser meeting capture, Gmail/SMTP delivery, class manager, publish audit, and submitted/reviewed student workflow.
- Recap email delivery is server-authoritative: send requests use a published `sessionId` and owner email instead of trusting a client-provided draft session.
- Verification passed on `main`: `npm run build`, `npm run test:import`, `node -c desktop/main.cjs`, `node --check api/*.js api/billing/*.js`, `npm run test:browser`, and `git diff --check`.

## 2026-05-09 Main Promotion + UX Smoke Update

- Promoted the working `codex/audio-session-improvements` experience into `main` so `main` is now the current branch Rushil should work from.
- `main` now includes the richer daily-use workflow: consent-first capture modes, one-click recap delivery UI, saved rosters, class/course manager, publish audit, student submitted/reviewed completion state, report exports, hosted backend/freemium scaffold, and privacy controls.
- Fixed a promotion merge regression where duplicate privacy/billing defaults broke the Vite app.
- Restored CSV import/export controls in the shared roster manager so draft review rosters, saved rosters, and classes all keep CSV workflow access.
- Expanded `tests/browser/classloop.spec.ts` into a deeper UX smoke script covering account creation/reset/settings, capture choices, roster CSV import/export, class reuse, publish preview, report downloads, student submission, teacher review, privacy, sync/billing fallback, appearance, tutorial, role gates, and mobile overflow.
- Manual-style Playwright UX pass against the running app covered login, capture mode selection, sample import, CSV import, publish, student preview completion, analytics, and privacy. It found no page errors, no console errors, and no desktop horizontal overflow.
- Verification passed on `main`: `npm run build`, `npm run test:import`, `npm run test:browser` (12/12), `node -c desktop/main.cjs`, `node --check api/*.js api/billing/*.js`, and `git diff --check`.

## 2026-05-09 Skills Added From Backend Rollout

Created three reusable ClassLoop skills:

- `classloop-hosted-deployment`: Vercel/Supabase/Stripe hosted deployment setup, env vars, RLS, API routes, webhooks, and live multi-device sync verification.
- `classloop-entitlement-gates`: Free/Pro plan limits, Stripe subscription state, webhook-owned entitlements, paid feature gating, and anti-client-bypass review.
- `classloop-dual-branch-rollout`: applies shared ClassLoop changes to both `main` and `codex/audio-session-improvements` while preserving branch boundaries and verifying both branches.

All three validate with `quick_validate.py`.

## 2026-05-09 Branch Consolidation

- `codex/audio-session-improvements` is no longer an active product branch.
- The committed improvement-branch history was already merged into `main`; remaining useful documentation guidance was folded into `main`.
- Future ClassLoop work should target `main` unless the user explicitly asks to create a new experiment branch.
- Keep the old `ui-test`/abyssal visual direction separate unless the user explicitly asks to revive it.

## 2026-05-10 Hosted Landing / Vercel Diagnostics

- The hosted Vercel root route `/` now serves a public ClassLoop landing page with a Codex-style first impression, download call to action, and web demo entry point.
- The actual app remains at `/#/dashboard`; Electron still opens `/#/dashboard` directly, so the desktop workflow is unchanged.
- The hosted web demo is sample-account-only. Visitors can use the sample teacher/student credentials, but they can only create their own account and keep saved data in the downloaded desktop app.
- Demo-account state is ephemeral: sample teacher/student changes are not written to the normal persistence path, demo-owned state is stripped before storage, and a top demo banner reminds users to download the app to save data.
- `public/classloop-downloads.json` points the landing-page download controls at external desktop installer hosts when packaging is ready. Keep installer binaries out of Vercel Blob so Vercel only handles the web/PWA shell and APIs. Until external installer links are ready, the page tells visitors to use the web demo.
- `/api/config` now returns a safe config version plus hosted backend booleans. If live Vercel still returns `stripeSchoolConfigured`, the deployed app is stale and must redeploy latest `main`.
- Current active freemium model: Free is 1 generated session per day with Google Classroom, Zoom transcript import, student accounts, and recap email delivery in the free workflow; Pro is `$3.99/month` for unlimited sessions plus private analytics and JSON/CSV/print report exports. School pilot UI/env keys remain removed/deferred.
- Verification passed after landing update: `npm run build`, `npm run test:import`, `npm run test:browser` (14/14), `node -c desktop/main.cjs`, `node --check api/*.js api/billing/*.js`, and `git diff --check -- ':!dist/**'`.

## 2026-05-26 Launch Integration And Completion Update

- Launch framing remains teacher-first: save time after class by turning a transcript, roster, resources, and notes into a teacher-approved recap workflow.
- Google Classroom launch scope:
  - teachers can choose manual roster or one Google Classroom course;
  - Classroom course import brings roster, course metadata, and recent same-course assignments/resources;
  - relevance is keyword match plus recent same-course items, with teacher final approval;
  - Classroom posting is class-wide only: recap, resources, and shared tasks, not personalized follow-ups;
  - teachers edit the exact Classroom post and choose Announcement, Assignment, or Material, with assignment due date defaulting from detected ClassLoop due dates.
- Zoom launch scope:
  - teachers can search transcript-ready cloud meetings by title/date and choose one transcript file when Zoom has multiple files;
  - raw Zoom cloud transcript text is auto-deleted after draft generation;
  - structured recap, tasks, resources, participation, and follow-ups remain.
- Email/sign-in scope:
  - recap emails use a ClassLoop-owned Gmail/SMTP sender when configured;
  - magic link/email-code sign-in should use Supabase/Auth email delivery when configured;
  - teachers can toggle recap email recipients on/off before sending.
- Student launch scope:
  - student dashboard should lead with tasks due soon;
  - student profile editing covers name, email, avatar, and accessibility settings;
  - high contrast follows device/browser settings while background themes are already implemented;
  - student completion supports submitted note/file link, then teacher review/approval.
- Future/deferred:
  - parent/guardian emails are out at launch;
  - live Zoom bot is future work;
  - personalized Classroom posts are out of scope for launch.

## 2026-05-12 Prompt-Free Storage / Routed Landing Update

- ClassLoop desktop state now uses a prompt-free local AES-GCM storage key file (`.classloop-storage-key`) next to `.classloop-data.json` instead of Electron `safeStorage`, avoiding OS password/Keychain prompts while keeping the data file encrypted.
- Public landing navigation is now page-based rather than one long scroll: Home, Features, Screenshots, Docs, Privacy, Support, and Download live at `#/features`, `#/screenshots`, `#/docs`, `#/privacy`, `#/support`, and `#/download`.
- Public funding pages and related environment variables were removed; ClassLoop should route support/help through Support and product feedback instead.
- QA coverage should include prompt-free desktop encrypted state, routed landing pages, platform download fallbacks, and PWA add-to-phone behavior on the Download page.

## 2026-05-18 Launch Stability Classwork Plan

- Local/current-code ClassLoop QA is green through the broad `npm run test:all` gate.
- Public hosted Vercel still needs an explicitly approved deploy of the current project and a fresh `npm run test:web` hosted smoke afterward.
- Rushil asked for daily email and Notion/classwork reminders to get ClassLoop fully live and low-babysitting. Gmail and Notion connectors were not available in this Codex session, so the payload was captured locally for later connector sync.
- Added launch planning artifacts:
  - [docs/classloop-launch-classwork.md](docs/classloop-launch-classwork.md)
  - [docs/classloop-launch-classwork.csv](docs/classloop-launch-classwork.csv)
- Daily plan runs from 2026-05-18 through 2026-06-01 and covers deploy/hosted smoke, legal/signup readiness, package distribution, backend config, support/privacy-safe logging, realistic alpha rehearsal, PWA/mobile, entitlements, state resilience, accessibility, rollback/incident ops, public beta material, and ship/hold review.
- Skill boundary decision: keep this as project CSB/classwork rather than embedding it inside `a03-superpowers`, `a07-product-shipping`, or `a13-comms-schedule`; those skills should stay reusable and point to project artifacts when needed.
- Rushil directly approved the public Vercel deployment. Final production deploy `dpl_DfbzrJq54MMsf7anhc2xLFwpBvKp` completed and is aliased to `https://classloop-followup.vercel.app`.
- Public root now serves fingerprinted assets `/assets/index-CkXZY_H5.js` and `/assets/index-BgBlv9cx.css`; the old fixed `/assets/index-CLI9tec8.js` path returns 404.
- Hosted smoke passed after deploy: `npm run test:web` (4/4), and local web/PWA smoke also passed: `npm run test:web:local` (4/4).
- Fixed the hosted screenshot route smoke race by waiting for screenshot images to finish loading and expose intrinsic dimensions before asserting them.

## 2026-05-19 Founder-Authored Legal Terms

- Replaced the short ClassLoop legal baseline with founder-authored launch language in `LEGAL.md`.
- Public routes now expose fuller Terms of Use, Privacy Policy, Desktop EULA, and Support/retention/child-safety language instead of placeholder-style "before polish" copy.
- Core policy stance: hosted public demo remains sample-only; durable hosted public signups with real student data stay gated until attorney/district review, school data terms, and hosted retention/deletion SLAs are ready.
- Legal/privacy copy now explicitly covers teacher review responsibility, non-gradebook/emergency boundaries, acceptable use, content permissions, local AES-GCM desktop storage, hosted sync processors, no-training posture, support data minimization, unsigned desktop installers, manual updates, COPPA/FERPA/PPRA-aware school setup, and no unsupervised child public accounts.
- Verification passed: `npm run build`, `npm run test:security`, `npm run test:web:local`, and `git diff --check`.

## 2026-05-18 Public Installer / Legal / Feedback QA Update

- Public landing routes now include Terms, EULA, and Support in addition to Home, Features, Screenshots, Docs, Privacy, and Download.
- Download and Support pages include an installer feedback form for clean-machine failures, OS blocking, checksum mismatch, checkout issues, and cloud sync problems. The form posts to `/api/feedback` with installer metadata and should notify the creator when feedback SMTP/Gmail env vars are configured.
- `public/classloop-downloads.json` should point to GitHub Release URLs for macOS DMGs/ZIPs, Windows EXE/ZIPs, Linux AppImages, and `SHA256SUMS.txt`. Keep release binaries out of Vercel Blob.
- QA prompt update: when testing public release readiness, verify `#/download`, `#/support`, `#/terms`, `#/privacy`, and `#/eula` across desktop and phone widths; submit a mocked installer feedback report; confirm Vercel Blob URLs remain blocked; confirm missing URLs stay `Packaging pending`; confirm legal copy is treated as a launch baseline pending final legal review.
