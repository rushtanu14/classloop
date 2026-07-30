# ClassLoop audit remediation

## Fixed issues

### Node 20 coverage gate failure

`npm run verify:ci` previously used Node's `--test-coverage-lines=80` flag directly. The repository environment runs Node 20, which supports experimental test coverage but not that threshold flag, so CI stopped after otherwise successful build, unit, MCP, and security checks.

The coverage command now runs through `scripts/check-test-coverage.cjs`. The wrapper:

- runs the existing import and cloud tests with `process.execPath` and `--experimental-test-coverage`;
- preserves test failures and spawn errors;
- reads Node's all-files line-coverage summary;
- fails closed if the summary is absent;
- enforces an 80% default threshold on Node versions that can generate the report; and
- supports a validated `CLASSLOOP_COVERAGE_LINES` override for intentional CI policy changes.

Focused tests cover summary parsing and threshold validation. The checker is also part of `test:unit`, preventing the portable coverage gate itself from silently breaking.

### Frontend documentation drift

`FRONTEND.md` claimed the repository already used route code splitting, systematic `React.memo`, ESLint, and pre-commit hooks. Those statements did not match the checked-in configuration.

The document now describes the current Vite vendor chunking, identifies route splitting as future work, explains that memoization should be measurement-driven, states that `npm run lint` is the TypeScript check, and tells contributors to run `verify:ci` because Git hooks are not installed.

## Validation plan

1. Run `npm run test:coverage:checker`.
2. Run `npm run test:coverage:import-cloud` and confirm the measured line coverage remains at least 80%.
3. Run `npm run verify:ci` to exercise the repaired path end to end.
4. Run `npm run test:browser` after installing Playwright system dependencies.
5. Validate both Codex skills with `quick_validate.py`.
