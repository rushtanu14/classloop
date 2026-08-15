# Packaging and Release Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the Python core with Electron on each supported operating system, prove current-host behavior, retire the Swift wrapper after macOS parity, and preserve truthful external release gates.

**Architecture:** PyInstaller creates a directory artifact on the target host. Electron Builder includes that artifact as an extra resource and launches its stable entry path. Source verification is common; installer claims remain target-specific.

**Tech Stack:** PyInstaller, Electron Builder, macOS codesigning, existing packaging/smoke/rollback scripts, Playwright PWA checks.

## Global Constraints

- macOS public package remains Apple silicon arm64 unless Rushil changes the release target.
- Windows and Linux packages may retain supported x64/arm64 targets.
- Linux defaults to AppImage; `.deb` is built and validated only on Linux.
- No installer is public-ready without clean-host validation on its exact OS and architecture.
- No live provider, payment, email, notarization, or deployment claim follows from a local build.

---

### Task 1: Reproducible Python artifact

**Files:** `classloop-core.spec`, `scripts/build-python-core.cjs`, `tests/python-artifact.test.mjs`, `package.json`.

**Interfaces:** `npm run build:python` writes `build/python-core/<platform>-<arch>/classloop-core`; artifact starts the desktop server and emits the ready JSON line.

- [ ] Write a failing artifact test for stable output path, missing dependency failure, startup handshake, health request, and clean shutdown.
- [ ] Run RED.
- [ ] Implement PyInstaller directory build with explicit package data and deterministic cleanup of its narrow output directory.
- [ ] Run GREEN on the current host and inspect bundled dependency inventory.
- [ ] Commit with `git commit -m "build: package Python core"`.

### Task 2: Electron Builder integration

**Files:** `package.json`, `desktop/main.cjs`, `scripts/verify-package-sync.cjs`, `tests/package-python-core.test.mjs`.

**Interfaces:** development uses interpreter module; packaged mode resolves `process.resourcesPath/python-core/classloop-core`; package preparation always builds Python before Electron.

- [ ] Write failing package-manifest and resolver tests for development, packaged macOS, Windows, Linux, missing binary, and executable mode.
- [ ] Run RED.
- [ ] Add `extraResources`, target-path resolution, and package command ordering.
- [ ] Run package-sync, artifact, build, and current-host first-run checks.
- [ ] Commit with `git commit -m "build: bundle Python core with Electron"`.

### Task 3: macOS Electron parity and Swift retirement

**Files:** `scripts/smoke-packaged-first-run.cjs`, `scripts/smoke-desktop-state.cjs`, `scripts/smoke-swift-mac.cjs`, `package.json`, `macos-swift/ClassLoopSwift`, release docs.

**Interfaces:** `npm run package:mac` builds Electron arm64; Command-W/Q, Dock reopen, hide/minimize/full-screen, encrypted state, no credential prompt, DMG, and ZIP behavior remain covered.

- [ ] Add failing Electron macOS parity tests matching every current Swift smoke assertion.
- [ ] Run RED on the Electron package.
- [ ] Fix only parity gaps, sign nested Python binaries through Electron Builder, and rerun first-run/state/shortcut/package checks.
- [ ] After parity passes, remove Swift sources/scripts and update package commands/docs.
- [ ] Commit with `git commit -m "build: standardize macOS on Electron"`.

### Task 4: PWA and public distribution truth

**Files:** `public/classloop-downloads.json`, `public/sw.js`, `playwright.web.config.ts`, `tests/browser/classloop-web.spec.ts`, `scripts/verify-release-distribution.cjs`.

**Interfaces:** public routes and Add-to-phone remain; missing installer URLs show packaging-in-progress; detected installer never guesses an unsupported platform.

- [ ] Add failing desktop/mobile/ambiguous-platform tests for PWA entry, installer detection, choice list, escape hatch, and missing URL copy.
- [ ] Run RED.
- [ ] Preserve current UI while updating artifact metadata and verification checks.
- [ ] Run hosted-local PWA, production build, service-worker, and distribution verification.
- [ ] Commit with `git commit -m "test: preserve ClassLoop distribution paths"`.

### Task 5: Final source and current-host release gate

**Files:** `TESTING.md`, `README.md`, `docs/classloop-maintainer-map.md`, release check scripts.

**Interfaces:** one documented `npm run verify:ci`; one current-host packaging command; external gates listed separately with exact evidence fields.

- [ ] Add a failing documentation/source contract that requires Python setup, architecture map, common commands, data backup, recovery, and target-host evidence boundaries.
- [ ] Run RED.
- [ ] Update documentation and generated manual checklist.
- [ ] Run full Python checks, `npm run verify:ci`, full browser, hosted-local PWA, package-init/sync, current-host desktop/package/rollback/incident checks, dependency audits, and `git diff --check`.
- [ ] Commit with `git commit -m "docs: finish Python ClassLoop migration"`.
