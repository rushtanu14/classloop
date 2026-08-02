import { expect, test, type Page } from "@playwright/test";
import { expectNoUnnamedInteractive } from "./accessibility-helpers";

const teacherEmail = "teacher@classloop.demo";
const teacherPassword = "classloop-teacher";
const studentEmail = "maya@classloop.demo";
const studentPassword = "classloop-student";

type AccountRole = "teacher" | "student" | "individual";

async function resetBrowser(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/#/dashboard");
}

async function openSignIn(page: Page) {
  if (await page.getByText(/Sign in to ClassLoop/i).isVisible().catch(() => false)) return;
  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const entryLogin = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await entryLogin.isVisible().catch(() => false)) await entryLogin.click();
  else await page.locator(".auth-mode-link").click();
}

async function chooseRole(page: Page, role: AccountRole) {
  if (role === "individual") {
    await page.getByRole("tab", { name: /^individual$/i }).click();
  } else {
    await page.getByRole("tab", { name: /^class$/i }).click();
    await page.getByRole("tab", { name: role === "teacher" ? /^teacher$/i : /^student$/i }).click();
  }
}

async function skipWalkthrough(page: Page) {
  const dialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: /^skip$/i }).click();
}

async function signInDemo(page: Page, role: "teacher" | "student") {
  await resetBrowser(page);
  await openSignIn(page);
  await chooseRole(page, role);
  await page.getByPlaceholder("name@example.com").fill(role === "teacher" ? teacherEmail : studentEmail);
  await page.getByPlaceholder("Enter password").fill(role === "teacher" ? teacherPassword : studentPassword);
  await page.locator("form.login-form button[type='submit']").click();
  await skipWalkthrough(page);
}

async function signInSeededIndividual(page: Page) {
  const email = "control-surface-individual@classloop.test";
  const password = "control-surface-password";
  await resetBrowser(page);
  await page.evaluate(
    async ({ accountEmail, accountPassword }) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(accountPassword));
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(
        "classloop:accounts:v1",
        JSON.stringify([
          {
            id: "control-surface-individual",
            role: "individual",
            email: accountEmail,
            name: "Control Surface Individual",
            passwordHash,
            createdAt: new Date().toISOString(),
          },
        ]),
      );
    },
    { accountEmail: email, accountPassword: password },
  );
  await page.reload();
  await openSignIn(page);
  await chooseRole(page, "individual");
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
}

async function auditInteractiveSurface(page: Page, rootSelector: string) {
  await expectNoUnnamedInteractive(page, rootSelector);
  const result = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return { count: 0, issues: [`Missing ${selector}`] };
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="menuitem"]',
      ),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    const issues: string[] = [];
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      const disabled = (control as HTMLButtonElement).disabled || control.getAttribute("aria-disabled") === "true";
      const associatedLabel = control instanceof HTMLInputElement ? Array.from(control.labels ?? []).map((item) => item.textContent).join(" ") : "";
      const label = (control.getAttribute("aria-label") || associatedLabel || control.textContent || control.getAttribute("placeholder") || control.tagName)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      if (rect.width < 24 || rect.height < 24) issues.push(`${label}: ${Math.round(rect.width)}x${Math.round(rect.height)} target`);
      if (!disabled && control.tabIndex < 0) issues.push(`${label}: enabled control is not keyboard reachable`);
      if (!disabled && getComputedStyle(control).pointerEvents === "none") issues.push(`${label}: enabled control ignores pointer input`);
      if (control.tagName === "A") {
        const href = (control as HTMLAnchorElement).href;
        if (!href || /^javascript:/i.test(href)) issues.push(`${label}: invalid destination`);
      }
    }
    return { count: controls.length, issues };
  }, rootSelector);
  expect(result.issues).toEqual([]);
  return result.count;
}

function recordPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("every public route exposes named, reachable controls and working navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete control inventory runs once on desktop Chromium.");
  const errors = recordPageErrors(page);
  const navigationRoutes = ["features", "screenshots", "docs", "privacy", "support", "download"];
  const linkedRoutes = ["terms", "eula"];
  let audited = 0;

  await page.goto("/#/features");
  for (const route of navigationRoutes) {
    const label = route[0].toUpperCase() + route.slice(1);
    await page.getByRole("navigation", { name: /classloop public navigation/i }).getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    audited += await auditInteractiveSurface(page, ".landing-page");
  }
  for (const route of linkedRoutes) {
    await page.goto(`/#/${route}`);
    audited += await auditInteractiveSurface(page, ".landing-page");
  }
  await page.getByRole("button", { name: /^ClassLoop$/i }).click();
  await expect(page).toHaveURL(/\/#\/home$/);
  audited += await auditInteractiveSurface(page, ".landing-page");

  console.log(`CONTROL_SURFACE public route instances: ${audited}`);
  expect(audited).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test("every teacher navigation button opens a healthy control surface", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete control inventory runs once on desktop Chromium.");
  const errors = recordPageErrors(page);
  await signInDemo(page, "teacher");
  const routes = [
    ["Dashboard", "dashboard"],
    ["New session", "new-session"],
    ["Draft review", "review"],
    ["Session report", "report"],
    ["Classes", "classes"],
    ["Rosters", "rosters"],
    ["Student view", "student"],
    ["Analytics", "analytics"],
    ["Plan options", "billing"],
    ["How it works", "tutorial"],
    ["Appearance", "appearance"],
    ["Privacy", "privacy"],
  ] as const;
  let audited = 0;

  for (const [label, route] of routes) {
    await page.locator(".nav-list").getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}(?:\\?|$)`));
    audited += await auditInteractiveSurface(page, ".app-shell");
  }

  console.log(`CONTROL_SURFACE teacher route instances: ${audited}`);
  expect(audited).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});

test("every student navigation button opens a healthy control surface", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete control inventory runs once on desktop Chromium.");
  const errors = recordPageErrors(page);
  await signInDemo(page, "student");
  const routes = [["My portal", "student"], ["How it works", "tutorial"], ["Appearance", "appearance"]] as const;
  let audited = 0;

  for (const [label, route] of routes) {
    await page.locator(".nav-list").getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}(?:\\?|$)`));
    audited += await auditInteractiveSurface(page, ".app-shell");
  }

  console.log(`CONTROL_SURFACE student route instances: ${audited}`);
  expect(audited).toBeGreaterThanOrEqual(35);
  expect(errors).toEqual([]);
});

test("every individual navigation button opens a healthy control surface", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The complete control inventory runs once on desktop Chromium.");
  const errors = recordPageErrors(page);
  await signInSeededIndividual(page);
  const routes = [["Personal dashboard", "personal-dashboard"], ["New meeting", "new-personal-meeting"], ["Meeting history", "personal-meetings"], ["Appearance", "appearance"]] as const;
  let audited = 0;

  for (const [label, route] of routes) {
    await page.locator(".nav-list").getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`#/${route}(?:\\?|$)`));
    audited += await auditInteractiveSurface(page, ".app-shell");
  }

  console.log(`CONTROL_SURFACE individual route instances: ${audited}`);
  expect(audited).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});
