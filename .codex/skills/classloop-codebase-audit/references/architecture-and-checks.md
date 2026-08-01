# Architecture and checks

## Core paths

- `src/App.tsx`: routing, boot/auth/persistence, pages, publishing, analytics, and billing UI.
- `src/data.ts`: roster/transcript parsing and generated sessions.
- `src/types.ts`: classroom and personal records.
- `src/cloud*.ts`: Supabase auth, offline conflicts, and owner-scoped workspace conversion.
- `server/backend/api/`: hosted implementation; `api/index.js` dispatches Vercel requests.
- `supabase/schema.sql`: tables, indexes, functions, and row-level security.
- `desktop/main.cjs`: Electron security and encrypted state bridge.
- `macos-swift/ClassLoopSwift/`: Apple-silicon wrapper around the shared dist.
- `mcp/`: local preview-first MCP server.
- `tests/browser/`: end-to-end product and hosted-web workflows.

## Check matrix

| Change | Narrow check | Merge-ready expansion |
|---|---|---|
| Parser | `npm run test:import` | `npm run verify:ci` |
| Cloud/persistence | `npm run test:cloud` | security tests and verify CI |
| Billing | `npm run test:entitlements` | billing Playwright and verify CI |
| API/schema | `npm run test:security` | `npm run verify:ci` |
| MCP | `npm run test:mcp` | `npm run verify:ci` |
| Visible workflow | relevant Playwright grep | full browser tests and verify CI |
| Public/PWA | `npm run test:web:local` | deployed asset verification |
| Electron state | `npm run test:desktop:state` | packaged clean-host smoke |
| Packaging | `npm run test:package:sync` | target OS distribution checks |

Use `npm run test:all` only when the environment can satisfy its platform-, credential-, and artifact-sensitive claims.

## Priority rubric

1. Unauthorized access, secret exposure, false entitlement, demo persistence, or unreviewed student output.
2. Data loss, stale overwrite, corrupt persistence, migration, or recovery failure.
3. Misleading educational output, matching errors, inaccessible critical paths, or dishonest downloads.
4. Architectural concentration, documentation drift, slow tests, and bundle growth.
5. New product capability.
