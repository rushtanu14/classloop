# ClassLoop Growth Kit

Last updated: 2026-06-07

This is the lightweight bridge from "ClassLoop works" to "teachers understand it, try it, and tell us what is missing." It keeps the product north star, business model, launch path, and first promo assets in one place.

## North Star

ClassLoop should be broadly understandable and teacher-specific in depth: a follow-through workspace for classes, tutoring, clubs, workshops, personal meetings, and student next steps, with the strongest workflow built for teachers.

The promise is simple:

> Turn messy session inputs into clear follow-through, with a teacher-first workflow for student-ready class next steps.

ClassLoop should help people turn transcripts, notes, links, questions, and due dates into usable next steps. For teachers, it should remember, draft, route, review, publish, remind, and track without making the workflow feel like another LMS chore.

## Product Positioning

- Not an AI note taker: a classroom continuity assistant.
- Not a grading or surveillance product: private support signals, teacher review, and student-specific next steps.
- Not a generic productivity app: built around transcripts, rosters, resources, student dashboards, and after-class follow-up.
- Broad enough for teachers, tutors, club leads, workshops, students reviewing their own work, and personal meeting notes.
- Specific enough that a teacher immediately sees the "after class" job it removes.

## Granola-Inspired Model

Snapshot checked 2026-06-01 from Granola's public pricing and help pages:

- Basic is free and gives core value with limited history.
- Business is priced per user monthly and unlocks unlimited history, advanced models, integrations, API/MCP-style access, and centralized billing.
- Enterprise starts higher and adds security, SSO, admin controls, priority support, usage analytics, auto-deletion, sharing controls, and org-wide model-training opt-out.
- Billing is predictable per seat/workspace rather than metered by meeting minutes.

ClassLoop adaptation:

- Free: enough value for a teacher to trust the workflow, including sample demo, transcript import, roster import, student preview, and a daily/session limit.
- Teacher Pro: low-cost individual plan for unlimited sessions, saved classes, live in-person/online capture, reports/exports, delivery logs, advanced analytics, and richer assistant features. Current target remains `$3.99/month`; multi-device cloud sync belongs to Free when Supabase is configured.
- School/team later: per-teacher or per-seat plan with admin controls, SSO, retention controls, audit/export, district-ready support, and stricter privacy/legal review.
- Avoid per-minute pricing early. Teachers should not feel punished for long classes or messy transcripts.
- Make the upgrade moment value-based: "I need this every week and want history, exports, delivery proof, and less manual cleanup."

Sources:

- Granola pricing: https://www.granola.ai/pricing
- Granola billing docs: https://docs.granola.ai/help-center/managing-your-account/subscriptions-and-billing
- Granola team-pricing explainer: https://www.granola.ai/blog/granola-pricing-teams-per-user-enterprise

## ClassLoop Business Plan

### Initial Customer

Start with individual teachers, tutors, club advisors, and workshop leads who already have a transcript, notes, roster, or resource list after class.

The first buying trigger is not "AI notes." It is:

> I already taught the class, and I do not want to spend another 20 minutes turning what happened into student-specific next steps.

### Plan Ladder

| Plan | Buyer | Promise | Limit or Gate |
| --- | --- | --- | --- |
| Free | Teacher trying it once or weekly-light user | Real transcript-to-follow-up value with local desktop storage | 1 generated session per day; live capture and advanced repeat-use layers locked |
| Teacher Pro | Teacher who uses ClassLoop every week | Unlimited sessions, live capture, delivery proof, analytics, and exports | Requires Stripe-verified entitlement; no local/client unlock |
| School/team pilot | Department, tutoring center, or school admin | Shared governance, retention, audit/export, support, and admin policy | Only after reviewed legal, privacy, support, and hosted data agreements |

### Conversion Moments

- Teacher hits the Free daily session cap during a real week.
- Teacher wants to reuse saved classes and reports across multiple sessions.
- Teacher needs delivery proof, completion history, or exports for follow-up.
- Teacher wants live in-person/online capture after trusting transcript import.
- Teacher wants the same workspace on desktop, browser, and phone.

### Launch Metrics

- Activation: teacher reaches publish preview with a realistic or anonymized session.
- Trust: teacher can explain what each student will see and what stayed private.
- Quality: recap accuracy, task accuracy, student usefulness, resource usefulness, and overall trust ratings.
- Support burden: number of times Rushil had to explain import, matching, publish, install, checkout, or sync.
- Retention signal: teacher asks to use another transcript or saved class.

### School-Ready Requirements

- Reviewed Terms, Privacy, EULA, retention/deletion SLA, and pilot agreement.
- Admin-owned workspace transfer, export/delete, SSO, audit logs, and policy controls.
- Clear distinction between local desktop data, hosted sample demo data, and hosted pilot data.
- Privacy-safe support logging and no raw student records in routine support tickets.
- Clean-host installer evidence and live Stripe/Supabase proof before charging broadly.

## Launch Path

### 1. Teacher Beta Proof

Goal: prove teachers can import a real or anonymized session, reach publish preview, and say whether the output saves time.

Needed evidence:

- 3 to 5 teacher/tutor tests.
- Redacted examples of bad matches, confusing copy, or missing follow-up actions.
- Ratings for recap accuracy, task accuracy, student usefulness, and trust.
- One support-burden note per test: what Rushil had to explain.

### 2. Public Try-It Path

Goal: make ClassLoop feel like Relay: deployed, easy to try, easy to explain, and not dependent on local setup.

Keep:

- Live hosted demo with sample accounts.
- Download page with real platform status and checksums.
- Web/PWA path for quick mobile inspection.
- Desktop path for real classroom data.
- Clear support page, demo-only sample boundary, and cloud-backed signup wording when Supabase is configured.

### 3. Assistant Loop

Goal: move from "generate a session" to "ClassLoop keeps track of what needs attention."

Product slices:

- Today view: classes needing follow-up, overdue student check-ins, unpublished drafts, and recent completions.
- Review queue: unmatched speakers, risky inferred tasks, missing emails, duplicate students, and private/direct-message warnings.
- Follow-up composer: drafts student messages and teacher summaries from approved session data.
- Reminder engine: "students who have not completed X by date Y" with teacher-approved send/copy actions.
- Feedback inbox: student usefulness ratings and teacher notes routed to Rushil/product feedback, not exposed as classroom judgment.

### 4. School-Ready Layer

Goal: sell or pilot without hand-waving around privacy.

Later requirements:

- Reviewed Terms, Privacy, EULA, deletion/retention SLA, and pilot agreement.
- Admin controls, roster ownership, workspace transfer, audit logs, export/delete, and SSO.
- Clear boundary between local desktop data, hosted demo data, and hosted pilot data.

## First Channel Strategy

Do not start with polished ads. Start with small proof videos that show the transformation.

Cadence:

- 2 short videos per week.
- 1 slightly longer walkthrough or slide-style post every other week.
- Every post should show either the messy input, the cleaned teacher view, or the student follow-up.

Content rule:

- Hook with teacher pain.
- Show the product doing the boring work.
- End with a low-friction ask: try the demo, ask for beta testers, or comment with a workflow.

## First 10 Short-Form Scripts

### 1. Messy Transcript To Student Follow-Ups

Hook: "Teachers should not have to turn a Zoom transcript into 30 separate reminders."

Screen: Paste transcript and roster, then show generated teacher review and one student preview.

Narration: "ClassLoop reads the class record, finds tasks and resources, matches students, and gives the teacher an editable follow-up before anything is published."

CTA: "Want to test this with an anonymized class?"

### 2. The After-Class Cleanup Problem

Hook: "The class ends, but the teacher work does not."

Screen: Notes, links, transcript, roster, then ClassLoop recap/tasks/resources.

Narration: "ClassLoop is for the 15 minutes after class when you know what happened but still have to make it usable for students."

CTA: "Trying this with teachers now."

### 3. Quiet Students Without Public Ranking

Hook: "Participation tools should not shame students."

Screen: Private teacher analytics and support cues.

Narration: "ClassLoop keeps participation signals private, editable, and focused on who may need support next."

CTA: "Would this help in your classroom?"

### 4. Student View

Hook: "What if every student got the version of class follow-up that mattered to them?"

Screen: Student dashboard with recap, tasks, resources, due date, and completion check-in.

Narration: "Students do not need the teacher's full analytics view. They need what happened, what they owe, and what helps."

CTA: "This is the student side of ClassLoop."

### 5. Tutor / Small Group Use

Hook: "This is not only for big classrooms."

Screen: Smaller roster and tutoring notes.

Narration: "A tutor can paste notes, resources, and a few students, then send each person a clear next step."

CTA: "Tutors are probably the easiest first beta users."

### 6. Club Meeting Mode

Hook: "Club meetings create follow-up chaos too."

Screen: Club/study-group template and action items.

Narration: "ClassLoop can turn a meeting record into tasks, resources, and owner-friendly follow-up without needing a full LMS."

CTA: "Built from the same engine as the classroom workflow."

### 7. Teacher Review First

Hook: "The AI should draft. The teacher should approve."

Screen: Edit recap, approve participation, publish preview.

Narration: "ClassLoop does not skip the teacher. It makes the draft reviewable before students see anything."

CTA: "That is the trust boundary."

### 8. Free-First Desktop Path

Hook: "Real classroom data should not be forced into a hosted demo."

Screen: Download page, desktop app, demo-only web route, and cloud-backed account flow.

Narration: "The demo-only route is sample-only. For real class artifacts, ClassLoop can use cloud-backed accounts when Supabase is configured, while school-scale hosted use still needs retention and support review."

CTA: "Try the demo first; use desktop for real data."

### 9. Before / After Screenshot

Hook: "Before: transcript soup. After: student next steps."

Screen: Split before/after.

Narration: "The whole product is this transformation: messy class memory into something students can act on."

CTA: "This is the demo moment."

### 10. Build-In-Public Update

Hook: "I am building a classroom assistant inspired by how Granola made meetings useful after the call."

Screen: North-star slide and live product.

Narration: "ClassLoop is trying to do that for education: not just notes, but follow-through for every student."

CTA: "Teachers, tutors, and club leads: I need beta feedback."

## Starter Slide Deck Outline

Use this as a quick Canva, Google Slides, or Codex-generated deck brief.

### Slide 1: ClassLoop

Title: ClassLoop

Subtitle: A teacher assistant for after-class follow-through.

Visual: Product screenshot or before/after split.

### Slide 2: The Problem

Title: Class ends. Follow-up begins.

Bullets:

- Transcripts, rosters, notes, links, and missing work live in different places.
- Students need different next steps.
- Teachers do not have time to rewrite everything manually.

### Slide 3: The Product

Title: Messy class input -> reviewable follow-up.

Bullets:

- Import transcript, notes, roster, and resources.
- Review recap, tasks, participation signals, and student previews.
- Publish only after teacher approval.

### Slide 4: Teacher View

Title: Private review before publish.

Bullets:

- Editable recap.
- Unmatched speaker warnings.
- Private support signals.
- Completion tracking.

### Slide 5: Student View

Title: Clear next steps for each student.

Bullets:

- Recap.
- Tasks.
- Resources.
- Due dates.
- Completion check-ins.

### Slide 6: Why It Is Different

Title: Not just notes.

Bullets:

- Connects what happened in class to what each student should do next.
- Keeps teachers in control.
- Avoids public rankings and surveillance framing.

### Slide 7: Business Model

Title: Free to try, paid when it becomes a weekly habit.

Bullets:

- Free tier for initial trust and lightweight use.
- Teacher Pro for unlimited sessions, live capture, history, exports, delivery proof, and advanced assistant workflows.
- School/team plans only after privacy, admin, and legal readiness.

### Slide 8: Beta Ask

Title: Looking for teacher feedback.

Bullets:

- Try the sample demo.
- Use anonymized data for first tests.
- Tell us where the draft is wrong, confusing, or time-saving.

CTA: Try ClassLoop at https://classloop-followup.vercel.app

## Screenshots To Capture Next

- Hosted homepage first viewport.
- Teacher import/paste screen.
- Generated teacher review screen.
- Unmatched speaker or warning state.
- Student dashboard.
- Completion review.
- Download page with desktop/PWA options.

## Reusable One-Liners

- "ClassLoop turns messy class records into teacher-reviewed student follow-ups."
- "A personal assistant for the work teachers do after class."
- "From transcript soup to student next steps."
- "Not just notes: recap, tasks, resources, completion, and private support signals."
- "Built for teacher review first, student clarity second, and automation only where it earns trust."

## Next Concrete Assets

- Generated starter deck: [docs/promo/classloop-starter-promo-deck.pptx](promo/classloop-starter-promo-deck.pptx).
- First channel starter pack: [docs/promo/classloop-first-channel-pack.md](promo/classloop-first-channel-pack.md).
- Four-week posting calendar: [docs/promo/classloop-first-channel-calendar.csv](promo/classloop-first-channel-calendar.csv).
- Beta outreach kit: [docs/promo/classloop-beta-outreach-kit.md](promo/classloop-beta-outreach-kit.md).
- Beta tester tracker: [docs/promo/classloop-beta-tester-tracker.csv](promo/classloop-beta-tester-tracker.csv).
- Beta feedback form template: [docs/promo/classloop-beta-feedback-form.md](promo/classloop-beta-feedback-form.md).
- Beta launch command center: [docs/promo/classloop-beta-launch-command-center.md](promo/classloop-beta-launch-command-center.md).
- Record a 45-second screen walkthrough of script 1.
- Capture clean screenshots from the hosted demo and desktop app.
- Create a simple channel banner: `ClassLoop - after-class follow-up, automated`.
