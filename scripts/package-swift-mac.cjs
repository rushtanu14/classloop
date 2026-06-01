#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const productName = packageJson.build?.productName || "ClassLoop";
const bundleIdentifier = "com.classloop.app";
const swiftPackagePath = path.join(rootDir, "macos-swift", "ClassLoopSwift");
const releaseDir = path.join(rootDir, "release");
const swiftReleaseDir = path.join(releaseDir, "swift-mac-arm64");
const appPath = path.join(swiftReleaseDir, `${productName}.app`);
const contentsDir = path.join(appPath, "Contents");
const macOSDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const distDir = path.join(rootDir, "dist");
const executableName = productName;
const zipPath = path.join(releaseDir, `${productName}-Swift-${version}-arm64-mac.zip`);
const dmgPath = path.join(releaseDir, `${productName}-Swift-${version}-arm64.dmg`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, label, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    fail(`${label} failed${output ? `:\n${output}` : "."}`);
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

function ensureMacHost() {
  if (process.platform !== "darwin") {
    fail("Swift macOS packaging must run on macOS.");
  }
  if (os.arch() !== "arm64") {
    fail("ClassLoop Swift macOS packaging is Apple silicon arm64 only.");
  }
}

function copyRecursive(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

function findSwiftExecutable() {
  const candidates = [
    path.join(swiftPackagePath, ".build", "release", "ClassLoopSwift"),
    path.join(swiftPackagePath, ".build", "arm64-apple-macosx", "release", "ClassLoopSwift"),
    path.join(swiftPackagePath, ".build", "debug", "ClassLoopSwift"),
    path.join(swiftPackagePath, ".build", "arm64-apple-macosx", "debug", "ClassLoopSwift"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function plistEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function writeInfoPlist() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${plistEscape(productName)}</string>
  <key>CFBundleExecutable</key>
  <string>${plistEscape(executableName)}</string>
  <key>CFBundleIconFile</key>
  <string>${plistEscape(productName)}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleIdentifier}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${plistEscape(productName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${plistEscape(version)}</string>
  <key>CFBundleVersion</key>
  <string>${plistEscape(version)}</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.education</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
  </dict>
  <key>NSSupportsAutomaticTermination</key>
  <true/>
  <key>NSSupportsSuddenTermination</key>
  <true/>
</dict>
</plist>
`;
  fs.writeFileSync(path.join(contentsDir, "Info.plist"), plist);
  fs.writeFileSync(path.join(contentsDir, "PkgInfo"), "APPL????");
}

function packageApp() {
  ensureMacHost();
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    fail("Missing dist/index.html. Run npm run package:prepare before Swift macOS packaging.");
  }

  run("swift", ["build", "--package-path", swiftPackagePath], "Swift app build", {
    stdio: "inherit",
  });

  const swiftExecutable = findSwiftExecutable();
  if (!swiftExecutable) {
    fail("Could not find the compiled ClassLoopSwift executable after swift build.");
  }

  fs.rmSync(appPath, { recursive: true, force: true });
  fs.mkdirSync(macOSDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  fs.copyFileSync(swiftExecutable, path.join(macOSDir, executableName));
  fs.chmodSync(path.join(macOSDir, executableName), 0o755);
  copyRecursive(distDir, path.join(resourcesDir, "dist"));

  const iconSource = path.join(rootDir, "build", "icon.icns");
  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, path.join(resourcesDir, `${productName}.icns`));
  }
  writeInfoPlist();

  run("codesign", ["--force", "--deep", "--sign", "-", appPath], "Ad-hoc code signing", { stdio: "inherit" });

  fs.rmSync(zipPath, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", appPath, zipPath], "Swift macOS ZIP creation");

  fs.rmSync(dmgPath, { force: true });
  run(
    "hdiutil",
    ["create", "-volname", productName, "-srcfolder", appPath, "-ov", "-format", "UDZO", dmgPath],
    "Swift macOS DMG creation",
  );

  console.log(`PASS Swift macOS app bundle: ${path.relative(rootDir, appPath)}`);
  console.log(`PASS Swift macOS DMG: ${path.relative(rootDir, dmgPath)}`);
  console.log(`PASS Swift macOS ZIP: ${path.relative(rootDir, zipPath)}`);
}

packageApp();
