# Release Rollback Drill

ClassLoop desktop releases are manual download/install releases. The app does not auto-download desktop updates yet, so rollback means stopping distribution of the bad artifacts, restoring a known-good hosted deployment or download URLs, and telling teachers whether to reinstall.

## Run The Drill

```bash
npm run drill:rollback
```

The drill is non-destructive. It verifies the local `release/` artifacts and update metadata for macOS arm64 plus Windows and Linux across x64 and arm64 where packaged, inspects each unpacked `app.asar`, and writes a simulated bad-release quarantine manifest in a temporary directory.

Pass criteria:

- macOS DMG/ZIP, Windows NSIS/ZIP, Linux AppImage, and `latest*.yml` files exist and are large enough to be real release artifacts. Debian packages are optional and must be built/verified on a Linux host before offering `.deb` downloads.
- Each unpacked app has a readable executable, `package.json`, `desktop/main.cjs`, and `dist/index.html` inside `app.asar`.
- Public download links can be rolled back to known-good URLs or left unset so the landing page says `Packaging pending`.

## Real Rollback Steps

1. Freeze the bad release: stop uploads, remove the bad GitHub/S3/R2 release assets from public download links, and keep the files locally for diagnosis. Do not use Vercel Blob for installer rollback storage; ClassLoop keeps Vercel storage reserved for the web/PWA shell and APIs.
2. Restore the previous hosted deployment in Vercel, or redeploy `main` at the last known-good commit.
3. Set `public/classloop-downloads.json` to known-good installer URLs hosted outside Vercel Blob. Leave any uncertain platform blank so the UI shows `Packaging pending`.
4. Run `npm run test:web` against the restored hosted URL.
5. On each host OS, run `npm run test:desktop:first-run` against the known-good packaged app, record the result in `test-results/clean-host-verification.json`, and run `npm run test:release:distribution` before re-opening public installer links.
6. Publish a short teacher-facing status update: what was paused, whether local data is affected, and what to reinstall.

## Teacher Status Template

```text
We paused the latest ClassLoop desktop download while we validate a replacement build.
Existing local ClassLoop data is not affected because it is stored in your user data folder, not inside the app bundle.
Use the hosted demo or reinstall the previous desktop build until the replacement is posted.
```
