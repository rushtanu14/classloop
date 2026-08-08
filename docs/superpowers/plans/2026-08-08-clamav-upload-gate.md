# ClamAV Upload Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate every optional Filestack class-resource upload on a clean verdict from a private self-hosted ClamAV service before ClassLoop returns a share URL.

**Architecture:** Add a zero-dependency Node gateway that speaks ClamAV INSTREAM over a private container network. Extend the existing server-side Filestack finalization path to download the verified object, call the authenticated scanner, validate a fresh verdict, delete rejected objects best-effort, and expose only clean resources.

**Tech Stack:** Node.js ESM, native `http`/`net`, ClamAV `clamd` plus `freshclam`, Docker Compose, existing React/TypeScript/Vite/Playwright test stack.

## Global Constraints

- Keep `VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=false` until live clean/detected/outage proof passes in the exact deployment.
- Never expose `clamd` publicly; only the authenticated HTTPS gateway may be reachable by ClassLoop.
- Never log, persist, or return file bytes, filenames, bearer tokens, or raw scanner output.
- Fail closed on every non-clean, missing, stale, malformed, timeout, quota, or provider result.
- Do not claim that a clean scan proves a file is virus-free.
- Preserve the existing 10 MB and PDF/TXT/Markdown boundaries.
- Do not commit checkpoint snapshots from the current dirty `main`; preserve RED/GREEN evidence in `docs/testing/clamav-upload-gate.tdd.md` instead.

---

### Task 1: ClamAV Protocol Client And Gateway

**Files:**
- Create: `services/clamav-scanner/clamd-client.mjs`
- Create: `services/clamav-scanner/server.mjs`
- Create: `services/clamav-scanner/Dockerfile`
- Create: `services/clamav-scanner/compose.yaml`
- Create: `services/clamav-scanner/README.md`
- Create: `tests/clamav-scanner.test.mjs`

**Interfaces:**
- Produces: `scanBufferWithClamd(buffer, options)` returning `{ verdict, engine, engineVersion, scannedAt, threats }`.
- Produces: authenticated `POST /scan` and readiness `GET /health`.

- [x] Write a failing test that starts a fake TCP server, asserts the exact `zINSTREAM\0` frame/chunk terminator, and returns clean, found, and error responses.
- [x] Run `node tests/clamav-scanner.test.mjs`; expect module-not-found or missing-export RED.
- [x] Implement bounded ClamAV TCP framing and response parsing with socket timeout and output cap.
- [x] Add gateway tests for bearer authentication, MIME/body limits, rate limiting, clean/detected JSON, and generic failures.
- [x] Implement the native HTTP gateway and container definitions. Use the official pinned `clamav/clamav:1.5.3_base` image only on the private Compose network.
- [x] Run `node tests/clamav-scanner.test.mjs`; expect all scanner tests to pass.

### Task 2: Fail-Closed Filestack Finalization

**Files:**
- Modify: `server/backend/api/file-uploads.js`
- Modify: `tests/file-uploads.test.mjs`

**Interfaces:**
- Consumes: `CLASSLOOP_MALWARE_SCANNER_URL`, `CLASSLOOP_MALWARE_SCANNER_TOKEN`, and the gateway contract from Task 1.
- Produces: finalized resource with `scan: { engine, engineVersion, scannedAt, verdict: "clean" }` only after a clean result.

- [x] Extend the integration test first so session creation fails without scanner configuration and finalization proves metadata -> bounded download -> scanner -> share ordering.
- [x] Add failing cases for malicious, malformed, stale/future, timeout/non-2xx, oversized download, and cleanup behavior.
- [x] Run `npm run test:file-uploads`; expect RED because the existing handler issues a URL without scanning.
- [x] Implement scanner configuration validation, bounded Filestack download, scanner call/receipt validation, best-effort Filestack removal, and clean-only URL issuance.
- [x] Run `npm run test:file-uploads`; expect all upload integration tests to pass.

### Task 3: Teacher Scan Receipt UX

**Files:**
- Modify: `src/components/FilestackResourceUpload.tsx`
- Modify: `tests/browser/file-uploads.spec.ts`

**Interfaces:**
- Consumes: finalization `scan` receipt.
- Produces: scan-in-progress text and time-bounded clean-result copy before the resource appears.

- [x] Update the browser test first to require scanner receipt parsing and “No malware was detected by ClamAV” success copy.
- [x] Run `node scripts/run-playwright.cjs tests/browser/file-uploads.spec.ts --project=chromium`; expect RED against current copy/schema.
- [x] Extend the response parser and UI states without exposing server configuration or threat names.
- [x] Rerun the focused browser test; expect PASS.

### Task 4: Configuration, Docs, And Evidence

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/filestack-resource-uploads.md`
- Modify: `package.json`
- Create: `docs/testing/clamav-upload-gate.tdd.md`
- Modify: `codexsecondbrain-sync-2026-04-30.md`

**Interfaces:**
- Produces: exact deployment variables, Docker instructions, release proof matrix, npm test routing, and preserved RED/GREEN evidence.

- [x] Add `test:malware-scanner` and include it in `test:unit`.
- [x] Document HTTPS, token rotation, `freshclam`, private networking, EICAR verification, cleanup, and truthful receipt language.
- [x] Record actual RED/GREEN commands and outputs in the TDD evidence file.
- [x] Run `npm run test:malware-scanner`, `npm run test:file-uploads`, the focused browser test, `npm run test:security`, `npm run build`, `npm run test:coverage:import-cloud`, `npm run audit:prod`, and `git diff --check`.
- [x] If Docker is available, run the Compose health check plus clean/EICAR/outage probes; otherwise record Docker live proof as blocked rather than simulated.

### Task 5: Security Review And CSB Capture

**Files:**
- Modify: `/Users/rushil/obsidian/codexvault/codexsecondbrain/01 Projects/ClassLoop/ClassLoop.md`
- Modify: `/Users/rushil/obsidian/codexvault/codexsecondbrain/03 Resources/Codex/External Resource Upload and Email Validation API Policy.md`

**Interfaces:**
- Consumes: final diff and verification evidence.
- Produces: canonical local/pushed/deployed state, threat boundaries, live-proof gaps, and reusable self-hosted scanner policy.

- [x] Review the diff for SSRF, token leakage, public `clamd`, fail-open behavior, oversized bodies/responses, stale verdicts, unsafe redirects, and false assurance copy.
- [x] Recheck `git status`, `HEAD`, and `origin/main`; record local/uncommitted/unpushed/deployed truth precisely.
- [x] Update the existing project and reusable policy notes without storing credentials.
