# Frontend Decomposition and Legacy Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the oversized React application by existing product workflows, port remaining domain behavior to Python, and delete every temporary migration switch and replaced JavaScript implementation.

**Architecture:** `App.tsx` owns boot, global account state, and route selection. Feature modules own visible workflow state and call one API client. Python owns publication, analytics calculations, retention, personal-meeting generation, and workspace rules that still affect stored or visible data.

**Tech Stack:** React 18, TypeScript, Python core, Playwright, existing CSS.

## Global Constraints

- Preserve the current UI, copy, route hashes, keyboard behavior, responsive layout, and accessibility.
- Do not introduce Redux, a new component library, or speculative reusable abstractions.
- Components contain display and interaction logic, not authorization, persistence, parsing, entitlement, or publication rules.
- Remove code only when direct tests prove its replacement.
- Update the maintainer map and feature QA prompt as each workflow moves.

---

### Task 1: Characterization and route shell

**Files:** `tests/ui-route-contract.test.mjs`, `src/App.tsx`, `src/features/public/PublicRoutes.tsx`, `src/features/auth/AuthRoutes.tsx`.

**Interfaces:** `App` chooses public/auth/app shell; existing hashes and fallback routes remain exact.

- [ ] Add a failing source/runtime characterization test for every public, teacher, student, individual, settings, and fallback route.
- [ ] Run RED against the required feature-module imports.
- [ ] Extract public and auth routes without changing rendered markup or CSS classes.
- [ ] Run route, hosted-web, accessibility, typecheck, and build tests.
- [ ] Commit with `git commit -m "refactor: split ClassLoop route shells"`.

### Task 2: Teacher workflow modules

**Files:** `src/features/teacher/TeacherShell.tsx`, `src/features/import/ImportFlow.tsx`, `src/features/review/SessionReview.tsx`, `src/features/teacher/ClassManager.tsx`, `src/features/analytics/TeacherAnalytics.tsx`, `src/App.tsx`.

**Interfaces:** feature props are explicit state plus named callbacks; API calls remain in hooks/client, not presentational components.

- [ ] Add failing source-contract tests requiring each teacher route to render through its feature module and forbidding direct `fetch`.
- [ ] Run RED.
- [ ] Move existing markup/state in small route-sized commits without reformatting unrelated CSS.
- [ ] After each extraction run the matching Playwright grep; then run full teacher/browser/accessibility checks.
- [ ] Commit with `git commit -m "refactor: split teacher workflows"`.

### Task 3: Student and Individual modules

**Files:** `src/features/student/StudentDashboard.tsx`, `src/features/student/StudentCompletion.tsx`, `src/features/individual/PersonalDashboard.tsx`, `src/features/individual/PersonalMeetingEditor.tsx`, `python/classloop_core/domain/personal_meetings.py`, `python/classloop_core/domain/publication.py`, `python/tests/unit/test_personal_meetings.py`, `python/tests/unit/test_publication.py`.

**Interfaces:** Python endpoints generate personal drafts, validate publication, and commit completion; React renders authoritative responses and non-blocking feedback.

- [ ] Add failing Python and Playwright tests for personal draft/task dates, publish visibility, student identity match, completion-first success, and optional feedback.
- [ ] Run RED.
- [ ] Implement Python rules/endpoints, then extract existing student and individual markup into feature modules.
- [ ] Run focused Python and browser tests, then accessibility/typecheck/build.
- [ ] Commit with `git commit -m "refactor: split student and personal workflows"`.

### Task 4: Settings, privacy, analytics, and retention

**Files:** `src/features/settings/SettingsRoutes.tsx`, `src/features/analytics/TeacherAnalytics.tsx`, `python/classloop_core/services/retention.py`, `python/classloop_core/services/analytics.py`, corresponding tests.

**Interfaces:** Python returns derived analytics and retention partitions; React never changes stored records merely to calculate a chart.

- [ ] Add failing pure-Python tests matching existing retention and analytics fixtures plus browser tests for visible settings/privacy states.
- [ ] Run RED.
- [ ] Implement pure services and route affected UI through the API client.
- [ ] Run focused and full browser checks.
- [ ] Commit with `git commit -m "refactor: move analytics and retention to Python"`.

### Task 5: Remove migration and legacy surfaces

**Files:** legacy `server/backend`, replaced `api/*.js`, replaced `src/data.ts` sections, migration flags, obsolete tests, `README.md`, `FRONTEND.md`, `TESTING.md`, `docs/classloop-maintainer-map.md`, `codexsecondbrain-sync-2026-04-30.md`.

**Interfaces:** `App.tsx` is boot/routing only; `ClassLoopClient` is the product request boundary; Python is the only production business-rule implementation.

- [ ] Add a failing repository contract that rejects migration flags, replaced handler imports, direct product fetches, and duplicated named domain functions.
- [ ] Run RED.
- [ ] Delete only proven replacements, update scripts/docs, and keep intentional Electron/Vite/service-worker/Playwright JavaScript documented.
- [ ] Run Python coverage, all unit/security tests, full Playwright, hosted-local PWA, typecheck, build, and diff check.
- [ ] Commit with `git commit -m "refactor: remove legacy ClassLoop implementations"`.
