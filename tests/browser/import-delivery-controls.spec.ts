import { expect, test, type Page } from "@playwright/test";

type EmailSendRequest = {
  sessionId: string;
  recipients?: string[];
  includeAccessInstructions?: boolean;
};

type EmailSendCall = {
  method: string;
  authorization: string;
  body: EmailSendRequest;
};

const cloudAccessToken = "import-delivery-playwright-access-token";

async function openSignInForm(page: Page) {
  const signInHeading = page.getByText(/Sign in to ClassLoop/i);
  if (await signInHeading.isVisible().catch(() => false)) return;

  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const logInButton = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await logInButton.isVisible().catch(() => false)) {
    await logInButton.click();
  } else {
    await page.locator(".auth-mode-link").click();
  }
  await expect(signInHeading).toBeVisible();
}

async function skipAutoWalkthrough(page: Page) {
  const dialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (!(await dialog.isVisible().catch(() => false))) return;

  const skipButton = dialog.getByRole("button", { name: /skip/i });
  await skipButton.click({ force: true, timeout: 5_000 }).catch(async () => {
    await skipButton.dispatchEvent("click").catch(() => undefined);
  });
  await dialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
}

async function seedAndSignInTeacher(page: Page, name: string, email: string, password: string) {
  await page.goto("/");
  await page.evaluate(
    async ({ name, email, password, accessToken }) => {
      localStorage.clear();
      sessionStorage.clear();
      const passwordBytes = new TextEncoder().encode(password);
      const digest = await crypto.subtle.digest("SHA-256", passwordBytes);
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const timestamp = new Date().toISOString();

      localStorage.setItem(
        "classloop:accounts:v1",
        JSON.stringify([
          {
            id: `teacher-import-delivery-${Date.now().toString(36)}`,
            role: "teacher",
            email,
            name,
            passwordHash,
            createdAt: timestamp,
            theme: "classroom",
          },
        ]),
      );
      localStorage.setItem(
        "sb-classloop-playwright-auth-token",
        JSON.stringify({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "import-delivery-playwright-refresh-token",
          user: {
            id: "00000000-0000-4000-8000-000000000321",
            aud: "authenticated",
            role: "authenticated",
            email,
            email_confirmed_at: timestamp,
            confirmed_at: timestamp,
            last_sign_in_at: timestamp,
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: { role: "teacher", name, source: "playwright" },
            identities: [],
            created_at: timestamp,
            updated_at: timestamp,
          },
        }),
      );
    },
    { name, email, password, accessToken: cloudAccessToken },
  );

  await page.reload();
  await page.goto("/#/dashboard");
  await openSignInForm(page);
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await skipAutoWalkthrough(page);
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
}

async function mockConfiguredEmailDelivery(page: Page, teacherEmail: string, emailRequests: EmailSendCall[]) {
  await page.route("**/api/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email: teacherEmail,
        role: "teacher",
        billingProfile: { tier: "free", status: "not_configured" },
        noTrainingOnStudentData: true,
      }),
    });
  });

  await page.route("**/api/integrations/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        email: {
          configured: true,
          provider: "Gmail SMTP",
        },
        localMcp: {
          available: true,
          transport: "stdio",
          command: "node",
          args: ["dist-mcp/mcp/classloop-server.js"],
          redactionDefault: "strict",
          resources: [],
          tools: [],
          prompts: [],
        },
        composio: {
          configured: false,
          serverName: "classloop-preview-connectors",
          mcpConfigIdConfigured: false,
          userIdConfigured: false,
          configuredToolkitCount: 0,
          coreToolkitCount: 0,
          configuredCoreToolkitCount: 0,
          toolkits: [],
        },
      }),
    });
  });

  await page.route("**/api/email/send-recaps", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as EmailSendRequest;
    const authorization = request.headers().authorization ?? "";
    emailRequests.push({ method: request.method(), authorization, body });
    if (request.method() !== "POST" || authorization !== `Bearer ${cloudAccessToken}`) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authenticated cloud delivery is required." }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "Gmail SMTP",
        sentAt: "2026-07-29T00:00:00.000Z",
        recipients: body.recipients ?? [],
        skipped: [],
        failed: [],
      }),
    });
  });
}

async function dismissRosterSavePrompt(page: Page) {
  const dialog = page.getByRole("dialog", { name: /save this roster/i });
  await dialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /not now/i }).click();
    await expect(dialog).toHaveCount(0);
  }
}

test("uploads a transcript file, resolves speakers, publishes, and sends selected recap emails", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The full import and delivery control flow only needs one browser project.");

  const runId = Date.now().toString(36);
  const teacherEmail = `delivery-teacher-${runId}@classloop.test`;
  const mayaEmail = `maya-${runId}@classloop.test`;
  const jordanEmail = `jordan-${runId}@classloop.test`;
  const emailRequests: EmailSendCall[] = [];
  await mockConfiguredEmailDelivery(page, teacherEmail, emailRequests);
  await seedAndSignInTeacher(
    page,
    `Delivery Teacher ${runId}`,
    teacherEmail,
    `delivery-teacher-pass-${runId}`,
  );

  await page.getByRole("button", { name: /new session/i }).first().click();
  await expect(page.getByText(/session template/i)).toBeVisible();
  await page.getByLabel(/session title/i).fill(`File import and delivery ${runId}`);

  const transcript = `WEBVTT

00:00:01.000 --> 00:00:03.000
Maya iPad: I can explain why the equivalent fractions stay balanced.

00:00:04.000 --> 00:00:06.000
New Guest: I need the catch-up instructions before Friday.

00:00:07.000 --> 00:00:09.000
Jordan Lee: I think multiplying both sides keeps the equation equal.

00:00:10.000 --> 00:00:12.000
Ms. Rivera: Homework for Friday is the short reflection.`;
  await page.locator('input[accept=".txt,.vtt,.srt,text/plain,text/vtt"]').setInputFiles({
    name: "unmatched-speakers.vtt",
    mimeType: "text/vtt",
    buffer: Buffer.from(transcript),
  });
  await expect(page.getByText("Loaded unmatched-speakers.vtt.")).toBeVisible();
  await expect(page.getByLabel(/paste transcript text/i)).toContainText("Maya iPad");

  const summary = page.locator(".summary-input-card");
  await summary.getByLabel(/^Meeting notes$/i).fill("Review equivalent fractions and assign the reflection by Friday.");
  await summary
    .getByLabel(/^Roster$/i)
    .fill(`Maya Chen, ${mayaEmail}\nJordan Lee, ${jordanEmail}`);
  await summary.getByLabel(/^Resources$/i).fill("https://example.com/equivalent-fractions-review");
  await page.getByRole("button", { name: /generate draft/i }).click();

  await expect(page.locator(".review-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/edit the draft before publishing/i)).toBeVisible();
  await page.getByRole("tab", { name: /roster & matching/i }).click();
  await expect(page.getByText(/resolve transcript speakers/i)).toBeVisible();

  const addCard = page
    .locator(".participant-card")
    .filter({ has: page.getByRole("heading", { name: "New Guest", exact: true }) });
  await expect(addCard).toBeVisible();
  await addCard.getByRole("button", { name: /add to roster/i }).click();
  await expect(addCard).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".roster-name-field input")
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toContain("New Guest");

  const linkCard = page
    .locator(".participant-card")
    .filter({ has: page.getByRole("heading", { name: "Maya iPad", exact: true }) });
  await expect(linkCard).toBeVisible();
  await linkCard.locator("select").selectOption({ label: "Maya Chen" });
  await linkCard.getByRole("button", { name: /link name/i }).click();
  await expect(linkCard).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".roster-aliases-field input")
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toContain("Maya iPad");
  await expect(page.getByText(/all transcript speakers match the roster/i)).toBeVisible();

  await page.getByRole("button", { name: /preview and publish/i }).click();
  await expect(page.getByText(/review the student view/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /publish to students/i })).toBeEnabled();
  await page.getByRole("button", { name: /publish to students/i }).click();
  await dismissRosterSavePrompt(page);
  await expect(page.getByRole("heading", { name: new RegExp(`File import and delivery ${runId}`, "i") })).toBeVisible();
  await expect(page.getByText(/follow-through tracker/i)).toBeVisible();

  await page.goBack();
  await expect(page.getByText(/one-click student delivery/i)).toBeVisible();
  await expect(page.getByText(/Gmail SMTP is ready/i)).toBeVisible();
  await expect(page.getByText(/Sender details stay private on the server/i)).toBeVisible();

  const recipientList = page.locator('[aria-label="Email recap recipients"]');
  const mayaRecipient = recipientList.locator("label").filter({ hasText: mayaEmail }).getByRole("checkbox");
  const jordanRecipient = recipientList.locator("label").filter({ hasText: jordanEmail }).getByRole("checkbox");
  await expect(mayaRecipient).toBeChecked();
  await expect(jordanRecipient).toBeChecked();
  await jordanRecipient.uncheck();
  await expect(jordanRecipient).not.toBeChecked();
  await page.getByLabel(/include student sign-in instructions/i).check();

  const sendRecapButton = page.getByRole("button", { name: /send recap emails/i });
  await expect(sendRecapButton).toBeEnabled();
  await sendRecapButton.click();
  await expect.poll(() => emailRequests.length).toBe(1);
  expect(emailRequests[0]).toMatchObject({
    method: "POST",
    authorization: `Bearer ${cloudAccessToken}`,
    body: {
      recipients: [mayaEmail],
      includeAccessInstructions: true,
    },
  });
  expect(emailRequests[0].body.sessionId).toMatch(/^session-generated-/);
  await expect(page.getByText("Recaps sent")).toBeVisible();
  await expect(page.getByRole("button", { name: /emails sent/i })).toBeDisabled();
  await expect(page.getByText("Sent recap emails to 1 student.").first()).toBeVisible();
  await expect(page.getByText("Student recap email")).toBeVisible();
});
