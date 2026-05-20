const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const evidencePath = path.resolve(
  rootDir,
  process.env.CLASSLOOP_CLEAN_HOST_EVIDENCE || "test-results/clean-host-verification.json",
);
const distributionMode = String(process.env.CLASSLOOP_DISTRIBUTION_MODE || "free").toLowerCase();

function isDeveloperIdMode() {
  return ["developer-id", "developerid", "notarized", "paid"].includes(distributionMode);
}

function requiresCleanHostEvidence() {
  return (
    isDeveloperIdMode() ||
    ["1", "true", "yes"].includes(String(process.env.CLASSLOOP_REQUIRE_CLEAN_HOST_EVIDENCE || "").toLowerCase())
  );
}

function candidateProductNames() {
  return Array.from(new Set([packageJson.build?.productName, "ClassLoop"].filter(Boolean)));
}

function buildTargets(productName) {
  const linuxPackageName = productName.toLowerCase();
  return [
    {
      id: "macos-arm64",
      label: "macOS arm64",
      appPath: `release/mac-arm64/${productName}.app`,
      artifacts: [`release/${productName}-${version}-arm64.dmg`, `release/${productName}-${version}-arm64-mac.zip`],
    },
    {
      id: "windows-x64",
      label: "Windows x64",
      executable: `release/win-unpacked/${productName}.exe`,
      artifacts: [`release/${productName} Setup ${version}.exe`, `release/${productName}-${version}-win.zip`],
    },
    {
      id: "windows-arm64",
      label: "Windows arm64",
      executable: `release/win-arm64-unpacked/${productName}.exe`,
      artifacts: [`release/${productName}-${version}-arm64-win.zip`],
    },
    {
      id: "linux-x64",
      label: "Linux x64",
      executable: `release/linux-unpacked/${linuxPackageName}`,
      artifacts: [`release/${productName}-${version}.AppImage`],
    },
    {
      id: "linux-arm64",
      label: "Linux arm64",
      executable: `release/linux-arm64-unpacked/${linuxPackageName}`,
      artifacts: [`release/${productName}-${version}-arm64.AppImage`],
    },
  ];
}

const minimumReleaseArtifactBytes = {
  ".AppImage": 10 * 1024 * 1024,
  ".deb": 10 * 1024 * 1024,
  ".dmg": 10 * 1024 * 1024,
  ".exe": 10 * 1024 * 1024,
  ".zip": 10 * 1024 * 1024,
  ".yml": 80,
};

function fail(message) {
  throw new Error(message);
}

function abs(relPath) {
  return path.join(rootDir, relPath);
}

function rel(fullPath) {
  return path.relative(rootDir, fullPath);
}

function exists(relPath) {
  return fs.existsSync(abs(relPath));
}

function targetIsPackaged(target) {
  if (target.appPath && exists(target.appPath)) return true;
  if (target.executable && exists(target.executable)) return true;
  return target.artifacts.some((artifact) => exists(artifact));
}

function minimumBytesForArtifact(relPath) {
  const extension = Object.keys(minimumReleaseArtifactBytes).find((suffix) => relPath.endsWith(suffix));
  return extension ? minimumReleaseArtifactBytes[extension] : 1;
}

function verifyArtifactSize(relPath, label) {
  if (!exists(relPath)) return;
  const fullPath = abs(relPath);
  const stat = fs.statSync(fullPath);
  const minimumBytes = minimumBytesForArtifact(relPath);
  if (!stat.isFile() || stat.size < minimumBytes) {
    fail(`${label} is too small to be a valid release artifact: ${relPath} (${stat.size.toLocaleString()} bytes).`);
  }
}

function verifyReleaseArtifacts(packagedTargets) {
  packagedTargets.forEach((target) => {
    target.artifacts.forEach((artifact) => verifyArtifactSize(artifact, `${target.label} artifact`));
  });

  const optionalDebs = fs.existsSync(abs("release"))
    ? fs.readdirSync(abs("release")).filter((name) => /^classloop_.*_(?:amd64|arm64)\.deb$/i.test(name))
    : [];
  optionalDebs.forEach((name) => {
    verifyArtifactSize(path.join("release", name), `Optional Debian package ${name}`);
  });
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.status !== 0) {
    fail(`${label} failed:\n${output}`);
  }
  return output;
}

function inspect(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n"),
  };
}

function verifyMacSigning(packagedTargets) {
  const macTargets = packagedTargets.filter((target) => target.appPath);
  if (!macTargets.length) return;
  if (process.platform !== "darwin") {
    if (isDeveloperIdMode()) {
      fail("macOS signing/notarization must be verified on macOS with codesign, spctl, and xcrun stapler.");
    }
    console.warn("WARN free distribution mode: macOS signing details can only be inspected on macOS.");
    return;
  }

  macTargets.forEach((target) => {
    const appPath = abs(target.appPath);
    if (!fs.existsSync(appPath)) fail(`${target.label} app bundle is missing: ${target.appPath}`);

    const detailsResult = inspect("codesign", ["-dv", "--verbose=4", appPath]);
    const details = detailsResult.output;
    if (!isDeveloperIdMode()) {
      if (detailsResult.status !== 0) {
        console.warn(`WARN ${target.label} is unsigned in free distribution mode:\n${details.trim()}`);
      } else if (/Signature=adhoc/i.test(details) || /flags=.*adhoc/i.test(details)) {
        console.warn(`WARN ${target.label} is ad-hoc signed in free distribution mode.`);
      } else if (/Authority=Developer ID Application/i.test(details)) {
        console.log(`PASS ${target.label} already has Developer ID signing.`);
      } else {
        console.warn(`WARN ${target.label} is signed, but not with Developer ID. Free distribution mode will still show trust friction.`);
      }
      console.log(`PASS ${target.label} free distribution mode accepts unsigned/ad-hoc macOS artifacts with manual-open instructions.`);
      return;
    }

    if (detailsResult.status !== 0) {
      fail(`${target.label} codesign details failed:\n${details}`);
    }
    if (/Signature=adhoc/i.test(details) || /flags=.*adhoc/i.test(details)) {
      fail(`${target.label} is still ad-hoc signed. Package with a Developer ID Application identity before publishing.`);
    }
    if (!/Authority=Developer ID Application/i.test(details)) {
      fail(`${target.label} is not signed by a Developer ID Application certificate.`);
    }
    if (/TeamIdentifier=not set/i.test(details) || !/TeamIdentifier=/i.test(details)) {
      fail(`${target.label} is missing an Apple TeamIdentifier in the code signature.`);
    }

    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], `${target.label} strict codesign verification`);
    run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath], `${target.label} Gatekeeper assessment`);

    target.artifacts
      .filter((artifact) => artifact.endsWith(".dmg") && exists(artifact))
      .forEach((artifact) => {
        run("xcrun", ["stapler", "validate", abs(artifact)], `${target.label} stapled notarization ticket for ${artifact}`);
      });
    console.log(`PASS ${target.label} Developer ID signing, Gatekeeper, and stapling checks`);
  });
}

function loadCleanHostEvidence() {
  if (!fs.existsSync(evidencePath)) {
    if (!requiresCleanHostEvidence()) {
      console.warn(
        `WARN free distribution mode: missing optional clean-host evidence at ${rel(evidencePath)}. ` +
          "Run first-run smoke on clean hosts before sharing broadly.",
      );
      return null;
    }
    fail(
      `Missing clean-host verification evidence: ${rel(evidencePath)}. ` +
        "Copy ops/clean-host-verification.example.json to that path after running first-run smoke on each target OS.",
    );
  }
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  if (!Array.isArray(evidence.checks)) {
    fail(`${rel(evidencePath)} must contain a checks array.`);
  }
  return evidence;
}

function verifyCleanHostEvidence(packagedTargets) {
  const evidence = loadCleanHostEvidence();
  if (!evidence) return;
  const checksByTarget = new Map(evidence.checks.map((check) => [check.target, check]));
  const missing = [];

  packagedTargets.forEach((target) => {
    const check = checksByTarget.get(target.id);
    if (!check) {
      missing.push(`${target.label} (${target.id})`);
      return;
    }

    const checkVersion = check.version || evidence.version;
    if (checkVersion !== version) {
      fail(`${target.label} clean-host evidence is for version ${checkVersion || "unknown"}, expected ${version}.`);
    }
    if (String(check.status || "").toLowerCase() !== "pass") {
      fail(`${target.label} clean-host evidence must have status "pass".`);
    }
    if (!check.verifiedAt || Number.isNaN(Date.parse(check.verifiedAt))) {
      fail(`${target.label} clean-host evidence needs a valid verifiedAt timestamp.`);
    }
    if (!check.host) {
      fail(`${target.label} clean-host evidence needs the host/VM description used for verification.`);
    }
    if (!/test:desktop:first-run/.test(check.command || "")) {
      fail(`${target.label} clean-host evidence must record the npm run test:desktop:first-run command that passed.`);
    }
    if (!check.artifact) {
      fail(`${target.label} clean-host evidence must name the installer or unpacked artifact that was tested.`);
    }
    console.log(`PASS ${target.label} clean-host first-run evidence`);
  });

  if (missing.length) {
    fail(`Missing clean-host first-run evidence for packaged target(s): ${missing.join(", ")}.`);
  }
}

function main() {
  let packagedTargets = [];
  let selectedProductName = "";
  for (const productName of candidateProductNames()) {
    const currentTargets = buildTargets(productName).filter(targetIsPackaged);
    if (currentTargets.length) {
      packagedTargets = currentTargets;
      selectedProductName = productName;
      break;
    }
  }
  if (!packagedTargets.length) {
    fail("No packaged release artifacts found. Run the package scripts before distribution verification.");
  }

  console.log(`Checking ${selectedProductName} ${version} release artifacts.`);
  console.log(`Distribution mode: ${isDeveloperIdMode() ? "Developer ID/notarized" : "free unsigned/ad-hoc"}.`);
  verifyReleaseArtifacts(packagedTargets);
  verifyMacSigning(packagedTargets);
  verifyCleanHostEvidence(packagedTargets);
  console.log(
    isDeveloperIdMode()
      ? "Release distribution verification passed: signing/notarization and clean-host evidence are present for packaged targets."
      : "Release distribution verification passed in free mode: packaged artifacts are present, paid signing is optional, and warnings are explicit.",
  );
}

main();
