#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const failures = [];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const pkg = readJson("package.json");
const scripts = pkg.scripts || {};

assert(
  typeof scripts["package:prepare"] === "string" && scripts["package:prepare"].includes("npm run build"),
  "package:prepare must rebuild the shared Vite dist before any desktop packaging command runs.",
);
assert(
  typeof scripts["package:prepare"] === "string" && scripts["package:prepare"].includes("verify-package-sync.cjs"),
  "package:prepare must run verify-package-sync.cjs so future packaging scripts cannot drift silently.",
);

const scriptsThatMustUseFreshDist = [
  "package",
  "package:all",
  "package:mac",
  "package:mac:electron",
  "package:win",
  "package:linux",
  "package:linux:deb",
  "swift:mac:build",
  "swift:mac:package",
  "swift:mac:run",
];

scriptsThatMustUseFreshDist.forEach((scriptName) => {
  assert(typeof scripts[scriptName] === "string", `${scriptName} is missing from package.json.`);
  assert(
    scripts[scriptName]?.includes("package:prepare"),
    `${scriptName} must run package:prepare so local source changes reach every desktop version.`,
  );
});

const preparedPackageScripts = ["package:mac:prepared", "package:win:prepared", "package:linux:prepared"];
preparedPackageScripts.forEach((scriptName) => {
  assert(typeof scripts[scriptName] === "string", `${scriptName} is missing from package.json.`);
  assert(
    !scripts[scriptName]?.includes("npm run build") && !scripts[scriptName]?.includes("package:prepare"),
    `${scriptName} should only wrap the already-prepared dist; call package:prepare from the public script instead.`,
  );
});

assert(
  scripts["package:mac:prepared"]?.includes("package-swift-mac.cjs"),
  "package:mac:prepared must package the Swift macOS app, not the Electron fallback.",
);
assert(
  scripts["package:mac:electron"]?.includes("electron-builder --mac"),
  "package:mac:electron must remain available as the explicit legacy Electron macOS fallback.",
);

assert(
  Array.isArray(pkg.build?.files) && pkg.build.files.includes("dist/**/*"),
  "electron-builder files must include dist/**/* so packaged macOS, Windows, and Linux builds share the latest web build.",
);
assert(
  Array.isArray(pkg.build?.files) && pkg.build.files.includes("desktop/**/*"),
  "electron-builder files must include desktop/**/* so local Electron shell changes package with the web build.",
);

const swiftSource = readText("macos-swift/ClassLoopSwift/Sources/ClassLoopSwift/ClassLoopSwiftApp.swift");
assert(
  swiftSource.includes("CLASSLOOP_SWIFT_LOCAL_DIST") && swiftSource.includes("LocalDistServer"),
  "Swift macOS app must load the local dist build instead of drifting to unrelated bundled code.",
);
assert(
  swiftSource.includes("Bundle.main.resourceURL") && swiftSource.includes('appendingPathComponent("dist"') && swiftSource.includes("127.0.0.1"),
  "Swift macOS app must be able to serve the bundled dist inside ClassLoop.app.",
);
assert(
  swiftSource.includes("reloadLocalAppIfUnhealthy") && !swiftSource.includes("webView?.load(request)"),
  "Swift macOS startup recovery must health-check before reloading so first-click auth actions are not swallowed.",
);

const downloads = readJson("public/classloop-downloads.json");
assert(
  downloads.macos?.arm64Url?.includes("ClassLoop-Swift-") && downloads.macos?.arm64ZipUrl?.includes("ClassLoop-Swift-"),
  "public/classloop-downloads.json must point macOS users at the Swift app DMG/ZIP.",
);
assert(
  downloads.macos?.sourceUrl?.includes("macos-swift/ClassLoopSwift"),
  "public/classloop-downloads.json must expose the Swift macOS source option.",
);

if (failures.length) {
  console.error("ClassLoop package sync check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("PASS ClassLoop package sync guard: local changes rebuild shared dist before Swift macOS, Windows, and Linux packaging.");
