# ClassLoop Swift macOS App

This folder contains the Swift macOS app for ClassLoop. macOS packaging now uses this SwiftUI/WKWebView app instead of Electron so Mac users get a native app bundle while the shared ClassLoop product UI and parser/billing/sync flows stay aligned with the hosted web/PWA build.

## Build

From the repository root:

```bash
npm run package:mac
```

The script builds the React app into `dist/`, compiles the Swift package, bundles `dist/` into `ClassLoop.app`, ad-hoc signs the app for the free distribution path, and writes:

- `release/swift-mac-arm64/ClassLoop.app`
- `release/ClassLoop-Swift-0.1.0-arm64.dmg`
- `release/ClassLoop-Swift-0.1.0-arm64-mac.zip`

## Run

```bash
npm run swift:mac:run
```

The Swift app loads the bundled `Contents/Resources/dist/index.html` in packaged builds. During local development it loads the repo `dist/index.html` when present. If no local build exists, it falls back to the hosted ClassLoop shell at `https://classloop-followup.vercel.app/#/dashboard`.

You can point the Swift shell at another built web directory:

```bash
CLASSLOOP_SWIFT_LOCAL_DIST=/absolute/path/to/dist swift run --package-path macos-swift/ClassLoopSwift ClassLoopSwift
```

## Release Boundary

- The Swift app uses WebKit persistent website storage and the same built ClassLoop app as Vercel.
- `npm run package:mac` is the macOS release path.
- `npm run package:mac:electron` remains available only as a legacy fallback while Windows and Linux still use Electron Builder.
- The free public distribution path uses ad-hoc signing. Developer ID signing/notarization can be added later with a paid Apple Developer account and installed certificates.
