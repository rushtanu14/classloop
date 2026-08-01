# ClassLoop maintainer map

| Concern | Source of truth | Primary validation |
|---|---|---|
| Terminology/trust boundaries | `AGENTS.md`, `CONTEXT.md`, `LEGAL.md` | `npm run test:security` |
| Domain records | `src/types.ts` | `npm run typecheck` |
| Import generation | `src/data.ts`, `src/transcript.ts` | `npm run test:import` |
| UI/routing/publishing | `src/App.tsx`, `src/styles.css` | `npm run test:browser` |
| Supabase auth/API | `src/cloud.ts` | `npm run test:cloud` |
| Queue/conflicts | `src/cloudSync.ts` | `npm run test:cloud` |
| Owner payload scoping | `src/cloudWorkspace.ts` | `npm run test:cloud` |
| Retention | `src/retention.ts` | `npm run test:cloud` |
| Vercel dispatch | `api/index.js` | `npm run test:security` |
| Hosted handlers | `server/backend/api/` | `npm run test:security` |
| Entitlements | billing handlers, `src/cloud.ts` | `npm run test:entitlements` |
| Database/RLS | `supabase/schema.sql` | `npm run test:security` |
| Email delivery | email handler | security tests and delivery Playwright spec |
| MCP/Composio | `mcp/`, integration server | `npm run test:mcp` |
| Electron state/security | `desktop/main.cjs` | `npm run test:desktop:state` |
| Swift wrapper | `macos-swift/ClassLoopSwift/` | `npm run test:swift:mac` on macOS |
| PWA/install metadata | `public/` | `npm run test:web:local` |
| Build | `vite.config.ts`, `src/main.tsx` | `npm run build` |
| Packaging/release | `package.json`, `scripts/`, `ops/` | target-specific release checks |

## Non-negotiable invariants

1. Keep desktop useful without Supabase, Stripe, SMTP, or integration credentials.
2. Keep hosted-demo mutations memory-only and clearly unsaved.
3. Require teacher review of generated educational output.
4. Trust hosted billing profiles—not client state—for paid entitlement.
5. Exclude local secrets, encryption keys, and billing state from cloud workspace payloads.
6. Never expose server secrets through `VITE_*`, tracked env files, logs, or screenshots.
7. Keep transcript paste/upload reliable when capture/integrations fail.
8. Restrict students to published, identity-matched content.
9. Show honest unavailable installer states and validate artifacts on target hosts.
10. Update Playwright coverage and `codexsecondbrain-sync-2026-04-30.md` for visible workflows.

## Change workflow

1. Read scoped instructions and check the worktree.
2. Identify the data owner and trust boundary above.
3. Add a failing characterization test for changed behavior.
4. Make the smallest domain-cohesive change; avoid growing the `App.tsx` monolith.
5. Run the narrow check and then `npm run verify:ci`.
6. For visible changes, run desktop/phone Playwright coverage and capture a screenshot.
7. For packaging, rebuild the shared dist and validate on the target OS/architecture.
8. Inspect the diff, run `git diff --check`, commit, and prepare the pull request.
