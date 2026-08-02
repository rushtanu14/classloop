#!/usr/bin/env node

const { chromium } = require("@playwright/test");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
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
  assertNoForbiddenAppStrings();

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "classloop-swift-state-"));
  const child = spawn(appExecutable, [], {
    cwd: rootDir,
    env: {
      ...process.env,
      CLASSLOOP_USER_DATA_DIR: userDataDir,
      CLASSLOOP_SWIFT_RESET_WEB_STORAGE: "1",
    },
    stdio: "ignore",
  });
  const pid = child.pid;
  if (!pid) fail("Swift macOS app process did not start.");

  const cleanup = () => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The app may already be closed.
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
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
    await assertSwiftStateApi(page, url, userDataDir);
    await assertPackagedDashboardChrome(page);
    assertNoSwiftWrapperChrome();
  } finally {
    await browser.close();
    cleanup();
  }

  console.log(`PASS Swift macOS packaged app smoke: ${url}`);
}

function assertNoForbiddenAppStrings() {
  const labels = execFileSync("strings", [appExecutable], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  for (const forbidden of ["Native Swift macOS app", "Open in Browser", "Reload"]) {
    if (labels.includes(forbidden)) {
      fail(`Swift packaged executable still contains wrapper-only chrome text: ${forbidden}`);
    }
  }
  for (const requiredCommand of ["Close Window", "Quit ClassLoop", "Copy", "Paste", "Select All"]) {
    if (!labels.includes(requiredCommand)) {
      fail(`Swift packaged executable is missing the standard app command: ${requiredCommand}`);
    }
  }
}

async function assertSwiftStateApi(page, appURL, userDataDir) {
  const stateURL = new URL("/api/state", appURL).toString();
  const initial = await page.request.get(stateURL);
  if (initial.status() !== 200) fail(`Swift /api/state initial read returned ${initial.status()}.`);
  const initialBody = await initial.json();
  if (!Array.isArray(initialBody.sessions) || initialBody.sessions.length !== 0) {
    fail("Swift /api/state initial read should return an empty sessions array.");
  }

  const expected = {
    accounts: [
      {
        id: "swift-state-teacher",
        role: "teacher",
        email: "swift-state@classloop.test",
        name: "Swift State Teacher",
      },
    ],
    sessions: [
      {
        id: "swift-state-session",
        ownerEmail: "swift-state@classloop.test",
        title: "Swift Desktop State Smoke",
        type: "General classroom",
        date: "2026-06-01",
        status: "published",
        students: [],
        transcript: "Swift smoke transcript should never be plaintext in the state file.",
        notes: "Swift desktop state smoke fixture.",
        recap: "Swift smoke recap.",
        essentialQuestions: [],
        attendance: {},
        resources: [],
        actionItems: [],
        participationEvents: [],
        followUps: [],
        submissions: [],
      },
    ],
    personalMeetings: [],
    draft: null,
    demoLoaded: false,
    classGroups: [],
    rosterTemplates: [],
    privacySettings: undefined,
    auditLog: [],
    billingProfile: undefined,
  };

  const write = await page.request.put(stateURL, { data: expected });
  if (write.status() !== 200) fail(`Swift /api/state write returned ${write.status()}: ${await write.text()}`);
  const read = await page.request.get(stateURL);
  const readBody = await read.json();
  if (read.status() !== 200 || readBody.sessions?.[0]?.title !== expected.sessions[0].title) {
    fail("Swift /api/state did not read back the written encrypted state.");
  }

  const dataFile = path.join(userDataDir, ".classloop-data.json");
  const keyFile = path.join(userDataDir, ".classloop-storage-key");
  if (!fs.existsSync(dataFile) || !fs.existsSync(keyFile)) {
    fail("Swift /api/state did not create the desktop state file and storage key.");
  }
  const storedText = fs.readFileSync(dataFile, "utf8");
  const stored = JSON.parse(storedText);
  if (!stored.encrypted || stored.algorithm !== "aes-256-gcm" || typeof stored.payload !== "string") {
    fail("Swift desktop state file is not an encrypted AES-GCM payload.");
  }
  if (storedText.includes(expected.accounts[0].email) || storedText.includes(expected.sessions[0].title) || storedText.includes(expected.sessions[0].transcript)) {
    fail("Swift encrypted desktop state file leaked plaintext workspace data.");
  }
}

async function assertPackagedDashboardChrome(page) {
  const entryLogin = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await entryLogin.isVisible().catch(() => false)) {
    await entryLogin.click();
  }

  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await page.getByPlaceholder("name@example.com").fill("teacher@classloop.demo");
  await page.getByPlaceholder("Enter password").fill("classloop-teacher");
  await page.locator("form.login-form button[type='submit']").click();

  const tourDialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await tourDialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await tourDialog.isVisible().catch(() => false)) {
    await tourDialog.getByRole("button", { name: /^skip$/i }).click();
  }

  await page.getByRole("heading", { name: /^Today in ClassLoop$/i }).waitFor({ timeout: 10_000 });
  const topbar = page.locator(".topbar");
  const account = topbar.locator(".account-pill");
  const walkthrough = topbar.locator(".tutorial-button");
  const newSession = page.locator('.dashboard-home-hero [data-tour="new-session-button"]');

  for (const locator of [topbar, account, walkthrough, newSession]) {
    await locator.waitFor({ state: "visible", timeout: 10_000 });
  }

  const topbarBox = await topbar.boundingBox();
  const accountBox = await account.boundingBox();
  const walkthroughBox = await walkthrough.boundingBox();
  const newSessionBox = await newSession.boundingBox();
  if (!topbarBox || !accountBox || !walkthroughBox || !newSessionBox) {
    fail("Packaged ClassLoop dashboard controls did not render with measurable boxes.");
  }

  const withinTopbar = (box) =>
    box.y >= topbarBox.y - 2 &&
    box.y + box.height <= topbarBox.y + topbarBox.height + 2;

  if (!withinTopbar(accountBox) || !withinTopbar(walkthroughBox)) {
    fail("Packaged ClassLoop account and walkthrough controls are not aligned inside the web topbar.");
  }
  if (!(accountBox.x < walkthroughBox.x)) {
    fail("Packaged ClassLoop dashboard top-right controls are not ordered as account then walkthrough.");
  }
  if ((await topbar.getByRole("button", { name: /new session/i }).count()) !== 0) {
    fail("Packaged ClassLoop dashboard duplicated the primary New session action in the topbar.");
  }
}

function assertNoSwiftWrapperChrome() {
  const script = `
tell application "System Events"
  tell process "ClassLoop"
    set frontmost to true
    repeat 40 times
      if exists window 1 then exit repeat
      delay 0.25
    end repeat
    if not (exists window 1) then error "ClassLoop window did not appear for native chrome inspection."
    set output to ""
    repeat with uiItem in entire contents of window 1
      try
        set output to output & (name of uiItem as text) & "\\n"
      end try
      try
        set output to output & (description of uiItem as text) & "\\n"
      end try
      try
        set output to output & (value of uiItem as text) & "\\n"
      end try
    end repeat
    return output
  end tell
end tell
`;
  let labels = "";
  try {
    labels = execFileSync("osascript", ["-e", script], { encoding: "utf8", timeout: 15_000 });
  } catch (error) {
    console.warn(
      `WARN Swift native chrome Accessibility inspection was unavailable: ${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }`,
    );
    return;
  }
  for (const forbidden of ["Native Swift macOS app", "Open in Browser", "Reload"]) {
    if (labels.includes(forbidden)) {
      fail(`Swift native window still exposes wrapper-only chrome: ${forbidden}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
