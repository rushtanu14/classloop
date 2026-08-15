# Python Billing and Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Python authoritative for Free/Pro decisions, Stripe checkout and portal creation, webhook updates, and account preparation without trusting client plan state.

**Architecture:** Pure entitlement functions consume trusted profile and Stripe facts. FastAPI routes require confirmed identity, while the webhook independently verifies Stripe signatures and writes server-owned profile state through the Supabase adapter.

**Tech Stack:** Python Stripe SDK, FastAPI, Pydantic, Supabase adapter, pytest, existing entitlement and Playwright tests.

## Global Constraints

- Real paid access is server-owned; a client cannot set `plan_tier` or subscription fields.
- Local testing upgrades are device-only and never enter cloud state.
- Checkout requires a confirmed cloud identity.
- Portal URLs must use `https://billing.stripe.com` exactly.
- Webhook operations are idempotent and verify the raw signed body.
- Sample Workspace cannot start checkout or receive durable entitlement.

---

### Task 1: Pure entitlement policy

**Files:** `python/classloop_core/domain/entitlements.py`, `python/tests/unit/test_entitlements.py`.

**Interfaces:** `resolve_entitlement(profile: BillingProfile, subscription: StripeSubscription | None) -> Entitlement`; returns `free`, `included_pro`, or `stripe_pro` plus allowed actions.

- [ ] Write failing table-driven tests for free, included/manual Pro, active Stripe, canceled Stripe, stale client Pro, mismatched customer, and local-test states.
- [ ] Run RED.
- [ ] Implement one pure resolver with immutable Pydantic inputs.
- [ ] Run GREEN with 100% focused branch coverage.
- [ ] Commit with `git commit -m "feat: define server-owned entitlements in Python"`.

### Task 2: Account preparation and checkout

**Files:** `python/classloop_core/adapters/stripe.py`, `python/classloop_core/api/routes/billing.py`, `python/tests/integration/test_billing_checkout.py`.

**Interfaces:** `POST /api/billing/prepare-account`; `POST /api/billing/checkout`; return only allowlisted Stripe checkout URLs and trusted entitlement data.

- [ ] Write failing tests for unauthenticated, unconfirmed, sample, free, included Pro, existing customer, duplicate checkout idempotency, forged email, wrong URL host, and provider failure.
- [ ] Run RED.
- [ ] Implement narrow adapter calls and route dependencies.
- [ ] Run GREEN.
- [ ] Commit with `git commit -m "feat: create Stripe checkout in Python"`.

### Task 3: Billing portal

**Files:** `python/classloop_core/api/routes/billing.py`, `python/tests/integration/test_billing_portal.py`.

**Interfaces:** `POST /api/billing/portal`; active Stripe subscribers receive a validated cancellation portal; included/manual Pro receives a truthful non-cancellable result.

- [ ] Write failing tests for active, included, missing subscription, forged customer, non-Stripe URL, and provider timeout.
- [ ] Run RED.
- [ ] Implement direct cancellation-session parameters and strict return URL from configured public URL.
- [ ] Run GREEN.
- [ ] Commit with `git commit -m "feat: open Stripe billing portal from Python"`.

### Task 4: Signed idempotent webhook

**Files:** `python/classloop_core/api/routes/billing.py`, `python/classloop_core/services/billing_webhook.py`, `python/tests/integration/test_billing_webhook.py`.

**Interfaces:** `POST /api/billing/webhook`; accepted events update profile by authenticated Stripe customer metadata, record event ID, and safely replay.

- [ ] Write failing tests for invalid signature, oversized raw body, supported events, ignored events, duplicate event ID, customer mismatch, active/canceled subscription, and database failure.
- [ ] Run RED.
- [ ] Implement raw-body verification, event allowlist, idempotency record, and server-owned profile update.
- [ ] Run GREEN plus existing entitlement/security tests.
- [ ] Cut over billing handlers and commit with `git commit -m "refactor: move billing authority to Python"`.

### Task 5: Browser billing parity

**Files:** `src/api/classloop-client.ts`, `src/cloud.ts`, `src/App.tsx`, `tests/browser/classloop.spec.ts`.

**Interfaces:** React sends no plan tier/customer/subscription fields; UI renders normalized entitlement and validated checkout/portal results.

- [ ] Add failing Playwright/source tests for public upgrade, included Pro, Stripe Pro, unconfirmed account, and forged local state.
- [ ] Run RED.
- [ ] Route billing through `ClassLoopClient` and remove replaced frontend entitlement helpers.
- [ ] Run focused Stripe Playwright, Python billing, existing entitlement/security, typecheck, and build tests.
- [ ] Commit with `git commit -m "refactor: consume Python billing authority"`.
