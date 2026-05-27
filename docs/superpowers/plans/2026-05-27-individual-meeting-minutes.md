# Individual Meeting Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free Individual personal meeting-minutes mode while preserving the existing Class teacher/student workflows.

**Architecture:** Extend account routing to `individual | teacher | student`, add a separate `PersonalMeeting` model/state slice, and build small personal dashboard/intake/review surfaces inside the existing app shell. Keep personal generation separate from classroom `createGeneratedSession()` and keep template links configurable through a tiny public manifest.

**Tech Stack:** React 18, TypeScript, Vite, local encrypted storage, existing Playwright/Vitest-style checks.

---

### Task 1: Domain Types And Storage

**Files:**
- Modify: `src/types.ts`
- Modify: `src/data.ts`
- Modify: `src/App.tsx`
- Modify: `api/validators.js`

- [x] Add `PersonalTaskStatus`, `PersonalTask`, and `PersonalMeeting` types.
- [x] Add `createPersonalMeetingDraft()` in `src/data.ts`.
- [x] Add `individual` role support and `personalMeetings` state persistence in `src/App.tsx`.
- [x] Update hosted state validation to accept individual accounts and personal meetings.
- [x] Remove synthesized placeholder student emails for name-only students.

### Task 2: Account Routing And Personal UI

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [x] Change login/create account flow to choose `Individual` or `Class`, then Teacher/Student under Class.
- [x] Add Individual sidebar routes: Personal Dashboard, New personal meeting, Personal meetings, Appearance.
- [x] Add Personal Dashboard, New Personal Meeting, and Personal Meeting Review components.
- [x] Keep Individual V1 free by bypassing classroom generation limits and billing gates.

### Task 3: Template Link Manifest

**Files:**
- Create: `public/classloop-template-links.json`
- Modify: `src/App.tsx`
- Modify: `tests/browser/classloop.spec.ts`

- [x] Load template copy links from the public manifest.
- [x] Show class template CTA under class `Generate draft`.
- [x] Show personal template CTA under personal generate action.
- [x] Show missing-link fallback when a URL is absent.

### Task 4: Tests And Docs

**Files:**
- Modify: `tests/import-flow.test.ts`
- Modify: `tests/browser/classloop.spec.ts`
- Modify: docs as needed.

- [x] Update import tests so name-only students keep blank emails.
- [x] Add focused browser coverage for Individual login, personal meeting generation, personal task status/due date persistence, and class template placement.
- [x] Run `npm run build`, `npm run test:import`, focused browser tests, and `git diff --check`.
- [x] Commit and push `rushex/individual-meeting-minutes` after tests pass.
