const fs = require("fs");
const os = require("os");
const path = require("path");
const { _electron: electron } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const dataFileName = ".classloop-data.json";
const dataKeyFileName = ".classloop-storage-key";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitForFile(filePath, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) return;
    await wait(150);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function close(app) {
  if (app) {
    const process = app.process?.();
    await Promise.race([
      app.close().catch(() => undefined),
      wait(5_000).then(() => {
        process?.kill("SIGKILL");
      }),
    ]);
  }
}

async function waitForSignInForm(page, timeoutMs) {
  const emailInput = page.getByPlaceholder("name@example.com");
  if (await emailInput.isVisible({ timeout: Math.min(5_000, timeoutMs) }).catch(() => false)) {
    return;
  }

  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: timeoutMs }).catch(() => undefined);
  const entryLogin = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await entryLogin.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await entryLogin.click();
  } else {
    const modeLogin = page.locator(".auth-mode-link").first();
    if (await modeLogin.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await modeLogin.click();
    }
  }

  await emailInput.waitFor({ timeout: timeoutMs });
}

async function launchClassLoop(userDataDir) {
  const launchTimeoutMs = positiveIntegerEnv("CLASSLOOP_DESKTOP_LAUNCH_TIMEOUT_MS", 60_000);
  const firstWindowTimeoutMs = positiveIntegerEnv("CLASSLOOP_DESKTOP_FIRST_WINDOW_TIMEOUT_MS", 60_000);
  const loginReadyTimeoutMs = positiveIntegerEnv("CLASSLOOP_DESKTOP_LOGIN_READY_TIMEOUT_MS", 30_000);
  let app;

  try {
    app = await electron.launch({
      args: [rootDir],
      cwd: rootDir,
      timeout: launchTimeoutMs,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        CLASSLOOP_USER_DATA_DIR: userDataDir,
      },
    });
    const page = await withTimeout(
      app.firstWindow({ timeout: firstWindowTimeoutMs }),
      firstWindowTimeoutMs,
      `Timed out after ${firstWindowTimeoutMs}ms waiting for ClassLoop's first Electron window.`,
    );
    page.setDefaultTimeout(loginReadyTimeoutMs);
    try {
      await waitForSignInForm(page, loginReadyTimeoutMs);
    } catch (error) {
      const title = await page.title().catch(() => "unknown");
      const url = page.url();
      throw new Error(
        `ClassLoop's first Electron window opened, but the sign-in screen did not become ready within ${loginReadyTimeoutMs}ms. ` +
          `Window title: ${title || "untitled"}. URL: ${url || "unknown"}. ${error.message}`,
      );
    }
    return { app, page };
  } catch (error) {
    await close(app);
    throw error;
  }
}

async function apiState(page, method = "GET", payload) {
  return page.evaluate(
    async ({ method: requestMethod, payload: requestPayload }) => {
      const response = await fetch("/api/state", {
        method: requestMethod,
        headers: { "Content-Type": "application/json" },
        body: requestPayload === undefined ? undefined : JSON.stringify(requestPayload),
      });
      const body = await response.json();
      return { status: response.status, body };
    },
    { method, payload },
  );
}

async function waitForSessionTitle(page, title, timeoutMs = 5_000) {
  const startedAt = Date.now();
  let lastRead;
  while (Date.now() - startedAt < timeoutMs) {
    lastRead = await apiState(page);
    if (lastRead.status === 200 && lastRead.body.sessions?.[0]?.title === title) {
      return lastRead;
    }
    await wait(150);
  }
  return lastRead;
}

async function expectEmptyWorkspace(page, label) {
  const read = await apiState(page);
  if (read.status !== 200 || !Array.isArray(read.body.sessions) || read.body.sessions.length !== 0) {
    throw new Error(`Expected an empty workspace ${label}, got status ${read.status}.`);
  }
  return read;
}

function assertNoSensitiveLeak(value, label, tokens) {
  const text = JSON.stringify(value);
  for (const token of tokens) {
    if (token && text.includes(token)) {
      throw new Error(label + " leaked sensitive desktop state token: " + token);
    }
  }
  if (/passwordHash|State Student:|Desktop state smoke fixture/i.test(text)) {
    throw new Error(label + " leaked account, transcript, or fixture details.");
  }
}
function sampleState() {
  const now = new Date().toISOString();
  return {
    accounts: [
      {
        id: "desktop-state-teacher",
        role: "teacher",
        email: "desktop-state@classloop.test",
        name: "Desktop State Teacher",
        passwordHash: "not-a-real-password-hash",
        createdAt: now,
      },
    ],
    sessions: [
      {
        id: "desktop-state-session",
        ownerEmail: "desktop-state@classloop.test",
        title: "Encrypted Desktop State Smoke",
        type: "General classroom",
        date: now.slice(0, 10),
        status: "published",
        students: [
          {
            id: "desktop-state-student",
            name: "State Student",
            email: "state-student@classloop.test",
            avatarColor: "#0f766e",
          },
        ],
        transcript: "State Student: I can see the restored follow-up.",
        notes: "Desktop state smoke fixture.",
        recap: "State smoke recap.",
        essentialQuestions: ["Can ClassLoop restore encrypted desktop state?"],
        attendance: { "desktop-state-student": "present" },
        resources: [],
        actionItems: [],
        participationEvents: [],
        followUps: [
          {
            studentId: "desktop-state-student",
            reminder: "Verify restore.",
            catchUp: "The restored state should still be readable.",
            tasks: ["Confirm encrypted backup restore"],
            dueDate: now.slice(0, 10),
            status: "todo",
            score: 80,
          },
        ],
        submissions: [],
      },
    ],
    draft: null,
    demoLoaded: false,
    classGroups: [],
    rosterTemplates: [],
    privacySettings: undefined,
    auditLog: [],
    billingProfile: undefined,
  };
}

async function run() {
  const distIndex = path.join(rootDir, "dist", "index.html");
  if (!fs.existsSync(distIndex)) {
    throw new Error("Missing dist/index.html. Run `npm run build` before `npm run test:desktop:state`.");
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "classloop-desktop-state-"));
  const dataFile = path.join(userDataDir, dataFileName);
  const dataKeyFile = path.join(userDataDir, dataKeyFileName);
  const backupFile = path.join(userDataDir, `${dataFileName}.backup`);
  const expected = sampleState();
  let classloop;

  try {
    classloop = await launchClassLoop(userDataDir);
    await expectEmptyWorkspace(classloop.page, "on initial read");
    await wait(750);
    await expectEmptyWorkspace(classloop.page, "after startup sync settled");

    const writeResult = await apiState(classloop.page, "PUT", expected);
    if (writeResult.status !== 200 || writeResult.body.sessions?.[0]?.title !== expected.sessions[0].title) {
      throw new Error(`Expected state write to succeed, got status ${writeResult.status}.`);
    }
    await waitForFile(dataFile);

    const storedText = fs.readFileSync(dataFile, "utf8");
    const stored = JSON.parse(storedText);
    if (!stored.encrypted || stored.algorithm !== "aes-256-gcm" || typeof stored.payload !== "string") {
      throw new Error("Desktop state was not written as an encrypted ClassLoop AES-GCM payload.");
    }
    if (storedText.includes(expected.accounts[0].email) || storedText.includes(expected.sessions[0].title)) {
      throw new Error("Encrypted desktop state file contains plaintext account or session data.");
    }
    if (!fs.existsSync(dataKeyFile)) {
      throw new Error("Encrypted desktop state key was not created next to the data file.");
    }

    const decryptedRead = await waitForSessionTitle(classloop.page, expected.sessions[0].title);
    if (decryptedRead.status !== 200 || decryptedRead.body.sessions?.[0]?.title !== expected.sessions[0].title) {
      throw new Error(`Expected encrypted state to decrypt through /api/state, got status ${decryptedRead.status}.`);
    }
    await wait(750);
    const stableRead = await apiState(classloop.page);
    if (stableRead.status !== 200 || stableRead.body.sessions?.[0]?.title !== expected.sessions[0].title) {
      throw new Error(`Desktop state write was not stable after app sync settled: ${JSON.stringify(stableRead.body)}`);
    }
    await close(classloop.app);
    classloop = null;

    fs.copyFileSync(dataFile, backupFile);

    classloop = await launchClassLoop(userDataDir);
    const relaunchRead = await waitForSessionTitle(classloop.page, expected.sessions[0].title);
    if (relaunchRead.status !== 200 || relaunchRead.body.sessions?.[0]?.title !== expected.sessions[0].title) {
      throw new Error(`Relaunch did not recover the encrypted desktop state: ${JSON.stringify(relaunchRead.body)}`);
    }
    await close(classloop.app);
    classloop = null;

    fs.writeFileSync(dataFile, '{"version":1,"encrypted":true,"payload":"truncated', { mode: 0o600 });
    classloop = await launchClassLoop(userDataDir);
    const corruptRead = await apiState(classloop.page);
    if (corruptRead.status !== 423 || !corruptRead.body.readOnly || !corruptRead.body.readError) {
      throw new Error(`Corrupt desktop state should surface read-only 423, got ${corruptRead.status}.`);
    }
    assertNoSensitiveLeak(corruptRead.body, "Corrupt desktop read response", [
      expected.accounts[0].email,
      expected.sessions[0].title,
      expected.sessions[0].transcript,
    ]);
    if (!/unable to read|could not read|fix|export|restore|before saving/i.test(JSON.stringify(corruptRead.body))) {
      throw new Error("Corrupt desktop state error should explain recovery without exposing state contents.");
    }
    const blockedWrite = await apiState(classloop.page, "PUT", sampleState());
    if (blockedWrite.status !== 423) {
      throw new Error(`Corrupt desktop state should block overwrite with 423, got ${blockedWrite.status}.`);
    }
    assertNoSensitiveLeak(blockedWrite.body, "Corrupt desktop blocked-write response", [
      expected.accounts[0].email,
      expected.sessions[0].title,
      expected.sessions[0].transcript,
    ]);
    await close(classloop.app);
    classloop = null;

    fs.copyFileSync(backupFile, dataFile);
    classloop = await launchClassLoop(userDataDir);
    const restoredRead = await waitForSessionTitle(classloop.page, expected.sessions[0].title);
    if (restoredRead.status !== 200 || restoredRead.body.sessions?.[0]?.title !== expected.sessions[0].title) {
      throw new Error(`Restored encrypted backup did not load correctly: ${JSON.stringify(restoredRead.body)}`);
    }

    console.log("Desktop state smoke passed: encrypted write/read, crash-corrupt read-only lock, and backup restore.");
  } finally {
    await close(classloop?.app);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
