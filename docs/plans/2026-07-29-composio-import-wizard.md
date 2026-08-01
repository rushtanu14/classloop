# Composio structured-import wizard implementation plan

**Goal:** Turn ClassLoop's connection previews into an explicit, teacher-reviewed provider import flow, verify Gmail SMTP independently of Composio, and deploy the tested build.

**Safety contract:** The browser may choose an integration, a bounded query, and a server-issued record key. It may not choose Composio tools, provider arguments, connected-account IDs, auth-config IDs, or user IDs. Provider reads stay server-owned, read-only, authenticated to the current teacher, rate-limited, bounded, redacted, and version-pinned. Nothing changes a ClassLoop draft until the teacher applies selected fields.

## Tasks

1. Add pure provider-response normalization with safe candidate extraction, per-provider field mapping, deterministic record keys, size limits, prototype-pollution protection, and tests.
2. Add authenticated `records` and `import-preview` endpoints that re-read the teacher's active connection and reject stale, cross-provider, or invented record keys.
3. Add client-side immutable merge helpers for title, transcript, notes, roster, and resources, including append/fill-empty/replace conflict modes and idempotent deduplication.
4. Replace raw JSON preview cards with a guided flow: choose provider, connect, verify, browse, select, review fields, choose merge behavior, continue, and explicitly apply in New Session.
5. Preserve typed New Session fields across the integrations route with an App-owned pending normalized patch; clear it on account change, logout, discard, or successful apply.
6. Keep Gmail out of Composio. Verify the server-side app-password transport with a redacted SMTP verification and one harmless self-addressed delivery.
7. Run typecheck, build, unit/security/coverage/browser/web suites, dependency audit, and independent code/security review.
8. Deploy to Vercel production, verify live asset hashes, public PWA smoke tests, integration status, and authenticated-route rejection without a session.

## Human gates

- A teacher must complete each provider's OAuth consent in the trusted Composio page before live provider data can be executed.
- Google Classroom, Google Forms, Canvas, and Blackboard remain administrator-setup integrations until their separate OAuth or institution credentials are supplied.
- Gmail inbox delivery is verified through the configured SMTP account; Gmail is never connected through Composio.
