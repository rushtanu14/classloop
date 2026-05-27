# ClassLoop Product Scout - 2026-05-27

## Health Summary

- `git pull --rebase origin main`: passed on `main`
- `npm ci`: passed
  - `scripts/postinstall-playwright.cjs` skipped Chromium download after a 45s timeout in this environment, so browser suites were not run in this scout pass
- `npm run build`: passed
  - Current production bundle: `dist/assets/index-S49up8X4.js` at 630.95 kB raw / 176.51 kB gzip
- `npm run test:import`: passed
- Extra signal:
  - `npm run test:cloud`: passed
  - `npm run test:security`: passed

## Bugs / Risk Areas

1. High: local password reset exposes the reset code directly in the UI.
   - `handleRequestPasswordReset` generates the code client-side and returns it to the caller, then the auth modal renders that code and offers clipboard + email-draft helpers.
   - On a shared browser or shared desktop profile, anyone who knows the teacher email can reset the local password without proving inbox ownership.
   - Pointers: [`src/App.tsx`](/private/tmp/classloop-origin-main-donation/src/App.tsx:2704), [`src/App.tsx`](/private/tmp/classloop-origin-main-donation/src/App.tsx:4230), [`src/App.tsx`](/private/tmp/classloop-origin-main-donation/src/App.tsx:4546)

2. Medium: billing readiness is split across two flags, so the upgrade path can advertise hosted readiness while embedded checkout is guaranteed to fail.
   - `webReady` only requires Supabase + a Stripe price id, but the checkout route immediately errors if `VITE_STRIPE_PUBLISHABLE_KEY` is missing.
   - Result: teachers can enter the upgrade flow and only discover the misconfiguration after navigation.
   - Pointers: [`src/cloud.ts`](/private/tmp/classloop-origin-main-donation/src/cloud.ts:73), [`src/App.tsx`](/private/tmp/classloop-origin-main-donation/src/App.tsx:5725), [`src/App.tsx`](/private/tmp/classloop-origin-main-donation/src/App.tsx:5864)

3. Medium: dependency install can false-green browser readiness.
   - `npm ci` now succeeds even when Playwright Chromium could not be installed, because `postinstall` intentionally exits `0` after network timeouts.
   - That is pragmatic for constrained environments, but it also means "deps installed" no longer implies browser QA is runnable.
   - Pointers: [`scripts/postinstall-playwright.cjs`](/private/tmp/classloop-origin-main-donation/scripts/postinstall-playwright.cjs:18), [`package.json`](/private/tmp/classloop-origin-main-donation/package.json:8)

4. Medium: frontend regression radius is getting too large.
   - `src/App.tsx` is 10,451 lines and owns auth, routing, billing, capture, publishing, analytics, and landing-page behavior. The main Playwright spec is another 1,300 lines.
   - The current build output also shows a 630.95 kB app bundle, which will keep hurting startup/debuggability if more flows stay in one module.
   - Pointers: [`src/App.tsx`](/private/tmp/classloop-origin-main-donation/src/App.tsx:1), [`tests/browser/classloop.spec.ts`](/private/tmp/classloop-origin-main-donation/tests/browser/classloop.spec.ts:1)

## Feature Ideas Ranked By Impact / Effort

1. High impact / Low effort: saved "class launch kits"
   - Let teachers start a new session from a saved roster template + session type + default resources in one click.

2. High impact / Medium effort: version history for draft -> publish -> post-publish edits
   - Show what changed, who changed it, and what students actually saw.

3. High impact / Medium effort: student inbox with unread updates and reviewed-submission feedback
   - This deepens the student side without widening scope into external LMS integrations.

4. Medium impact / Low effort: absent/quiet-student catch-up pack
   - One action that bundles recap, action items, and selected resources for students flagged absent or quiet.

5. Medium impact / Medium effort: class trend snapshots by roster group
   - Aggregate participation, overdue work, and absent/quiet flags across repeated sessions for the same class.

## Quick Wins Under 1 Hour

1. Make the billing CTA explicitly route teachers to hosted checkout when the embedded publishable key is absent instead of landing on an error-first hidden checkout page.
2. Add a visible "browser QA unavailable" warning when Playwright Chromium is missing after install so product scouts and release runs cannot mistake install success for UI-test readiness.
3. Replace the local password reset code reveal with a stricter local-only recovery warning or a teacher-confirmed reset flow until a real email sender exists.

## Tests To Add

- Browser/auth regression: verify that password reset in hosted/web mode never reveals a valid reset code to an unauthenticated user.
- Billing regression: assert that missing `VITE_STRIPE_PUBLISHABLE_KEY` keeps teachers on a clear hosted-checkout path instead of an erroring embedded-checkout route.
- Tooling regression: add a small smoke that fails loudly when browser tests are requested but Chromium is unavailable.
- Import/capture regression: add parser coverage for `in_person`, `online_meeting`, and `audio` capture metadata so non-transcript workflows stay stable.

## Notes

- No code fix shipped in this run. The clearest issue is the local password reset design, which is real but should be handled deliberately rather than patched blindly.
