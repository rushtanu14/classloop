import { expect, test, type Page } from "@playwright/test";
import {
  expectContrast,
  expectKeyboardFocusOrder,
  expectNoUnnamedInteractive,
  expectReadableMobileLayout,
} from "./accessibility-helpers";

const teacherEmail = "teacher@classloop.demo";
const teacherPassword = "classloop-teacher";
const studentEmail = "maya@classloop.demo";
const studentPassword = "classloop-student";

const landingContrastSelectors = [
  ".landing-hero h1",
  ".landing-hero p",
  ".landing-primary",
  ".landing-secondary",
  ".landing-message",
  ".landing-feature-band h2",
  ".landing-feature-band p",
  ".landing-pwa-checklist h2",
  ".landing-pwa-checklist p",
];

const loginContrastSelectors = [
  ".login-panel h1",
  ".login-copy p",
  ".field > span",
  ".role-tabs button.active",
  ".primary-button",
  ".text-button",
  ".login-help span",
  ".security-card p",
];

async function resetBrowser(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/#/dashboard");
  await openSignInForm(page);
  await chooseAuthRole(page, "teacher");
}

async function openSignInForm(page: Page) {
  const signInHeading = page.getByText(/Sign in to ClassLoop/i);
  if (await signInHeading.isVisible().catch(() => false)) return;
  await page.waitForSelector(".auth-entry-actions, .auth-switch", { timeout: 15_000 });
  const entryLogin = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await entryLogin.isVisible().catch(() => false)) {
    await entryLogin.click();
  } else {
    await page.locator(".auth-switch").getByRole("button", { name: /^sign in$/i }).click();
  }
  await expect(signInHeading).toBeVisible();
}

async function chooseAuthRole(page: Page, role: "teacher" | "student") {
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: role === "teacher" ? /^teacher$/i : /^student$/i }).click();
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
}

async function skipAutoWalkthrough(page: Page) {
  const dialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /skip/i }).click();
  }
}

async function signIn(page: Page, role: "teacher" | "student") {
  await resetBrowser(page);
  await chooseAuthRole(page, role);
  await page.getByPlaceholder("name@example.com").fill(role === "teacher" ? teacherEmail : studentEmail);
  await page.getByPlaceholder("Enter password").fill(role === "teacher" ? teacherPassword : studentPassword);
  await page.locator("form.login-form button[type='submit']").click();
  await skipAutoWalkthrough(page);
}

test.describe("WCAG-targeted accessibility checks", () => {
  test("login and student completion support keyboard navigation, focus order, labels, contrast, and announcements", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Runs once on desktop; PWA/mobile WCAG checks run in their own tests.");

    await resetBrowser(page);
    await expectNoUnnamedInteractive(page, ".login-panel");
    await expect(
      page.getByRole("tablist", { name: /choose workspace type/i }).getByRole("tab", { name: /class/i }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tablist", { name: /choose class role/i }).getByRole("tab", { name: /teacher/i }),
    ).toHaveAttribute("aria-selected", "true");
    await expectKeyboardFocusOrder(page, [
      /^Sign in$/,
      /^Create account$/,
      /^Individual$/,
      /^Class$/,
      /^Teacher$/,
      /^Student$/,
      /Email name@example.com/,
      /Password Enter password/,
      /^Show password$/,
      /^Forgot password\?$/,
      /^Sign in$/,
    ]);
    await expectContrast(page, loginContrastSelectors);

    await signIn(page, "student");
    await expectNoUnnamedInteractive(page, ".app-shell");
    await page.getByRole("button", { name: /open detail/i }).first().click();
    const liveRegion = page.locator(".checkin-celebration[aria-live='polite']");
    await expect(liveRegion).toBeVisible();
    const checkInButton = liveRegion.getByRole("button", { name: /complete check-in|completed/i });
    if (!/completed/i.test((await checkInButton.textContent()) ?? "")) {
      await checkInButton.click();
    }
    await expect(liveRegion.getByRole("button", { name: /completed/i })).toBeVisible();
  });

  test("landing PWA install controls expose names, contrast, and screen-reader status announcements", async ({ page }) => {
    await page.goto("/?demoOnly=1");
    await expect(page.getByRole("heading", { name: /^ClassLoop$/i })).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) > 920) {
      await expect(page.getByRole("button", { name: /^screenshots$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^docs$/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /^support$/i })).toBeVisible();
    }

    await expectNoUnnamedInteractive(page, ".landing-page");
    await expectContrast(page, landingContrastSelectors);

    await expect(page.locator(".landing-hero").getByRole("button", { name: /^add to phone$/i })).toBeVisible();

    await page.goto("/#/download");
    await expect(page.getByRole("heading", { name: /use the pwa for fast after-class cleanup/i })).toBeVisible();
    await page.locator(".landing-mobile-band").getByRole("button", { name: /^add to phone$/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /home screen|install app|install menu|already running|added/i }),
    ).toBeVisible();
  });

  test("screenshot gallery stays readable on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/#/screenshots");
    await expect(page.getByRole("heading", { name: /screenshots: how classloop works/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /teacher import and review screen/i })).toBeVisible();
    await expectReadableMobileLayout(page, ".landing-page");
    await expectContrast(page, [
      ".landing-page-header h1",
      ".landing-page-header p",
      ".landing-screenshot-card h2",
      ".landing-screenshot-card p",
      ".landing-workflow-strip h2",
      ".landing-workflow-strip p",
    ]);
  });

  test("PWA and add-to-home-screen layout stays readable on a phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/#/download");
    await expect(page.getByRole("heading", { name: /use the pwa for fast after-class cleanup/i })).toBeVisible();

    await expectReadableMobileLayout(page, ".landing-page");
    await expectContrast(page, [
      ".landing-mobile-card h2",
      ".landing-mobile-card p",
      ".mobile-step span",
      ".landing-pwa-checklist h2",
      ".landing-pwa-checklist p",
      ".landing-download-band h2",
      ".landing-download-band p",
      ".landing-primary",
      ".landing-secondary",
      ".landing-message",
    ]);
    await page.locator(".landing-mobile-band").getByRole("button", { name: /add to phone/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /home screen|install app|install menu|already running|added/i }),
    ).toBeVisible();
    await expectReadableMobileLayout(page, ".landing-page");
  });
});
