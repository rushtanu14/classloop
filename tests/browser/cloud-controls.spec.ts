import { expect, test, type Page, type Route } from "@playwright/test";

const supabaseProjectRef = "classloop-playwright";
const supabaseAccessToken = "cloud-controls-playwright-access-token";
const supabaseRefreshToken = "cloud-controls-playwright-refresh-token";

type CloudStateCall = {
  method: string;
  authorization: string;
  body: Record<string, unknown> | null;
};

type CloudMock = {
  tokenRequests: number;
  cloudStateCalls: CloudStateCall[];
  logoutShouldFail: boolean;
};

function classGroup(id: string, ownerEmail: string, name: string) {
  const timestamp = "2026-07-28T12:00:00.000Z";
  return {
    id,
    ownerEmail,
    name,
    description: `${name} browser fixture`,
    defaultSessionType: "General classroom",
    students: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function openSignInForm(page: Page) {
  const signInHeading = page.getByText(/Sign in to ClassLoop/i);
  if (await signInHeading.isVisible().catch(() => false)) return;

  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const loginButton = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await loginButton.isVisible().catch(() => false)) {
    await loginButton.click();
  } else {
    await page.locator(".auth-mode-link").click();
  }
  await expect(signInHeading).toBeVisible();
}

async function chooseTeacherRole(page: Page) {
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await expect(page.getByPlaceholder("name@example.com")).toBeVisible();
}

async function resetAndSeedLocalTeacher(
  page: Page,
  {
    email,
    password,
    localClassName,
  }: {
    email: string;
    password: string;
    localClassName: string;
  },
) {
  await page.goto("/#/dashboard");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await openSignInForm(page);

  await page.evaluate(
    async ({ email: accountEmail, password: accountPassword, localClassName: className }) => {
      const passwordBytes = new TextEncoder().encode(accountPassword);
      const digest = await crypto.subtle.digest("SHA-256", passwordBytes);
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const timestamp = "2026-07-28T12:00:00.000Z";

      localStorage.setItem(
        "classloop:accounts:v1",
        JSON.stringify([
          {
            id: "teacher-cloud-controls",
            role: "teacher",
            email: accountEmail,
            name: "Cloud Controls Teacher",
            passwordHash,
            createdAt: timestamp,
            theme: "classroom",
          },
        ]),
      );
      localStorage.setItem(
        "classloop:class-groups:v1",
        JSON.stringify([
          {
            id: "local-cloud-controls-class",
            ownerEmail: accountEmail,
            name: className,
            description: `${className} browser fixture`,
            defaultSessionType: "General classroom",
            students: [],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]),
      );
      localStorage.setItem(
        "classloop:privacy:v1",
        JSON.stringify({
          retentionDays: 180,
          recordingConsentRequired: true,
          allowStudentExport: true,
          auditLogEnabled: false,
          noTrainingOnStudentData: true,
        }),
      );
    },
    { email, password, localClassName },
  );

  await page.reload();
  await openSignInForm(page);
  await chooseTeacherRole(page);
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible({ timeout: 15_000 });
}

async function openPlanOptions(page: Page) {
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^Plan options\.$/i })).toBeVisible();
}

function cloudControls(page: Page) {
  return page.locator("details.settings-options-panel").filter({
    hasText: "Upload this device or pull the latest cloud copy.",
  });
}

async function openCloudControls(page: Page) {
  const controls = cloudControls(page);
  const isOpen = await controls.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await controls.locator("summary").click();
  }
  return controls;
}

async function supabaseSessionStorageKeys(page: Page) {
  return page.evaluate((projectRef) => {
    const prefix = `sb-${projectRef}-auth-token`;
    const matchingKeys = (storage: Storage) =>
      Object.keys(storage).filter((key) => key === prefix || key.startsWith(`${prefix}-`));
    return {
      local: matchingKeys(localStorage),
      session: matchingKeys(sessionStorage),
    };
  }, supabaseProjectRef);
}

async function handleNextConfirm(page: Page, action: "accept" | "dismiss") {
  return new Promise<string>((resolve, reject) => {
    page.once("dialog", (dialog) => {
      const message = dialog.message();
      const response = action === "accept" ? dialog.accept() : dialog.dismiss();
      void response.then(() => resolve(message), reject);
    });
  });
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockCloudBackend(page: Page, email: string, remoteClassName: string): Promise<CloudMock> {
  const mock: CloudMock = {
    tokenRequests: 0,
    cloudStateCalls: [],
    logoutShouldFail: false,
  };
  const fakeUser = {
    id: "00000000-0000-4000-8000-000000000789",
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: "2026-07-28T12:00:00.000Z",
    confirmed_at: "2026-07-28T12:00:00.000Z",
    last_sign_in_at: "2026-07-28T12:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {
      product: "ClassLoop",
      plan: "free",
      role: "teacher",
      name: "Cloud Controls Teacher",
      source: "playwright",
    },
    identities: [],
    created_at: "2026-07-28T12:00:00.000Z",
    updated_at: "2026-07-28T12:00:00.000Z",
  };
  const session = {
    access_token: supabaseAccessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: supabaseRefreshToken,
    user: fakeUser,
  };

  await page.route("**/auth/v1/token**", async (route) => {
    mock.tokenRequests += 1;
    await fulfillJson(route, session);
  });
  await page.route("**/auth/v1/user**", async (route) => {
    await fulfillJson(route, fakeUser);
  });
  await page.route("**/auth/v1/logout**", async (route) => {
    if (mock.logoutShouldFail) {
      await fulfillJson(route, { error: "logout_unavailable", message: "Logout unavailable" }, 503);
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/profile", async (route) => {
    await fulfillJson(route, {
      email,
      role: "teacher",
      billingProfile: { tier: "free", status: "not_configured" },
      noTrainingOnStudentData: true,
    });
  });
  await page.route("**/api/integrations/status", async (route) => {
    await fulfillJson(route, {});
  });
  await page.route("**/api/cloud-state", async (route) => {
    const request = route.request();
    const method = request.method();
    mock.cloudStateCalls.push({
      method,
      authorization: request.headers().authorization ?? "",
      body:
        method === "PUT"
          ? (JSON.parse(request.postData() ?? "{}") as Record<string, unknown>)
          : null,
    });

    if (method === "GET") {
      await fulfillJson(route, {
        state: {
          sessions: [],
          personalMeetings: [],
          draft: null,
          demoLoaded: false,
          classGroups: [
            classGroup("remote-cloud-controls-class", email, remoteClassName),
          ],
          rosterTemplates: [],
          auditLog: [],
        },
        updatedAt: "2026-07-28T18:30:00.000Z",
      });
      return;
    }

    await fulfillJson(route, { ok: true, updatedAt: "2026-07-28T18:31:00.000Z" });
  });

  return mock;
}

test.describe("Cloud workspace controls", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Cloud-control state coverage only needs one browser project.");
  });

  test("same-email local teacher can upload, confirm a destructive download, and disconnect the cloud session", async ({
    page,
  }) => {
    const runId = Date.now().toString(36);
    const email = `cloud-controls-${runId}@classloop.test`;
    const password = `cloud-controls-password-${runId}`;
    const localClassName = `Local class ${runId}`;
    const remoteClassName = `Cloud class ${runId}`;
    await page.addInitScript(() => {
      (window as Window & { __CLASSLOOP_TEST_AUTO_CLOUD__?: boolean }).__CLASSLOOP_TEST_AUTO_CLOUD__ = true;
    });
    const cloud = await mockCloudBackend(page, email, remoteClassName);

    await resetAndSeedLocalTeacher(page, { email, password, localClassName });
    await openPlanOptions(page);
    await expect(page.getByText(`Connected as ${email}`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Cloud email", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Cloud password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^create account$/i })).toHaveCount(0);
    expect(cloud.tokenRequests).toBe(1);

    await expect
      .poll(async () => {
        const keys = await supabaseSessionStorageKeys(page);
        return keys.local.length + keys.session.length;
      })
      .toBeGreaterThan(0);

    let controls = await openCloudControls(page);
    await controls.getByRole("button", { name: /Upload this device/i }).click();
    await expect(page.getByText("Uploaded this account's workspace to cloud sync.")).toBeVisible();
    await expect.poll(() => cloud.cloudStateCalls.filter((call) => call.method === "PUT").length).toBe(1);

    const upload = cloud.cloudStateCalls.find((call) => call.method === "PUT");
    expect(upload?.authorization).toBe(`Bearer ${supabaseAccessToken}`);
    expect(upload?.body).not.toHaveProperty("accounts");
    expect(upload?.body).not.toHaveProperty("billingProfile");
    expect(upload?.body?.classGroups).toEqual([
      expect.objectContaining({
        ownerEmail: email,
        name: localClassName,
      }),
    ]);

    const dismissedConfirm = handleNextConfirm(page, "dismiss");
    await controls.getByRole("button", { name: /Download cloud copy/i }).click();
    await expect(dismissedConfirm).resolves.toMatch(
      /Replace this account's local workspace with the cloud copy/i,
    );
    await expect(page.getByText("Cloud download canceled. Local work was not changed.")).toBeVisible();
    await expect.poll(() => cloud.cloudStateCalls.filter((call) => call.method === "GET").length).toBe(1);

    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.getByText(localClassName, { exact: true })).toBeVisible();
    await expect(page.getByText(remoteClassName, { exact: true })).toHaveCount(0);

    await openPlanOptions(page);
    await expect(page.getByText(`Connected as ${email}`)).toBeVisible();
    controls = await openCloudControls(page);
    const acceptedConfirm = handleNextConfirm(page, "accept");
    await controls.getByRole("button", { name: /Download cloud copy/i }).click();
    await expect(acceptedConfirm).resolves.toMatch(
      /Replace this account's local workspace with the cloud copy/i,
    );
    await expect(page.getByText("Downloaded this account's cloud workspace to this device.")).toBeVisible();
    await expect.poll(() => cloud.cloudStateCalls.filter((call) => call.method === "GET").length).toBe(2);

    const downloads = cloud.cloudStateCalls.filter((call) => call.method === "GET");
    expect(downloads.every((call) => call.authorization === `Bearer ${supabaseAccessToken}`)).toBe(true);
    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.getByText(remoteClassName, { exact: true })).toBeVisible();
    await expect(page.getByText(localClassName, { exact: true })).toHaveCount(0);

    await page.reload();
    await page.goto("/#/dashboard");
    await openSignInForm(page);
    await chooseTeacherRole(page);
    await page.getByPlaceholder("name@example.com").fill(email);
    await page.getByPlaceholder("Enter password").fill(password);
    await page.locator("form.login-form button[type='submit']").click();
    await expect(page.getByText("Today in ClassLoop")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.getByText(remoteClassName, { exact: true })).toBeVisible();
    await expect(page.getByText(localClassName, { exact: true })).toHaveCount(0);

    await openPlanOptions(page);
    await expect(page.getByText(`Connected as ${email}`)).toBeVisible();
    controls = await openCloudControls(page);
    cloud.logoutShouldFail = true;
    await controls.getByRole("button", { name: /Disconnect cloud sync/i }).click();
    await expect(
      page.getByText(/Cloud sync disconnected on this device.*local cloud credentials were cleared/i),
    ).toBeVisible();
    await expect(page.getByText(`Connected as ${email}`)).toHaveCount(0);
    await expect(controls.getByRole("button", { name: /Upload this device/i })).toBeDisabled();
    await expect(controls.getByRole("button", { name: /Download cloud copy/i })).toBeDisabled();
    await expect(controls.getByRole("button", { name: /Disconnect cloud sync/i })).toBeDisabled();
    await expect(page.getByLabel("Cloud email", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Cloud password", { exact: true })).toHaveCount(0);
    await expect.poll(() => supabaseSessionStorageKeys(page)).toEqual({ local: [], session: [] });
  });

  test("disconnected users can only start cloud login from the main sign-in page", async ({ page }) => {
    const runId = Date.now().toString(36);
    const email = `cloud-owner-${runId}@classloop.test`;
    const differentEmail = `different-cloud-${runId}@classloop.test`;
    const password = `cloud-owner-password-${runId}`;
    const cloud = await mockCloudBackend(page, differentEmail, `Unused cloud class ${runId}`);

    await resetAndSeedLocalTeacher(page, {
      email,
      password,
      localClassName: `Local owner class ${runId}`,
    });
    await openPlanOptions(page);
    await expect(page.getByLabel("Cloud email", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Cloud password", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^create account$/i })).toHaveCount(0);
    await expect(page.getByText(/main ClassLoop sign-in page/i)).toBeVisible();
    expect(cloud.tokenRequests).toBe(0);
    expect(cloud.cloudStateCalls).toEqual([]);
    await expect(supabaseSessionStorageKeys(page)).resolves.toEqual({ local: [], session: [] });

    const controls = await openCloudControls(page);
    await expect(controls.getByRole("button", { name: /Upload this device/i })).toBeDisabled();
    await expect(controls.getByRole("button", { name: /Download cloud copy/i })).toBeDisabled();
    await expect(controls.getByRole("button", { name: /Disconnect cloud sync/i })).toBeDisabled();
    expect(cloud.cloudStateCalls).toEqual([]);
  });
});
