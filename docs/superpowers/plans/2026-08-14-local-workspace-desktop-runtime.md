# Local Workspace and Desktop Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Python authoritative for encrypted local workspace persistence and run it as an authenticated loopback service behind Electron's narrow IPC bridge.

**Architecture:** Pure workspace conversion and validation sit above a file adapter. Electron launches the Python process, owns its token and port, and proxies an allowlisted request set; React never receives the private connection details.

**Tech Stack:** Python, Pydantic, cryptography AES-GCM, FastAPI, Electron IPC, PyInstaller development spec, pytest, Node desktop smoke tests.

## Global Constraints

- Never trigger Keychain, safeStorage, biometric, or OS-password prompts.
- Preserve current encrypted state and create a timestamped backup before the first Python write.
- Use temporary-file flush and atomic replace; verify the written file before reporting success.
- Keep the previous active file unchanged on conversion or persistence failure.
- The service listens only on `127.0.0.1`; token and port remain in Electron main.

---

### Task 1: Workspace model and compatibility reader

**Files:** `python/classloop_core/services/workspace.py`, `python/tests/unit/test_workspace.py`, `python/tests/fixtures/workspace-v1.json`.

**Interfaces:** `validate_workspace(value: object) -> WorkspaceState`; `upgrade_workspace(value: object) -> WorkspaceState`; `public_workspace_dump(state: WorkspaceState) -> dict[str, object]`.

- [ ] Write failing tests for empty, current, owner-mismatched, forbidden billing/account fields, and malformed nested records.
- [ ] Run the focused pytest file and confirm missing-module failure.
- [ ] Implement explicit version conversion and owner filtering without a generic repository layer.
- [ ] Run focused tests with branch coverage and expect PASS.
- [ ] Commit with `git commit -m "feat: validate Python workspace state"`.

### Task 2: Prompt-free encrypted atomic storage

**Files:** `python/classloop_core/services/local_storage.py`, `python/tests/unit/test_local_storage.py`.

**Interfaces:** `LocalStateStore.load() -> WorkspaceState`; `LocalStateStore.save(state: WorkspaceState) -> SaveReceipt`; `LocalStateStore.backup_current() -> Path | None`.

- [ ] Write failing tests using a temporary directory for first run, compatibility read, backup, wrong key, corrupt ciphertext, interrupted write, atomic replace, reopen verification, and mode `600` key/state files.
- [ ] Run RED.
- [ ] Implement AES-GCM with a versioned envelope, random nonce, fsync, atomic replace, and no secret logging.
- [ ] Run GREEN and `ruff check python`.
- [ ] Commit with `git commit -m "feat: persist encrypted workspace in Python"`.

### Task 3: Authenticated desktop server

**Files:** `python/classloop_core/desktop/server.py`, `python/classloop_core/api/routes/workspace.py`, `python/tests/integration/test_desktop_server.py`.

**Interfaces:** startup writes exactly one JSON line `{"event":"ready","port":int}`; requests require `X-ClassLoop-Desktop-Token`; routes are `GET|PUT /api/workspace`.

- [ ] Write failing HTTP tests for loopback bind, missing/wrong token, allowed methods, body limit, parent disconnect, and state round-trip.
- [ ] Run RED.
- [ ] Implement the token dependency, loopback guard, route, startup protocol, and graceful shutdown.
- [ ] Run GREEN.
- [ ] Commit with `git commit -m "feat: serve local workspace from Python"`.

### Task 4: Electron process and IPC proxy

**Files:** `desktop/main.cjs`, `desktop/preload.cjs`, `src/api/transport.ts`, `tests/desktop-python-bridge.test.mjs`, `package.json`.

**Interfaces:** preload exposes `window.classloop.request({method,path,body})`; main allowlists draft/workspace paths and methods; token and port are never returned.

- [ ] Write a failing Node test that supplies a fake Python child, verifies handshake parsing, rejects unknown paths/methods, caps bodies, attaches the token, and kills the child on Electron shutdown.
- [ ] Run RED.
- [ ] Implement argument-array process spawning, timeout, readiness/error handling, IPC allowlist, and renderer transport selection.
- [ ] Run Node bridge, shortcut, state smoke, typecheck, and build tests.
- [ ] Commit with `git commit -m "feat: connect Electron to Python core"`.

### Task 5: State cutover and recovery UI

**Files:** `src/App.tsx`, `src/features/settings/LocalStateRecovery.tsx`, `tests/browser/error-states.spec.ts`, `scripts/smoke-desktop-state.cjs`.

**Interfaces:** desktop boot blocks on authoritative load; save receipts include `savedAt` and `version`; recovery shows log path but no transcript, token, or key.

- [ ] Add failing browser and desktop smoke tests for migration, relaunch, deletion durability, failed save, and startup recovery.
- [ ] Run RED.
- [ ] Route desktop load/save/delete through the IPC transport and preserve the current visual patterns.
- [ ] Run focused browser, desktop state, first-run, and build checks.
- [ ] Commit with `git commit -m "refactor: make Python own desktop state"`.
