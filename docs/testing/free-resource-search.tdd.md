# Free Resource Search TDD Evidence

## Source

The user requested a reusable free-API path based on `public-apis/public-apis`. The journey was derived during this run; no external plan file was used.

## User journey

As a teacher reviewing a ClassLoop draft, I can type a non-private learning topic, inspect results from currently verified keyless providers, and explicitly add a useful resource without sending classroom records to those providers.

## RED and GREEN

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Provider adapter and API handler | `npm run test:free-resources` failed with `ERR_MODULE_NOT_FOUND` for `server/backend/api/free-resources.js`. | `npm run test:free-resources` passed. | Queries are bounded, provider records are normalized, unsafe records are skipped, partial failure is reported, responses are no-store, and repeated queries use a short-lived server cache. |
| Teacher review flow | Targeted Playwright reached Follow-up review, then failed because the privacy notice/search control did not exist. | `node scripts/run-playwright.cjs tests/browser/free-resources.spec.ts --project=chromium --workers=1` passed `1/1`. | The teacher sees the privacy boundary, sends only the entered topic, reviews a result, explicitly adds it, and cannot add the same URL twice. |

## Verification targets

- Provider and handler contract: `tests/free-resources.test.mjs`
- Teacher browser journey: `tests/browser/free-resources.spec.ts`
- Full repository gate: `npm run verify:ci`
- Coverage gate: included through `npm run verify:ci`; ClassLoop's scoped import/cloud line threshold remains 80%.

## Known boundary

The automated tests mock upstream provider responses. A separate live probe verified the current Wikipedia and Open Library endpoints on 2026-08-06, but provider uptime remains external and is handled as a recoverable partial failure.
