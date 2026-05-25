const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const nodeModulesDir = path.join(rootDir, "node_modules");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBinExt = process.platform === "win32" ? ".cmd" : "";

function rel(filePath) {
  return path.relative(rootDir, filePath);
}

function binPath(name) {
  return path.join(nodeModulesDir, ".bin", `${name}${nodeBinExt}`);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function hasExecutableBin(name) {
  return exists(binPath(name));
}

function electronBinaryPath() {
  if (process.platform === "darwin") {
    return path.join(nodeModulesDir, "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  }
  if (process.platform === "win32") {
    return path.join(nodeModulesDir, "electron", "dist", "electron.exe");
  }
  return path.join(nodeModulesDir, "electron", "dist", "electron");
}

function dependencyTreeStatus() {
  const missingBins = ["electron", "tsc", "vite", "playwright"].filter((name) => !hasExecutableBin(name));
  const missingPackages = ["electron", "typescript", "vite", "@playwright/test"].filter((name) => {
    try {
      require.resolve(name, { paths: [rootDir] });
      return false;
    } catch {
      return true;
    }
  });
  const electronBinary = electronBinaryPath();
  return {
    ok: missingBins.length === 0 && missingPackages.length === 0 && exists(electronBinary),
    missingBins,
    missingPackages,
    electronBinary,
    electronBinaryMissing: !exists(electronBinary),
  };
}

function printStatus(status) {
  if (!status.missingBins.length && !status.missingPackages.length && !status.electronBinaryMissing) return;
  if (status.missingBins.length) {
    console.warn(`Missing local package bins: ${status.missingBins.join(", ")}`);
  }
  if (status.missingPackages.length) {
    console.warn(`Missing local packages: ${status.missingPackages.join(", ")}`);
  }
  if (status.electronBinaryMissing) {
    console.warn(`Missing Electron runtime binary: ${rel(status.electronBinary)}`);
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return { ...result, label };
}

function repairElectronInstall() {
  const installScript = path.join(nodeModulesDir, "electron", "install.js");
  if (!exists(installScript)) return false;
  console.log("Repairing cached Electron runtime install...");
  const result = run(process.execPath, [installScript], "Electron install repair");
  return result.status === 0 && exists(electronBinaryPath());
}

function installDependencies() {
  const args = exists(path.join(rootDir, "package-lock.json")) ? ["ci"] : ["install"];
  console.log(`Installing ClassLoop dependencies with npm ${args.join(" ")}...`);
  return run(npmCommand, args, `npm ${args.join(" ")}`);
}

function networkishFailure(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return /github\.com|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|network|certificate|unable to verify/i.test(output);
}

function main() {
  let status = dependencyTreeStatus();
  if (status.ok) {
    console.log("ClassLoop dependency tree is ready.");
    return;
  }

  printStatus(status);
  if (status.electronBinaryMissing && repairElectronInstall()) {
    status = dependencyTreeStatus();
    if (status.ok) {
      console.log("ClassLoop dependency tree is ready after Electron cache repair.");
      return;
    }
  }

  const installResult = installDependencies();
  status = dependencyTreeStatus();
  if (installResult.status === 0) {
    if (status.electronBinaryMissing) repairElectronInstall();
    status = dependencyTreeStatus();
    if (!status.ok) {
      printStatus(status);
      throw new Error("Dependency install completed, but required ClassLoop runtime files are still missing.");
    }
    console.log("ClassLoop dependency tree is ready after install.");
    return;
  }

  if (status.ok) {
    const reason = networkishFailure(installResult) ? "network-restricted install failed" : "install failed";
    console.warn(`npm install step did not complete, but the existing dependency tree is usable; continuing (${reason}).`);
    return;
  }

  printStatus(status);
  throw new Error("ClassLoop dependencies are not usable. Re-run in an environment that can install npm/Electron/Playwright dependencies.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
