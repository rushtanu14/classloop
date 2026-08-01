# ClassLoop codebase audit

**Audit date:** 2026-07-30

**Repository state:** `947f370` on the container's `work` branch

**Scope:** product behavior, frontend, parser, persistence, hosted APIs, desktop shells, integrations, testing, and release operations.

## Executive summary

ClassLoop is no longer only a transcript parser. It is a local-first classroom follow-through product with teacher, student, and individual experiences; a public PWA; optional Supabase sync; server-owned Stripe entitlements; SMTP recap delivery; Electron and Swift macOS shells; a local MCP surface; and substantial operational tooling.

Its strongest qualities are the defensive import pipeline, explicit teacher-review boundary, useful offline mode, hosted-demo isolation, encrypted persistence, and broad workflow/security tests. Its largest engineering risk is concentration: `src/App.tsx` contains routing, authentication, storage, billing, imports, presentation, and most UI in more than 13,000 lines, while `src/styles.css` approaches 8,000 lines. This makes good functionality expensive to understand and risky to change.

The next phase should establish stable module seams, add immutable publication history, and validate with redacted real-class artifacts and clean release hosts before adding another broad feature.

## Implemented product behavior

### Public, identity, and installation

- Hash-routed public pages cover home, features, screenshots, docs, privacy, terms, EULA, support, and download.
- The hosted sample workspace uses known demo accounts and keeps visitor-created changes in memory.
- The PWA has a manifest and service worker. Installer selection reads `public/classloop-downloads.json` and reports missing artifacts honestly.
- The same Vite application is hosted on the web, embedded by Electron on Windows/Linux, and embedded in the Apple-silicon Swift macOS wrapper.
- Class Account entry supports teachers and students; Individual Account entry supports owner-only meeting follow-through.
- Local identity works without hosted services. Supabase adds cloud identity/sync. Paid access is read from a trusted hosted profile updated by Stripe webhooks.

### Teacher workflow

1. Paste/upload a transcript or use gated online capture; provide roster, notes, resources, and session metadata.
2. `src/data.ts` parses varied rosters, speakers, participation, action items, URLs, attendance hints, quality warnings, and unmatched participants.
3. Resolve speakers, acknowledge blocking warnings, edit generated content, inspect student-visible output, and publish.
4. Optionally send selected recap emails, inspect delivery logs, manage saved classes/rosters, and export reports/CSV.
5. Use dashboard and analytics views for private support-oriented follow-through.

### Student workflow

- Students see only published sessions matched to an imported or linked email identity.
- They can read approved recaps, resources, personal reminders/catch-up content, and tasks.
- Submission notes, attachment links, completion states, and optional creator-directed product feedback are supported.
- Teacher analytics remain inaccessible to student accounts.

### Individual workflow

- Individuals paste meeting minutes without classroom or roster concepts.
- ClassLoop produces an owner-only recap, resources, questions, tasks, next-meeting details, docs summary, and email draft.
- Personal task status and lightweight due-date text remain free rather than Pro-gated.

## Architecture and trust boundaries

- `src/main.tsx` boots React, analytics, and service-worker registration.
- `src/App.tsx` owns routing, auth, boot/recovery, persistence orchestration, cloud synchronization, billing, pages, and many helpers.
- `src/types.ts` defines classroom/personal records; `src/data.ts` generates sessions; `src/transcript.ts` structures segments.
- `src/cloud.ts`, `src/cloudSync.ts`, and `src/cloudWorkspace.ts` cover Supabase auth/API calls, offline queue/conflict policy, and owner-scoped payload merging.
- `src/retention.ts` partitions records under the configured privacy retention period.
- `api/index.js` dispatches Vercel routes to `server/backend/api/`, which handles config, profiles, workspace state, feedback, billing, email, integrations, and keepalive.
- `supabase/schema.sql` establishes profiles/workspaces/submissions, indexes, and row-level policies.
- `desktop/main.cjs` hardens the Electron boundary and encrypted state bridge; the Swift wrapper packages the shared dist on macOS.

State ownership is deliberately split:

- **Local device:** offline workspace, local account secrets, appearance, and encrypted recovery state.
- **Supabase Auth:** hosted sessions, confirmation, and password recovery.
- **Cloud workspace API:** authenticated owner-scoped content; local secrets and billing state are excluded.
- **Profile/Stripe:** trusted entitlement and subscription lifecycle.
- **SMTP:** optional, explicit teacher-triggered recap delivery.

## Strengths to preserve

1. **Teacher review is functional, not just copy.** Unmatched-speaker resolution, warning review, publish preview, review-required flags, and audit entries reinforce review before delivery.
2. **Parsing reflects messy reality.** Regression fixtures cover compressed rosters, aliases, generic speakers, transcript metadata, private chat, noisy ASR, and URL extraction.
3. **Offline behavior is genuine.** Local accounts/workspace work without hosted credentials; encrypted state, corruption recovery, cloud queuing, and conflict policy have tests.
4. **Hosted boundaries are explicit.** Demo isolation, origin checks, authenticated owner scoping, server-owned billing, strict request bodies, RLS, rate limiting, and safe errors are checked.
5. **Workflow coverage is broad.** Playwright covers public pages, auth/recovery, import/review/publish/student access, billing, capture fallbacks, responsive behavior, privacy, and delivery.
6. **Release failure is designed.** The repo includes package synchronization, first-run smoke, checksum, rollback, incident, and distribution checks.

## Prioritized improvements

### Priority 0 — readiness for real student data

1. Obtain counsel review, a DPA/subprocessor posture, deletion/retention SLA, incident notification policy, and documented FERPA/COPPA roles before broad school-hosted use.
2. Run redacted real-class simulations. Measure false matches, time-to-publish, edits per follow-up, confusing steps, and language educators consider judgmental.
3. Require first-run evidence and checksums on each actual target OS/architecture before adding an installer URL to the public manifest.

### Priority 1 — reduce engineering risk

1. Split `App.tsx` by domain. Extract persistence, auth, billing, routing, and pure selectors first; then pages under public/auth/classroom/student/personal/settings features. Add characterization tests before extraction.
2. Split CSS with the components. Extract tokens/themes first and add stable visual baselines for landing, import review, publish preview, teacher dashboard, and student session.
3. Model boot/auth/sync transitions with a reducer or small state machine to make stale async saves and invalid transitions easier to reason about without Redux.
4. Move `Account`, `LocalAuthSecret`, `SharedState`, and persistence contracts out of `App.tsx`; document which fields are legal in cloud payloads.
5. Keep architecture documentation aligned with implementation. The inaccurate route-splitting, memoization, ESLint, and pre-commit claims found during this audit were corrected in `FRONTEND.md`; future structural changes should update it in the same commit.

### Priority 2 — strengthen the product loop

1. Add immutable publication versions: version ID, actor, time, field summary, and exact student-visible snapshot. Support teacher comparison.
2. Add a student update inbox for unread publication versions and reviewed-submission feedback, separate from grades and creator feedback.
3. Add private class-group longitudinal analytics without public rankings or high-stakes inference.
4. Add versioned encrypted backup/restore with validation, dry-run summary, and automatic pre-import backup.
5. Add font-size, reduced-motion, and higher-contrast accessibility preferences with browser coverage.

### Priority 3 — improve feedback speed

1. Add focused tests for extracted routing, CSV, identity matching, publish diffs, retention boundaries, and safe URL helpers while retaining broad regressions.
2. Add automated accessibility scanning and a small screenshot suite.
3. Enforce budgets for the main application chunk and future lazy routes.
4. Define privacy-preserving production observability before adding telemetry; exclude raw transcripts, rosters, names, and follow-ups.
5. Clarify historical/import-only `TranscriptSource` values so the type does not imply removed UI integrations are active.

## Suggested implementation sequence

1. **Establish seams:** characterize boot/demo/persistence/publish/student visibility; extract routing, selectors, and persistence contracts; fix architecture docs.
2. **Version publishing:** migrate defaults, store immutable snapshots/diffs, expose teacher history and student unread updates, extend Playwright and the QA prompt.
3. **Portability/accessibility:** implement encrypted backup/restore and accessibility presets with recovery and visual checks.
4. **Pilot readiness:** complete legal/operational ownership, run redacted simulations, then a small teacher alpha, requiring clean-host evidence per release target.

## Limitations

- `/Users/rushil/obsidian/codexvault/codexsecondbrain` did not exist in this Linux container, so it supplied no prior notes. The repository's `codexsecondbrain-sync-2026-04-30.md` and context documents were used as the available history.
- Automated checks show implementation consistency, not educator usefulness, legal compliance, school-domain email deliverability, or clean-host installer trust.
- No production Supabase, Stripe, SMTP, Vercel, or Composio credentials were used; those boundaries were evaluated from source, schemas, configuration, and tests.
