# Python Product Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port ClassLoop's email, resource search, feedback, upload security, ClamAV, internal provider-import, and MCP services to focused Python modules without exposing unfinished integrations.

**Architecture:** API routes validate identity and input, services enforce ClassLoop rules, and adapters contain provider-specific HTTP/SMTP/protocol behavior. Each JavaScript handler remains active until its Python replacement passes parity and security tests.

**Tech Stack:** FastAPI, Pydantic, httpx, standard `smtplib`, HMAC/AES-GCM helpers, ClamAV INSTREAM, Python MCP SDK, pytest.

## Global Constraints

- Manual transcript/roster/notes import remains the reliable free path.
- Unfinished integrations remain absent from teacher, student, sample, billing, and public UI.
- No transcript, roster, student email, token, provider response body, or secret enters logs.
- External requests use fixed HTTPS hosts, explicit timeouts, bounded response sizes, and normalized output.
- Mutations require explicit teacher action and truthful receipts.

---

### Task 1: Free resource search

**Files:** `python/classloop_core/services/resource_search.py`, `python/classloop_core/adapters/public_resources.py`, `python/classloop_core/api/routes/resources.py`, `python/tests/integration/test_resource_search_api.py`.

**Interfaces:** `GET /api/free-resources?q=`; 2-80 character topic; only Wikipedia and Open Library adapters; normalized `title`, `url`, `source`, `description`, and warnings.

- [ ] Write failing provider and API tests for valid partial results, timeout, invalid query, spoofed host, cache key, response cap, rate limit, and no-store.
- [ ] Run RED.
- [ ] Implement the two explicit adapters, service merge/de-duplication, bounded cache, and route.
- [ ] Run GREEN plus existing `npm run test:free-resources`.
- [ ] Cut over and delete the replaced JavaScript handler; commit with `git commit -m "feat: search learning resources through Python"`.

### Task 2: Recap email and creator feedback

**Files:** `python/classloop_core/adapters/smtp.py`, `python/classloop_core/services/email_delivery.py`, `python/classloop_core/api/routes/email.py`, `python/classloop_core/api/routes/feedback.py`, `python/tests/integration/test_email_feedback_api.py`.

**Interfaces:** `POST /api/email/send-recaps`; `POST|OPTIONS /api/feedback`; SMTP remains environment-only; feedback consent and transcript-context rules remain explicit.

- [ ] Write failing tests for teacher auth, recipient filtering, formatted app password, partial failure, demo no-send, CORS preflight, feedback consent, size caps, and transcript exclusion from logs.
- [ ] Run RED.
- [ ] Implement message construction with `email.message.EmailMessage`, SMTP adapter, delivery receipts, and bounded feedback persistence.
- [ ] Run GREEN plus existing email/security browser slices.
- [ ] Cut over handlers and commit with `git commit -m "feat: deliver ClassLoop messages through Python"`.

### Task 3: Upload authorization and private scanner

**Files:** `python/classloop_core/adapters/filestack.py`, `python/classloop_core/adapters/clamav.py`, `python/classloop_core/services/file_uploads.py`, `python/classloop_core/api/routes/uploads.py`, `python/classloop_core/scanner/app.py`, `python/classloop_core/scanner/clamd.py`, `python/classloop_core/scanner/receipts.py`, `python/tests/integration/test_file_uploads_api.py`, `python/tests/unit/test_scanner.py`.

**Interfaces:** `POST /api/file-uploads/session`; `POST /api/file-uploads/finalize`; private scanner `GET /health` and `POST /scan`; finalization returns a share URL only after a fresh signed clean receipt.

- [ ] Write failing tests covering bearer auth, teacher-bound receipts, filename prefix, metadata/type/extension/size, signed provider reads, clean file, EICAR result, stale/future receipt, timeout, outage, malformed clamd output, deletion attempt, and no threat-name exposure.
- [ ] Run RED.
- [ ] Implement bounded provider download, scanner protocol, exact-token auth, HMAC receipts, and fail-closed finalization.
- [ ] Run GREEN plus `npm run test:file-uploads` and `npm run test:malware-scanner`.
- [ ] Replace Node scanner/handler code only after parity; commit with `git commit -m "feat: secure uploads with Python ClamAV gate"`.

### Task 4: Internal provider imports

**Files:** `python/classloop_core/services/integration_imports.py`, `python/classloop_core/api/routes/integrations.py`, `python/tests/integration/test_integration_imports_api.py`.

**Interfaces:** preserve exact status/connect/connections/records/import-preview routes; selection tokens remain short-lived AES-GCM and bind user, provider account, query, tool version, and fingerprint.

- [ ] Write failing tests for teacher auth, allowlist, token binding, expiry, payload redaction, preview-only behavior, explicit apply boundary, reconnect, and public visibility gate.
- [ ] Run RED.
- [ ] Port normalization and token behavior into focused service functions and adapters.
- [ ] Run GREEN plus internal integration Playwright and manifest tests.
- [ ] Cut over handlers and commit with `git commit -m "refactor: move provider imports to Python"`.

### Task 5: Local MCP parity

**Files:** `python/classloop_core/mcp_server.py`, `python/tests/integration/test_mcp_server.py`, `package.json`, delete replaced `mcp/*.ts` after parity.

**Interfaces:** the MCP surface remains local, preview-first, bounded, and read-only unless an existing exact approved action says otherwise.

- [ ] Write failing tool-list and preview contract tests from the existing MCP smoke fixtures.
- [ ] Run RED.
- [ ] Implement the same named tools with Pydantic inputs and core service calls.
- [ ] Run Python MCP tests and existing MCP smoke tests against the Python server.
- [ ] Remove replaced TypeScript MCP code and commit with `git commit -m "refactor: serve ClassLoop MCP from Python"`.
