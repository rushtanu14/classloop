import { expect, test, type Page, type Route } from "@playwright/test";

const teacherEmail = "filestack-teacher@classloop.test";
const teacherPassword = "filestack-teacher-password";
const accessToken = "filestack-playwright-access-token";

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function signInTeacher(page: Page) {
  const timestamp = new Date().toISOString();
  const fakeUser = {
    id: "00000000-0000-4000-8000-000000000678",
    aud: "authenticated",
    role: "authenticated",
    email: teacherEmail,
    email_confirmed_at: timestamp,
    confirmed_at: timestamp,
    last_sign_in_at: timestamp,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { role: "teacher", name: "Filestack Teacher", source: "playwright" },
    identities: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "filestack-playwright-refresh-token",
    user: fakeUser,
  };

  await page.route("**/auth/v1/token**", async (route) => fulfillJson(route, session));
  await page.route("**/auth/v1/user**", async (route) => fulfillJson(route, fakeUser));
  await page.route("**/api/profile", async (route) =>
    fulfillJson(route, {
      email: teacherEmail,
      role: "teacher",
      billingProfile: { tier: "free", status: "not_configured" },
      noTrainingOnStudentData: true,
    }),
  );

  await page.goto("/");
  await page.evaluate(
    async ({ email, password, session }) => {
      localStorage.clear();
      sessionStorage.clear();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(
        "classloop:accounts:v1",
        JSON.stringify([
          {
            id: "filestack-teacher-account",
            role: "teacher",
            email,
            name: "Filestack Teacher",
            passwordHash,
            createdAt: new Date().toISOString(),
            theme: "classroom",
          },
        ]),
      );
      localStorage.setItem("sb-classloop-playwright-auth-token", JSON.stringify(session));
    },
    { email: teacherEmail, password: teacherPassword, session },
  );
  await page.reload();
  await page.goto("/#/dashboard");
  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const logInButton = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await logInButton.isVisible().catch(() => false)) await logInButton.click();
  else await page.locator(".auth-mode-link").click();
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await page.getByPlaceholder("name@example.com").fill(teacherEmail);
  await page.getByPlaceholder("Enter password").fill(teacherPassword);
  await page.locator("form.login-form button[type='submit']").click();
  const walkthrough = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await walkthrough.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await walkthrough.isVisible().catch(() => false)) {
    await walkthrough.getByRole("button", { name: /skip/i }).click({ force: true });
  }
}

test("teacher explicitly uploads an already-shareable resource through signed Filestack endpoints", async ({ page }) => {
  let sessionAuthorization = "";
  let finalizeAuthorization = "";
  let filestackUploadUrl = "";

  await page.route("**/api/file-uploads/session", async (route) => {
    sessionAuthorization = route.request().headers().authorization ?? "";
    await fulfillJson(route, {
      apiKey: "filestack-public-test-key",
      policy: "signed-upload-policy",
      signature: "signed-upload-signature",
      expiresAt: "2026-08-06T12:05:00.000Z",
      maxSizeBytes: 10_485_760,
      allowedExtensions: [".pdf", ".txt", ".md"],
      allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"],
      filenamePrefix: "cl-test-prefix-",
      uploadReceipt: "signed-upload-receipt",
    });
  });
  await page.route("https://www.filestackapi.com/api/store/S3?**", async (route) => {
    filestackUploadUrl = route.request().url();
    await fulfillJson(route, {
      handle: "AbCdEfGhIjKlMnOpQrSt",
      filename: "cl-test-prefix-cell-worksheet.pdf",
      mimetype: "application/pdf",
      size: 2048,
      url: "https://cdn.filestackcontent.com/AbCdEfGhIjKlMnOpQrSt",
    });
  });
  await page.route("**/api/file-uploads/finalize", async (route) => {
    finalizeAuthorization = route.request().headers().authorization ?? "";
    expect(route.request().postDataJSON()).toEqual({
      handle: "AbCdEfGhIjKlMnOpQrSt",
      uploadReceipt: "signed-upload-receipt",
      originalFilename: "cell-worksheet.pdf",
    });
    await fulfillJson(route, {
      title: "cell worksheet",
      url: "https://cdn.filestackcontent.com/AbCdEfGhIjKlMnOpQrSt?policy=read-policy&signature=read-signature",
      type: "worksheet",
      relatedTopic: "Teacher-uploaded resource",
      expiresAt: "2031-08-05T12:00:00.000Z",
      scan: {
        verdict: "clean",
        threats: [],
        engine: "ClamAV",
        engineVersion: "ClamAV 1.5.3/27800/Fri Aug 8 12:00:00 2026",
        signatureUpdatedAt: "2026-08-08T12:00:00.000Z",
        scannedAt: "2026-08-08T12:00:02.000Z",
      },
    });
  });

  await signInTeacher(page);
  await page.getByRole("button", { name: /new session/i }).first().click();
  await page.getByRole("button", { name: /use geometry sample/i }).click();
  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.getByText(/edit the draft before publishing/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: /follow-up/i }).click();

  await expect(page.getByText(/never upload transcripts, rosters, private notes, or student work/i)).toBeVisible();
  const uploadButton = page.getByRole("button", { name: /upload shareable resource/i });
  await expect(uploadButton).toBeDisabled();
  await page.getByLabel(/file is already intended for students/i).check();
  await expect(uploadButton).toBeEnabled();
  await page.getByLabel(/choose shareable resource file/i).setInputFiles({
    name: "cell-worksheet.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nClass worksheet"),
  });

  await expect(page.locator('input[value="cell worksheet"]')).toBeVisible();
  await expect(page.locator(".filestack-resource-upload .settings-message")).toContainText(
    /no malware was detected by clamav/i,
  );
  expect(sessionAuthorization).toBe(`Bearer ${accessToken}`);
  expect(finalizeAuthorization).toBe(`Bearer ${accessToken}`);
  const uploadUrl = new URL(filestackUploadUrl);
  expect(uploadUrl.searchParams.get("key")).toBe("filestack-public-test-key");
  expect(uploadUrl.searchParams.get("policy")).toBe("signed-upload-policy");
  expect(uploadUrl.searchParams.get("signature")).toBe("signed-upload-signature");
  expect(uploadUrl.searchParams.get("filename")).toBe("cl-test-prefix-cell-worksheet.pdf");
});
