# ClassLoop Launch Classwork Plan

Created: 2026-05-18

Purpose: give Rushil a daily, due-date-driven path to get ClassLoop fully live, stable, and low-babysitting. This is project classwork, not a reusable Codex skill. Keep durable workflow rules in skills; keep launch tasks here, CSB, and Notion.

## Current State

- Local/current-code release gate is green through `npm run test:all`.
- Current code uses fingerprinted Vite assets so the next hosted deploy should avoid stale bundle caching.
- Public Vercel hosted smoke is green after the 2026-05-18 production deploy.
- Final production deployment: `dpl_DfbzrJq54MMsf7anhc2xLFwpBvKp`, aliased to `https://classloop-followup.vercel.app`.
- Public root now serves fingerprinted assets: `/assets/index-CkXZY_H5.js` and `/assets/index-BgBlv9cx.css`.
- Verification passed after deploy: `npm run test:web` and `npm run test:web:local`.
- Gmail and Notion connectors were not available in this Codex session, so the email/Notion payload is prepared locally for now.

## Daily Classwork

| Due | Focus | Done Means |
| --- | --- | --- |
| 2026-05-18 | Deploy decision and hosted smoke | Done: deployed current ClassLoop to Vercel production, confirmed fingerprinted assets, and passed `npm run test:web`. |
| 2026-05-19 | Legal/public signup readiness | Done: founder-authored Terms, Privacy Policy, Desktop EULA, Support, retention/deletion, and child-safety language are in repo/public routes; hosted durable signup remains gated/sample-only until attorney/district review. |
| 2026-05-20 | Desktop release package | Package macOS, generate checksums, confirm download fallback/URLs, and update install guidance for unsigned/ad-hoc builds. |
| 2026-05-21 | Backend production config | Verify Supabase/Stripe env setup plan, webhook test path, credential-absent desktop behavior, and free-first external-services boundaries. |
| 2026-05-22 | Support and privacy-safe logging | Confirm user-visible recovery for bad transcripts, malformed URLs, sync/API outage, package init failure, and storage corruption; confirm logs help support without classroom/account payloads. |
| 2026-05-23 | Alpha field rehearsal | Run at least 3 realistic teacher + student scenarios: import, review, approve, publish, student dashboard, completion, and teacher review. |
| 2026-05-24 | Fix alpha blockers | Fix any correctness or trust issues from alpha rehearsal, then run `npm run test:all` again. |
| 2026-05-25 | Hosted PWA polish | Re-test landing, routes, downloads, add-to-home-screen flow, service worker, manifest, mobile readability, and sample-only demo boundaries. |
| 2026-05-26 | Entitlements and billing | Verify free/paid boundaries, locked unpaid UI, upgrade/downgrade flows, and webhook-owned entitlement updates. |
| 2026-05-27 | State resilience | Re-run encrypted local state, crash recovery, backup/restore, repeated imports, 100+ student roster, and no cross-user/project leakage checks. |
| 2026-05-28 | Accessibility finish | Run keyboard navigation, focus order, contrast, labels/announcements, and phone-width readability checks. Fix anything that blocks classroom use. |
| 2026-05-29 | Ops runbooks | Done: `npm run drill:ops` passed rollback and incident drills, including bad-release quarantine, sync/auth/billing outage behavior, parser regression response, and support triage coverage. |
| 2026-05-30 | Public beta packet | Done: prepared `docs/public-beta-packet.md`, updated the teacher alpha script, and included teacher onboarding, release notes, support FAQ, download links/fallbacks, launch announcement, verification checklist, and blocker list. |
| 2026-05-31 | Low-babysitting review | Confirm green gates, known limits, support loop, weekly maintenance cadence, and what still needs a human before broader public signups. |
| 2026-06-01 | Ship or hold | If hosted smoke, package checks, legal gate, support loop, and alpha trust criteria are green, ship the public beta. Otherwise hold with a one-page blocker list. |

## Daily Email Drafts

Use these as daily reminder emails when Gmail is connected.

### 2026-05-18

Subject: ClassLoop launch work due today - deploy decision and hosted smoke

Today: decide whether to deploy the current ClassLoop project. If approved, deploy, run `npm run test:web`, and capture hosted smoke evidence. Do not treat the public site as launch-ready until the hosted smoke passes against the deployed bundle.

### 2026-05-19

Subject: ClassLoop launch work due today - legal/public signup readiness

Today: founder-authored Terms, Privacy Policy, support contact, desktop EULA, retention/deletion expectations, and child-safety language are in place. Keep durable hosted signups gated/sample-only until attorney/district review.

### 2026-05-20

Subject: ClassLoop launch work due today - desktop release package

Today: package macOS, generate checksums, verify download URLs or fallback copy, and make sure unsigned/ad-hoc install guidance is clear enough for a teacher to follow without help.

### 2026-05-21

Subject: ClassLoop launch work due today - backend production config

Today: verify the Supabase/Stripe production setup plan, webhook test path, credential-absent desktop behavior, and free-first external-services boundaries.

### 2026-05-22

Subject: ClassLoop launch work due today - support and privacy-safe logging

Today: validate visible recovery for bad transcripts, malformed URLs, sync/API outage, package init failure, and storage corruption. Logs should help debug without exposing classroom/account payloads.

### 2026-05-23

Subject: ClassLoop launch work due today - alpha field rehearsal

Today: run three realistic teacher + student scenarios end to end: import, review, approve, publish, student dashboard, completion, and teacher review.

### 2026-05-24

Subject: ClassLoop launch work due today - fix alpha blockers

Today: fix correctness or trust issues found in rehearsal, then run the full local gate with `npm run test:all`.

### 2026-05-25

Subject: ClassLoop launch work due today - hosted PWA polish

Today: re-test landing routes, downloads, add-to-home-screen, service worker, manifest, mobile readability, and sample-only demo boundaries.

### 2026-05-26

Subject: ClassLoop launch work due today - entitlements and billing

Today: verify free/paid boundaries, locked unpaid UI, upgrade/downgrade flows, and webhook-owned entitlement updates.

### 2026-05-27

Subject: ClassLoop launch work due today - state resilience

Today: re-run encrypted state, crash recovery, backup/restore, repeated imports, 100+ student roster, and workspace/user isolation checks.

### 2026-05-28

Subject: ClassLoop launch work due today - accessibility finish

Today: run keyboard, focus order, contrast, screen-reader label/status, and phone readability checks. Fix anything that blocks comfortable classroom use.

### 2026-05-29

Subject: ClassLoop launch work due today - ops runbooks

Today: `npm run drill:ops` passed rollback and incident drills. Rerun before ship if release artifacts, hosted APIs, parser behavior, billing, or sync code changes.

### 2026-05-30

Subject: ClassLoop launch work due today - public beta packet

Today: public beta packet is prepared in `docs/public-beta-packet.md`. Verification passed for hosted smoke, release distribution, ops drills, and link checks against the current hosted/demo state, installer links, support path, and legal/public-signup gate.

### 2026-05-31

Subject: ClassLoop launch work due today - low-babysitting review

Today: confirm green gates, known limits, support loop, weekly maintenance cadence, and what still needs a human before broader public signups.

### 2026-06-01

Subject: ClassLoop launch work due today - ship or hold

Today: ship public beta only if hosted smoke, package checks, legal gate, support loop, and alpha trust criteria are green. Otherwise hold with a one-page blocker list.
