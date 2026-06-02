const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { _electron: electron } = require("playwright");

const appName = "ClassLoop";
const rootDir = path.resolve(__dirname, "..");

function swiftMacExecutablePath() {
  return path.join(rootDir, "release", "swift-mac-arm64", `${appName}.app`, "Contents", "MacOS", appName);
}

if (process.platform === "darwin") {
  if (process.argv[2] && !fs.existsSync(path.resolve(process.argv[2]))) {
    console.error(`Packaged executable was not found: ${path.resolve(process.argv[2])}`);
    process.exit(1);
  }
  const swiftSmoke = path.join(__dirname, "smoke-swift-mac.cjs");
  const result = spawnSync(process.execPath, [swiftSmoke], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

function candidateAppNames() {
  return [appName];
}

function executablePathForName(name) {
  if (process.platform === "darwin") {
    const archDir = process.arch === "arm64" ? "mac-arm64" : "mac";
    return path.join("release", archDir, `${name}.app`, "Contents", "MacOS", name);
  }
  if (process.platform === "win32") {
    const archDir = process.arch === "arm64" ? "win-arm64-unpacked" : "win-unpacked";
    return path.join("release", archDir, `${name}.exe`);
  }
  if (process.platform === "linux") {
    const archDir = process.arch === "arm64" ? "linux-arm64-unpacked" : "linux-unpacked";
    return path.join("release", archDir, name.toLowerCase());
  }
  throw new Error(`Unsupported platform for packaged smoke test: ${process.platform}`);
}

function defaultExecutablePath() {
  const candidates = candidateAppNames().map(executablePathForName);
  return candidates.find((candidate) => fs.existsSync(path.resolve(candidate))) || candidates[0];
}

function resolveExecutable() {
  return path.resolve(process.argv[2] || defaultExecutablePath());
}

function shouldUseSwiftMacSmoke() {
  return process.platform === "darwin" && !process.argv[2] && fs.existsSync(swiftMacExecutablePath());
}

function runSwiftMacSmoke() {
  console.log("[packaged-smoke] macOS package default is the Swift Apple silicon app; running Swift first-run smoke.");
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", "smoke-swift-mac.cjs")], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[packaged-smoke] ${message}`);
}

async function waitForAnyFile(filePaths, timeoutMs = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = filePaths.find((filePath) => fs.existsSync(filePath));
    if (found) return found;
    await wait(200);
  }
  throw new Error(`Timed out waiting for one of: ${filePaths.join(", ")}`);
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

async function ensureAuthForm(page, mode) {
  const heading =
    mode === "create" ? page.getByText(/Create your ClassLoop account/i) : page.getByText(/Sign in to ClassLoop/i);
  if (await heading.isVisible().catch(() => false)) {
    return;
  }

  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 20_000 });
  if (mode === "create") {
    const entryCreate = page.locator(".auth-entry-actions").getByRole("button", { name: /^create account$/i });
    if (await entryCreate.isVisible().catch(() => false)) {
      await entryCreate.click();
    } else {
      await page.locator(".auth-mode-link").click();
    }
  } else {
    const entryLogin = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
    if (await entryLogin.isVisible().catch(() => false)) {
      await entryLogin.click();
    }
  }

  await heading.waitFor({ timeout: 20_000 });
}

async function run() {
  if (shouldUseSwiftMacSmoke()) {
    runSwiftMacSmoke();
    return;
  }

  const executablePath = resolveExecutable();
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged executable was not found: ${executablePath}`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "classloop-first-run-"));
  const dataFiles = [path.join(userDataDir, ".classloop-data.json")];
  const email = `packaged-${Date.now()}@classloop.test`;
  const password = "classloop-packaged-smoke";
  const launchOptions = {
    executablePath,
    env: {
      ...process.env,
      CLASSLOOP_USER_DATA_DIR: userDataDir,
    },
  };

  let firstRun;
  let secondRun;
  let passed = false;
  try {
    log(`Launching ${executablePath}`);
    firstRun = await electron.launch(launchOptions);
    const firstPage = await firstRun.firstWindow();
    firstPage.setDefaultTimeout(20_000);
    log("Waiting for first-run sign-in screen");
    await ensureAuthForm(firstPage, "create");
    log("Creating a clean teacher account");
    await firstPage.getByLabel(/^name$/i).fill("Packaged Smoke Teacher");
    await firstPage.getByPlaceholder("name@example.com").fill(email);
    await firstPage.locator('input[placeholder="Enter password"]').fill(password);
    await firstPage.locator('input[placeholder="Re-enter password"]').fill(password);
    await firstPage.locator("form.login-form button[type='submit']").click();
    log("Waiting for teacher dashboard");
    await firstPage.getByText("Today in ClassLoop").waitFor({ timeout: 20_000 });
    const walkthrough = firstPage.getByRole("dialog", { name: /classloop guided walkthrough/i });
    if (await walkthrough.isVisible().catch(() => false)) {
      await walkthrough.getByRole("button", { name: /skip/i }).click();
    }
    log("Waiting for encrypted desktop state file");
    const dataFile = await waitForAnyFile(dataFiles);
    const stored = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (!stored || typeof stored !== "object" || !("payload" in stored)) {
      throw new Error("Packaged first-run data file was created without the expected payload wrapper.");
    }
    await close(firstRun);
    firstRun = null;

    log("Relaunching from the same clean profile");
    secondRun = await electron.launch(launchOptions);
    const secondPage = await secondRun.firstWindow();
    secondPage.setDefaultTimeout(20_000);
    await ensureAuthForm(secondPage, "signin");
    await secondPage.getByPlaceholder("name@example.com").fill(email);
    await secondPage.getByPlaceholder("Enter password").fill(password);
    await secondPage.locator("form.login-form button[type='submit']").click();
    await secondPage.getByText("Today in ClassLoop").waitFor({ timeout: 20_000 });

    console.log(`Packaged first-run smoke passed for ${executablePath}`);
    console.log(`Clean user data dir: ${userDataDir}`);
    passed = true;
  } finally {
    await close(secondRun);
    await close(firstRun);
    if (passed) {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } else {
      console.error(`Packaged first-run smoke failed. Preserved clean user data dir: ${userDataDir}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
