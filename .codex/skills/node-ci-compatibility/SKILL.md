---
name: node-ci-compatibility
description: Diagnose and fix Node.js test, coverage, and CI commands that fail across supported runtime versions. Use when a CLI flag is unavailable, a quality gate behaves differently by Node version, CI passes locally but fails on another runtime, or a portable wrapper is needed without weakening test or coverage requirements.
---

# Fix Node CI compatibility

Preserve the quality gate while replacing version-specific invocation details.

## Diagnose

1. Record `node --version` and the exact failing command.
2. Run the underlying operation without the unsupported convenience flag.
3. Capture the stable output or machine-readable artifact that represents the same result.
4. Check the repository's declared/supported Node versions before choosing a replacement.

## Implement a portable gate

1. Prefer a small repository script over shell-specific parsing.
2. Spawn `process.execPath` so the wrapper uses the active Node runtime.
3. Pass arguments as an array with `shell: false` behavior.
4. Preserve child exit codes and surface spawn errors.
5. Parse a narrowly identified summary; fail closed if it is missing.
6. Validate configuration bounds before running expensive work.
7. Print the measured value and required threshold on success and failure.

## Test

- Unit-test representative output parsing, missing summaries, and invalid thresholds.
- Run the real wrapped command on the oldest supported Node version.
- Run the containing CI script to prove the original failure is fixed.
- Do not lower or silently skip the threshold to gain compatibility.

## Review

- Avoid platform-specific `grep`, `awk`, or quoting when JavaScript can be portable.
- Avoid depending on experimental flags that are absent from the minimum runtime.
- Keep the wrapper focused; do not introduce a new test framework solely for output parsing.
- Document any minimum runtime that remains unavoidable.
