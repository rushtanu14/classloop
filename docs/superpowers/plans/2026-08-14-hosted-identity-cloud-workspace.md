# Hosted Identity and Cloud Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move profile and cloud-state authorization, validation, and persistence to FastAPI while keeping Supabase browser sign-in and current API paths.

**Architecture:** React obtains a Supabase session directly. FastAPI verifies bearer identity, derives owner and role from trusted hosted data, and calls a narrow Supabase adapter. Cloud workspace validation excludes local credentials and client-owned billing state.

**Tech Stack:** FastAPI dependencies, Supabase Python client, Pydantic, httpx, pytest, existing Supabase policy and Playwright tests.

## Global Constraints

- Passwords go directly from browser to Supabase, never through ClassLoop FastAPI.
- Cloud access requires confirmed hosted identity; local continuation remains available.
- Owner ID, role elevation, plan tier, and billing state are never accepted from the client.
- Preserve `/api/profile`, `/api/cloud-state`, and `/api/ops/supabase-keepalive` paths and method semantics.
- Request and response logs exclude user tokens and class artifacts.

---

### Task 1: Bearer verification dependency

**Files:** `python/classloop_core/api/dependencies.py`, `python/classloop_core/adapters/supabase.py`, `python/tests/unit/test_supabase_auth.py`.

**Interfaces:** `require_user(request) -> AuthenticatedUser`; `require_teacher(user, profile) -> AuthenticatedTeacher`; user contains verified `id`, normalized `email`, and confirmation state.

- [ ] Write failing tests for absent, malformed, expired, wrong-audience, unconfirmed, and valid tokens using a local test key pair.
- [ ] Run RED.
- [ ] Implement cached JWKS verification with issuer/audience checks and no service-role fallback for user identity.
- [ ] Run GREEN and security lint.
- [ ] Commit with `git commit -m "feat: verify hosted identity in Python"`.

### Task 2: Profile route parity

**Files:** `python/classloop_core/api/routes/profile.py`, `python/tests/integration/test_profile_api.py`.

**Interfaces:** `GET /api/profile` lazily creates the authenticated profile; `PATCH /api/profile` allows current privacy preferences but rejects owner and plan changes.

- [ ] Write failing parity tests from `tests/api-security.test.mjs` for auth, lazy creation, safe patch, forged owner, forged plan, and no-store headers.
- [ ] Run RED.
- [ ] Implement route and adapter calls with parameterized Supabase operations.
- [ ] Run GREEN.
- [ ] Commit with `git commit -m "feat: serve hosted profiles from Python"`.

### Task 3: Cloud-state route parity

**Files:** `python/classloop_core/services/cloud_workspace.py`, `python/classloop_core/api/routes/cloud_state.py`, `python/tests/integration/test_cloud_state_api.py`.

**Interfaces:** `GET|PUT /api/cloud-state`; maximum raw body 3.5 MB; writes strip/reject local accounts, local secrets, billing profiles, and mismatched owner records.

- [ ] Write failing tests for round-trip, owner isolation, oversized body, nested identity mismatch, forbidden fields, conflict metadata, and no-store headers.
- [ ] Run RED.
- [ ] Implement conversion, adapter upsert/select, and stable public errors.
- [ ] Run GREEN and existing cloud/security tests.
- [ ] Commit with `git commit -m "feat: sync cloud workspace through Python"`.

### Task 4: Keepalive, Vercel routing, and frontend cutover

**Files:** `python/classloop_core/api/routes/ops.py`, `api/index.py`, `vercel.json`, `src/api/classloop-client.ts`, `src/cloud.ts`, `tests/api-security.test.mjs`, `tests/cloud-sync.test.ts`.

**Interfaces:** existing paths resolve to FastAPI; `GET|POST /api/ops/supabase-keepalive` preserves cron authorization; Supabase sign-in APIs remain in `src/cloud.ts` while protected product requests move to `ClassLoopClient`.

- [ ] Add failing route-dispatch and source-contract tests proving profile/cloud/keepalive hit Python and browser passwords still call Supabase directly.
- [ ] Run RED.
- [ ] Wire Vercel Python entry, cut over client calls, and delete replaced JavaScript handlers.
- [ ] Run Python auth/cloud tests, existing security/cloud tests, hosted-local Playwright, build, and diff check.
- [ ] Commit with `git commit -m "refactor: cut hosted workspace over to Python"`.
