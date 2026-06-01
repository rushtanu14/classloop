#!/usr/bin/env node

const { chromium } = require("@playwright/test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const appBundle = path.join(rootDir, "release", "swift-mac-arm64", "ClassLoop.app");
const appExecutable = path.join(rootDir, "release", "swift-mac-arm64", "ClassLoop.app", "Contents", "MacOS", "ClassLoop");

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listeningPortForPid(pid) {
  try {
    const output = execFileSync("lsof", ["-Pan", "-p", String(pid), "-iTCP", "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    const line = output
      .split("\n")
      .slice(1)
      .find((item) => /TCP .*:\d+ \(LISTEN\)/.test(item));
    if (!line) return null;
    const match = line.match(/:(\d+) \(LISTEN\)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function classLoopPids() {
  try {
    return execFileSync("pgrep", ["-f", appExecutable], { encoding: "utf8" })
      .split("\n")
      .map((line) => Number(line.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function waitForNewPid(existingPids) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const nextPid = classLoopPids().find((pid) => !existingPids.has(pid));
    if (nextPid) return nextPid;
    await sleep(250);
  }
  fail("Timed out waiting for the Swift macOS app process to launch.");
}

async function waitForPort(pid) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const port = listeningPortForPid(pid);
    if (port) return port;
    await sleep(250);
  }
  fail("Timed out waiting for the Swift macOS app to start its local dist server.");
}

async function main() {
  if (process.platform !== "darwin") {
    console.log("SKIP Swift macOS smoke test: macOS is required.");
    return;
  }
  if (!fs.existsSync(appExecutable)) {
    fail("Missing Swift macOS app executable. Run npm run package:mac first.");
  }

  const existing = classLoopPids();
  const existingPids = new Set(existing);
  const reusedExistingApp = existing.length > 0;
  if (!reusedExistingApp) {
    execFileSync("open", ["-n", appBundle], { cwd: rootDir, stdio: "ignore" });
  }
  const pid = reusedExistingApp ? existing[0] : await waitForNewPid(existingPids);

  const cleanup = () => {
    if (reusedExistingApp) return;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The app may already be closed.
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  const port = await waitForPort(pid);
  const url = `http://127.0.0.1:${port}/#/dashboard`;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /^ClassLoop$/i }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: /create account/i }).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: /log in/i }).waitFor({ timeout: 10_000 });
  } finally {
    await browser.close();
    cleanup();
  }

  console.log(`PASS Swift macOS packaged app smoke: ${url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
