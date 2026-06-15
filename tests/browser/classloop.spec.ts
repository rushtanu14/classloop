import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Session, SessionType } from "../../src/types";

const teacherEmail = "teacher@classloop.demo";
const teacherPassword = "classloop-teacher";
const studentEmail = "maya@classloop.demo";
const studentPassword = "classloop-student";
const classTemplateCopyUrl = "https://docs.google.com/document/d/17qDjDwntSB_QHYE6rn-TKwiOrIWyxPBywMzSwNJUhVU/copy";

type TestAuthRole = "teacher" | "student" | "individual";

async function resetBrowser(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.goto("/#/dashboard");
  await openSignInForm(page);
  await chooseAuthRole(page, "teacher");
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

async function chooseAuthRole(page: Page, role: "teacher" | "student" | "individual") {
  if (role === "individual") {
    await page.getByRole("tab", { name: /^individual$/i }).click();
  } else {
    await page.getByRole("tab", { name: /^class$/i }).click();
    await page.getByRole("tab", { name: role === "teacher" ? /^teacher$/i : /^student$/i }).click();
  }
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
}

async function skipAutoWalkthrough(page: Page) {
  const dialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) {
    const skipButton = dialog.getByRole("button", { name: /skip/i });
    await skipButton.click({ force: true, timeout: 5_000 }).catch(async () => {
      await skipButton.dispatchEvent("click").catch(() => undefined);
    });
    await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  }
}

async function signIn(page: Page, role: "teacher" | "student", reset = true, closeWalkthrough = true) {
  if (reset) await resetBrowser(page);
  await chooseAuthRole(page, role);
  await page.getByPlaceholder("name@example.com").fill(role === "teacher" ? teacherEmail : studentEmail);
  await page.getByPlaceholder("Enter password").fill(role === "teacher" ? teacherPassword : studentPassword);
  await page.locator("form.login-form button[type='submit']").click();
  if (closeWalkthrough) await skipAutoWalkthrough(page);
}

async function expectDownloaded(downloadPromise: Promise<Download>, filenamePattern: RegExp) {
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(filenamePattern);
}

type TourBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function boxesOverlap(a: TourBox, b: TourBox) {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

async function tourBox(page: Page, selector: string): Promise<TourBox> {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} should have a rendered box`).not.toBeNull();
  return {
    left: box!.x,
    top: box!.y,
    right: box!.x + box!.width,
    bottom: box!.y + box!.height,
    width: box!.width,
    height: box!.height,
  };
}

async function expectTourSpotlight(page: Page, targetSelector: string) {
  const target = await tourBox(page, targetSelector);
  const highlight = await tourBox(page, ".tour-highlight");
  const popover = await tourBox(page, ".tour-popover");

  expect(highlight.left).toBeLessThanOrEqual(target.left + 2);
  expect(highlight.top).toBeLessThanOrEqual(target.top + 2);
  expect(highlight.right).toBeGreaterThanOrEqual(target.right - 2);
  expect(highlight.bottom).toBeGreaterThanOrEqual(target.bottom - 2);
  expect(boxesOverlap(popover, target)).toBe(false);
  expect(boxesOverlap(popover, highlight)).toBe(false);
}

type EndToEndScenario = {
  title: string;
  template: SessionType;
  transcript: string;
  notes: string;
  roster: string;
  resources: string;
  details: Record<string, string>;
  student: {
    name: string;
    email: string;
    password: string;
  };
  rosterSaveName?: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function signOut(page: Page) {
  const signOutButton = page.getByRole("button", { name: /sign out/i });
  if (await signOutButton.isVisible().catch(() => false)) {
    await signOutButton.click();
  }
  await expect(page.getByRole("heading", { name: /^ClassLoop$/i })).toBeVisible();
}

async function createAccount(
  page: Page,
  role: TestAuthRole,
  name: string,
  email: string,
  password: string,
  options: { mockCloud?: boolean } = {},
) {
  if (options.mockCloud !== false) {
    await mockCloudAuthForStripeCheckout(page, email, { role, name });
  }
  await openCreateAccountForm(page);
  await chooseAuthRole(page, role);
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password", { exact: true }).fill(password);
  await page.getByPlaceholder("Re-enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await skipAutoWalkthrough(page);
}

async function seedLocalAccount(
  page: Page,
  role: TestAuthRole,
  name: string,
  email: string,
  password: string,
) {
  await page.evaluate(
    async ({ role, name, email, password }) => {
      const bytes = new TextEncoder().encode(password);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(
        "classloop:accounts:v1",
        JSON.stringify([
          {
            id: `${role}-seeded-${Date.now().toString(36)}`,
            role,
            email,
            name,
            passwordHash,
            createdAt: new Date().toISOString(),
            theme: "classroom",
          },
        ]),
      );
    },
    { role, name, email, password },
  );
}

async function signInAccount(page: Page, role: "teacher" | "student" | "individual", email: string, password: string) {
  await openSignInForm(page);
  await chooseAuthRole(page, role);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await skipAutoWalkthrough(page);
}

type TestBillingProfile = {
  tier: "free" | "pro";
  status: string;
  customerId?: string;
  currentPeriodEnd?: string;
};

async function waitForPersistedAccounts(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          localStorage.getItem("classloop:secure:accounts:v1") !== null ||
          localStorage.getItem("classloop:accounts:v1") !== null,
      ),
    )
    .toBe(true);
}

async function waitForPersistedPersonalMeetings(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          localStorage.getItem("classloop:secure:personal-meetings:v1") !== null ||
          localStorage.getItem("classloop:personal-meetings:v1") !== null,
      ),
    )
    .toBe(true);
}

async function seedBillingProfile(page: Page, profile: TestBillingProfile) {
  await page.evaluate((nextProfile) => {
    localStorage.removeItem("classloop:secure:billing:v1");
    localStorage.setItem("classloop:billing:v1", JSON.stringify(nextProfile));
  }, profile);
}

async function signInWithSeededBillingProfile(
  page: Page,
  role: "teacher" | "student",
  email: string,
  password: string,
  profile: TestBillingProfile,
) {
  await waitForPersistedAccounts(page);
  await signOut(page);
  await seedBillingProfile(page, profile);
  await page.reload();
  await page.goto("/#/dashboard");
  await signInAccount(page, role, email, password);
}

async function signInWithVerifiedProEntitlement(page: Page, email: string, password: string) {
  await mockCloudAuthForStripeCheckout(page, email, { role: "teacher", name: "Verified Pro Teacher" });
  await page.route("**/api/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email,
        role: "teacher",
        billingProfile: {
          tier: "pro",
          status: "active",
          customerId: "cus_playwright_verified",
          currentPeriodEnd: "2026-06-30T00:00:00.000Z",
        },
        noTrainingOnStudentData: true,
      }),
    });
  });
  await waitForPersistedAccounts(page);
  await signOut(page);
  await seedBillingProfile(page, {
    tier: "pro",
    status: "active",
    customerId: "cus_local_tamper_should_not_unlock",
    currentPeriodEnd: "2026-06-30T00:00:00.000Z",
  });
  await page.reload();
  await page.goto("/#/dashboard");
  await signInAccount(page, "teacher", email, password);
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByText(`Connected as ${email}`)).toBeVisible({ timeout: 15_000 });
  await page.locator(".settings-options-panel").filter({ hasText: /Billing options/i }).locator("summary").click();
  await page.getByRole("button", { name: /refresh plan/i }).click();
  await expect(page.getByText(/PRO · active/i)).toBeVisible();
  await page.getByLabel(/go to dashboard/i).click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
}

async function mockCloudAuthForStripeCheckout(
  page: Page,
  cloudEmail: string,
  options: {
    failPasswordSignIn?: boolean;
    emailNotConfirmed?: boolean;
    signupRequiresConfirmation?: boolean;
    signupAlreadyExists?: boolean;
    role?: TestAuthRole;
    name?: string;
  } = {},
) {
  const resendRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const signupRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const updateUserRequests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const userMetadata = {
    product: "ClassLoop",
    plan: "free",
    role: options.role ?? "teacher",
    name: options.name ?? "ClassLoop Test User",
    source: "playwright",
  };
  const fakeUser = {
    id: "00000000-0000-4000-8000-000000000123",
    aud: "authenticated",
    role: "authenticated",
    email: cloudEmail,
    email_confirmed_at: "2026-05-19T00:00:00.000Z",
    confirmed_at: "2026-05-19T00:00:00.000Z",
    last_sign_in_at: "2026-05-19T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: userMetadata,
    identities: [],
    created_at: "2026-05-19T00:00:00.000Z",
    updated_at: "2026-05-19T00:00:00.000Z",
  };

  const authSessionBody = {
    access_token: "playwright-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "playwright-refresh-token",
    user: fakeUser,
  };
  let passwordSignInAttempts = 0;

  await page.route("**/auth/v1/token**", async (route) => {
    passwordSignInAttempts += 1;
    if (options.emailNotConfirmed) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "email_not_confirmed", error_description: "Email not confirmed" }),
      });
      return;
    }
    if (options.failPasswordSignIn && passwordSignInAttempts === 1) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authSessionBody),
    });
  });
  await page.route("**/auth/v1/signup**", async (route) => {
    signupRequests.push({
      url: route.request().url(),
      body: route.request().postDataJSON() as Record<string, unknown>,
    });
    if (options.signupAlreadyExists) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "user_already_exists", msg: "User already registered" }),
      });
      return;
    }
    if (options.signupRequiresConfirmation) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            ...fakeUser,
            email_confirmed_at: null,
            confirmed_at: null,
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authSessionBody),
    });
  });
  await page.route("**/auth/v1/resend**", async (route) => {
    resendRequests.push({
      url: route.request().url(),
      body: route.request().postDataJSON() as Record<string, unknown>,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: null, session: null }),
    });
  });
  await page.route("**/auth/v1/user**", async (route) => {
    updateUserRequests.push({
      url: route.request().url(),
      method: route.request().method(),
      body: route.request().postDataJSON() as Record<string, unknown>,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          ...fakeUser,
          email: (route.request().postDataJSON() as Record<string, unknown>).email ?? cloudEmail,
          email_change_sent_at: "2026-06-07T00:00:00.000Z",
        },
      }),
    });
  });
  return { resendRequests, signupRequests, updateUserRequests };
}

async function mockCloudSignup(page: Page, cloudEmail: string, requests: Array<Record<string, unknown>>) {
  const fakeUser = {
    id: "00000000-0000-4000-8000-000000000456",
    aud: "authenticated",
    role: "authenticated",
    email: cloudEmail,
    email_confirmed_at: "2026-06-02T00:00:00.000Z",
    confirmed_at: "2026-06-02T00:00:00.000Z",
    last_sign_in_at: "2026-06-02T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
  };

  await page.route("**/auth/v1/token?grant_type=password", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "invalid_credentials",
        msg: "Invalid login credentials",
        message: "Invalid login credentials",
      }),
    });
  });

  await page.route("**/auth/v1/signup**", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    requests.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "playwright-signup-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "playwright-signup-refresh-token",
        user: fakeUser,
      }),
    });
  });
}

async function mockLiveCaptureDevices(page: Page) {
  await page.addInitScript({
    content: `
      (() => {
        const makeStream = () => new MediaStream();
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: async () => makeStream(),
            getDisplayMedia: async () => makeStream(),
          },
        });

        class MockMediaRecorder {
          static isTypeSupported() { return true; }
          constructor() {
            this.state = "inactive";
            this.mimeType = "audio/webm";
            this.ondataavailable = null;
            this.onstop = null;
          }
          start() {
            this.state = "recording";
            setTimeout(() => {
              if (this.ondataavailable) {
                this.ondataavailable({ data: new Blob(["noisy capture sample"], { type: "audio/webm" }) });
              }
            }, 10);
          }
          stop() {
            this.state = "inactive";
            if (this.onstop) this.onstop();
          }
        }

        class MockSpeechRecognition {
          constructor() {
            this.continuous = false;
            this.interimResults = false;
            this.lang = "en-US";
            this.onresult = null;
            this.onerror = null;
            this.onend = null;
          }
          start() {
            setTimeout(() => {
              if (!this.onresult) return;
              const result = { isFinal: true, 0: { transcript: "Maya said um the ratio is noisy but clear enough for Friday homework" } };
              this.onresult({ resultIndex: 0, results: [result] });
            }, 20);
          }
          stop() {}
        }

        Object.defineProperty(window, "MediaRecorder", { configurable: true, value: MockMediaRecorder });
        Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
        Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: MockSpeechRecognition });
      })();
    `,
  });
}

async function waitForPersistedSessions(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem("classloop:secure:sessions:v3") !== null))
    .toBe(true);
}

async function handleRosterPrompt(page: Page, rosterSaveName?: string) {
  const dialog = page.getByRole("dialog", { name: /save this roster/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (!(await dialog.isVisible().catch(() => false))) return;
  if (rosterSaveName) {
    await dialog.getByLabel(/roster name/i).fill(rosterSaveName);
    await dialog.getByRole("button", { name: /save roster/i }).click();
  } else {
    await dialog.getByRole("button", { name: /not now/i }).click();
  }
  await expect(dialog).toHaveCount(0);
}

async function importReviewAndPublishScenario(page: Page, scenario: EndToEndScenario) {
  await page.getByRole("button", { name: /new session/i }).first().click();
  await expect(page.getByText(/session template/i)).toBeVisible();
  await page.getByLabel(/session title/i).fill(scenario.title);
  await page.getByLabel(/session template/i).selectOption(scenario.template);

  for (const [label, value] of Object.entries(scenario.details)) {
    await page.getByLabel(new RegExp(`^${escapeRegExp(label)}$`, "i")).fill(value);
  }

  await page.getByLabel(/paste transcript text/i).fill(scenario.transcript);
  const summary = page.locator(".summary-input-card");
  await summary.getByLabel(/^Meeting notes$/i).fill(scenario.notes);
  await summary.getByLabel(/^Roster$/i).fill(scenario.roster);
  await summary.getByLabel(/^Resources$/i).fill(scenario.resources);
  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.locator(".review-page")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: /roster & matching/i }).click();
  await expect(page.getByText(/all transcript speakers match the roster/i)).toBeVisible();
  await expect
    .poll(async () =>
      page.locator(".roster-email-field input").evaluateAll(
        (inputs, email) => inputs.some((input) => (input as HTMLInputElement).value === email),
        scenario.student.email,
      ),
    )
    .toBe(true);

  await page.getByRole("tab", { name: /class recap/i }).click();
  await page
    .getByLabel(/approved recap/i)
    .fill(`Approved E2E recap for ${scenario.title}: teacher reviewed the generated summary, tasks, and resources.`);
  await page.getByLabel(/essential question 1/i).fill(`What should students do next after ${scenario.template.toLowerCase()}?`);

  await page.getByRole("tab", { name: /follow-up/i }).click();
  await page.locator(".editable-item select").first().selectOption("todo");
  await expect(page.getByText(/student-specific follow-ups/i)).toBeVisible();

  await page.getByRole("button", { name: /preview and publish/i }).click();
  await expect(page.getByText(/review the student view/i)).toBeVisible();
  await expect(page.getByText(/student portal preview/i)).toBeVisible();
  await expect(page.getByText(/publish audit/i)).toBeVisible();
  await expect(page.getByText(/google classroom post/i)).toBeVisible();
  await expect(page.locator('[aria-label="Email recap recipients"]')).toContainText(scenario.student.email);
  await page.getByLabel(/post type/i).selectOption("assignment");
  await expect(page.getByLabel(/assignment due date/i)).toHaveValue(/\d{4}-\d{2}-\d{2}/);
  await page
    .getByLabel(/classroom body/i)
    .fill(`Class-wide recap for ${scenario.title}\n\nResources and shared tasks only.`);
  await page.getByRole("button", { name: /prepare classroom post/i }).click();
  await expect(page.getByText(/Edited assignment is ready/i)).toBeVisible();
  await expect(page.locator(".preview-diff-row")).toHaveCount(2);
  await expect(page.getByLabel(new RegExp(`Preview for ${escapeRegExp(scenario.student.name)}`, "i"))).toBeVisible();
  await page.getByRole("button", { name: /publish to students/i }).click();
  await expect(page.getByRole("heading", { name: scenario.title })).toBeVisible();
  await expect(page.getByText(/follow-through tracker/i)).toBeVisible();
  await handleRosterPrompt(page, scenario.rosterSaveName);
}

function submissionNoteForScenario(scenario: EndToEndScenario) {
  return `Finished the ClassLoop task for ${scenario.title}.`;
}

function submissionLinkForScenario(scenario: EndToEndScenario) {
  return `https://docs.example.com/${scenario.student.name.toLowerCase().replace(/\s+/g, "-")}`;
}

async function completeScenarioAsStudent(page: Page, scenario: EndToEndScenario, allTitles: string[]) {
  await createAccount(page, "student", scenario.student.name, scenario.student.email, scenario.student.password);
  await expect(page.getByText(`${scenario.student.name}'s follow-up dashboard`)).toBeVisible();
  await expect(page.getByText(/tasks due soon/i)).toBeVisible();
  await expect(page.locator(".today-card").getByRole("heading", { name: scenario.title })).toBeVisible();
  for (const otherTitle of allTitles.filter((title) => title !== scenario.title)) {
    await expect(page.locator(".student-page").getByText(otherTitle)).toHaveCount(0);
  }
  await expect(page.getByRole("region", { name: /classloop product feedback/i })).toHaveCount(0);
  await page.getByRole("button", { name: /open detail/i }).click();
  await expect(page.getByLabel(/note to teacher/i)).toBeVisible();
  await page.getByLabel(/note to teacher/i).fill(submissionNoteForScenario(scenario));
  await page.getByLabel(/file or link/i).fill(submissionLinkForScenario(scenario));
  await page.getByRole("button", { name: /complete check-in/i }).click();
  await expect(page.getByRole("button", { name: /completed/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /classloop product feedback/i })).toBeVisible();
  if (scenario.template === "Math review") {
    await page.getByRole("button", { name: /rate 2 out of 5/i }).click();
    await expect(page.getByLabel(/what would make classloop better/i)).toBeVisible();
    await page.getByLabel(/what would make classloop better/i).fill("Show one worked example before the task list.");
    await page.getByRole("button", { name: /send feedback/i }).click();
  } else {
    await page.getByRole("button", { name: /rate 5 out of 5/i }).click();
  }
  await expect(page.getByText(/thanks. your feedback helps improve classloop/i)).toBeVisible();
  await waitForPersistedSessions(page);
  await signOut(page);
}

async function openTeacherReport(page: Page, title: string) {
  await page.getByRole("button", { name: /^dashboard$/i }).click();
  await page.locator(".session-row").filter({ hasText: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

async function downloadCurrentReportJson(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /^export$/i }).click();
  await page.getByRole("menuitem", { name: /download json/i }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  return JSON.parse(await readFile(downloadPath!, "utf8")) as Session;
}

test("public root shows landing page and can enter the app demo", async ({ page }) => {
  await page.goto("/#/features");
  await expect(page.getByRole("heading", { name: /features for follow-through/i })).toBeVisible();
  await expect(page.getByText(/Transcript intelligence/i)).toBeVisible();

  await page.goto("/#/screenshots");
  await expect(page.getByRole("heading", { name: /screenshots: how classloop works/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /student dashboard/i })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^ClassLoop$/i })).toBeVisible();
  const heroCopy = page.locator(".landing-hero-copy");
  await expect(heroCopy.getByRole("button")).toHaveCount(2);
  await expect(heroCopy.getByRole("button", { name: /open web demo/i })).toBeVisible();
  await expect(heroCopy.getByRole("button", { name: /add to phone/i })).toBeVisible();
  await expect(heroCopy.getByRole("button", { name: /view screenshots/i })).toHaveCount(0);
  await expect(page.getByText("Class, club, and personal notes")).toBeVisible();
  await expect(page.getByText("Teacher review built in")).toBeVisible();
  await expect(page.getByText("Student-specific next steps")).toBeVisible();
  await expect(heroCopy.getByRole("button", { name: /download|macos|support classloop/i })).toHaveCount(0);
  await expect(page.locator(".landing-hero .landing-platform-list")).toHaveCount(0);
  await page.goto("/#/download");
  await expect(page.getByRole("heading", { name: /download classloop/i })).toBeVisible();
  const revealInstallers = page.getByRole("button", { name: /not your system|view desktop installers/i }).first();
  if (await revealInstallers.isVisible().catch(() => false)) {
    await revealInstallers.click();
  }
  const platformDownloads = page.locator(".landing-platform-list");
  await expect(platformDownloads).toBeVisible();
  const readyDownloads = await platformDownloads.getByText(/download ready/i).count();
  if (!readyDownloads) {
    await expect(platformDownloads.getByRole("button", { name: /macos.*packaging pending/i })).toBeVisible();
    await expect(platformDownloads.getByRole("button", { name: /windows.*packaging pending/i })).toBeVisible();
    await expect(platformDownloads.getByRole("button", { name: /linux.*packaging pending/i })).toBeVisible();
  } else {
    const appleSiliconDmg = platformDownloads.getByRole("button", { name: /macOS Swift app \(Apple silicon DMG\)/i });
    await expect(appleSiliconDmg).toBeVisible();
    await expect(appleSiliconDmg).toContainText(/Recommended default/i);
    await expect(appleSiliconDmg).toContainText(/Native Swift macOS app/i);
    const swiftSource = platformDownloads.getByRole("button", { name: /macOS Swift source/i });
    await expect(swiftSource).toBeVisible();
    await expect(swiftSource).toContainText(/Source ready/i);
    await expect(swiftSource).toContainText(/npm run package:mac/i);
    await expect(platformDownloads.getByRole("button", { name: /macOS \(Intel/i })).toHaveCount(0);
  }
  await expect(page.locator(".landing-mobile-band").getByRole("button", { name: /add .*to phone/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /use the pwa for fast after-class cleanup/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /classroom posts stay classwide/i })).toBeVisible();
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const manifestJson = await manifest.json();
  expect(manifestJson.display).toBe("standalone");
  expect(manifestJson.start_url).toContain("source=pwa");
  expect(manifestJson.icons?.map((icon: { src: string }) => icon.src)).toContain("/classloop-app-icon-512.png");
  await page.getByRole("button", { name: /open web demo/i }).click();
  await expect(page).toHaveURL(/#\/dashboard\?demoOnly=1/);
  await expect(page.getByRole("heading", { name: /try classloop as a teacher or student/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo teacher side/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo student side/i })).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toHaveCount(0);
  await expect(page.getByPlaceholder("Enter password")).toHaveCount(0);
});

test("hosted demo mode uses sample accounts only and does not persist demo workspace data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/?demoOnly=1#/dashboard");

  await expect(page.getByRole("heading", { name: /try classloop as a teacher or student/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo teacher side/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo student side/i })).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toHaveCount(0);
  await expect(page.getByPlaceholder("Enter password")).toHaveCount(0);

  await page.getByRole("button", { name: /demo teacher side/i }).click();
  await expect(page.getByRole("dialog", { name: /classloop guided walkthrough/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /start on the dashboard/i })).toBeVisible();
  await page.getByRole("button", { name: /skip/i }).click();
  await expect(page.getByText(/You are on a demo account/i)).toBeVisible();
  await expect(page.getByText(/Please download the app to create your own account/i)).toBeVisible();
  await page.waitForTimeout(500);
  const persistedSessions = await page.evaluate(() => localStorage.getItem("classloop:secure:sessions:v3"));
  expect(persistedSessions).toBeNull();

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("heading", { name: /try classloop as a teacher or student/i })).toBeVisible();
});

test("teacher dashboard shows an assistant brief and next-step queue", async ({ page }) => {
  await signIn(page, "teacher");
  await expect(page.getByLabel("Teacher assistant brief")).toBeVisible();
  await expect(page.getByText("Teacher assistant brief")).toBeVisible();
  await expect(page.locator(".assistant-brief-fact")).toHaveCount(4);
  await expect(page.locator(".assistant-action").first()).toBeVisible();
  await expect(page.getByLabel("Copy-ready assistant drafts")).toBeVisible();
  await expect(page.getByText("Next-class opener")).toBeVisible();
  await expect(page.getByRole("button", { name: /copy next-class opener/i })).toBeVisible();
});

async function publishGeometrySample(page: Page) {
  await page.getByRole("button", { name: /new session/i }).first().click();
  await expect(page.getByText(/session template/i)).toBeVisible();
  await page.getByLabel(/session template/i).selectOption("CS workshop");
  await expect(page.getByText(/project or repo/i)).toBeVisible();
  await page.getByRole("button", { name: /use geometry sample/i }).click();
  await expect(page.getByText(/practice problems/i)).toBeVisible();
  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.locator(".review-page")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: /roster & matching/i }).click();
  await expect(page.getByText(/all transcript speakers match the roster/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /import csv/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /export csv/i })).toBeVisible();
  await page.locator('input[accept=".csv,text/csv"]').setInputFiles({
    name: "main-roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Email,Aliases\nMaya Chen,maya@classloop.demo,Maya iPad\nAarav Patel,aarav@classloop.demo,\n"),
  });
  await expect(page.locator('input[value="Maya iPad"]').first()).toBeVisible();
  await page.locator(".roster-attendance-field select").first().selectOption("late");
  await page.getByRole("button", { name: /^link$/i }).first().click();
  await expect(page.getByText(/linked to maya@classloop.demo/i)).toBeVisible();

  await page.getByRole("tab", { name: /class recap/i }).click();
  await page.getByLabel(/approved recap/i).fill("Edited recap: similar triangles, proportional reasoning, and student support checks.");
  await page.getByLabel(/essential question 1/i).fill("How do proportional sides prove triangles are similar?");

  await page.getByRole("tab", { name: /follow-up/i }).click();
  await page.locator(".editable-item input").first().fill("Edited similar triangles practice");
  await page.locator(".editable-item select").first().selectOption("in_progress");
  await page.locator(".followup-card select").first().selectOption("overdue");
  await expect(page.getByText(/participation signals/i)).toBeVisible();

  await page.getByRole("button", { name: /preview and publish/i }).click();
  await expect(page.getByText(/review the student view/i)).toBeVisible();
  await expect(page.getByText(/student portal preview/i)).toBeVisible();
  await expect(page.getByText(/per-student preview differences/i)).toBeVisible();
  await expect(page.getByText(/publish audit/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /edit session/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /save and close/i })).toBeVisible();
  const publishActionHeights = await page
    .locator(".publish-preview-page .review-actions > button")
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.max(...publishActionHeights) - Math.min(...publishActionHeights)).toBeLessThan(8);
  await expect(page.getByText(/teacher-approved class-wide post/i)).toBeVisible();
  await expect(page.locator('[aria-label="Email recap recipients"]')).toContainText("Maya Chen");
  await page.getByLabel(/include student sign-in instructions/i).check();
  await expect(page.getByLabel(/student access instruction preview/i)).toContainText(/Access instructions will be added/i);
  expect(await page.locator(".preview-diff-row").count()).toBeGreaterThanOrEqual(2);
  await page.locator(".preview-diff-row").filter({ hasText: "Aarav" }).click();
  await expect(page.getByLabel(/Preview for Aarav Patel/i)).toBeVisible();
  await page.getByRole("button", { name: /add task/i }).click();
  await page.locator(".editable-line input").last().fill("Bring one corrected proportion to class");
  await page.getByRole("button", { name: /add resource/i }).click();
  await page.locator(".resource-edit-row input").last().fill("Teacher-added review link");
  await expect(page.getByText(/bring one corrected proportion to class/i)).toBeVisible();
  await page.getByRole("button", { name: /publish to students/i }).click();
  await expect(page.getByText(/save this roster/i)).toBeVisible();
  await page.getByLabel(/roster name/i).fill("Geometry review roster");
  await page.getByRole("button", { name: /save roster/i }).click();
  await expect(page.getByText(/Follow-through tracker/i)).toBeVisible();
}

test("teacher can use template links, manual rosters, and Zoom cloud transcript import", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The integration scaffold smoke runs once; responsive coverage comes from the main app smoke.");
  const runId = Date.now().toString(36);
  await resetBrowser(page);
  await createAccount(page, "teacher", `Integration Teacher ${runId}`, `integrations-${runId}@classloop.test`, `teacher-pass-${runId}`);

  await page.getByRole("button", { name: /new session/i }).first().click();
  const classTemplateCard = page.getByLabel(/google docs class template/i);
  await expect(classTemplateCard).toBeVisible();
  await expect(classTemplateCard.getByRole("link", { name: /make a copy/i })).toHaveAttribute("href", classTemplateCopyUrl);
  await expect(classTemplateCard.getByText(/template link is not connected yet/i)).toHaveCount(0);
  await expect(page.getByText(/roster source/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /google classroom/i })).toHaveCount(0);
  await page
    .locator(".summary-input-card")
    .getByLabel(/^Roster$/i)
    .fill(
      [
        "Aaliyah Carter, acarter@cs4all.nyc",
        "Jalen Thompson, jthompson@cs4all.nyc",
        "Priya Mehta, pmehta@cs4all.nyc",
        "Keisha Brown, kbrown@cs4all.nyc",
      ].join("\n"),
    );

  await expect(page.getByText(/zoom cloud import/i)).toBeVisible();
  await page.getByLabel(/search date or title/i).fill("CS4All");
  await page.getByRole("button", { name: /import selected zoom transcript/i }).click();
  await expect(page.getByText(/Imported Audio transcript VTT from CS4All Intro to Computational Thinking/i)).toBeVisible();
  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.locator(".review-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/edit the draft before publishing/i)).toBeVisible();
  await page.getByRole("tab", { name: /^transcript$/i }).click();
  await expect(page.getByText(/CS4All Intro to Computational Thinking transcript/i)).toBeVisible();
  await expect(page.getByText(/Priya Mehta/i).first()).toBeVisible();
  await page.getByRole("tab", { name: /roster & matching/i }).click();
  await expect
    .poll(async () =>
      page.locator(".roster-email-field input").evaluateAll((inputs) =>
        inputs.some((input) => (input as HTMLInputElement).value === "pmehta@cs4all.nyc"),
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: /preview and publish/i }).click();
  await expect(page.getByText(/google classroom post/i)).toBeVisible();
  await page.getByRole("button", { name: /publish to students/i }).click();
  await handleRosterPrompt(page);
  const exported = await downloadCurrentReportJson(page);
  expect(exported.capture?.transcriptSource).toBe("zoom_cloud_transcript");
  expect(exported.transcript).toBe("");
  expect(exported.notes).toContain("Raw Zoom cloud transcript auto-deleted after draft generation.");
  expect(exported.students.map((student) => student.email)).toContain("acarter@cs4all.nyc");
  expect(exported.resources.some((resource) => resource.url.includes("classroom.google.com"))).toBe(false);
});

test("create account reuses an existing email instead of creating duplicate local accounts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The duplicate-email auth regression only needs one browser project.");
  const runId = Date.now().toString(36);
  const email = `duplicate-${runId}@classloop.test`;
  const password = `duplicate-pass-${runId}`;

  await resetBrowser(page);
  await createAccount(page, "teacher", `Duplicate Teacher ${runId}`, email, password);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();

  await signOut(page);
  await openCreateAccountForm(page);
  await chooseAuthRole(page, "student");
  await page.getByPlaceholder("Your name").fill("Duplicate Student");
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password", { exact: true }).fill(password);
  await page.getByPlaceholder("Re-enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await expect(page.getByRole("button", { name: /new session/i }).first()).toBeVisible();

  await signOut(page);
  await openCreateAccountForm(page);
  await chooseAuthRole(page, "individual");
  await page.getByPlaceholder("Your name").fill("Duplicate Individual");
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password", { exact: true }).fill(`wrong-${password}`);
  await page.getByPlaceholder("Re-enter password").fill(`wrong-${password}`);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByRole("heading", { name: /sign in to classloop/i })).toBeVisible();
  await expect(page.getByText(/that email already has a classloop account/i)).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toHaveValue(email);

  await page.getByPlaceholder("Enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
});

test("auth entry buttons open the login and account forms from a compact desktop window", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The compact entry-card regression only needs one browser project.");
  await page.setViewportSize({ width: 713, height: 455 });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/#/dashboard");

  const entryActions = page.locator(".auth-entry-actions");
  const createAccount = entryActions.getByRole("button", { name: /^create account$/i });
  const logIn = entryActions.getByRole("button", { name: /^log in$/i });
  await expect(createAccount).toBeVisible();
  await expect(logIn).toBeVisible();

  await logIn.click();
  await expect(page.getByRole("heading", { name: /^sign in to classloop/i })).toBeVisible();

  await page.reload();
  await expect(createAccount).toBeVisible();
  await createAccount.click();
  await expect(page.getByRole("heading", { name: /^create your classloop account/i })).toBeVisible();
});

test("new accounts are cloud-backed and can sign in on a fresh device", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The cloud-backed signup regression only needs one browser project.");
  const runId = Date.now().toString(36);
  const email = `cloud-account-${runId}@classloop.test`;
  const password = `cloud-pass-${runId}`;
  const name = `Cloud Teacher ${runId}`;

  await resetBrowser(page);
  await createAccount(page, "teacher", name, email, password);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();

  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.goto("/#/dashboard");
  await signInAccount(page, "teacher", email, password);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByText(`Connected as ${email}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Cloud sync is separate from Pro/i)).toBeVisible();
});

test("cloud signup confirmation lets teachers continue locally until email is confirmed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The email-confirmation signup regression only needs one browser project.");
  const runId = Date.now().toString(36);
  const email = `needs-confirm-${runId}@classloop.test`;
  const password = `confirm-pass-${runId}`;

  await resetBrowser(page);
  const cloudAuth = await mockCloudAuthForStripeCheckout(page, email, {
    role: "teacher",
    name: "Needs Confirmation",
    signupRequiresConfirmation: true,
  });
  await openCreateAccountForm(page);
  await chooseAuthRole(page, "teacher");
  await page.getByPlaceholder("Your name").fill("Needs Confirmation");
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password", { exact: true }).fill(password);
  await page.getByPlaceholder("Re-enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();

  const dialog = page.getByRole("dialog", { name: /check your email to finish your account/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Open the inbox for ${email}`);
  await expect(dialog).toContainText(/multi-device sign-in works/i);
  await expect(dialog).toContainText(/same ClassLoop account can sign in/i);
  await expect(dialog).toContainText(/Continue on this device stores the account locally/i);
  await expect(dialog).toContainText(/Multi-device cloud sync will stay unavailable/i);
  await expect(page.getByRole("heading", { name: /sign in to classloop/i })).toBeVisible();
  await dialog.getByRole("button", { name: /resend confirmation email/i }).click();
  await expect(dialog).toContainText(/Confirmation email sent again/i);
  await expect.poll(() => cloudAuth.resendRequests.length).toBe(1);
  expect(cloudAuth.resendRequests[0].body).toMatchObject({ email, type: "signup" });
  await dialog.getByRole("button", { name: /continue on this device/i }).click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await skipAutoWalkthrough(page);
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByText(/Cloud sync is separate from Pro/i)).toBeVisible();
  await expect(page.getByText(`Connected as ${email}`)).toHaveCount(0);
});

test("existing cloud email signs in instead of creating a duplicate account", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The cloud duplicate-email regression only needs one browser project.");
  const runId = Date.now().toString(36);
  const email = `cloud-duplicate-${runId}@classloop.test`;
  const password = `cloud-duplicate-pass-${runId}`;

  await resetBrowser(page);
  await mockCloudAuthForStripeCheckout(page, email, {
    role: "teacher",
    name: "Existing Cloud Teacher",
    signupAlreadyExists: true,
  });
  await createAccount(page, "teacher", "Existing Cloud Teacher", email, password, { mockCloud: false });
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByText(`Connected as ${email}`)).toBeVisible({ timeout: 15_000 });
});

test("cloud email changes require password and wait for new-email confirmation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The cloud email-change regression only needs one browser project.");
  const runId = Date.now().toString(36);
  const email = `profile-email-${runId}@classloop.test`;
  const newEmail = `profile-email-new-${runId}@classloop.test`;
  const password = `profile-pass-${runId}`;
  const name = `Profile Teacher ${runId}`;

  await resetBrowser(page);
  const cloudAuth = await mockCloudAuthForStripeCheckout(page, email, { role: "teacher", name });
  await createAccount(page, "teacher", name, email, password, { mockCloud: false });
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();

  await page.getByRole("button", { name }).click();
  await expect(page.getByText(/Profile settings/i)).toBeVisible();
  await page.locator(".profile-menu").getByLabel("Email").fill(newEmail);
  await page.locator(".profile-menu").getByRole("button", { name: /save settings/i }).click();
  await expect(page.locator(".profile-menu")).toContainText(/Current password is incorrect/i);
  await expect.poll(() => cloudAuth.updateUserRequests.length).toBe(0);

  await page.locator(".profile-menu").getByPlaceholder(/Required to change email or password/i).fill(password);
  await page.locator(".profile-menu").getByRole("button", { name: /save settings/i }).click();
  await expect(page.locator(".profile-menu")).toContainText(/Confirmation sent to the new email/i);
  await expect.poll(() => cloudAuth.updateUserRequests.length).toBe(1);
  expect(cloudAuth.updateUserRequests[0].body).toMatchObject({ email: newEmail });
  await expect(page.getByRole("button", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(newEmail), "i") })).toHaveCount(0);
});

test("individual account can paste personal meeting minutes and track due-date status", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The individual workflow smoke runs once; responsive coverage comes from the main app smoke.");
  const runId = Date.now().toString(36);
  const email = `individual-${runId}@classloop.test`;
  const password = `individual-pass-${runId}`;
  await resetBrowser(page);
  await createAccount(page, "individual", `Individual ${runId}`, email, password);

  await expect(page.getByText(/Personal meetings/).first()).toBeVisible();
  await page.getByRole("button", { name: /new personal meeting/i }).first().click();
  await expect(page.getByText(/Session template/i)).toHaveCount(0);
  await expect(page.getByLabel(/google docs personal template/i)).toBeVisible();
  await expect(page.getByText(/template link is not connected yet/i)).toBeVisible();

  await page.getByLabel(/meeting title/i).fill(`Personal Launch Sync ${runId}`);
  await page.getByLabel(/paste meeting minutes/i).fill(`Meeting title: Personal Launch Sync ${runId}
Date: 2026-05-27
Context: Reviewing the public individual meeting mode.
Resources:
- https://example.com/personal-template
Questions:
- Should the personal dashboard stay paste only?
Due dates:
- Send the Google Docs copy link by Friday
Minutes:
- I need to send the Google Docs copy link by Friday.
- Review personal dashboard polish next week.`);
  await page.getByRole("button", { name: /generate draft/i }).click();

  await expect(page.getByText(/Personal meeting review/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: `Personal Launch Sync ${runId}` })).toBeVisible();
  await expect(page.getByText(/Should the personal dashboard stay paste only/i).first()).toBeVisible();
  await expect(page.getByText(/example.com\/personal-template/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Transcript/i })).toBeVisible();
  await expect(page.getByText(/Personal Launch Sync.*transcript/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Follow-through automations/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /add to calendar/i })).toBeEnabled();
  await expect(page.getByRole("button", { name: /open email draft/i })).toBeDisabled();
  await page.getByLabel(/I reviewed and approve opening this email draft/i).check();
  await expect(page.getByRole("button", { name: /open email draft/i })).toBeEnabled();

  const taskRow = page.locator(".personal-task-row").filter({ hasText: /send the google docs copy link/i }).first();
  await taskRow.locator("select").selectOption("complete");
  await taskRow.getByLabel(/due date/i).fill("Friday 5/29");
  await expect(taskRow.locator(".status-pill")).toHaveText(/complete/i);
  await waitForPersistedPersonalMeetings(page);
  await page.waitForTimeout(600);

  await signOut(page);
  await signInAccount(page, "individual", email, password);
  await page.getByRole("button", { name: /meeting history/i }).first().click();
  await expect(page.getByRole("heading", { name: `Personal Launch Sync ${runId}` })).toBeVisible();
  const persistedTaskRow = page.locator(".personal-task-row").filter({ hasText: /send the google docs copy link/i }).first();
  await expect(persistedTaskRow.locator("select")).toHaveValue("complete");
  await expect(persistedTaskRow.getByLabel(/due date/i)).toHaveValue("Friday 5/29");
});

test("teacher and student end-to-end flows work across three realistic session types without cross-user state leaks", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The full multi-account E2E runs once; mobile has a dedicated smoke test.");
  test.setTimeout(600_000);

  await resetBrowser(page);
  const runId = Date.now().toString(36);
  const teacherA = {
    name: "E2E Teacher Rivera",
    email: `teacher-a-${runId}@classloop.test`,
    password: `teacher-pass-${runId}`,
  };
  const teacherB = {
    name: "E2E Teacher Patel",
    email: `teacher-b-${runId}@classloop.test`,
    password: `teacher-pass-b-${runId}`,
  };
  const savedRosterName = `E2E Math Period ${runId}`;
  const scenarios: EndToEndScenario[] = [
    {
      title: `E2E Algebra Error Analysis ${runId}`,
      template: "Math review",
      student: {
        name: "Maya Vale",
        email: `maya-${runId}@classloop.test`,
        password: `student-pass-maya-${runId}`,
      },
      rosterSaveName: savedRosterName,
      roster: `Maya Vale, maya-${runId}@classloop.test
Jordan Kim, jordan-math-${runId}@classloop.test`,
      transcript: `[00:00:05] Ms. Lin: Today we are reviewing linear equation mistakes and showing corrected steps.
[00:00:22] Maya Vale: I think we distribute first because the parentheses affect every term.
[00:00:51] Jordan Kim: Why did the negative sign change when we moved the term?
[00:04:10] Ms. Lin: Homework for Friday: complete the error-analysis worksheet and correct one old quiz item.
[00:04:34] Maya Vale: I missed problem four because I combined unlike terms.`,
      notes: "Jordan late. Maya should explain one correction in writing.",
      resources: "https://example.com/algebra-error-analysis",
      details: {
        "Practice problems": "Worksheet B, problems 5-10",
        "Skills to reinforce": "Distributing, combining like terms, and inverse operations",
        "Common mistakes": "Dropping negative signs and combining unlike terms",
      },
    },
    {
      title: `E2E App Lab Debugging Workshop ${runId}`,
      template: "CS workshop",
      student: {
        name: "Alex Rivera",
        email: `alex-${runId}@classloop.test`,
        password: `student-pass-alex-${runId}`,
      },
      roster: `Alex Rivera, alex-${runId}@classloop.test
Samir Desai, samir-cs-${runId}@classloop.test`,
      transcript: `[00:00:03] Mr. Chen: Today each pair is debugging the App Lab click counter.
[00:00:31] Alex Rivera: My event listener works after I moved the state update inside the callback.
[00:01:08] Samir Desai: Is the array index supposed to start at zero here?
[00:05:16] Mr. Chen: By Friday, push the fixed counter and write a short reflection on the bug you found.
[00:05:46] Alex Rivera: The checklist helped me catch the missing reset condition.`,
      notes: "Samir quiet after the indexing question; check confidence next session.",
      resources: `https://github.com/example/app-lab-counter
https://example.com/debugging-checklist`,
      details: {
        "Project or repo": "https://github.com/example/app-lab-counter",
        "Debug targets": "Event handlers, state updates, and array indexing",
        "Workshop deliverable": "Push fixed counter and submit a short debugging reflection",
      },
    },
    {
      title: `E2E Robotics Outreach Planning ${runId}`,
      template: "Club meeting",
      student: {
        name: "Priya Shah",
        email: `priya-${runId}@classloop.test`,
        password: `student-pass-priya-${runId}`,
      },
      roster: `Priya Shah, priya-${runId}@classloop.test
Leo Martinez, leo-club-${runId}@classloop.test`,
      transcript: `[00:00:04] Ms. Kim: Today we need owners for the elementary robotics outreach booth.
[00:00:32] Priya Shah: I can own the demo script and make sure each station has a one-minute explanation.
[00:01:18] Leo Martinez: I can email the elementary school coordinator about the room setup.
[00:05:07] Ms. Kim: Next checkpoint is Monday: script draft, materials list, and outreach email should be ready.
[00:05:41] Priya Shah: Can we add a backup battery checklist so setup is not rushed?`,
      notes: "Decision made: keep three short stations instead of one long demo.",
      resources: "https://example.com/robotics-outreach-template",
      details: {
        "Decisions made": "Three short activity stations for the outreach booth",
        "Owners": "Priya owns demo script; Leo owns coordinator email",
        "Next checkpoint": "Monday materials list and script draft",
      },
    },
  ];
  const allTitles = scenarios.map((scenario) => scenario.title);
  const productFeedbackPayloads: Array<Record<string, unknown>> = [];
  await page.route("**/api/feedback", async (route) => {
    if (route.request().method() === "POST") {
      productFeedbackPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await createAccount(page, "teacher", teacherA.name, teacherA.email, teacherA.password);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await signInWithVerifiedProEntitlement(page, teacherA.email, teacherA.password);

  for (const scenario of scenarios) {
    await importReviewAndPublishScenario(page, scenario);
  }
  await waitForPersistedSessions(page);
  await signOut(page);

  for (const scenario of scenarios) {
    await completeScenarioAsStudent(page, scenario, allTitles);
  }
  await expect.poll(() => productFeedbackPayloads.length).toBe(scenarios.length);
  const lowProductFeedback = productFeedbackPayloads.find((payload) => payload.rating === 2);
  expect(lowProductFeedback).toMatchObject({
    rating: 2,
    role: "student",
    source: "student_followup_popup",
    note: "Show one worked example before the task list.",
  });
  const feedbackJson = JSON.stringify(productFeedbackPayloads);
  expect(feedbackJson).toContain('"sessionType":"Math review"');
  expect(feedbackJson).toContain('"completedFollowUp":true');
  expect(feedbackJson).not.toContain("Maya Vale");
  expect(feedbackJson).not.toContain(`maya-${runId}@classloop.test`);
  expect(feedbackJson).not.toContain("complete the error-analysis worksheet");

  await signInAccount(page, "teacher", teacherA.email, teacherA.password);
  await page.getByRole("button", { name: /^dashboard$/i }).click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  for (const title of allTitles) {
    await expect(page.locator(".session-row").filter({ hasText: title })).toBeVisible();
  }

  await expect(page.locator(".nav-list").getByRole("button", { name: /low feedback item/i })).toHaveCount(0);
  await page.locator(".nav-list").getByRole("button", { name: /^analytics$/i }).click();
  await expect(page.getByText(/participation and follow-through/i)).toBeVisible();
  await expect(page.getByText(/3 finished/i)).toBeVisible();
  await expect(page.getByText(/student feedback/i)).toHaveCount(0);
  await expect(page.getByText(/show one worked example before the task list/i)).toHaveCount(0);
  await expect(page.getByText(/Maya Vale's follow-up needs review/i)).toHaveCount(0);

  for (const scenario of scenarios) {
    await openTeacherReport(page, scenario.title);
    const exported = await downloadCurrentReportJson(page);
    expect(exported.title).toBe(scenario.title);
    expect(exported.type).toBe(scenario.template);
    expect(exported.status).toBe("published");
    expect(exported.ownerEmail).toBe(teacherA.email);

    const exportedStudentEmails = exported.students.map((student) => student.email);
    const scenarioEmails = Array.from(scenario.roster.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)).map(
      (match) => match[0].toLowerCase(),
    );
    expect(exportedStudentEmails.sort()).toEqual(scenarioEmails.sort());
    for (const otherScenario of scenarios.filter((item) => item.title !== scenario.title)) {
      expect(JSON.stringify(exported)).not.toContain(otherScenario.title);
      expect(exportedStudentEmails).not.toContain(otherScenario.student.email);
    }

    const primaryStudent = exported.students.find((student) => student.email === scenario.student.email);
    expect(primaryStudent).toBeDefined();
    if (!primaryStudent) throw new Error(`Missing exported student ${scenario.student.email}`);
    const followUp = exported.followUps.find((item) => item.studentId === primaryStudent.id);
    expect(followUp?.status).toBe("submitted");
    const submittedPayload = exported.submissions?.find((item) => item.studentId === primaryStudent.id);
    expect(submittedPayload?.note).toBe(submissionNoteForScenario(scenario));
    expect(submittedPayload?.attachmentUrl).toBe(submissionLinkForScenario(scenario));
    const classWideActionStatuses = exported.actionItems.filter((item) => !item.ownerId).map((item) => item.status);
    expect(classWideActionStatuses.length).toBeGreaterThan(0);
    expect(classWideActionStatuses).not.toContain("submitted");

    await page.goto(`/#/student-session?session=${encodeURIComponent(exported.id)}`);
    await expect(page.getByRole("heading", { name: scenario.title })).toBeVisible();
    await expect(page.getByText(`Edit ${primaryStudent.name}'s student view`)).toBeVisible();
    await page.getByRole("button", { name: /mark reviewed/i }).click();
    await expect(page.getByText(/reviewed/i).first()).toBeVisible();

    await openTeacherReport(page, scenario.title);
    const reviewedExport = await downloadCurrentReportJson(page);
    const reviewedFollowUp = reviewedExport.followUps.find((item) => item.studentId === primaryStudent.id);
    const reviewedSubmission = reviewedExport.submissions?.find((item) => item.studentId === primaryStudent.id);
    expect(reviewedFollowUp?.status).toBe("reviewed");
    expect(reviewedSubmission?.reviewedAt).toBeTruthy();
    expect(reviewedSubmission?.note).toBe(submissionNoteForScenario(scenario));
    expect(reviewedSubmission?.attachmentUrl).toBe(submissionLinkForScenario(scenario));
  }

  await page.getByRole("button", { name: /rosters/i }).click();
  await expect
    .poll(async () =>
      page.locator(".roster-class-selector select option").evaluateAll(
        (options, rosterName) => options.some((option) => option.textContent?.includes(rosterName as string)),
        savedRosterName,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: /classes/i }).click();
  await expect(page.locator(".roster-template-card").filter({ hasText: savedRosterName }).first()).toBeVisible();
  await signOut(page);

  await createAccount(page, "teacher", teacherB.name, teacherB.email, teacherB.password);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await expect(page.getByText(/no sessions yet/i)).toBeVisible();
  for (const title of allTitles) {
    await expect(page.getByText(title)).toHaveCount(0);
  }
  await page.getByRole("button", { name: /rosters/i }).click();
  await expect(page.getByText(/no saved rosters yet/i)).toBeVisible();
  await expect(page.getByText(savedRosterName)).toHaveCount(0);
  await page.getByRole("button", { name: /classes/i }).click();
  await expect(page.getByText(/no classes yet/i)).toBeVisible();
  await expect(page.getByText(savedRosterName)).toHaveCount(0);
});

test("account creation, settings, and password reset work", async ({ page }) => {
  await resetBrowser(page);
  const uniqueEmail = `teacher-${Date.now()}@classloop.test`;
  const originalPassword = "classloop-new-teacher";
  const resetPassword = "classloop-reset-teacher";

  await page.getByRole("button", { name: /show password/i }).click();
  await expect(page.locator('input[placeholder="Enter password"]')).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: /create account/i }).click();
  await chooseAuthRole(page, "teacher");
  await expect(page.locator('input[placeholder="Enter password"]')).toHaveAttribute("type", "password");
  await expect(page.locator('input[placeholder="Re-enter password"]')).toHaveAttribute("type", "password");
  await page.locator(".password-control").first().getByRole("button", { name: /show password/i }).click();
  await expect(page.locator('input[placeholder="Enter password"]')).toHaveAttribute("type", "text");
  await expect(page.locator('input[placeholder="Re-enter password"]')).toHaveAttribute("type", "text");
  await page.locator(".password-control").first().getByRole("button", { name: /hide password/i }).click();
  await expect(page.locator('input[placeholder="Enter password"]')).toHaveAttribute("type", "password");
  await expect(page.locator('input[placeholder="Re-enter password"]')).toHaveAttribute("type", "password");
  await mockCloudAuthForStripeCheckout(page, uniqueEmail, { role: "teacher", name: "Test Teacher" });
  await page.getByLabel(/^name$/i).fill("Test Teacher");
  await page.getByPlaceholder("name@example.com").fill(uniqueEmail);
  await page.locator('input[placeholder="Enter password"]').fill(originalPassword);
  await page.locator('input[placeholder="Re-enter password"]').fill(originalPassword);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await skipAutoWalkthrough(page);

  await page.getByRole("button", { name: /test teacher/i }).click();
  await page.locator(".profile-menu").getByLabel(/^name$/i).fill("Test Teacher Updated");
  await page.locator(".profile-menu button[type='submit']").click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
  await page.getByRole("button", { name: /done/i }).click();
  await expect(page.getByRole("button", { name: /test teacher updated/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /sign out/i }).click();

  await openSignInForm(page);
  await chooseAuthRole(page, "teacher");
  await page.getByPlaceholder("name@example.com").fill(uniqueEmail);
  await page.getByRole("button", { name: /forgot password/i }).click();
  await page.getByRole("button", { name: /get reset code/i }).click();
  const resetCode = (await page.locator(".reset-code-card button").textContent())?.trim() ?? "";
  expect(resetCode).toMatch(/^\d{6}$/);
  await page.getByPlaceholder("6-digit code").fill(resetCode);
  await page.locator('input[placeholder="New password"]').fill(resetPassword);
  await page.locator('input[placeholder="Confirm new password"]').fill(resetPassword);
  await page.getByRole("button", { name: /^reset password$/i }).click();
  await expect(page.getByText(/password reset/i)).toBeVisible();
  await page.getByPlaceholder("Enter password").fill(resetPassword);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
});

test("free local account prepares a cloud account on login when Supabase is configured", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The cloud provisioning regression only needs one browser project.");
  await resetBrowser(page);
  const runId = Date.now().toString(36);
  const email = `free-cloud-${runId}@classloop.test`;
  const password = `free-cloud-pass-${runId}`;

  await createAccount(page, "teacher", "Free Cloud Teacher", email, password);
  await waitForPersistedAccounts(page);
  await signOut(page);

  const signupRequests: Array<Record<string, unknown>> = [];
  await mockCloudSignup(page, email, signupRequests);
  await page.evaluate(() => {
    (window as Window & { __CLASSLOOP_TEST_AUTO_CLOUD__?: boolean }).__CLASSLOOP_TEST_AUTO_CLOUD__ = true;
  });

  await signInAccount(page, "teacher", email, password);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await expect.poll(() => signupRequests.length).toBe(1);
  expect(signupRequests[0]).toMatchObject({
    email,
    password,
    data: {
      role: "teacher",
      name: "Free Cloud Teacher",
      source: "classloop_local_signin",
    },
  });

  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByText(`Connected as ${email}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/FREE · not_configured/i)).toBeVisible();
});

test("teacher can log in, import a sample, preview publishing, publish, open student view, and access analytics", async ({ page }) => {
  await signIn(page, "teacher");
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
  await expect(page.getByRole("button", { name: /new session/i }).first()).toBeVisible();
  await page.waitForTimeout(500);
  const storageState = await page.evaluate(() => ({
    legacyAccounts: localStorage.getItem("classloop:accounts:v1"),
    secureAccounts: localStorage.getItem("classloop:secure:accounts:v1"),
  }));
  expect(storageState.legacyAccounts).toBeNull();
  expect(storageState.secureAccounts).toBeNull();

  await publishGeometrySample(page);
  const reportActionHeights = await page
    .locator(".report-actions > button, .report-actions > .report-export > button")
    .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.max(...reportActionHeights)).toBeLessThan(80);

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^export$/i }).click();
  await expect(page.getByRole("menu", { name: /export options/i })).toBeVisible();
  await page.getByRole("menuitem", { name: /download json/i }).click();
  await expectDownloaded(jsonDownload, /geometry-review.*\.json/i);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^export$/i }).click();
  await page.getByRole("menuitem", { name: /download csv/i }).click();
  await expectDownloaded(csvDownload, /geometry-review.*\.csv/i);
  await page.getByRole("button", { name: /^export$/i }).click();
  await expect(page.getByRole("menuitem", { name: /print report/i })).toBeVisible();

  await page.getByRole("button", { name: /rosters/i }).click();
  await expect(page.locator(".roster-class-selector select")).toContainText("Geometry review roster");
  await expect(page.locator(".roster-template-card", { hasText: "Geometry review roster" }).first()).toContainText(/2 students/i);
  await page.getByLabel(/find student/i).first().fill("maya");
  await expect(page.locator(".roster-count").first()).toContainText("1");
  await expect(page.locator(".roster-count").first()).toContainText("1 hidden");
  await page.getByLabel(/find student/i).first().fill("");
  await expect(page.getByRole("button", { name: /export csv/i }).first()).toBeVisible();
  await page.locator('input[accept=".csv,text/csv"]').last().setInputFiles({
    name: "period-4.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Email,Aliases\nMaya Chen,maya@classloop.demo,Maya iPad\nAarav Patel,aarav@classloop.demo,\n"),
  });
  await expect(page.locator('.roster-template-layout input[value="Maya iPad"]').first()).toBeVisible();

  await page.getByRole("button", { name: /classes/i }).click();
  await expect(page.getByRole("button", { name: /Geometry review roster/i })).toBeVisible();
  await expect(page.getByText(/Edit student rosters from the Rosters tab/i)).toBeVisible();
  await expect(page.getByText(/published sessions linked to this class/i)).toBeVisible();

  await page.getByRole("button", { name: /new session/i }).first().click();
  await page.getByLabel(/session template/i).selectOption("Math review");
  await expect(page.getByLabel(/preload saved roster/i)).toContainText("Geometry review roster");
  await expect(page.getByLabel(/preload class roster/i)).toContainText("Geometry review roster");
  const generateDraftButton = page.getByRole("button", { name: /generate draft/i });
  if (await generateDraftButton.isDisabled()) {
    const quotaMessageVisible = await page.getByText(/Free accounts can generate 1 session per day/i).isVisible().catch(() => false);
    const missingContextVisible = await page
      .getByText(/Add transcript text, meeting notes, or template details before generating a draft/i)
      .isVisible()
      .catch(() => false);
    expect(quotaMessageVisible || missingContextVisible).toBeTruthy();
  } else {
    await expect(page.locator(".settings-message").filter({ hasText: /generate 1 session per day/i })).toHaveCount(0);
  }

  await page.getByRole("button", { name: /student view/i }).click();
  await expect(page.getByText(/follow-up dashboard/i)).toBeVisible();
  await page.getByRole("button", { name: /mark complete/i }).click();
  await expect(page.getByText(/submitted/i).first()).toBeVisible();
  await page.getByRole("button", { name: /open detail/i }).click();
  await expect(page.getByText(/what happened/i)).toBeVisible();
  await page.getByRole("button", { name: /mark reviewed/i }).click();
  await expect(page.getByText(/reviewed/i).first()).toBeVisible();

  await page.getByRole("button", { name: /analytics/i }).click();
  await expect(page.getByText(/Participation and follow-through/i)).toBeVisible();
  await expect(page.getByText(/teacher action queue/i)).toBeVisible();

  await page.getByRole("button", { name: /session report/i }).click();
  await expect(page.getByRole("button", { name: /^export$/i })).toBeVisible();
  await page.getByRole("button", { name: /^export$/i }).click();
  await expect(page.getByRole("menuitem", { name: /download json/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /download csv/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /print report/i })).toBeVisible();

  await page.getByRole("button", { name: /privacy/i }).click();
  await expect(page.getByText(/Manage retention, recording consent/i)).toBeVisible();

  await page.getByRole("button", { name: /session report/i }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /delete session/i }).click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
});

test("guided walkthrough spotlight stays aligned with the explained controls", async ({ page }) => {
  await signIn(page, "teacher", true, false);
  await expect(page.getByRole("dialog", { name: /classloop guided walkthrough/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /start on the dashboard/i })).toBeVisible();

  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="dashboard-overview"]');
  }

  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByRole("heading", { name: /create the session/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="new-session-button"]');
  }

  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByRole("heading", { name: /review before publishing/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="nav-review"]');
  }

  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByRole("heading", { name: /track follow-through/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="nav-analytics"]');
  }
});

test("privacy, sync billing, appearance, and tutorial controls are usable", async ({ page }) => {
  await signIn(page, "teacher");

  await page.getByRole("button", { name: /appearance/i }).click();
  await expect(page.getByText(/experience settings/i)).toBeVisible();
  await page.getByRole("button", { name: /graphite focus/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
  await page.getByLabel(/custom accent/i).fill("#2563eb");
  await page.getByLabel(/image backdrop url/i).fill("https://example.com/classroom.jpg");
  await expect(page.locator(".live-theme-preview")).toHaveAttribute("style", /classroom\.jpg/);
  await page.getByRole("button", { name: /remove image/i }).click();
  await page.getByRole("button", { name: /^reset$/i }).click();

  await expect(page.locator(".topbar-actions").getByRole("button", { name: /student preview/i })).toHaveCount(0);
  await page.getByRole("button", { name: /open interactive walkthrough/i }).click();
  await expect(page.getByRole("dialog", { name: /classloop guided walkthrough/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /start on the dashboard/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /return home/i })).toHaveCount(0);
  await page.getByRole("button", { name: /go to this area/i }).click();
  await expect(page.getByRole("button", { name: /go to this area/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /return home/i })).toBeVisible();
  await page.getByRole("button", { name: /return home/i }).click();
  await expect(page.getByRole("button", { name: /go to this area/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="dashboard-overview"]');
  }
  const tourBackdropFilter = await page
    .locator(".guided-tour")
    .evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(["", "none"].includes(tourBackdropFilter)).toBe(true);
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByRole("heading", { name: /create the session/i })).toBeVisible();
  await expect(page.locator(".tour-backdrop-piece")).toHaveCount(4);
  await expect(page.locator(".tour-corner-mask")).toHaveCount(4);
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expect.poll(async () => (await page.locator(".tour-highlight").boundingBox())?.height ?? 999).toBeLessThan(90);
    await expectTourSpotlight(page, '[data-tour="new-session-button"]');
  }
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByRole("heading", { name: /review before publishing/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="nav-review"]');
  }
  await page.getByRole("button", { name: /^next/i }).click();
  await expect(page.getByRole("heading", { name: /track follow-through/i })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) > 920) {
    await expectTourSpotlight(page, '[data-tour="nav-analytics"]');
  }
  await page.getByRole("button", { name: /skip/i }).click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();

  await page.getByRole("button", { name: /^how it works$/i }).click();
  await expect(page.getByRole("heading", { name: /learn the class follow-up loop one step at a time/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /create a session/i })).toBeVisible();
  await page.getByRole("button", { name: /skip tutorial/i }).click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();

  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByRole("heading", { name: /save time on every class follow-up/i })).toBeVisible();
  await expect(page.getByText(/plan options/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /cloud sync \+ pro walkthrough/i })).toBeVisible();
  await expect(page.getByText(/Cloud sync is separate from Pro/i)).toBeVisible();
  await expect(page.getByText(/Free accounts can upload and download a workspace across devices/i)).toBeVisible();
  await expect(page.getByPlaceholder("you@school.org")).toBeVisible();
  await expect(page.getByText(/school pilot/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /keep free/i })).toHaveCount(0);
  await expect(page.locator(".stripe-pricing-table-shell")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /demo account upgrades are disabled/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /downgrade to free/i })).toHaveCount(0);

  await page.getByRole("button", { name: /^privacy$/i }).click();
  await expect(page.getByText(/manage retention, recording consent/i)).toBeVisible();
  await page.getByLabel(/keep class session data/i).fill("180");
  await page.getByLabel(/require confirmation before live audio notes/i).uncheck();
  await page.getByLabel(/allow student-specific data exports/i).uncheck();
  await page.getByLabel(/no training on student data/i).check();
  const workspaceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /export workspace data/i }).click();
  await expectDownloaded(workspaceDownload, /classloop-export-.*\.json/i);
  await expect(page.getByText(/You are on a demo account/i)).toBeVisible();
});

test("live capture modes stay locked until verified Pro while local billing tampering does not unlock them", async ({ page }) => {
  const runId = Date.now().toString(36);
  const email = `capture-${runId}@classloop.test`;
  const password = `teacher-pass-${runId}`;
  await resetBrowser(page);
  await createAccount(page, "teacher", `Capture Teacher ${runId}`, email, password);
  await signInWithSeededBillingProfile(page, "teacher", email, password, {
    tier: "pro",
    status: "active",
    customerId: "cus_local_tamper_should_not_unlock",
  });
  await page.getByRole("button", { name: /new session/i }).first().click();

  await expect(page.getByText(/Use a transcript, in-person capture, or meeting audio/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Transcript\s*Upload or paste/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /In-person class/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Online meeting/i })).toBeVisible();
  await expect(page.getByText(/Pro only/i)).toHaveCount(2);

  await page.getByRole("button", { name: /In-person class/i }).click();
  await expect(page.getByText(/In-person live capture is available with Pro/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /start capture/i })).toHaveCount(0);
  await expect(page.getByText(/No voiceprints are created/i)).toHaveCount(0);

  await page.getByRole("button", { name: /Online meeting/i }).click();
  await expect(page.getByText(/Online meeting capture is available with Pro/i)).toBeVisible();
  await expect(page.getByRole("dialog", { name: /share the meeting tab or window with audio/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /view plan options/i })).toBeVisible();

  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.locator(".stripe-pricing-table-shell")).toHaveCount(0);
  await expect(page.getByText(/Stripe Payment Link/i)).toBeVisible();
  await expect(page.getByPlaceholder("you@school.org")).toBeVisible();
  await expect(page.getByText(/Cloud sync is separate from Pro/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /downgrade to free/i })).toHaveCount(0);
  const currentPlanCard = page.locator(".integration-card").filter({ hasText: /Current account/ });
  await expect(currentPlanCard).toContainText(/Current account/i);
  await expect(currentPlanCard).toContainText(/Free/i);
});

test("verified Pro can use in-person and online live capture with noisy and missing-audio fallbacks", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Live capture media mocks run once; locked UI coverage runs on desktop and mobile.");
  await mockLiveCaptureDevices(page);
  const runId = Date.now().toString(36);
  const email = `pro-capture-${runId}@classloop.test`;
  const password = `teacher-pass-${runId}`;
  await resetBrowser(page);
  await createAccount(page, "teacher", `Pro Capture Teacher ${runId}`, email, password);
  await signInWithVerifiedProEntitlement(page, email, password);

  await page.getByRole("button", { name: /new session/i }).first().click();
  await page.getByLabel(/session title/i).fill("Pro Live Capture Edge Case");
  await page.getByLabel(/session template/i).selectOption("Math review");
  await page.locator(".summary-input-card").getByLabel(/^Roster$/i).fill("Maya Chen, maya@classloop.test\nAarav Patel, aarav@classloop.test");
  await page.locator(".summary-input-card").getByLabel(/^Meeting notes$/i).fill("Noisy room. Teacher will review unknown speaker segments before publishing.");
  await expect(page.getByText(/Pro only/i)).toHaveCount(0);

  await page.getByRole("button", { name: /In-person class/i }).click();
  await expect(page.getByText(/Start capture before discussion/i)).toBeVisible();
  await page.getByLabel(/permission to capture audio notes/i).check();
  await page.getByRole("button", { name: /start capture/i }).click();
  await expect(page.getByText(/In-person class capture is running/i)).toBeVisible();
  await expect(page.getByText(/No voiceprints are created/i)).toBeVisible();
  await expect(page.getByText(/unknown voice segments/i)).toBeVisible();
  await page.waitForTimeout(80);
  await page.getByRole("button", { name: /^stop$/i }).click();
  await expect(page.getByText(/In-person class capture stopped/i)).toBeVisible();

  await page.getByRole("button", { name: /Online meeting/i }).click();
  await expect(page.getByRole("dialog", { name: /share the meeting tab or window with audio/i })).toBeVisible();
  await expect(page.getByText(/Paste the platform transcript after class/i)).toBeVisible();
  await page.getByRole("button", { name: /not now/i }).click();
  await page.getByRole("button", { name: /start capture/i }).click();
  await expect(page.getByText(/no meeting audio track was shared/i)).toBeVisible();
  await page.waitForTimeout(80);
  await page.getByRole("button", { name: /^stop$/i }).click();
  await expect(page.getByText(/Online meeting capture stopped/i)).toBeVisible();

  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.locator(".review-page")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: /roster & matching/i }).click();
  await expect(page.getByRole("heading", { name: /Unknown meeting voice/i })).toBeVisible();
});

test("Stripe payment link starts checkout without unlocking Pro first", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The Stripe smoke runs once on desktop; mobile checkout is covered by responsive app smokes.");
  const runId = Date.now().toString(36);
  const email = `stripe-${runId}@classloop.test`;
  const password = `teacher-pass-${runId}`;
  const checkoutApiRequests: Array<{ authorization: string | undefined; body: Record<string, unknown> }> = [];
  const prepareRequests: Array<Record<string, unknown>> = [];

  const cloudAuth = await mockCloudAuthForStripeCheckout(page, email, { failPasswordSignIn: true });
  await page.route("https://js.stripe.com/v3/buy-button.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "customElements.define('stripe-buy-button', class extends HTMLElement {});",
    });
  });
  await page.route("https://buy.stripe.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<main><h1>Stripe Payment Link smoke</h1></main>",
    });
  });
  await page.route("**/api/billing/prepare-account", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    prepareRequests.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ready: true, email: body.email }),
    });
  });
  await page.route("**/api/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email,
        role: "teacher",
        billingProfile: { tier: "free", status: "not_configured" },
        noTrainingOnStudentData: true,
      }),
    });
  });
  await page.route("**/api/billing/checkout", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    checkoutApiRequests.push({
      authorization: route.request().headers().authorization,
      body,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_live_playwright_open_smoke" }),
    });
  });

  await resetBrowser(page);
  await seedLocalAccount(page, "teacher", `Stripe Teacher ${runId}`, email, password);
  await page.reload();
  await page.goto("/#/dashboard");
  await signInAccount(page, "teacher", email, password);
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByPlaceholder("you@school.org")).toBeVisible();
  await expect(page.getByRole("heading", { name: /cloud workspace/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /upgrade to pro with stripe/i })).toBeVisible();
  await expect(page.getByText(/Current account/i)).toBeVisible();
  await expect(page.locator(".integration-card").filter({ hasText: /Current account/ })).toContainText(/Free/i);
  await expect(page.locator(".stripe-pricing-table-shell")).toHaveCount(0);
  await expect(page.locator("stripe-pricing-table")).toHaveCount(0);
  await expect(page.getByText(/Stripe Payment Link/i)).toBeVisible();
  await expect(page.getByText(/ClassLoop turns on Pro only after Stripe confirms payment/i)).toBeVisible();
  await expect(page.locator(".stripe-buy-button-copy strong").filter({ hasText: /Stripe Buy Button fallback/i })).toBeVisible();
  await expect(page.getByText(/current theme accent/i)).toBeVisible();

  await page.getByRole("button", { name: /prepare stripe buy button/i }).click();
  await expect.poll(() => cloudAuth.signupRequests.length).toBeLessThanOrEqual(1);
  await expect.poll(() => prepareRequests.length).toBe(0);
  const buyButton = page.locator("stripe-buy-button").first();
  await expect(buyButton).toHaveAttribute("buy-button-id", /^buy_btn_/);
  await expect(buyButton).toHaveAttribute("publishable-key", /^pk_(test|live)_/);
  await expect(buyButton).toHaveAttribute("customer-email", email);
  await expect(buyButton).toHaveAttribute("client-reference-id", "00000000-0000-4000-8000-000000000123");

  await page.getByRole("button", { name: /upgrade to pro with stripe/i }).click();
  await expect.poll(() => prepareRequests.length).toBe(0);
  await expect.poll(() => checkoutApiRequests.length).toBe(0);
  await expect(page).toHaveURL(/buy\.stripe\.com\/7sY28qeT16Mh5wi0ZbeME00/);
  const paymentUrl = new URL(page.url());
  expect(paymentUrl.searchParams.get("prefilled_email")).toBe(email);
  expect(paymentUrl.searchParams.get("client_reference_id")).toBe("00000000-0000-4000-8000-000000000123");
  await expect(page.getByRole("heading", { name: /Stripe Payment Link smoke/i })).toBeVisible();
  await expect(page.getByText(/PRO · active/i)).toHaveCount(0);
});

test("unconfirmed cloud email shows instructions overlay instead of a red billing error", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The Supabase confirmation regression only needs one browser project.");
  const runId = Date.now().toString(36);
  const email = `confirm-${runId}@classloop.test`;
  const password = `teacher-pass-${runId}`;
  const prepareRequests: Array<Record<string, unknown>> = [];
  const checkoutRequests: Array<Record<string, unknown>> = [];
  const cloudOptions = { emailNotConfirmed: true };

  const cloudAuth = await mockCloudAuthForStripeCheckout(page, email, cloudOptions);
  await page.route("**/api/billing/prepare-account", async (route) => {
    prepareRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ready: true, email }),
    });
  });
  await page.route("**/api/billing/checkout", async (route) => {
    checkoutRequests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ clientSecret: "cs_test_should_not_be_used" }),
    });
  });

  await resetBrowser(page);
  await seedLocalAccount(page, "teacher", `Confirm Teacher ${runId}`, email, password);
  await page.reload();
  await page.goto("/#/dashboard");
  await signInAccount(page, "teacher", email, password);
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await page.getByRole("button", { name: /upgrade to pro with stripe/i }).click();

  const dialog = page.getByRole("dialog", { name: /check your email to link your cloud account/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Open the inbox for ${email}`);
  await expect.poll(() => cloudAuth.resendRequests.length).toBe(1);
  await expect(dialog).not.toContainText(/Expected return link/i);
  await expect(dialog).not.toContainText("https://classloop-followup.vercel.app/#/billing?cloud=confirmed");
  await expect(page.locator(".settings-message.warning").filter({ hasText: /email not confirmed|confirm your email/i })).toHaveCount(0);
  await expect.poll(() => prepareRequests.length).toBe(0);
  await expect.poll(() => checkoutRequests.length).toBe(0);
  await dialog.getByRole("button", { name: /resend confirmation email/i }).click();
  await expect(dialog).toContainText(/Confirmation email sent again/i);
  await expect.poll(() => cloudAuth.resendRequests.length).toBe(2);
  expect(cloudAuth.resendRequests[0].body).toMatchObject({ email, type: "signup" });
  expect(cloudAuth.resendRequests[1].body).toMatchObject({ email, type: "signup" });

  await dialog.getByRole("button", { name: /close email confirmation instructions/i }).click();
  await page.getByPlaceholder("you@school.org").fill(email);
  await page.getByLabel(/cloud password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("dialog", { name: /check your email to link your cloud account/i })).toBeVisible();
});

test("students cannot access analytics but can save appearance while logged in, with default theme restored on logout", async ({ page }) => {
  await signIn(page, "student");
  await expect(page.getByRole("button", { name: /analytics/i })).toHaveCount(0);

  const restrictedRoutes = ["analytics", "classes", "rosters", "report", "billing", "checkout", "privacy", "new-session", "review"];
  for (const restrictedRoute of restrictedRoutes) {
    await page.goto(`/#/${restrictedRoute}`);
    await expect(page.getByText(/follow-up dashboard/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /analytics/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /new session/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /billing/i })).toHaveCount(0);
  }

  await page.getByRole("button", { name: /mark complete/i }).click();
  await expect(page.getByText(/submitted/i).first()).toBeVisible();
  await expect(page.getByText(/since your last visit/i)).toBeVisible();

  await page.getByRole("button", { name: /appearance/i }).click();
  await page.getByRole("button", { name: /Graphite focus/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
  await page.getByLabel(/image backdrop url/i).fill("https://example.com/classloop-backdrop.png");
  await expect(page.locator(".live-theme-preview")).toHaveAttribute("style", /classloop-backdrop\.png/);
  const customBackdrop = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--custom-backdrop"),
  );
  expect(customBackdrop).toContain("https://example.com/classloop-backdrop.png");

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("heading", { name: /^ClassLoop$/i })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "classroom");

  await openSignInForm(page);
  await chooseAuthRole(page, "student");
  await page.getByPlaceholder("name@example.com").fill("maya@classloop.demo");
  await page.getByPlaceholder("Enter password").fill("classloop-student");
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "classroom");
  await expect(page.getByText(/You are on a demo account/i)).toBeVisible();
});

test("accessibility and error-recovery smoke covers keyboard focus, labels, and bad transcript recovery", async ({ page }) => {
  await resetBrowser(page);
  await page.keyboard.press("Tab");
  const focusedAfterTab = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return null;
    const style = getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    return {
      tag: active.tagName,
      visible: rect.width > 0 && rect.height > 0,
      hasFocusTreatment:
        style.outlineStyle !== "none" ||
        style.boxShadow !== "none" ||
        style.borderColor !== "rgba(0, 0, 0, 0)",
    };
  });
  expect(focusedAfterTab?.visible).toBe(true);
  expect(focusedAfterTab?.hasFocusTreatment).toBe(true);

  await page.getByPlaceholder("name@example.com").fill(`missing-${Date.now()}@classloop.test`);
  await page.getByPlaceholder("Enter password").fill("wrong-password");
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText(/email not associated with a classloop teacher account/i)).toBeVisible();

  await page.getByPlaceholder("name@example.com").fill(teacherEmail);
  await page.getByPlaceholder("Enter password").fill("wrong-password");
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText(/password is incorrect for this classloop account/i)).toBeVisible();

  const runId = Date.now().toString(36);
  await createAccount(page, "teacher", "Accessibility Teacher", `accessibility-${runId}@classloop.test`, `access-pass-${runId}`);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();

  await page.getByRole("button", { name: /new session/i }).first().click();
  await expect(page.getByRole("button", { name: /Transcript\s*Upload or paste/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /In-person class/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Online meeting/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /generate draft/i })).toBeVisible();

  await page.getByLabel(/session title/i).fill("Accessibility Bad Transcript Recovery");
  await page.getByLabel(/session template/i).selectOption("Study group");
  await page
    .getByLabel(/paste transcript text/i)
    .fill("This transcript lost speaker labels. The group reviewed ratios and the teacher assigned a reflection due Friday.");
  const summary = page.locator(".summary-input-card");
  await summary.getByLabel(/^Roster$/i).fill("Maya Chen, maya@classloop.demo\nJordan Lee, jordan@classloop.demo");
  await summary.getByLabel(/^Resources$/i).fill("not a url\nhttps://example.com/ratio-review).");
  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.locator(".review-page")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: /roster & matching/i }).click();
  await expect(page.getByText(/all transcript speakers match the roster/i)).toBeVisible();
  await page.getByRole("tab", { name: /class recap/i }).click();
  await expect(page.getByLabel(/approved recap/i)).toBeVisible();

  const unnamedInteractive = await page.evaluate(() => {
    const selector = 'button, input:not([type="hidden"]), select, textarea, a[href]';
    const visible = (element: Element) => {
      const html = element as HTMLElement;
      const rect = html.getBoundingClientRect();
      const style = getComputedStyle(html);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const accessibleName = (element: Element) => {
      const html = element as HTMLElement;
      const id = html.id;
      const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? "" : "";
      return [
        html.getAttribute("aria-label"),
        html.getAttribute("title"),
        html.getAttribute("placeholder"),
        explicitLabel,
        html.closest("label")?.textContent,
        html.textContent,
        html.getAttribute("value"),
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    };
    return Array.from(document.querySelectorAll(selector))
      .filter(visible)
      .filter((element) => !accessibleName(element))
      .map((element) => {
        const html = element as HTMLElement;
        return `${html.tagName.toLowerCase()}${html.className ? `.${String(html.className).replace(/\s+/g, ".")}` : ""}`;
      })
      .slice(0, 5);
  });
  expect(unnamedInteractive).toEqual([]);
});

test("core controls remain usable on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await signIn(page, "teacher");
  await expect(page.getByRole("button", { name: /new session/i }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /appearance/i })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 4);
  expect(hasHorizontalOverflow).toBe(false);
});
