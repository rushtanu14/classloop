# ClassLoop Teacher Alpha Script

Thanks for helping test ClassLoop. This is an early alpha, so the goal is not to impress you. The goal is to find where ClassLoop is useful, confusing, or wrong.

Use this script with the public beta packet in [docs/public-beta-packet.md](../docs/public-beta-packet.md). The observed session should prove whether a teacher can reach a useful publish preview without live help and without losing the sample/demo versus real-data boundary.

## Before You Start

Use sample or anonymized data if possible. If you use a real transcript or roster, please do not send raw student data back to us. We only need counts, ratings, and redacted examples.

Bring:

- a class transcript, meeting notes, or pasted lesson notes
- a roster CSV or pasted roster
- optional resource links
- a sense of what students should do next

Do not paste real student records into the hosted sample demo unless a reviewed pilot agreement allows it. Use the desktop app for durable local testing with real classroom artifacts.

## Task 1: First Run

Open ClassLoop and get to the teacher dashboard.

Observer notes:

- Did install/opening work?
- Did the teacher understand demo/sample versus real workspace?
- How many times did they ask for help?

## Task 2: Generate A Draft

Create a new session and import your transcript/notes, roster, and resources.

Think aloud:

- What feels clear?
- What feels too much?
- What do you expect ClassLoop to do after clicking Generate?

Observer notes:

- Time to first draft:
- Import confusion:
- Missing data or formatting issues:

## Task 3: Review Matching And Participation

Open the roster/matching review and participation review.

Look for:

- a speaker matched to the wrong student
- a teacher/guest treated as a student
- a quiet/absent/participation signal that feels wrong
- any participation signal that feels too judgmental

Record only redacted examples.

## Task 4: Review Interpretation Quality

Check the class recap, action items, resources, and at least two student previews.

Rate 1-5:

- Recap accuracy:
- Task/action-item accuracy:
- Student follow-up usefulness:
- Resource usefulness:
- Overall trust:

## Task 5: Publish Preview

Open publish preview. You do not need to actually send anything.

Answer:

- Would you publish this after editing?
- What would you still need to change?
- Would you trust a student to see this?
- Would you use ClassLoop again next week?

## Task 6: Student-Side Check

Switch to the sample student view or open a student preview.

Check:

- Does the student see only their own follow-up?
- Are tasks, due dates, resources, and completion controls understandable?
- Can the student mark a task complete?
- Can the teacher see and review the completion afterward?

## Wrap Questions

1. What was the most useful part?
2. What was the most confusing part?
3. What felt inaccurate or risky?
4. What support did you need?
5. What would make ClassLoop worth using again?

## Recording Rules

- Use [alpha/classloop-alpha-tracker.csv](classloop-alpha-tracker.csv) for counts, ratings, and support intervention codes.
- Use [alpha/support-triage.md](support-triage.md) for severity and support categories.
- Store false positives as redacted examples, such as `Student A matched to Student B after display name M. Chen`.
- Do not store raw transcripts, full rosters, grades, passwords, Stripe data, Supabase keys, or private student notes in the tracker.
