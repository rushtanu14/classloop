# React API Boundary and Draft Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the real teacher import and draft-review workflow through the Python API while preserving the current interface and removing the replaced browser parser after parity.

**Architecture:** One `ClassLoopClient` owns product requests. Hosted mode uses `fetch`; desktop transport remains the existing path until Plan 3. A temporary build-time adapter compares legacy and Python results during migration and is deleted when this plan finishes.

**Tech Stack:** React 18, TypeScript, Vite, FastAPI, Playwright, Vitest-style Node contract tests.

## Global Constraints

- No visual redesign or new product features.
- Sample Workspace state must never call the Python API or persist visitor mutations.
- Preserve unsaved teacher input on every API error.
- Components do not call product API routes directly.
- Remove the legacy draft generator only after focused desktop and phone Playwright flows pass.

---

### Task 1: Typed client and error contract

**Files:**
- Create: `src/api/contracts.ts`
- Create: `src/api/errors.ts`
- Create: `src/api/transport.ts`
- Create: `src/api/classloop-client.ts`
- Create: `tests/classloop-client.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ClassLoopTransport.request<T>(request: ClassLoopRequest) -> Promise<T>`.
- Produces: `ClassLoopClient.generateDraft(input: ImportDraftInput) -> Promise<Session>`.
- Produces: `ClassLoopApiError` with `code`, `message`, `field`, and `retryable`.

- [ ] Write a failing contract test that feeds success, `422`, malformed JSON, network failure, and abort responses through the real client.
- [ ] Run `node --test tests/classloop-client.test.mjs`; confirm missing-module failure.
- [ ] Implement the narrow types, hosted fetch transport, response validation, timeout, and public error translation.
- [ ] Run `node --test tests/classloop-client.test.mjs && npm run typecheck`; expect PASS.
- [ ] Commit with `git commit -m "feat: add ClassLoop API client"`.

### Task 2: Development process orchestration

**Files:**
- Create: `scripts/run-development.mjs`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `tests/development-runner.test.mjs`

**Interfaces:**
- `npm run dev` starts Uvicorn on `127.0.0.1:8011` and Vite on the existing port.
- Vite proxies `/api/drafts` to Uvicorn only in development.
- SIGINT, SIGTERM, or child failure stops both children.

- [ ] Write a failing child-lifecycle test with fixture commands that print readiness and exit.
- [ ] Run the test and confirm the runner is missing.
- [ ] Implement argument-array spawning without shell interpolation, readiness forwarding, and symmetric cleanup.
- [ ] Run the runner test and `npm run build`; expect PASS.
- [ ] Commit with `git commit -m "chore: run Python and Vite together"`.

### Task 3: Import and review cutover

**Files:**
- Create: `src/features/import/useDraftGeneration.ts`
- Create: `src/features/import/DraftGenerationError.tsx`
- Modify: `src/App.tsx`
- Modify: `tests/browser/classloop.spec.ts`
- Modify: `codexsecondbrain-sync-2026-04-30.md`

**Interfaces:**
- `useDraftGeneration` returns `{generateDraft, pending, error, clearError}`.
- Demo/sample accounts keep current in-memory seeded behavior and never invoke the client.
- Real teacher draft creation calls Python exactly once after explicit submission.

- [ ] Add a failing Playwright test that intercepts `/api/drafts/generate`, asserts the selected inputs, returns a contract fixture, and verifies review UI plus preserved form state on a retryable error.
- [ ] Run the focused browser test and confirm it fails before the UI route exists.
- [ ] Add the hook and error surface, wire only the real teacher import action, and retain existing styles and copy.
- [ ] Run focused Playwright on desktop and phone plus `npm run typecheck`; expect PASS.
- [ ] Commit with `git commit -m "feat: generate teacher drafts through Python"`.

### Task 4: Parity gate and legacy parser removal

**Files:**
- Modify: `src/data.ts`
- Modify: `src/App.tsx`
- Modify: `tests/import-flow.test.ts`
- Modify: `package.json`
- Delete: `tests/export-python-import-fixtures.mjs`

**Interfaces:**
- Personal Meeting generation remains in TypeScript until its own Python model is added in Plan 7.
- Classroom `createGeneratedSession` is no longer a production export after cutover.
- `npm run test:import` runs the Python contract suite.

- [ ] Add a source-contract test that fails while production code imports `createGeneratedSession` for classroom drafts.
- [ ] Run the source-contract test and confirm RED.
- [ ] Remove only the replaced classroom generation path; retain sample constants and personal meeting behavior in focused files.
- [ ] Run `npm run test:python && npm run test:import && npm run test:browser -- --grep "import|publish" && npm run build`.
- [ ] Commit with `git commit -m "refactor: retire browser classroom parser"`.
