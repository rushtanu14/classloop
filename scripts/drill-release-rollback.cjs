const fs = require("fs");
const os = require("os");
const path = require("path");
const asar = require("@electron/asar");

const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "release");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const productName = packageJson.build?.productName || "ClassLoop";
const cliArgs = process.argv.slice(2);
const currentHostOnly = cliArgs.includes("--current-host");
const rollbackTarget =
  cliArgs.find((argument) => argument !== "--current-host") ||
  process.env.CLASSLOOP_ROLLBACK_TARGET_VERSION ||
  "last-known-good";

const requiredArtifacts = [
  { platform: "darwin", rel: `${productName}-Swift-${version}-arm64.dmg`, label: "Swift macOS arm64 DMG", minBytes: 250 * 1024 },
  { platform: "darwin", rel: `${productName}-Swift-${version}-arm64-mac.zip`, label: "Swift macOS arm64 ZIP", minBytes: 250 * 1024 },
  { platform: "win32", rel: `${productName} Setup ${version}.exe`, label: "Windows x64 NSIS installer", minBytes: 10 * 1024 * 1024 },
  { platform: "win32", rel: `${productName}-${version}-win.zip`, label: "Windows x64 ZIP", minBytes: 10 * 1024 * 1024 },
  { platform: "win32", rel: `${productName}-${version}-arm64-win.zip`, label: "Windows arm64 ZIP", minBytes: 10 * 1024 * 1024 },
  { platform: "linux", rel: `${productName}-${version}.AppImage`, label: "Linux x64 AppImage", minBytes: 10 * 1024 * 1024 },
  { platform: "linux", rel: `${productName}-${version}-arm64.AppImage`, label: "Linux arm64 AppImage", minBytes: 10 * 1024 * 1024 },
];

const optionalArtifacts = [
  { rel: `classloop_${version}_amd64.deb`, label: "Linux x64 deb", minBytes: 10 * 1024 * 1024 },
  { rel: `classloop_${version}_arm64.deb`, label: "Linux arm64 deb", minBytes: 10 * 1024 * 1024 },
];

const platformTargets = [
  {
    platform: "darwin",
    id: "macOS arm64",
    executable: path.join("release", "swift-mac-arm64", `${productName}.app`, "Contents", "MacOS", productName),
    bundledDist: path.join("release", "swift-mac-arm64", `${productName}.app`, "Contents", "Resources", "dist", "index.html"),
  },
  {
    platform: "win32",
    id: "Windows x64",
    executable: path.join("release", "win-unpacked", `${productName}.exe`),
    appAsar: path.join("release", "win-unpacked", "resources", "app.asar"),
  },
  {
    platform: "win32",
    id: "Windows arm64",
    executable: path.join("release", "win-arm64-unpacked", `${productName}.exe`),
    appAsar: path.join("release", "win-arm64-unpacked", "resources", "app.asar"),
  },
  {
    platform: "linux",
    id: "Linux x64",
    executable: path.join("release", "linux-unpacked", productName.toLowerCase()),
    appAsar: path.join("release", "linux-unpacked", "resources", "app.asar"),
  },
  {
    platform: "linux",
    id: "Linux arm64",
    executable: path.join("release", "linux-arm64-unpacked", productName.toLowerCase()),
    appAsar: path.join("release", "linux-arm64-unpacked", "resources", "app.asar"),
  },
];

function fail(message) {
  throw new Error(message);
}

function requireFile(relPath, label, minBytes = 1) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) fail(`${label} is missing: ${relPath}`);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile() || stat.size <= 0) fail(`${label} is empty or not a file: ${relPath}`);
  if (stat.size < minBytes) {
    fail(`${label} is too small to be a valid release artifact: ${relPath} (${stat.size.toLocaleString()} bytes)`);
  }
  console.log(`PASS ${label}: ${relPath} (${stat.size.toLocaleString()} bytes)`);
  return fullPath;
}

function verifyMetadata(relPath) {
  const fullPath = requireFile(path.join("release", relPath), `${relPath} release metadata`);
  const text = fs.readFileSync(fullPath, "utf8");
  if (!text.includes(version)) fail(`${relPath} does not reference release version ${version}.`);
  console.log(`PASS ${relPath} references ${version}`);
}

function extractJsonFromAsar(appAsar, filePath) {
  const raw = asar.extractFile(appAsar, filePath);
  return JSON.parse(raw.toString("utf8"));
}

function verifyPackagedApp(target) {
  const executable = requireFile(target.executable, `${target.id} packaged executable`);
  fs.accessSync(executable, fs.constants.R_OK);
  if (target.bundledDist) {
    requireFile(target.bundledDist, `${target.id} bundled dist/index.html`);
    console.log(`PASS ${target.id} Swift app includes bundled ClassLoop dist`);
    return;
  }
  const appAsar = requireFile(target.appAsar, `${target.id} app.asar`);
  const packagedPackage = extractJsonFromAsar(appAsar, "package.json");
  const mainFile = packagedPackage.main || "desktop/main.cjs";
  if (packagedPackage.name !== packageJson.name) fail(`${target.id} app.asar package name is ${packagedPackage.name}.`);
  if (packagedPackage.version !== version) fail(`${target.id} app.asar version is ${packagedPackage.version}.`);
  if (mainFile !== packageJson.main) fail(`${target.id} app.asar main is ${mainFile}, expected ${packageJson.main}.`);
  const mainStat = asar.statFile(appAsar, mainFile);
  const distStat = asar.statFile(appAsar, "dist/index.html");
  if (!mainStat?.size) fail(`${target.id} app.asar is missing ${mainFile}.`);
  if (!distStat?.size) fail(`${target.id} app.asar is missing dist/index.html.`);
  console.log(`PASS ${target.id} asar metadata: ${packagedPackage.name}@${packagedPackage.version}, main ${mainFile}`);
}

function writeRollbackSimulation() {
  const drillDir = fs.mkdtempSync(path.join(os.tmpdir(), "classloop-rollback-drill-"));
  const timestamp = new Date().toISOString();
  const manifest = {
    generatedAt: timestamp,
    mode: "non-destructive rollback drill",
    badRelease: {
      product: productName,
      version,
      reason: "Simulated bad release for rollback rehearsal.",
      quarantineAction: "Do not upload these artifacts or point public download URLs at them.",
    },
    rollbackTarget: {
      version: rollbackTarget,
      action: "Restore the previous known-good hosted deployment and public installer URLs.",
    },
    publicDownloadManifest: "public/classloop-downloads.json",
    verification: [
      "Hosted landing page shows the previous known-good installer link or Packaging pending.",
      "Manual install-over-replace keeps Swift macOS or Electron desktop data in the per-user data directory.",
      "Run npm run test:desktop:first-run on each host OS and npm run test:release:distribution before re-opening downloads.",
    ],
  };
  const comms = [
    `ClassLoop rollback drill ${timestamp}`,
    "",
    `Bad release quarantined: ${productName} ${version}`,
    `Rollback target: ${rollbackTarget}`,
    "",
    "Teacher-facing status:",
    "We paused the latest desktop download while we validate a replacement build. Existing local ClassLoop data is not affected.",
    "",
    "Internal next steps:",
    "1. Restore the previous Vercel deployment or redeploy main at the known-good commit.",
    "2. Replace bad installer URLs in public/classloop-downloads.json with known-good external-host URLs, or leave them unset so the UI says Packaging pending.",
    "3. Run hosted web smoke, packaged first-run smoke, and release distribution verification before announcing recovery.",
    "",
  ].join("\n");

  fs.writeFileSync(path.join(drillDir, "rollback-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(drillDir, "teacher-status-draft.txt"), comms);
  console.log(`PASS rollback simulation written to ${drillDir}`);
}

function run() {
  if (!fs.existsSync(releaseDir)) {
    fail("Missing release/. Run npm run package:mac, npm run package:win, and npm run package:linux before this rollback drill.");
  }

  const artifactsToVerify = currentHostOnly
    ? requiredArtifacts.filter((artifact) => artifact.platform === process.platform)
    : requiredArtifacts;
  const targetsToVerify = currentHostOnly
    ? platformTargets.filter((target) => target.platform === process.platform)
    : platformTargets;
  if (!artifactsToVerify.length || !targetsToVerify.length) {
    fail(`Rollback drill does not define release targets for host platform ${process.platform}.`);
  }
  console.log(
    `Rollback artifact scope: ${currentHostOnly ? `current host (${process.platform})` : "all supported platforms"}.`,
  );

  for (const artifact of artifactsToVerify) {
    requireFile(path.join("release", artifact.rel), artifact.label, artifact.minBytes);
  }
  for (const artifact of optionalArtifacts) {
    const relPath = path.join("release", artifact.rel);
    if (fs.existsSync(path.join(rootDir, relPath))) {
      requireFile(relPath, artifact.label, artifact.minBytes);
    } else {
      console.warn(`WARN optional ${artifact.label} is absent. Publish the AppImage, or build .deb on a Linux host before offering Debian packages.`);
    }
  }
  for (const metadata of ["latest.yml", "latest-linux.yml", "latest-linux-arm64.yml"]) {
    if (fs.existsSync(path.join(releaseDir, metadata))) {
      verifyMetadata(metadata);
    } else {
      console.warn(`WARN optional ${metadata} release metadata is absent. Public downloads use direct installer/AppImage URLs.`);
    }
  }
  for (const target of targetsToVerify) {
    verifyPackagedApp(target);
  }
  writeRollbackSimulation();

  console.log("Rollback drill passed: release artifacts are inspectable and the bad-release quarantine path was rehearsed.");
}

run();
