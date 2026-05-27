# ClassLoop Context

ClassLoop is a classroom continuity product that turns class records into teacher-reviewed follow-up for students.

## Language

**Class Artifact**:
A teacher-provided class record such as a transcript, notes, roster, task list, or resource link.
_Avoid_: Data dump, raw file

**Redacted Real-Class Data**:
Class artifacts based on an actual class, with student-identifying details replaced before use in ClassLoop validation.
_Avoid_: Raw student data, private roster

**Solo Simulation**:
A validation pass where Rushil plays the teacher/operator role and tests ClassLoop against realistic class artifacts without recruiting outside testers.
_Avoid_: Teacher alpha, beta test

**Teacher Alpha**:
A later real-user research milestone where outside teachers try ClassLoop and provide usability/support feedback.
_Avoid_: Solo simulation, launch-readiness gate

**Sample Workspace**:
The sample-only hosted environment where visitors can explore teacher and student flows without creating durable accounts or saved class data.
_Avoid_: Hosted demo workspace, demo account, public signup

**Sample Publication**:
A temporary published session inside the Sample Workspace that proves the student-facing workflow without real delivery or durable persistence.
_Avoid_: Real delivery, durable publish

**Memory-Only Sample State**:
Visitor-created Sample Workspace data that exists only for the current browser runtime and is cleared on reload, sign-out, or tab close.
_Avoid_: Demo persistence, saved sample account data, hidden localStorage

**Clean-Host Release Validation**:
First-run validation on the actual target operating system and architecture before that installer is treated as public-ready.
_Avoid_: Build artifact check, package exists, local-only smoke

**Detected Installer**:
The installer ClassLoop recommends from the public download page based on the visitor's current operating system.
_Avoid_: Default macOS download, guessed platform

**Browser Hint Detection**:
Non-permission browser platform hints used to choose a Detected Installer.
_Avoid_: Fingerprinting, permission prompt, device scan

**Install Fallback**:
The non-desktop path shown when ClassLoop cannot confidently detect the visitor's operating system for a desktop installer.
_Avoid_: Fake desktop default, macOS guess

**Installer Choice List**:
The fallback list of desktop operating-system installers shown when a visitor says the detected installer is not their system.
_Avoid_: Web/PWA option list, hidden downloads, advanced downloads

**Desktop Installer Escape Hatch**:
A clear secondary option from mobile, tablet, or ambiguous install flows that opens the Installer Choice List for visitors who want to download ClassLoop for another computer.
_Avoid_: Forced desktop download, hidden alternate installers

**Web/PWA Entry Point**:
The browser and add-to-phone path shown near the public landing hero, separate from desktop installer choices.
_Avoid_: Installer choice, desktop download

**No Device Credential Prompt**:
A ClassLoop product rule that app flows must not ask for a device password, OS password, fingerprint, or biometric credential.
_Avoid_: Keychain prompt, safeStorage prompt, Touch ID prompt, OS password prompt

**Celebration Moment**:
A short, reduced-motion-aware success animation tied to a completed workflow milestone.
_Avoid_: Idle spectacle, distracting loop, false success animation

**Microinteraction Polish**:
Small hover, focus, and pointer-follow motion that makes controls feel responsive without changing layout or meaning.
_Avoid_: Constant gleam, layout shift, inaccessible motion, disabled-control animation

**CS4ALL/Scratch Club Session**:
A recurring Monday learning session Rushil runs, suitable as the first real-class shape for ClassLoop validation.
_Avoid_: Generic demo class

**Student Feedback Popup**:
A student-facing rating prompt for ClassLoop product usefulness that asks for improvement notes when the score is low.
_Avoid_: Public rating, grade, generic survey

**Creator Product Feedback**:
Student feedback routed to Rushil/the ClassLoop creator for product improvements, not to the teacher's classroom analytics.
_Avoid_: Teacher action item, grade signal, student-visible ranking

**Transcript-Attached Product Feedback**:
Creator product feedback that stores the student's rating, optional improvement note, app/version/context metadata, timestamp, and the relevant session transcript so Rushil/the ClassLoop creator can diagnose product quality.
_Avoid_: Teacher-visible rating, classroom analytics, grade signal, transcript-free support context

**Completion-Triggered Feedback**:
Student feedback requested only after the student marks a follow-up complete.
_Avoid_: First-load feedback, pre-read rating

**Non-Blocking Feedback Prompt**:
An optional feedback prompt shown after a successful workflow state change without blocking, reverting, or delaying that state.
_Avoid_: Completion gate, required survey, progress rollback

**Low Product Feedback**:
A low ClassLoop usefulness rating that asks what would make the product better and posts that note to the creator feedback endpoint.
_Avoid_: Teacher action queue, classroom intervention, public complaint

**Server-Owned Entitlement**:
Paid ClassLoop access determined by hosted Stripe webhook state stored in Supabase, not by client-side UI state.
_Avoid_: Local Pro switch, client-owned plan, manual paid flag

**Local Testing Upgrade**:
A device-only Pro toggle used to test locked ClassLoop features when hosted Supabase or Stripe is not configured.
_Avoid_: Paid subscription, live billing, server entitlement

**Live Stripe Cutover**:
The production transition where ClassLoop uses activated live Stripe account details, live product and price IDs, live webhook signing secret, production Vercel environment variables, and a real low-risk checkout verification.
_Avoid_: Sandbox checkout, copied test price, local-only billing test

**Individual Account**:
A non-teacher personal ClassLoop account for turning the account owner's pasted meeting minutes into their own recap and tasks.
_Avoid_: Student account, teacher account, public classroom signup

**Class Account**:
A classroom-focused ClassLoop account path that contains Teacher and Student roles under one class-oriented entry point.
_Avoid_: Individual account, three equal login tabs

**Personal Meetings Mode**:
The Individual Account area inside ClassLoop for personal meeting recap and task workflows.
_Avoid_: Separate product name, rebrand, Personal Loop

**Personal Meeting Record**:
Meeting minutes or notes pasted by an Individual Account owner for their own follow-up, without a roster, student dashboards, publishing, or class analytics.
_Avoid_: Class artifact, student follow-up, classroom publication

**Personal Meeting**:
A separate Individual Account record built from pasted meeting minutes into an owner-only recap, decisions, and personal tasks.
_Avoid_: Classroom Session, session template, class record

**Personal Meeting Template**:
The copyable meeting-minutes structure for Individual Accounts with only meeting title, date, context, resources, questions, and due dates.
_Avoid_: Classroom template, roster template, teacher notes template

**Class Meeting Template**:
The copyable Google Docs-style template shown in the Class Account import flow to help teachers provide the class-specific details ClassLoop needs.
_Avoid_: Personal meeting template, generic meeting-minutes template

**Google Docs Template Copy Link**:
A public viewer/copy URL for a Rushil-owned Google Doc template, where Rushil can edit the source doc and users make their own copy before filling it out.
_Avoid_: Static in-app-only template, user-editable source doc, unauthenticated write access

**Template Link Config**:
Configurable ClassLoop template URLs, preferably env-backed or loaded from a tiny public manifest, so Rushil can change Google Docs copy links without changing app logic.
_Avoid_: Hardcoded public template URL, broken fake template button

**Owner-Editable Template Source**:
The Rushil-owned source Google Doc behind a template copy link. Editing this source doc changes what future users copy, without requiring a ClassLoop code change.
_Avoid_: App-only hardcoded template text, public users editing the source doc

**Free Individual Mode**:
Individual Account access where all V1 personal meeting features are free and not gated by ClassLoop Pro.
_Avoid_: Pro-gated personal meeting generation, shared classroom free-limit counter

**Personal Task Due Date**:
A lightweight editable text field next to a personal task status, used to record when the owner thinks the task is due.
_Avoid_: Notification reminder, calendar integration, scheduled automation

**Personal Dashboard**:
The Individual Account home surface for the owner's meeting recaps, personal tasks, and follow-through status.
_Avoid_: Teacher dashboard, student portal, class analytics

**Student Contact Email**:
A student email address that was imported from a roster/source system or manually entered by the teacher.
_Avoid_: Generated placeholder email, name-only account link

## Relationships

- A **Class Artifact** may be synthetic or may come from **Redacted Real-Class Data**.
- **Redacted Real-Class Data** is made from one or more **Class Artifacts**.
- A **Solo Simulation** may use **Redacted Real-Class Data**.
- The first planned **Solo Simulation** uses a **CS4ALL/Scratch Club Session** as its real-class shape.
- A **Teacher Alpha** happens after the launch-readiness **Solo Simulation** and requires outside teacher participation.
- A **Sample Workspace** may allow temporary session creation and **Sample Publication**, but visitor-created class data must be **Memory-Only Sample State**.
- **Memory-Only Sample State** must not be written to localStorage, Supabase, cookies, telemetry payloads, or analytics. Seeded static sample data may reload because it is product demo content, not visitor-created class data.
- **Clean-Host Release Validation** applies per installer target; one passing target does not certify other operating systems or architectures.
- A **Detected Installer** is chosen with **Browser Hint Detection** only.
- A public download page shows one **Detected Installer** first when **Browser Hint Detection** is confident; otherwise it shows the **Install Fallback**.
- Mobile, tablet, ChromeOS, and ambiguous platforms should see the **Web/PWA Entry Point** or **Install Fallback** first, not a guessed desktop installer.
- The **Installer Choice List** is revealed when the visitor says the detected installer is not their system or uses the **Desktop Installer Escape Hatch**.
- The **Web/PWA Entry Point** belongs near the landing hero, not inside the desktop installer section.
- ClassLoop app flows follow **No Device Credential Prompt**; install detection and local storage must not request device passwords, fingerprints, biometric credentials, Keychain prompts, or Electron safeStorage prompts.
- **Celebration Moment** applies to teacher new-session draft creation, teacher publish success, and student completion check-in.
- The student completion **Celebration Moment** fires when the student submits or marks the full follow-up complete, not on every individual task checkbox. Individual task changes may use small **Microinteraction Polish** only.
- A **Celebration Moment** fires only after the underlying state change succeeds. Reduced-motion users should get a quieter success state instead of confetti or cursor-following motion.
- **Microinteraction Polish** may appear across the site and app, but disabled or loading controls must not animate, and hover effects must not cause layout shift.
- A **Student Feedback Popup** records **Creator Product Feedback** for Rushil/the ClassLoop creator.
- **Creator Product Feedback** must not appear in teacher analytics, classroom records, grades, or named teacher-visible student reports.
- **Creator Product Feedback** is **Transcript-Attached Product Feedback**: it stores the feedback response with the relevant session transcript for creator-side product improvement and debugging.
- **Transcript-Attached Product Feedback** may include transcript text and transcript-derived class context, but should not add separate roster exports, student emails, teacher emails, grades, or non-transcript class artifacts unless a later support/export flow explicitly asks for them.
- The **Student Feedback Popup** should clearly communicate that the feedback, including the related transcript context, goes to ClassLoop/the creator for product improvement and is not sent to the teacher.
- ClassLoop uses **Completion-Triggered Feedback** so usefulness ratings happen after the student has acted on the follow-up.
- Completion state is primary: after a full student completion check-in, ClassLoop should save/commit completion, show success or a **Celebration Moment**, then optionally show a **Non-Blocking Feedback Prompt**.
- A **Non-Blocking Feedback Prompt** must not prevent completion, undo progress, or make feedback required.
- Low **Creator Product Feedback** becomes **Low Product Feedback** and is routed to the product feedback endpoint, not teacher analytics.
- Real paid access must be a **Server-Owned Entitlement**. A **Local Testing Upgrade** can unlock Pro controls on one device for validation, but it must not be treated as live billing or durable paid access.
- A **Live Stripe Cutover** requires an activated live Stripe account, live `ClassLoop Pro` product and recurring price, production Vercel Supabase and Stripe environment variables, a live webhook endpoint, and one verified low-risk live checkout/portal cycle.
- The **Sample Workspace** must not create a **Server-Owned Entitlement** or start a **Live Stripe Cutover**.
- An **Individual Account** uses **Personal Meeting Records** for the owner only. The V1 flow is paste-only meeting minutes to a personal recap and tasks; it does not include rosters, student portals, publish-to-others, or class analytics.
- The login/signup choice should be two top-level paths: **Individual Account** and **Class Account**. The **Class Account** path then asks whether the person is a Teacher or Student.
- An **Individual Account** should land on a **Personal Dashboard**. It can reuse teacher-like draft/review mechanics, but it should remove classroom-specific surfaces and focus on the owner's own meetings and tasks.
- The product name remains ClassLoop. Individual surfaces may be labeled **Personal Meetings Mode**, but they should not introduce a separate product or brand name.
- A **Student Contact Email** must stay blank when ClassLoop only has a student's name. ClassLoop should not synthesize placeholder emails or link an account to a student by name alone; email linkage requires import data or manual teacher entry.
- A **Personal Meeting** is separate from a classroom `Session`. It should not show classroom template options; Individual V1 has one paste-only intake path: paste meeting minutes, generate a personal draft, review recap/tasks, and track the owner's own follow-through.
- Individual V1 should trim classroom features by default: no roster manager, class groups, student portal, publish-to-students, attendance, participation matching, per-student previews, classroom analytics, or classroom template chooser.
- Individual V1 should not include live capture, audio capture, file upload, Zoom import, or external meeting integrations until the paste-only personal workflow is proven.
- The **Personal Meeting Template** should ask only for: Meeting title, Date, Context, Resources, Questions, and Due dates. Personal tasks are generated from the pasted minutes/template content rather than entered as a separate required field.
- The class import flow should show the **Class Meeting Template** directly under the class `Generate draft` action. The Individual flow should show the **Personal Meeting Template** directly under the personal generate action.
- Both template CTAs should use **Google Docs Template Copy Links**. Rushil owns and edits the source Google Docs; public users should only receive copy links that create their own copy, not edit access to the source template.
- Google Docs template URLs should come from **Template Link Config**. If a template URL is missing, ClassLoop should say the template link is not connected yet instead of showing a broken or pretend copy link.
- Each **Google Docs Template Copy Link** should point to an **Owner-Editable Template Source**. Rushil should be able to edit the source Google Doc content directly; users should get copies of the current source content.
- Individual Account features in V1 are **Free Individual Mode**: paste personal meeting minutes, generate personal drafts, review/edit recaps and tasks, and track completion should all be free.
- **Free Individual Mode** should not change Class Account billing. Class Account Free/Pro limits remain intact; only Individual V1 bypasses generation limits and Pro gating.
- Personal Meeting tasks should use simple editable statuses plus a nearby **Personal Task Due Date** text box. Individual V1 should not add notifications, calendar reminders, or background scheduling.

## Example dialogue

> **Dev:** "Should the launch-readiness PRD require a teacher alpha before installers go public?"
> **Domain expert:** "No. The launch-readiness gate is a **Solo Simulation** with **Redacted Real-Class Data**. A **Teacher Alpha** is useful later, but it is not this PRD's required validation step."

> **Dev:** "Can the web demo save the sample teacher's published session?"
> **Domain expert:** "Only as a **Sample Publication** inside the current **Sample Workspace** interaction. It should disappear after reload or sign-out."

> **Dev:** "Can a visitor-created session in the Sample Workspace survive reload or sync to Supabase?"
> **Domain expert:** "No. It is **Memory-Only Sample State**. Reload, sign-out, or closing the tab clears it; static seeded samples may load again."

> **Dev:** "Can we publish Windows downloads after macOS arm64 passes locally?"
> **Domain expert:** "No. Each installer needs **Clean-Host Release Validation** on its own target."

> **Dev:** "Should the download page show macOS first for everyone?"
> **Domain expert:** "No. Show the **Detected Installer** first, with a small 'Not your system?' control that opens the **Installer Choice List**."

> **Dev:** "What if ClassLoop cannot tell what system the visitor uses?"
> **Domain expert:** "Show the **Install Fallback** first. Do not guess macOS or any desktop installer."

> **Dev:** "What if the visitor is on mobile, tablet, ChromeOS, or an unknown platform but wants the desktop app for another computer?"
> **Domain expert:** "Show the **Web/PWA Entry Point** or **Install Fallback** first, but include a clear **Desktop Installer Escape Hatch** that opens the **Installer Choice List**."

> **Dev:** "Can ClassLoop ask permission or fingerprint the browser to detect the installer?"
> **Domain expert:** "No. Use **Browser Hint Detection** only, and follow **No Device Credential Prompt**."

> **Dev:** "Can desktop storage use OS secure storage if it asks for Keychain or a password?"
> **Domain expert:** "No. **No Device Credential Prompt** also bans Keychain and Electron safeStorage prompts."

> **Dev:** "Should the installer section include the web/PWA path?"
> **Domain expert:** "No. Keep the **Installer Choice List** focused on desktop installers. Put the **Web/PWA Entry Point** near the hero."

> **Dev:** "Where should ClassLoop use confetti?"
> **Domain expert:** "Use a **Celebration Moment** for teacher new-session draft creation, teacher publish success, and student completion check-in. Respect reduced motion and never animate false success."

> **Dev:** "Should every student task checkbox trigger confetti?"
> **Domain expert:** "No. Save confetti for the full completion check-in. Individual task checkboxes can get small **Microinteraction Polish**."

> **Dev:** "Can buttons have hover shine and cursor-following motion?"
> **Domain expert:** "Yes, as **Microinteraction Polish**, as long as it avoids layout shift, respects reduced motion, and stays off disabled or loading controls."

> **Dev:** "When should ClassLoop ask students to rate a follow-up?"
> **Domain expert:** "After they mark it complete. The feedback is **Creator Product Feedback** for improving ClassLoop, not teacher-visible classroom data."

> **Dev:** "Should teachers see named ratings from the student completion feedback popup?"
> **Domain expert:** "No. That popup routes to ClassLoop product feedback for the creator. Teacher-visible classroom feedback would need a separate feature."

> **Dev:** "What data should product feedback store?"
> **Domain expert:** "Use **Transcript-Attached Product Feedback**: store the rating, optional improvement note, app/version/context metadata, timestamp, and relevant transcript. It goes to the ClassLoop creator, not the teacher."

> **Dev:** "Should the feedback popup block student completion?"
> **Domain expert:** "No. Commit completion and show success/confetti first. Then show an optional **Non-Blocking Feedback Prompt**."

> **Dev:** "What should happen when a student says the follow-up was not useful?"
> **Domain expert:** "Treat it as **Low Product Feedback**: ask what would make ClassLoop better and send that to the creator feedback endpoint."

## Flagged ambiguities

- "Teacher alpha" was used for both solo validation and outside-teacher research. Resolved: **Solo Simulation** is the required launch-readiness validation path; **Teacher Alpha** is a later optional real-user research milestone.
- "Hosted demo workspace", "demo account", "web demo", and "sample workspace" were used for the same hosted sample-only environment. Resolved: use **Sample Workspace** for the non-durable public demo boundary.
- "Publish" in a **Sample Workspace** was ambiguous. Resolved: use **Sample Publication** for temporary demo publishing; it proves the student-facing workflow without real delivery or durable persistence.
- "Not saved" was ambiguous. Resolved: visitor-created Sample Workspace data is **Memory-Only Sample State** and must not write to localStorage, Supabase, cookies, telemetry payloads, or analytics.
- "Installer verified" was ambiguous. Resolved: use **Clean-Host Release Validation** for per-OS/per-architecture launch proof, not build artifact presence.
- "Download" was too broad for the website install flow. Resolved: public page should show one **Detected Installer** when confident, show **Install Fallback** when not confident, reveal the desktop-only **Installer Choice List** through "Not your system?", and keep the **Web/PWA Entry Point** near the hero.
- "Auto-detect" was ambiguous. Resolved: use **Browser Hint Detection** only; no fingerprinting, permission prompts, or device scans.
- "Mobile download" was ambiguous. Resolved: mobile/tablet/ChromeOS/unknown should get Web/PWA or fallback first, with a clear **Desktop Installer Escape Hatch** for downloading desktop installers manually.
- "No prompts" includes **No Device Credential Prompt**: ClassLoop app flows must not ask for device password, OS password, fingerprint, biometric credential, Keychain access, or Electron safeStorage prompts.
- "Confetti" was too broad. Resolved: confetti is a **Celebration Moment** for teacher new-session draft creation, teacher publish success, and student completion check-in only after state succeeds.
- "Student completion check-in" means completing/submitting the full follow-up, not every individual task checkbox.
- "Interactive buttons" means **Microinteraction Polish**: hover/focus/pointer response that respects reduced motion, avoids layout shift, and does not animate disabled/loading controls.
- "Feedback" means **Creator Product Feedback** from a **Student Feedback Popup**, not teacher-facing classroom analytics.
- "Student rating" in the completion popup is not teacher-visible or part of classroom records unless a separate classroom-feedback feature is created later.
- "Useful feedback data" means **Transcript-Attached Product Feedback**: include the relevant transcript with the product feedback so the creator can understand what went wrong or right.
- Feedback timing is **Completion-Triggered Feedback**, not first-load or detail-open feedback.
- Feedback prompting is non-blocking: student completion must save before the optional feedback prompt appears, and dismissing/skipping feedback must not affect progress.
- Low feedback is product-actionable: it should ask for an improvement note and route to Rushil/the creator, not appear in the teacher action queue.
