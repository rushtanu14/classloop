# Individual Meeting Minutes Design

## Goal

Add a new Individual account path inside ClassLoop for personal meeting minutes. Individual users paste meeting minutes, generate a personal meeting draft, edit their recap/tasks, and track their own follow-through for free.

## Recommended Approach

Use two top-level account paths: Individual and Class. Under Class, ask whether the user is a Teacher or Student. This keeps the public mental model simple while preserving the classroom roles that already exist.

Build Individual work on a separate `PersonalMeeting` model instead of reusing classroom `Session`. This avoids classroom fields leaking into personal mode and lets the UI trim rosters, attendance, participation matching, student previews, publish flow, class analytics, live capture, and template selection.

Rejected alternatives:

- Make Teacher, Student, and Individual three equal login tabs. This makes the first choice too busy and conflicts with the desired Individual vs Class split.
- Reuse classroom `Session` with mode flags. This would be faster initially but would spread conditionals through import, review, publish, analytics, and student email logic.
- Create a separate product name for personal mode. ClassLoop remains the product; the mode can be labeled Personal meetings.

## Account Flow

The login and account creation screen should first ask:

- Individual
- Class

If the user chooses Class, the next choice is:

- Teacher
- Student

Individual accounts land on a Personal Dashboard. Class teacher accounts keep the current teacher dashboard. Class student accounts keep the current student portal.

Hosted demo boundaries stay conservative: public hosted demo may show sample-only behavior, while durable real account creation remains controlled by the existing hosted/legal gate.

## Individual V1 Scope

Individual V1 includes:

- Personal Dashboard.
- New personal meeting intake.
- Paste-only meeting minutes.
- One generate action.
- Owner-only recap.
- Owner-only personal tasks.
- Editable task statuses.
- Editable due-date text field near each task.
- Free access to all Individual V1 features.

Individual V1 excludes:

- Classroom template chooser.
- Roster manager.
- Class groups.
- Student portal.
- Publish-to-students.
- Attendance.
- Participation matching.
- Per-student previews.
- Classroom analytics.
- Live capture.
- Audio capture.
- File upload.
- Zoom import.
- External meeting integrations.
- Notifications, calendar reminders, or background scheduling.

## Personal Meeting Model

Create a new `PersonalMeeting` domain model with fields for:

- `id`
- `ownerEmail`
- `title`
- `date`
- `minutes`
- `context`
- `recap`
- `resources`
- `questions`
- `tasks`
- `createdAt`
- `updatedAt`

Personal tasks should include:

- `id`
- `title`
- `status`
- `dueDateText`
- `source`

Task status should use exactly three personal states in V1: `todo`, `in_progress`, and `complete`. Individual mode does not use teacher review or submission semantics.

## Personal Generation

Personal generation should parse pasted minutes into:

- Short recap.
- Resources found in the text.
- Questions found in the text.
- Tasks inferred from action language and due-date language.
- Due-date text when obvious.

The parser can reuse safe utility code from `src/data.ts`, but the public API should be separate from `createGeneratedSession()` so personal generation does not require a roster, session template, attendance, or student follow-ups.

## Templates

Show a Google Docs template copy link directly under each generate action:

- Class import flow: class meeting template below the class `Generate draft` action.
- Individual flow: personal meeting template below the personal generate action.

Personal template source fields:

- Meeting title
- Date
- Context
- Resources
- Questions
- Due dates

Template URLs should come from configurable app data, not hardcoded UI text. Use a tiny public manifest at `public/classloop-template-links.json` with keys for class and personal copy URLs. If a URL is missing, show clear fallback copy that says the template link is not connected yet.

The template links should point to Rushil-owned Google Docs source documents using Google Docs copy links. Rushil edits the source Google Doc directly. Users receive their own copy and should not get edit access to the source document.

## Billing

Individual V1 is free for all personal meeting features. It should not consume the Class Account free daily generation limit and should not require Pro.

Class Account billing remains unchanged. Existing Free/Pro limits continue to apply to teacher/classroom workflows.

## Student Email Guardrail

ClassLoop should not synthesize placeholder student emails when only a student name is known. Name-only students should have blank email fields until an email is imported from a roster/source system or manually entered by the teacher.

Student account linking should require an actual email match, not a name-only match.

This guardrail is required for the class flow even though Individual mode does not use rosters.

## Navigation And UI

Individual sidebar should be trimmed to personal work:

- Personal Dashboard
- New personal meeting
- Personal meetings or meeting history
- Appearance

Class teacher sidebar keeps classroom features. Class student sidebar keeps portal features.

The Personal Dashboard should feel like a focused version of the teacher workflow: less classroom management, more personal recap and task follow-through.

## Testing

Add or update tests for:

- Login/account creation top-level split: Individual vs Class, then Teacher/Student under Class.
- Individual account lands on Personal Dashboard.
- Individual V1 can generate a personal meeting from pasted minutes without classroom templates.
- Individual task statuses and due-date text persist.
- Individual features are free and do not trigger the Class Account daily generation limit.
- Class teacher generation limit still works as before.
- Class template link appears under class Generate draft.
- Personal template link appears under personal generate.
- Missing template URL shows a not-connected fallback.
- Name-only roster students keep blank emails.
- Student account matching/linking does not match by name-only student records.

Run at minimum:

- `npm run build`
- `npm run test:import`
- focused browser tests for login, Individual flow, and class import template placement
- `git diff --check`

## Open Implementation Notes

Several branch-local files already contain exploratory changes unrelated to this spec. Implementation should first reconcile or isolate those changes, then proceed with small commits. Avoid mixing Individual mode work with the already-pushed billing entitlement hardening.
