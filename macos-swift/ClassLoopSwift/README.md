# ClassLoop Swift macOS Preview

This folder contains a native SwiftUI/WKWebView shell for ClassLoop on macOS. It is a preview path beside the Electron desktop app, not a replacement for the current release installer.

## Build

From the repository root:

```bash
npm run swift:mac:build
```

The script builds the React app into `dist/`, then compiles the Swift package.

## Run

```bash
npm run swift:mac:run
```

The Swift shell loads `dist/index.html` when a local build exists. If `dist/` is missing, it falls back to the hosted ClassLoop shell at `https://classloop-followup.vercel.app/#/dashboard`.

You can point the Swift shell at another built web directory:

```bash
CLASSLOOP_SWIFT_LOCAL_DIST=/absolute/path/to/dist swift run --package-path macos-swift/ClassLoopSwift ClassLoopSwift
```

## Current Boundary

- The Swift preview uses WebKit persistent website storage.
- The Electron app remains the packaged desktop release path with existing installer checks, local APIs, and distribution scripts.
- A signed/notarized `.app`/`.dmg` for the Swift version still needs an Xcode archive/export or equivalent packaging step before it should be offered as a production installer.
