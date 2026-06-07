# ClassLoop PRD

Last updated: 2026-06-07

## Product Thesis

ClassLoop is a follow-through workspace for people who leave a live session with messy notes, transcripts, resources, questions, and unfinished next steps. It should be understandable for many workflows, but the teacher workflow is the sharpest first product wedge.

The launch message should be:

> ClassLoop turns messy session inputs into clear follow-through, with a teacher-first workflow for student-ready class next steps.

## Who It Serves

### Broad Use

- Tutors turning session notes into recap and homework.
- Club leads turning meeting notes into tasks and resources.
- Workshop facilitators turning attendance, links, and transcript snippets into participant follow-up.
- Individual users turning personal meeting minutes into owner-only recaps and tasks.
- Students using published student views to understand what happened, what they owe, and where to find resources.

### Teacher-Specific Depth

Teachers need more than a generic notes summary. ClassLoop must preserve:

- Roster-aware transcript and notes import.
- Speaker matching with confidence and unmatched-participant review.
- Editable class recap, task, resource, and participation review before publishing.
- Student-specific previews and follow-ups.
- Completion check-ins and teacher review of submitted work.
- Private support analytics, not public ranking.
- Privacy/legal boundaries for student data, local desktop storage, hosted sample-only demos, and reviewed school-scale use.

## Launch Positioning Requirements

- The public landing page should lead with broad follow-through language, not only "Zoom transcript after class."
- The same first screen must still make the teacher value obvious through teacher review, student-specific next steps, and classroom screenshots.
- Product docs should explain that ClassLoop is useful for classes, tutoring, clubs, workshops, and personal meetings, while teacher workflows remain the paid/Pro and school-ready wedge.
- Demo surfaces must not imply public durable signup for real student data unless hosted legal/privacy gates are satisfied.
- Individual personal-meeting workflows must stay free in V1 and separate from class billing limits.

## Core User Stories

- As a teacher, I can import class artifacts, review generated outputs, and publish only after I approve.
- As a student, I can see only my own recap, tasks, resources, due dates, and completion check-ins.
- As a tutor or club lead, I can use the same messy-input-to-follow-up loop without needing a full LMS.
- As an individual user, I can paste personal meeting minutes and track my own recap/tasks without classroom features.
- As Rushil/operator, I can verify billing, sync, privacy, launch, and installer states without fake success or hidden failing paths.

## Non-Goals For Current Launch

- Do not position ClassLoop as replacing teachers.
- Do not make the public hosted demo a durable real-student workspace.
- Do not claim school-scale readiness before legal/privacy/retention/support review.
- Do not move Windows or Linux off Electron until a separate native replacement is safely verified.
- Do not use client-side paid state as proof of Pro entitlement; Stripe/Supabase webhook-owned profile state remains authoritative.

## Acceptance Criteria

- Public landing hero presents broad follow-through plus teacher-specific depth.
- `README.md`, this PRD, and the growth kit use the same launch framing.
- Current web and app tests pass after copy changes.
- Browser/button QA covers public landing routes, demo entry, teacher flow, student flow, Plan Options/Stripe fallback, downloads, support, and legal routes.
- Remaining non-automated gates are reported explicitly rather than hidden.
