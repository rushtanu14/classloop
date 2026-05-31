import { expect, test, type Page } from "@playwright/test";

const teacherEmail = "teacher@classloop.demo";
const teacherPassword = "classloop-teacher";

async function resetBrowser(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/#/dashboard");
  await openTeacherSignInFields(page);
}

async function openSignInForm(page: Page) {
  const signInHeading = page.getByText(/Sign in to ClassLoop/i);
  if (await signInHeading.isVisible().catch(() => false)) return;
  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const entryLogin = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await entryLogin.isVisible().catch(() => false)) {
    await entryLogin.click();
  } else {
    await page.locator(".auth-mode-link").click();
  }
  await expect(signInHeading).toBeVisible();
}

async function openCreateAccountForm(page: Page) {
  const createHeading = page.getByText(/Create your ClassLoop account/i);
  if (await createHeading.isVisible().catch(() => false)) return;
  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const entryCreate = page.locator(".auth-entry-actions").getByRole("button", { name: /^create account$/i });
  if (await entryCreate.isVisible().catch(() => false)) {
    await entryCreate.click();
  } else {
    await page.locator(".auth-mode-link").click();
  }
  await expect(createHeading).toBeVisible();
}

async function openTeacherSignInFields(page: Page) {
  await openSignInForm(page);
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
}

async function skipAutoWalkthrough(page: Page) {
  const dialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /skip/i }).click();
  }
}

async function signInTeacher(page: Page) {
  await resetBrowser(page);
  await page.getByPlaceholder("name@example.com").fill(teacherEmail);
  await page.getByPlaceholder("Enter password").fill(teacherPassword);
  await page.locator("form.login-form button[type='submit']").click();
  await skipAutoWalkthrough(page);
}

function privateLogPattern() {
  return /maya@classloop\.test|jordan@classloop\.test|teacher@classloop\.demo|proportional reasoning|short reflection|not-a-url|study-guide/i;
}

test.describe("user-visible error states and recovery", () => {
  test("startup opens encrypted local state without probing stale shared-state API", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally guards the removed shared-state API path.");
    let apiStateRequests = 0;
    await page.route("**/api/state", async (route) => {
      apiStateRequests += 1;
      await route.abort();
    });

    await page.goto("/#/dashboard", { waitUntil: "domcontentloaded" });
    await openTeacherSignInFields(page);
    await expect(page.getByRole("status").filter({ hasText: /shared sync is unavailable/i })).toHaveCount(0);
    expect(apiStateRequests).toBe(0);
  });

  test("bad transcript format and malformed resource URLs show recoverable warnings without leaking private text to logs", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once on desktop; mobile coverage focuses on layout and PWA checks.");
    const runtimeMessages: string[] = [];
    page.on("console", (message) => {
      if (["error", "warning", "info", "log", "debug"].includes(message.type())) runtimeMessages.push(message.text());
    });

    await signInTeacher(page);
    await page.getByRole("button", { name: /new session/i }).first().click();
    await page.getByLabel(/session title/i).fill("Recover malformed import inputs");
    await page.getByLabel(/paste transcript text/i).fill(
      "This export lost speaker labels.\n" +
        "The class reviewed proportional reasoning and the teacher assigned a short reflection due Friday.\n" +
        "Malformed links should not break parsing: not-a-url, www.example without protocol, https://example.com/reflection-guide.",
    );
    const summary = page.locator(".summary-input-card");
    await summary.getByLabel(/^Roster$/i).fill("Maya Chen, maya@classloop.test\nJordan Lee, jordan@classloop.test");
    await summary.getByLabel(/^Meeting notes$/i).fill("Maya needs a check-in; Jordan should redo one proportion.");
    await summary.getByLabel(/^Resources$/i).fill(
      "not a url\n" + "www.example without protocol\n" + "https://example.com/study-guide).",
    );

    await expect(page.getByRole("status").filter({ hasText: /no speaker labels were detected/i })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /resource .*http:\/\/ or https:\/\//i })).toBeVisible();

    await page.getByRole("button", { name: /generate draft/i }).click();
    await expect(page.getByText(/edit the draft before publishing/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/all transcript speakers match the roster/i)).toBeVisible();

    await page.getByRole("tab", { name: /follow-up/i }).click();
    await expect(page.locator('input[value="https://example.com/study-guide"]')).toBeVisible();
    await expect(page.getByText("not a url")).toHaveCount(0);

    expect(runtimeMessages.join("\n")).not.toMatch(privateLogPattern());
  });

  test("public-transcript proxy risks block publish until reviewed", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once on desktop; mobile coverage focuses on layout and PWA checks.");

    await signInTeacher(page);
    await page.getByRole("button", { name: /new session/i }).first().click();
    await page.getByLabel(/session title/i).fill("Public proxy generic-speaker import");
    await page.getByLabel(/paste transcript text/i).fill(
      "STUDENT: I think we can divide both sides by the same number.\n" +
        "STUDENT: I am not sure whose equation that is.\n" +
        "TEACHER: Keep this as a class-level discussion until speakers are linked.",
    );
    const summary = page.locator(".summary-input-card");
    await summary.getByLabel(/^Roster$/i).fill("Maya Chen, maya@classloop.test\nJordan Lee, jordan@classloop.test");

    await page.getByRole("button", { name: /generate draft/i }).click();
    await expect(page.getByText(/edit the draft before publishing/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/generic speaker labels need review/i)).toBeVisible();

    await page.getByRole("button", { name: /preview and publish/i }).click();
    await expect(page.getByRole("button", { name: /review warnings first/i })).toBeDisabled();
    await expect(page.getByText(/publish is paused until these warnings are reviewed/i)).toBeVisible();

    await page.getByRole("button", { name: /back to edit/i }).click();
    await page.getByRole("button", { name: /mark reviewed/i }).first().click();
    await page.getByRole("button", { name: /preview and publish/i }).click();
    await expect(page.getByRole("button", { name: /publish to students/i })).toBeEnabled();
  });

  test("missing shared-state API does not block the local browser workspace", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally guards the removed shared-state API path.");
    const runtimeMessages: string[] = [];
    page.on("console", (message) => {
      if (["error", "warning", "info", "log", "debug"].includes(message.type())) runtimeMessages.push(message.text());
    });
    let apiStateRequests = 0;
    await page.route("**/api/state", async (route) => {
      apiStateRequests += 1;
      await route.abort();
    });

    await page.goto("/#/dashboard");
    await openTeacherSignInFields(page);
    await expect(page.getByRole("status").filter({ hasText: /shared sync is unavailable/i })).toHaveCount(0);
    await page.getByPlaceholder("name@example.com").fill(teacherEmail);
    await page.getByPlaceholder("Enter password").fill(teacherPassword);
    await page.locator("form.login-form button[type='submit']").click();
    await skipAutoWalkthrough(page);
    await expect(page.getByText("Today in ClassLoop")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /shared sync is unavailable/i })).toHaveCount(0);

    await page.getByRole("button", { name: /ms\. rivera/i }).click();
    await expect(page.locator(".profile-menu")).toContainText(/Saved in this browser/i);
    expect(apiStateRequests).toBe(0);
    expect(runtimeMessages.join("\n")).not.toMatch(privateLogPattern());
  });

  test("corrupt encrypted browser state is reported before sign in", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally corrupts browser storage.");
    await page.addInitScript(() => {
      window.localStorage.setItem("classloop:secure:accounts:v1", "not-json");
    });

    await page.goto("/#/dashboard");
    await openTeacherSignInFields(page);
    await expect(page.getByRole("alert").filter({ hasText: /some browser data could not be read/i })).toBeVisible();
  });

  test("browser storage write failures stay visible after account creation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally forces local storage writes to fail.");
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (String(key).startsWith("classloop:secure:")) {
          throw new DOMException("Synthetic ClassLoop quota failure", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    });

    await page.goto("/#/dashboard");
    await openCreateAccountForm(page);
    await page.getByRole("tab", { name: /^class$/i }).click();
    await page.getByRole("tab", { name: /^teacher$/i }).click();
    await page.getByPlaceholder("Your name").fill("Storage Drill Teacher");
    await page.getByPlaceholder("name@example.com").fill("storage-drill-teacher@classloop.test");
    await page.getByPlaceholder("Enter password", { exact: true }).fill("storage-drill-password");
    await page.getByPlaceholder("Re-enter password").fill("storage-drill-password");
    await page.locator("form.login-form button[type='submit']").click();
    await skipAutoWalkthrough(page);
    await expect(page.getByText("Today in ClassLoop")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /encrypted browser storage could not save changes/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("download manifest outage keeps desktop installers pending", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally intercepts the download manifest.");
    await page.route("**/classloop-downloads.json", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "release manifest unavailable" }),
      });
    });

    await page.goto("/#/download");
    await expect(page.getByRole("heading", { name: /download classloop/i })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /desktop installer manifest is unavailable/i })).toBeVisible();
    await page.getByRole("button", { name: /not your system|view desktop installers/i }).first().click();
    await expect(page.getByLabel(/desktop download options/i).getByText(/packaging pending/i).first()).toBeVisible();
  });

  test("malformed download manifest is ignored with visible recovery copy", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally intercepts the download manifest.");
    await page.route("**/classloop-downloads.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{",
      });
    });

    await page.goto("/#/download");
    await expect(page.getByRole("status").filter({ hasText: /desktop installer manifest could not be read/i })).toBeVisible();
    await page.getByRole("button", { name: /not your system|view desktop installers/i }).first().click();
    await expect(page.getByLabel(/desktop download options/i).getByText(/download ready/i)).toHaveCount(0);
  });

  test("Vercel Blob download URLs are blocked instead of shown as ready installers", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once because it intentionally supplies blocked release URLs.");
    await page.route("**/classloop-downloads.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checksumsUrl: "https://classloop-checksums.public.blob.vercel-storage.com/SHA256SUMS.txt",
          macos: { url: "https://classloop-mac.public.blob.vercel-storage.com/ClassLoop.dmg" },
          windows: { url: "https://classloop-win.public.blob.vercel-storage.com/ClassLoop.exe" },
          linux: { url: "https://classloop-linux.public.blob.vercel-storage.com/ClassLoop.AppImage" },
        }),
      });
    });

    await page.goto("/#/download");
    await expect(page.getByRole("status").filter({ hasText: /Vercel Blob/i })).toBeVisible();
    await page.getByRole("button", { name: /not your system|view desktop installers/i }).first().click();
    await expect(page.getByLabel(/desktop download options/i).getByText(/download ready/i)).toHaveCount(0);
    await expect(page.getByLabel(/desktop download options/i).getByText(/packaging pending/i).first()).toBeVisible();
  });
});
