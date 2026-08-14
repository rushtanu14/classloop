# ClassLoop Python Core Migration Design

**Date:** 2026-08-14

**Status:** Approved architecture; implementation planning pending

**Branch:** `rushex/python-first-rebuild`

**Decision:** Preserve the existing React interface while moving ClassLoop's business rules and hosted services into a readable Python core.

## Summary

ClassLoop will remain a React, Vite, Electron, and PWA product at the user-interface boundary. Python 3.12, FastAPI, and Pydantic will become the authority for transcript and roster parsing, draft generation, workspace validation, cloud APIs, billing, email, resource discovery, uploads, and integration adapters.

The migration will happen in vertical slices. Each slice must match the existing behavior through contract fixtures and user-flow tests before the corresponding TypeScript or JavaScript implementation is removed. The current application remains runnable throughout the migration.

The finished codebase will still contain TypeScript where a browser requires it, but product rules will no longer be buried in React components or duplicated across browser and server code.

## Goals

1. Make the code Rushil is most likely to change understandable Python organized by product responsibility.
2. Preserve the current ClassLoop interface, public routes, teacher workflow, student workflow, Sample Workspace, PWA shell, and desktop distribution.
3. Keep transcript paste/upload and local desktop operation useful without Supabase, Stripe, or another paid service.
4. Preserve security and privacy boundaries: teacher review before publish, owner-scoped cloud state, server-owned paid entitlements, student access only to published identity-matched content, and memory-only visitor changes in the Sample Workspace.
5. Preserve existing local and cloud data through explicit schema conversion and compatibility tests.
6. Replace the duplicated macOS Swift wrapper with the shared Electron wrapper only after macOS behavior and packaging reach parity.
7. Leave the project in a state where one documented Python command runs the core tests and one documented development command starts the full product.

## Non-goals

- Redesigning the interface or changing ClassLoop's visual identity.
- Adding new classroom, AI, LMS, payment, analytics, or capture features during the migration.
- Replacing React with a Python UI framework.
- Moving Supabase password entry through ClassLoop's server; browser sign-in continues to go directly to Supabase.
- Introducing Redux, a generated frontend API SDK, microservices, a message queue, or a repository abstraction for every model.
- Changing the Supabase schema unless a compatibility or security requirement makes a narrow migration necessary.
- Claiming live OAuth, payment, email, upload-provider, or installer readiness from mocked or local tests.

## Definition of "Mainly Python"

The target is based on responsibility rather than an arbitrary line-count percentage:

- Python owns domain models, parsing, generated educational drafts, validation, persistence rules, authorization checks, entitlements, and server integrations.
- TypeScript owns React rendering, browser events, Supabase browser sign-in, the service worker, and Playwright browser tests.
- JavaScript or CommonJS remains only where Electron, Vite, or a packaging tool requires it.
- CSS continues to own presentation.

If a future behavior change affects what a session contains, who may see it, how it is stored, or whether an action is allowed, the primary change should normally be made in Python.

## Architecture

```text
React interface
  |
  | typed JSON over the existing /api paths
  v
FastAPI application
  |-- Pydantic request/response models
  |-- transcript and roster parsing
  |-- session and follow-up generation
  |-- workspace and publication rules
  |-- cloud, billing, email, resource, and upload services
  v
Adapters
  |-- encrypted local desktop storage
  |-- Supabase
  |-- Stripe
  |-- SMTP
  |-- bounded external providers
```

### Hosted mode

Vite builds the React application as it does today. FastAPI serves the hosted API through Vercel's Python runtime. Hosted durable state remains in Supabase and uses the authenticated Supabase user ID as the owner boundary. The hosted PWA caches the application shell and public assets; durable signed-in operations require network access and must report offline state truthfully.

The Sample Workspace remains a special frontend-only surface. Visitor-created sample data stays in React memory and is cleared on reload, sign-out, or tab close. It is never sent to FastAPI, local storage, Supabase, telemetry, or analytics. Static seeded samples may load again because they are product fixtures.

When an authenticated hosted user explicitly generates a draft from real class artifacts, the interface must disclose that the selected transcript, roster, notes, and resource links are sent to the hosted ClassLoop service for processing. Class artifacts are validated in memory, excluded from application logs, and retained only through the user's explicit save or cloud-sync action. The local desktop app remains the recommended path for teachers who want processing to stay on their device.

### Desktop mode

Electron remains the shared desktop window and lifecycle wrapper. During startup it launches a packaged Python executable that runs the same FastAPI application on `127.0.0.1` using an operating-system-assigned port.

The Python process emits one structured startup message containing the selected port. Electron supplies a new cryptographically random authentication token for each launch through the child environment and keeps the token in the main process. A narrow preload API lets the renderer request an allowlisted ClassLoop operation; Electron attaches the token and proxies the request to Python. React never receives the port or token. The Python service accepts only loopback traffic carrying the launch token, rejects browser-originated requests, never writes the token to disk, and terminates when the Electron parent exits.

Development mode runs the Python package through the local interpreter. Release mode bundles it with PyInstaller in directory form, then includes that target-specific artifact in Electron Builder resources. Python artifacts are built on each target operating system rather than cross-compiled.

The existing Swift wrapper remains untouched until Electron passes equivalent macOS arm64 window, shortcut, storage, first-run, packaging, and no-device-credential-prompt checks. It is then removed in a dedicated cleanup slice, and `npm run package:mac` becomes the Electron arm64 packaging path.

## Proposed File Structure

```text
pyproject.toml                # Python metadata and development dependencies
python/
  classloop_core/
    __init__.py
    api/
      app.py                 # FastAPI construction and middleware
      dependencies.py        # auth, plan, request, and desktop-token dependencies
      errors.py              # stable public error envelope
      routes/
        drafts.py
        workspace.py
        profile.py
        cloud_state.py
        billing.py
        email.py
        resources.py
        uploads.py
        integrations.py
    domain/
      models.py              # classroom, student, session, task, and resource models
      accounts.py            # account roles and identity rules
      entitlements.py        # Free/Pro decisions from trusted server state
      publication.py         # draft, review, publish, and student visibility rules
    parsing/
      roster.py
      transcript.py
      resources.py
      session_builder.py
    services/
      workspace.py
      local_storage.py
      cloud_workspace.py
      email_delivery.py
      resource_search.py
      file_uploads.py
      integration_imports.py
    adapters/
      supabase.py
      stripe.py
      smtp.py
      filestack.py
      clamav.py
      public_resources.py
    scanner/
      app.py                 # private authenticated ClamAV gateway
      clamd.py               # bounded INSTREAM protocol client
      receipts.py            # signed fresh scan receipts
    mcp_server.py            # local preview-first ClassLoop MCP surface
    desktop/
      server.py              # loopback startup and parent-lifecycle handling
  tests/
    contract/
    fixtures/
    unit/
    integration/

src/
  api/
    classloop-client.ts      # the only general React-to-Python client
    contracts.ts             # UI-facing TypeScript response shapes
    errors.ts
    transport.ts             # hosted fetch or narrow Electron IPC transport
  features/
    auth/
    teacher/
    import/
    review/
    student/
    analytics/
    settings/
    public/
  App.tsx                    # top-level boot and routing only
```

Files should normally stay between roughly 100 and 400 lines. A file may be longer when keeping one cohesive state machine together is clearer than splitting it. Functions should describe one behavior, use domain names, and include short comments for privacy, security, or compatibility decisions that are not obvious from the code.

## Technology Choices

- Python 3.12.
- FastAPI, Pydantic 2, and Uvicorn for the core application and local development server.
- `httpx` for bounded outbound HTTP and FastAPI integration tests.
- `cryptography` for AES-GCM local state and signed compatibility helpers.
- Supabase's Python client for hosted database access, with explicit bearer-token verification and owner checks at the ClassLoop boundary.
- Stripe's Python SDK for checkout, portal, webhook verification, and subscription state.
- Python's standard `smtplib` and `email` packages for the existing server-side SMTP path.
- PyInstaller directory builds for target-specific desktop artifacts.
- pytest, pytest-cov, Ruff, and mypy for Python verification.

These are direct dependencies with a clear ClassLoop responsibility. The migration does not add an ORM, dependency-injection framework, task queue, alternative package manager, or generated frontend client.

## API Contract

Python preserves the current externally configured `/api/*` paths, including the Stripe webhook and Supabase keepalive URL. React reaches general product endpoints only through `src/api/classloop-client.ts`; components do not call `fetch` directly. In hosted mode the client uses `fetch`. In desktop mode it uses the narrow Electron IPC transport, which adds the private loopback token in the main process.

The Python application exposes these explicit routes:

- `POST /api/drafts/generate`
- `POST /api/workspace/validate`
- `GET|PUT /api/cloud-state`
- `GET|PATCH /api/profile`
- `GET /api/config`
- `POST /api/billing/prepare-account`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`
- `POST /api/email/send-recaps`
- `POST|OPTIONS /api/feedback`
- `GET /api/free-resources`
- `POST /api/file-uploads/session`
- `POST /api/file-uploads/finalize`
- `GET /api/integrations/status`
- `POST /api/integrations/connect`
- `GET /api/integrations/connections`
- `POST /api/integrations/records`
- `POST /api/integrations/import-preview`
- `GET|POST /api/ops/supabase-keepalive`

Each route returns `405` for methods outside this list. `OPTIONS` is handled centrally for routes that require browser preflight, while `/api/feedback` preserves its explicit current preflight behavior.

Successful responses use the narrowest response model required by the UI. Errors use one stable envelope:

```json
{
  "error": {
    "code": "workspace_invalid",
    "message": "ClassLoop could not save this workspace.",
    "field": null,
    "retryable": false
  }
}
```

Public messages are actionable and do not expose stack traces, provider bodies, SQL details, credentials, threat names, or account-enumeration clues. Server logs contain a request ID and redacted operational context, never transcripts, rosters, passwords, tokens, or payment data.

Pydantic is the server authority for all request and response validation. The frontend keeps small handwritten TypeScript types because generated-client tooling would add complexity. Contract tests send shared JSON fixtures through both sides to detect drift.

## Core Data Flow

### Teacher import and draft generation

1. React collects the teacher-selected transcript, roster, notes, template, and resource links.
2. React applies only browser concerns such as file reading, visible size feedback, and form state.
3. `POST /api/drafts/generate` validates size and type limits before parsing.
4. Python normalizes the roster and transcript, matches speakers, records unmatched participants, extracts bounded resources and action items, and constructs a teacher-reviewable draft.
5. React renders the returned draft without inventing additional educational content.
6. Teacher edits stay in view state until an explicit save or publish action.
7. Python validates the edited workspace and publication transition before persistence.

### Publication and student access

1. A session begins as a draft owned by the teacher.
2. Only an explicit publish action creates student-visible output.
3. Published student data is derived from the validated reviewed draft, not regenerated during student access.
4. A student sees only publications linked to the authenticated identity-matched student record.
5. Name-only records never receive synthetic email addresses and never link to an account by name alone.

### Browser authentication and hosted authorization

1. React uses the Supabase browser client for signup, confirmation, recovery, and sign-in.
2. React sends the Supabase access token as a bearer token to protected FastAPI routes.
3. Python validates the token and derives the owner ID and teacher/student role from trusted hosted state.
4. Python never trusts a client-provided owner ID, plan tier, billing state, or role elevation.
5. Local continuation remains available when cloud configuration is absent or email confirmation is pending; cloud sync and paid checkout remain gated by confirmed hosted identity.

## Persistence and Compatibility

### Local desktop state

Python replaces the Electron implementation of ClassLoop workspace rules and encrypted state serialization. It continues to use AES-GCM with a prompt-free local key file rather than Keychain, `safeStorage`, biometrics, or an operating-system password prompt.

Before the first Python write, the application:

1. Reads and validates the current encrypted state through a compatibility reader.
2. Writes a timestamped backup beside the existing state file.
3. Converts the state into the new versioned Pydantic model.
4. Writes to a temporary file, flushes it, and atomically replaces the active state file.
5. Reopens and validates the saved state before reporting success to React.

Failed conversion or persistence leaves the existing active file unchanged and returns a truthful blocking error. Tests cover current fixtures, empty state, malformed state, interrupted writes, stale writes, deletion durability, and process restart.

### Cloud state

The Python cloud-workspace model accepts the current stored snapshot version and writes a new version only after round-trip compatibility passes. It excludes local accounts, password hashes, local encryption material, billing profiles, and client-owned entitlement fields.

Cloud writes remain owner-scoped and capped at the existing bounded request size. Conflicts return both the trusted server version metadata and a human-readable choice; they never silently overwrite newer work.

## Security and Privacy Invariants

- All external input is validated at the FastAPI boundary with Pydantic and explicit byte, record, and nesting limits.
- Protected hosted routes derive identity from a verified bearer token.
- Paid entitlements come from server-owned Stripe/Supabase state. Local testing upgrades remain device-only and cannot alter hosted entitlement.
- The desktop Python service listens only on loopback, requires the per-launch token, accepts requests only from Electron's main-process proxy, and shuts down with its parent. The token and selected port never enter React.
- Sample Workspace mutations remain memory-only.
- Generated classroom material remains a teacher-reviewed draft until explicit publish.
- Student access is limited to published, identity-matched records.
- No secret enters a `VITE_*` variable, tracked source, response body, screenshot, test fixture, or log.
- SMTP credentials, provider keys, webhook secrets, service-role keys, and upload-signing secrets stay server-side.
- Resource search uses fixed HTTPS provider hosts, bounded queries, timeouts, normalized output, and teacher-selected additions.
- Resource uploads preserve the existing teacher ownership, type, extension, size, signed-provider metadata, fresh ClamAV receipt, and fail-closed share-link boundary.
- ClassLoop does not claim a message, payment, upload, external import, or persistence action succeeded until the authoritative operation succeeds.

## Error Handling

Errors are handled where they can be resolved:

- Pydantic rejects malformed boundary input with a stable field-level response.
- Domain functions return or raise named ClassLoop errors, not HTTP responses.
- API routes translate domain and adapter errors into the public error envelope.
- Provider adapters use fixed timeouts and bounded retries only for safe idempotent reads.
- Mutating actions are not automatically retried unless they carry an idempotency key and the provider supports it.
- React shows the server message, preserves unsaved teacher input, and offers retry only when `retryable` is true.
- Unexpected errors receive a request ID, a generic user message, and a redacted server log entry.

Desktop startup failure shows one recovery screen with the Python process exit status and a local log path. It does not silently fall back to a different persistence implementation.

## Migration Program

The program is intentionally split into independently verifiable subprojects. Each subproject gets a focused implementation plan and must leave the app runnable.

### Slice 1: Python foundation and parser parity

- Add `pyproject.toml`, the package skeleton, domain models, shared fixtures, and pytest configuration.
- Port roster parsing, transcript parsing, resource extraction, and session generation using tests first.
- Run the same realistic import fixtures through TypeScript and Python and compare normalized JSON.
- Add the Python draft endpoint without routing production UI to it.
- Remove no TypeScript production logic in this slice.

Exit gate: Python matches the accepted import corpus, noisy transcript fixture, privacy filtering, unmatched-participant behavior, and deterministic quality checks.

### Slice 2: React API boundary and draft vertical slice

- Add the single React API client and stable error handling.
- Route teacher import, review, edit, and draft creation through Python behind a temporary build-time migration switch.
- Split only the affected import and review code out of `App.tsx`.
- Run old and new browser journeys against the same fixtures.
- Make Python the default after parity and delete the old parser/generator path.

Exit gate: teacher import through visible draft review behaves equivalently on desktop and phone-sized browser tests.

### Slice 3: Local workspace and desktop runtime

- Port local workspace validation, serialization, encryption, deletion durability, retention, and restart behavior.
- Add the authenticated loopback desktop server and Electron process lifecycle.
- Add current-state compatibility, backup, atomic-write, and restart tests.
- Route local desktop persistence through Python and remove the replaced Electron state logic.

Exit gate: current saved-state fixtures migrate without loss; prompt-free first run, relaunch, deletion, failure recovery, and desktop shortcuts pass on macOS arm64.

### Slice 4: Hosted identity and cloud workspace

- Port profile and cloud-state handlers.
- Keep Supabase browser sign-in; move token validation, role enforcement, snapshot validation, and owner-scoped persistence to Python.
- Preserve email-confirmation, local-continuation, conflict, request-size, and no-client-entitlement behavior.
- Route the hosted UI to Python and retire the replaced JavaScript handlers.

Exit gate: auth, confirmation, owner isolation, profile, cloud round-trip, conflict, and security suites pass without live synthetic-account creation.

### Slice 5: Product services

- Port recap email, free resource search, file-upload authorization/finalization, the private ClamAV scanner gateway and client, feedback, the local MCP surface, and existing release-gated provider import handlers.
- Keep unfinished integrations hidden from public product UI.
- Preserve manual transcript/roster/notes import as the reliable free path.
- Retire each JavaScript service only after focused tests and browser coverage pass.

Exit gate: mocked provider tests, SSRF and secret-exposure tests, desktop/mobile visible flows, and unauthenticated rejection checks pass. Live provider proof remains a separate release gate.

### Slice 6: Billing and entitlement authority

- Port checkout, portal, webhook, profile preparation, and entitlement normalization to Python.
- Preserve server-owned plan state and strict billing URL validation.
- Keep local testing upgrades separate from real paid access.
- Remove the JavaScript billing implementation only after security and idempotency tests pass.

Exit gate: Free, manual-included Pro, Stripe-backed Pro, checkout, portal, webhook, and forged-client-state tests pass.

### Slice 7: Frontend decomposition and legacy removal

- Finish splitting `App.tsx` by the existing product features without redesigning them.
- Remove temporary migration switches, legacy clients, replaced JavaScript APIs, duplicated TypeScript domain logic, and obsolete tests.
- Retain one straightforward boot/routing component and one API client.
- Update architecture, setup, testing, and maintainer documentation.

Exit gate: no browser component contains server authorization, entitlement, parsing, publication, or persistence rules; the full local CI and browser matrices pass.

### Slice 8: Packaging and release parity

- Build the Python artifact on macOS, Windows, and Linux target hosts.
- Include it in Electron packages and validate first-run process launch, clean shutdown, storage, and recovery.
- Replace the Swift macOS wrapper only after Electron macOS parity is proven.
- Re-run PWA and public-route checks.
- Keep deployment, live providers, notarization, and non-current-host installers as explicit external gates.

Exit gate: local source verification is green and each claimed installer has clean-host evidence on its exact target. No deployment or live integration is inferred from local success.

## Testing Strategy

### Python tests

- `pytest` unit tests for every domain rule, parser, and validation boundary.
- Integration tests for FastAPI routes using the real application and in-memory or temporary adapters.
- Shared golden fixtures for roster formats, transcript formats, action items, resources, session drafts, workspace snapshots, and public errors.
- Security tests for authentication, authorization, request limits, owner isolation, entitlement forgery, SSRF, secret leakage, webhook verification, and desktop loopback authentication.
- Minimum 80% Python line coverage, with higher focused coverage for parsing, workspace validation, authorization, and entitlements.

### Frontend and end-to-end tests

- Existing Playwright coverage remains the authority for visible user workflows.
- Each migrated slice gets a focused desktop and phone-sized browser journey.
- Contract tests verify the React client accepts every Python response fixture and renders every public error state.
- Sample Workspace tests verify no fetch, storage, cookie, Supabase, telemetry, or analytics write occurs for visitor-created state.
- Accessibility checks continue to cover names, keyboard access, contrast, focus behavior, reduced motion, and target sizes.

### Release checks

During migration, `npm run verify:ci` remains green and gains a Python test command. A merge-ready tree must pass:

1. Python formatting, linting, type checking, tests, coverage, and dependency audit.
2. React type checking and production build.
3. Existing unit, security, cloud, parser, billing, upload, resource, and UI-control tests that still apply.
4. The full Playwright browser matrix.
5. Package synchronization and current-host desktop checks.
6. `git diff --check`.

Target-host packaging, live email, live payment, live upload providers, live OAuth, and production deployment remain separate explicit checks.

## Development Commands

The implementation plan will preserve simple commands with these intended responsibilities:

- `npm run dev` starts Vite and the Python development API together.
- `npm run test:python` runs the Python test suite and coverage gate.
- `npm run test:import` runs the Python parser/import regression suite after cutover.
- `npm run verify:ci` runs both Python and frontend verification.
- `npm run package:mac`, `npm run package:win`, and `npm run package:linux` build the target-specific Python artifact before Electron packaging.

Python setup uses a normal local virtual environment and editable development install. A second Python environment manager is not required to understand or change the application.

## Rollback and Removal Rules

- Migration switches are build-time developer controls, never user-facing settings.
- A slice keeps its old implementation until contract and visible-flow parity pass.
- The old path is removed in the same slice that makes Python authoritative; permanent dual implementations are not allowed.
- Local-state migration always retains the pre-migration backup.
- Database changes require a reversible migration and existing-row verification.
- A failed slice can revert to the preceding working commit without requiring the user to repair data manually.
- The final cleanup removes every migration switch and documents the remaining intentional TypeScript and JavaScript boundaries.

## Documentation Standard

The finished repository must explain the system at three levels:

1. `README.md`: how to install, run, test, and locate major features.
2. `docs/classloop-maintainer-map.md`: where each product workflow lives and which checks verify it.
3. Focused module docstrings and comments: why a non-obvious privacy, security, or compatibility boundary exists.

Documentation should point to exact files and commands. It should not duplicate implementation details that are already clear from small modules and tests.

## Acceptance Criteria

The migration is complete only when all of the following are true:

- The React interface and public routes retain their current product behavior and visual language.
- Python is authoritative for parsing, generated drafts, workspace/publication rules, persistence, authorization, entitlement, and hosted service behavior.
- The normal teacher import, review, publish, student follow-up, student completion, Individual Account, class management, analytics, privacy, and plan workflows pass browser tests.
- Existing supported local and cloud data is readable without manual repair.
- Local desktop use works without Supabase or Stripe configuration and never triggers a device credential prompt.
- Hosted owner isolation, email confirmation, student identity matching, and server-owned entitlement rules pass security tests.
- Sample Workspace changes are proven memory-only.
- The temporary compatibility implementations and migration switches are removed.
- `App.tsx` contains only application bootstrapping and top-level routing, with product features in focused components.
- Python tests meet the 80% line-coverage floor and all high-risk modules have direct focused tests.
- Full local CI and browser verification pass on the final tree.
- Installer, provider, payment, email, and deployment claims are limited to the exact external checks actually performed.

## Final Decision

ClassLoop will use a staged Python-core migration with a preserved React interface. FastAPI and Pydantic become the business-logic and server boundary; React becomes a thin presentation client; Electron becomes the single cross-platform desktop wrapper after macOS parity; and old implementations are deleted slice by slice once tests prove the Python replacements.
