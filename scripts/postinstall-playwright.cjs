const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const nodeBinExt = process.platform === "win32" ? ".cmd" : "";
const playwrightBin = path.join(rootDir, "node_modules", ".bin", `playwright${nodeBinExt}`);
const installTimeoutMs = Number(process.env.CLASSLOOP_PLAYWRIGHT_INSTALL_TIMEOUT_MS || 45000);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function warn(message) {
  process.stderr.write(`${message}\n`);
}

function skipped(message) {
  warn(`Skipping Playwright browser install: ${message}`);
  warn("Run `npx playwright install chromium` later if you need browser tests in this environment.");
}

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1") {
  skipped("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1");
  process.exit(0);
}

if (!fs.existsSync(playwrightBin)) {
  skipped("Playwright CLI is not available yet");
  process.exit(0);
}

log("Installing Playwright Chromium browser...");

const result = spawnSync(playwrightBin, ["install", "chromium"], {
  cwd: rootDir,
  env: process.env,
  encoding: "utf8",
  timeout: installTimeoutMs,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.status === 0) {
  process.exit(0);
}

const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
const likelyNetworkIssue = /github\.com|cdn|download|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|timed out|ECONNREFUSED|network/i.test(
  combinedOutput,
);

if (result.error?.code === "ETIMEDOUT" || likelyNetworkIssue) {
  skipped(`browser download unavailable or timed out after ${installTimeoutMs}ms`);
  process.exit(0);
}

if (result.error) {
  throw result.error;
}

process.exit(result.status || 1);
