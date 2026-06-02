# ClassLoop Beta Launch Command Center

Last updated: 2026-06-01

This is the operating page for moving ClassLoop from "deployed demo and promo assets exist" to "real teachers/tutors are trying it and giving useful feedback." It keeps the current launch stance honest: small beta outreach is allowed; broad real-student hosted signup is not ready.

## Current Stance

Ship/hold decision:

> Hold broad public student-data launch. Start controlled beta outreach and content-led tester discovery.

Why:

- ClassLoop has a live hosted demo and an internal controlled-pilot packet.
- Promo assets now exist: starter deck, first-channel pack, outreach kit, feedback form, calendar, and tester tracker.
- Real teacher alpha evidence is still required before claiming field-proven usefulness.
- Hosted real-student signup remains gated until legal/public signup review, retention/deletion SLA, and pilot agreement work are complete.
- Clean-host installer evidence and live billing proof still need to be treated as launch gates, not assumed away.

Allowed now:

- Post demo clips using sample/anonymized data.
- Invite 3 to 5 teachers/tutors/club leads for controlled beta tests.
- Use hosted sample demo for first impressions.
- Use desktop or reviewed pilot path for real classroom artifacts.
- Collect ratings, redacted notes, and support-burden observations.

Not allowed yet:

- Say ClassLoop is school-approved, district-ready, or legally reviewed.
- Encourage public users to upload real student data into the hosted demo.
- Claim AI-generated participation/student follow-ups are field-proven.
- Unlock or advertise paid Pro as live until Stripe/Supabase proof is current.

## Week 1 Objective

Get the first 3 live beta conversations started.

Success means:

- At least 6 outreach messages sent.
- At least 3 replies or warm leads.
- At least 1 tester scheduled or completed.
- At least 1 public proof post or private demo clip recorded with sample data.
- Tester tracker updated after every reply.

## Artifact Map

| Need | Artifact |
| --- | --- |
| Private pilot path | Do not publish a beta route. Use private outreach plus the public demo/support pages. |
| Product/growth north star | [classloop-growth-kit.md](../classloop-growth-kit.md) |
| Editable starter deck | [classloop-starter-promo-deck.pptx](classloop-starter-promo-deck.pptx) |
| First channel scripts/captions | [classloop-first-channel-pack.md](classloop-first-channel-pack.md) |
| Four-week posting plan | [classloop-first-channel-calendar.csv](classloop-first-channel-calendar.csv) |
| Payment launch runbook | [../classloop-payment-launch-runbook.md](../classloop-payment-launch-runbook.md) |
| Outreach copy | [classloop-beta-outreach-kit.md](classloop-beta-outreach-kit.md) |
| Tester pipeline | [classloop-beta-tester-tracker.csv](classloop-beta-tester-tracker.csv) |
| Feedback form structure | [classloop-beta-feedback-form.md](classloop-beta-feedback-form.md) |
| Teacher-facing beta packet | [../public-beta-packet.md](../public-beta-packet.md) |
| Observed alpha script | [../../alpha/teacher-alpha-script.md](../../alpha/teacher-alpha-script.md) |

## Launch Funnel

1. Public proof post or warm DM.
2. Interested teacher/tutor replies.
3. Tester gets short confirmation message and safety boundary.
4. Tester uses sample/anonymized data for one session.
5. Tester reaches publish preview or reports where they got stuck.
6. Tester fills feedback form or sends notes.
7. Rushil logs ratings, top blocker, support interventions, and next follow-up.
8. Codex turns repeated blockers into product/docs fixes.

## First 6 Outreach Targets

Use roles instead of real names until Rushil identifies people.

| Target | Why They Matter | Message |
| --- | --- | --- |
| T001 teacher with clean transcript/roster | Proves ideal classroom workflow | Teacher email |
| T002 teacher with messy notes/partial transcript | Proves real messiness | Teacher email |
| T003 tutor | Fastest practical adopter and less school bureaucracy | Tutor/club email |
| T004 club lead/advisor | Tests non-classroom follow-through | Tutor/club email |
| T005 teacher-adjacent peer or family contact | Warm intro path | Warm intro ask |
| T006 education/product friend | Messaging feedback before teacher outreach | Short DM |

Track them in [classloop-beta-tester-tracker.csv](classloop-beta-tester-tracker.csv). Do not store sensitive personal details in repo docs.

## One-Day Execution Script

### Morning: Prepare Proof

- Open the live demo or local desktop app.
- Capture one sample-data clip for "Messy transcript to follow-up."
- Confirm no real student data appears.
- Save one clean screenshot of teacher review and one of student preview.

### Midday: Send Outreach

- Send 3 teacher/tutor messages from [classloop-beta-outreach-kit.md](classloop-beta-outreach-kit.md).
- Add each person to the tracker as `contacted`.
- Post one short build-in-public clip or draft it if visuals are not ready.

### Evening: Follow Up And Log

- Move replies to `replied` or `scheduled`.
- Send confirmation message to anyone willing to test.
- Record blockers in `top_blocker` and `notes_redacted`.
- If no replies, send 2 warm-intro asks the next day.

## Evidence To Collect

For each beta test:

- Role and session type.
- Test platform: hosted sample demo, desktop, or reviewed pilot.
- Whether they reached publish preview.
- Recap, task, student usefulness, and trust ratings.
- What they edited before students could see it.
- Support interventions: install/setup, import, matching, review/publish, student access, privacy concern, account/auth, sync, billing.
- Would-use-again signal.
- Redacted screenshot only if it contains sample/anonymized data.

## Ship / Hold Gates

### Controlled Beta Outreach

Status: allowed.

Minimum gate:

- Demo/sample boundary is clear.
- Outreach copy says sample/anonymized first.
- Tester tracker does not store private student details.
- Beta feedback form asks for ratings and blockers.

### Broad Public Student-Data Signup

Status: hold.

Needs:

- Real teacher alpha evidence.
- Final legal/public signup review.
- Hosted retention/deletion SLA and pilot agreement.
- Support logging proof.
- Clean-host installer proof for offered platforms.
- Live Stripe/Supabase billing proof before charging.

### Paid Pro Promotion

Status: hold for live claims.

Allowed:

- Discuss intended Granola-inspired business model.
- Say current target is `$3.99/month` for Teacher Pro.

Needs:

- Live `cs_live` checkout proof.
- Webhook-owned profile entitlement update proof.
- Cancellation/downgrade proof.
- Demo accounts blocked from paid upgrade.
- Payment setup completed from [../classloop-payment-launch-runbook.md](../classloop-payment-launch-runbook.md).

## Repeated Blocker Response

If a blocker appears in 2 or more tester notes:

1. Add it to `top_blocker` in the tracker.
2. Create a small fix issue or local task.
3. Decide whether it is copy, UI, parser, install, privacy, or backend.
4. Fix the smallest safe slice.
5. Rerun the relevant check.
6. Re-test with the next beta user.

## First Public Claim Set

Safe claims:

- "ClassLoop turns transcripts, notes, rosters, and links into teacher-reviewed follow-ups."
- "The hosted demo uses sample accounts."
- "Real classroom artifacts should stay local or in a reviewed pilot."
- "I am looking for teachers/tutors to test with sample or anonymized data."
- "Inspired by the daily-use simplicity of tools like Granola, adapted for classroom follow-through."

Claims to avoid:

- "Fully automated classroom follow-up."
- "School-approved."
- "FERPA/COPPA compliant" unless reviewed and backed by legal/pilot terms.
- "Works for every class" before real alpha evidence.
- "Automatically posts/sends to students" without teacher approval.

## Next Best Product Slice

After the first tester notes, prioritize one of these:

1. Today view for assistant-style follow-through: unpublished drafts, overdue check-ins, recent completions, and risky warnings.
2. Better first-run onboarding around demo/sample versus real data.
3. Cleaner teacher review queue for low-confidence speaker matching and generated tasks.
4. One-click copy/share handoff for teacher-approved student follow-up text.
5. Screenshot-ready demo session path for consistent public clips.
