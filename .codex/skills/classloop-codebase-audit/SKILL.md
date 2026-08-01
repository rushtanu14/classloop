---
name: classloop-codebase-audit
description: Audit, explain, and safely change the ClassLoop Electron/React/PWA classroom follow-up repository. Use for ClassLoop architecture exploration, feature planning, parser or publishing changes, auth/cloud/billing reviews, privacy and release-readiness checks, maintenance handoffs, and requests to identify or prioritize improvements.
---

# Audit the ClassLoop codebase

Build an evidence-based map before proposing changes. Preserve local-first operation, teacher review, sample-demo isolation, server-owned entitlements, and student privacy.

## Start safely

1. Read applicable `AGENTS.md` files and `CONTEXT.md`.
2. Check `git status --short --branch`; preserve unrelated work.
3. Read [references/architecture-and-checks.md](references/architecture-and-checks.md).
4. Inspect source rather than trusting overview documents.
5. Trace one complete path: input -> normalization -> state -> persistence/API -> visible output -> test.

## Choose an audit path

- For imports, inspect `src/data.ts`, `src/transcript.ts`, domain types, import tests, then browser import/review coverage.
- For UI, inspect the relevant `src/App.tsx` component, styles, state callbacks, persistence effect, and Playwright scenario.
- For auth/sync, inspect `src/cloud.ts`, `src/cloudSync.ts`, `src/cloudWorkspace.ts`, hosted handlers, schema/RLS, and cloud/security tests.
- For billing, trace checkout identity through checkout, webhook, profile storage, trusted client normalization, and entitlement tests.
- For releases, trace Vite `dist` generation into Electron/Swift packaging and target-specific checks.
- For planning, distinguish implemented behavior from aspirational docs and prioritize user risk, trust boundaries, and change cost.

## Preserve invariants

- Keep transcript paste/upload and local desktop use functional without paid services.
- Keep sample-workspace mutations memory-only.
- Treat generated educational content as a teacher-reviewed draft.
- Keep hosted Pro entitlement server-owned.
- Scope cloud workspace data to its authenticated owner; exclude local secrets and billing state.
- Never expose secrets through `VITE_*`, tracked files, logs, or screenshots.
- Restrict students to published, identity-matched content.
- Do not claim installer readiness without target-host validation.

## Report findings

Separate implemented functionality, architecture/trust boundaries, checks run, strengths, prioritized improvements, assumptions, and limitations. Do not call mocked Playwright APIs proof of live integrations, parser tests proof of educational usefulness, or a build proof of clean-host installer readiness.

## Validate changes

Run the narrow relevant check while iterating and `npm run verify:ci` before completion. Run browser tests for visible workflows. Run package checks only on platforms they honestly validate. Update the feature QA prompt for behavioral changes.

## Avoid common errors

- Do not read only `README.md`.
- Do not describe ClassLoop as only Electron; include the PWA and Swift wrapper.
- Do not conflate account role, cloud authentication, and paid entitlement.
- Do not add unrelated responsibilities to `App.tsx` when a cohesive module is possible.
- Do not recommend external integrations that conflict with free-first policy unless requested.
