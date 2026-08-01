import { expect, test, type Page, type Route } from "@playwright/test";

const teacherEmail = "composio-runtime@classloop.test";
const teacherPassword = "composio-runtime-password";
const supabaseAccessToken = "composio-runtime-access-token";

type RuntimeConnection = {
  integrationId: string;
  toolkit: string;
  connectionStatus: string;
  connected: boolean;
  updatedAt?: string;
};

type RuntimeMockOptions = {
  connections?: RuntimeConnection[];
  connectRedirectUrl?: string;
  connectConnected?: boolean;
  actionDelayMs?: number;
};

type RuntimeMock = {
  connectionRequestCount: number;
  connectRequests: Array<Record<string, unknown>>;
  recordRequests: Array<Record<string, unknown>>;
  importPreviewRequests: Array<Record<string, unknown>>;
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function integrationStatus() {
  return {
    email: {
      configured: true,
      provider: "SMTP",
    },
    localMcp: {
      available: true,
      transport: "stdio",
      command: "node",
      args: ["dist-mcp/mcp/classloop-server.js"],
      redactionDefault: "strict",
      resources: [],
      tools: ["preview_connector_records"],
      prompts: [],
    },
    composio: {
      configured: true,
      serverName: "classloop-preview-connectors",
      mcpConfigIdConfigured: true,
      userIdConfigured: false,
      configuredToolkitCount: 2,
      coreToolkitCount: 1,
      configuredCoreToolkitCount: 1,
      toolkits: [
        {
          id: "googledocs",
          toolkit: "googledocs",
          label: "Google Docs",
          category: "Google Workspace",
          priority: "core",
          purpose: "Read a teacher-selected document.",
          authConfigEnv: "COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID",
          authConfigured: true,
          mode: "preview_first",
          allowedTools: ["GOOGLEDOCS_GET_DOCUMENT_BY_ID"],
        },
        {
          id: "outlook",
          toolkit: "outlook",
          label: "Outlook",
          category: "Microsoft school tools",
          priority: "optional",
          purpose: "Preview teacher-owned Outlook records.",
          authConfigEnv: "COMPOSIO_OUTLOOK_AUTH_CONFIG_ID",
          authConfigured: true,
          mode: "preview_first",
          allowedTools: ["OUTLOOK_LIST_MESSAGES"],
        },
      ],
    },
  };
}

async function mockRuntime(page: Page, options: RuntimeMockOptions = {}): Promise<RuntimeMock> {
  const fakeUser = {
    id: "00000000-0000-4000-8000-000000000321",
    aud: "authenticated",
    role: "authenticated",
    email: teacherEmail,
    email_confirmed_at: "2026-07-29T12:00:00.000Z",
    confirmed_at: "2026-07-29T12:00:00.000Z",
    last_sign_in_at: "2026-07-29T12:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {
      product: "ClassLoop",
      plan: "free",
      role: "teacher",
      name: "Composio Runtime Teacher",
      source: "playwright",
    },
    identities: [],
    created_at: "2026-07-29T12:00:00.000Z",
    updated_at: "2026-07-29T12:00:00.000Z",
  };
  const session = {
    access_token: supabaseAccessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "composio-runtime-refresh-token",
    user: fakeUser,
  };
  const mock: RuntimeMock = {
    connectionRequestCount: 0,
    connectRequests: [],
    recordRequests: [],
    importPreviewRequests: [],
  };

  await page.route("**/auth/v1/token**", async (route) => {
    await fulfillJson(route, session);
  });
  await page.route("**/auth/v1/user**", async (route) => {
    await fulfillJson(route, fakeUser);
  });
  await page.route("**/api/profile", async (route) => {
    await fulfillJson(route, {
      email: teacherEmail,
      role: "teacher",
      billingProfile: { tier: "free", status: "not_configured" },
      noTrainingOnStudentData: true,
    });
  });
  await page.route("**/api/integrations/status", async (route) => {
    await fulfillJson(route, integrationStatus());
  });
  await page.route("**/api/integrations/connections", async (route) => {
    mock.connectionRequestCount += 1;
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe(`Bearer ${supabaseAccessToken}`);
    await fulfillJson(route, { connections: options.connections ?? [] });
  });
  await page.route("**/api/integrations/connect", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mock.connectRequests.push(body);
    expect(route.request().headers().authorization).toBe(`Bearer ${supabaseAccessToken}`);
    if (options.actionDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.actionDelayMs));
    }
    await fulfillJson(route, {
      integrationId: body.integrationId,
      connectionStatus: options.connectConnected ? "ACTIVE" : "INITIATED",
      connected: options.connectConnected ?? false,
      redirectUrl: options.connectRedirectUrl,
    });
  });
  await page.route("**/api/integrations/records", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mock.recordRequests.push(body);
    expect(route.request().headers().authorization).toBe(`Bearer ${supabaseAccessToken}`);
    await fulfillJson(route, {
      integrationId: body.integrationId,
      records: [
        {
          selectionKey: "clsi1.test-selection-token",
          integrationId: "googledocs",
          title: "Period 4 review notes",
          subtitle: "Google Docs document",
          availableFields: ["title", "notes", "resources"],
        },
      ],
      truncated: false,
    });
  });
  await page.route("**/api/integrations/import-preview", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mock.importPreviewRequests.push(body);
    expect(route.request().headers().authorization).toBe(`Bearer ${supabaseAccessToken}`);
    await fulfillJson(route, {
      patch: {
        schemaVersion: 1,
        importId: "import-docs-1",
        integrationId: "googledocs",
        providerLabel: "Google Docs",
        sourceLabel: "Period 4 review notes",
        fields: {
          title: "Period 4 review notes",
          notes: ["Teacher-owned normalized document notes"],
          resources: [
            {
              title: "Period 4 review notes",
              url: "https://docs.google.com/document/d/doc-123/edit",
            },
          ],
        },
        warnings: [],
        receipt: {
          id: "receipt-docs-1",
          importedAt: "2026-07-29T13:00:00.000Z",
        },
      },
    });
  });
  await page.route("https://connect.composio.dev/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Trusted Composio connection</title>",
    });
  });

  return mock;
}

async function signInTeacher(page: Page) {
  await page.addInitScript(() => {
    (window as Window & { __CLASSLOOP_TEST_AUTO_CLOUD__?: boolean }).__CLASSLOOP_TEST_AUTO_CLOUD__ = true;
  });
  await page.goto("/#/dashboard");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.evaluate(
    async ({ email, password }) => {
      const bytes = new TextEncoder().encode(password);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const passwordHash = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(
        "classloop:accounts:v1",
        JSON.stringify([
          {
            id: "teacher-composio-runtime",
            role: "teacher",
            email,
            name: "Composio Runtime Teacher",
            passwordHash,
            createdAt: "2026-07-29T12:00:00.000Z",
            theme: "classroom",
          },
        ]),
      );
    },
    { email: teacherEmail, password: teacherPassword },
  );
  await page.reload();
  await page.getByRole("button", { name: /^log in$/i }).click();
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await page.getByPlaceholder("name@example.com").fill(teacherEmail);
  await page.getByPlaceholder("Enter password").fill(teacherPassword);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible({ timeout: 15_000 });

  const walkthrough = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  if (await walkthrough.isVisible().catch(() => false)) {
    await walkthrough.getByRole("button", { name: /skip/i }).click({ force: true });
  }
  await page.locator(".nav-list").getByRole("button", { name: /^Integrations$/i }).click();
  await expect(page.getByRole("heading", { name: /connect classloop to the places teachers already work/i })).toBeVisible();
}

function connectorCard(page: Page, name: string) {
  return page.locator("article.integration-workflow-card").filter({ hasText: name });
}

test.describe("Per-teacher Composio runtime", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The authenticated Composio runtime only needs one browser project.");
  });

  test("setup-only connector is ready to connect and only opens a trusted Composio redirect", async ({ page }) => {
    const runtime = await mockRuntime(page, {
      connections: [
        {
          integrationId: "googledocs",
          toolkit: "googledocs",
          connectionStatus: "needs_oauth",
          connected: false,
        },
      ],
      connectRedirectUrl: "https://connect.composio.dev/link/google-docs?session=test",
    });
    await signInTeacher(page);

    const docsCard = connectorCard(page, "Google Docs");
    await expect(docsCard.getByText("Ready to connect", { exact: true })).toBeVisible();
    await expect(docsCard.getByRole("button", { name: /set up google docs/i })).toBeVisible();
    await page.getByRole("button", { name: /refresh connections/i }).click();
    await expect.poll(() => runtime.connectionRequestCount).toBe(2);

    await docsCard.getByRole("button", { name: /set up google docs/i }).click();
    const flow = page.getByTestId("integration-flow");
    await Promise.all([
      page.waitForURL("https://connect.composio.dev/**"),
      flow.getByRole("button", { name: /connect google docs/i }).click(),
    ]);
    expect(runtime.connectRequests).toEqual([{ integrationId: "googledocs" }]);
  });

  test("connected connector browses bounded teacher-owned records with an explicit reference", async ({ page }) => {
    const runtime = await mockRuntime(page, {
      connections: [
        {
          integrationId: "googledocs",
          toolkit: "googledocs",
          connectionStatus: "ACTIVE",
          connected: true,
          updatedAt: "2026-07-29T12:30:00.000Z",
        },
      ],
    });
    await signInTeacher(page);

    const docsCard = connectorCard(page, "Google Docs");
    await expect(docsCard.getByText("Connected", { exact: true })).toBeVisible();
    await docsCard.getByRole("button", { name: /browse google docs/i }).click();
    const flow = page.getByTestId("integration-flow");
    await flow.getByLabel(/Google Docs document ID or URL/i).fill("https://docs.google.com/document/d/doc-123/edit");
    await flow.getByRole("button", { name: /load google docs sources/i }).click();

    await expect(flow.getByRole("radio", { name: /Period 4 review notes/i })).toBeVisible();
    expect(runtime.recordRequests).toEqual([
      {
        integrationId: "googledocs",
        query: "https://docs.google.com/document/d/doc-123/edit",
      },
    ]);
  });

  test("structured import changes no New Session field until the teacher explicitly applies it", async ({ page }) => {
    const runtime = await mockRuntime(page, {
      connections: [
        {
          integrationId: "googledocs",
          toolkit: "googledocs",
          connectionStatus: "ACTIVE",
          connected: true,
        },
      ],
    });
    await signInTeacher(page);

    const docsCard = connectorCard(page, "Google Docs");
    await docsCard.getByRole("button", { name: /set up google docs|browse google docs/i }).click();
    const flow = page.getByTestId("integration-flow");
    await expect(flow).toBeVisible();
    await flow.getByLabel(/Google Docs document ID or URL/i).fill(
      "https://docs.google.com/document/d/doc-123/edit",
    );
    await flow.getByRole("button", { name: /load google docs sources/i }).click();
    await flow.getByRole("radio", { name: /Period 4 review notes/i }).check();
    await flow.getByRole("button", { name: /review selected source/i }).click();

    const review = page.getByTestId("integration-import-review");
    await expect(review).toContainText("Teacher-owned normalized document notes");
    expect(runtime.recordRequests).toEqual([
      {
        integrationId: "googledocs",
        query: "https://docs.google.com/document/d/doc-123/edit",
      },
    ]);
    expect(runtime.importPreviewRequests).toEqual([
      {
        integrationId: "googledocs",
        query: "https://docs.google.com/document/d/doc-123/edit",
        selectionKey: "clsi1.test-selection-token",
      },
    ]);

    await review.getByRole("button", { name: /continue to new session/i }).click();
    const pendingImport = page.getByRole("region", { name: /Google Docs import ready/i });
    await expect(pendingImport).toBeVisible();
    await expect(page.getByLabel("Session title")).toHaveValue("");
    await expect(page.getByLabel("Meeting notes")).toHaveValue("");

    await pendingImport.getByRole("button", { name: /apply selected fields/i }).click();
    await expect(page.getByLabel("Session title")).toHaveValue("Period 4 review notes");
    await expect(page.getByLabel("Meeting notes")).toHaveValue(
      /Teacher-owned normalized document notes/,
    );
    await expect(page.getByTestId("integration-import-receipt")).toContainText(
      /nothing was posted back/i,
    );
  });

  test("untrusted redirects are rejected without leaving ClassLoop", async ({ page }) => {
    const runtime = await mockRuntime(page, {
      connectRedirectUrl: "https://connect.composio.dev.evil.example/link/google-docs",
    });
    await signInTeacher(page);

    const classLoopUrl = page.url();
    const docsCard = connectorCard(page, "Google Docs");
    await docsCard.getByRole("button", { name: /set up google docs/i }).click();
    await page.getByTestId("integration-flow").getByRole("button", { name: /connect google docs/i }).click();

    await expect(docsCard).toContainText(/rejected an untrusted Composio redirect/i);
    await expect(page).toHaveURL(classLoopUrl);
    expect(runtime.connectRequests).toEqual([{ integrationId: "googledocs" }]);
  });

  test("rapid repeated actions create only one connect and one source request", async ({ page }) => {
    const runtime = await mockRuntime(page, {
      connectConnected: true,
      actionDelayMs: 100,
    });
    await signInTeacher(page);

    const docsCard = connectorCard(page, "Google Docs");
    await docsCard.getByRole("button", { name: /set up google docs/i }).click();
    const flow = page.getByTestId("integration-flow");
    const connectButton = flow.getByRole("button", { name: /connect google docs/i });
    await connectButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(docsCard.getByText("Connected", { exact: true })).toBeVisible();
    expect(runtime.connectRequests).toEqual([{ integrationId: "googledocs" }]);

    await flow.getByLabel(/Google Docs document ID or URL/i).fill("doc-1234567890");
    const loadButton = flow.getByRole("button", { name: /load google docs sources/i });
    await loadButton.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect(flow.getByRole("radio", { name: /Period 4 review notes/i })).toBeVisible();
    expect(runtime.recordRequests).toEqual([
      { integrationId: "googledocs", query: "doc-1234567890" },
    ]);
  });

  test("runtime offers reviewed read-only imports without Gmail or unsafe external actions", async ({ page }) => {
    await mockRuntime(page, {
      connections: [
        {
          integrationId: "outlook",
          toolkit: "outlook",
          connectionStatus: "ACTIVE",
          connected: true,
        },
      ],
    });
    await signInTeacher(page);

    const outlookCard = connectorCard(page, "Outlook");
    await expect(outlookCard.getByText("Connected", { exact: true })).toBeVisible();
    await expect(outlookCard.getByRole("button", { name: /browse outlook/i })).toBeVisible();
    await expect(page.getByText(/gmail/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /\b(send|post|delete|gmail)\b/i })).toHaveCount(0);
    await expect(outlookCard).not.toContainText(/create (?:an? )?(?:email )?draft|send messages|post records|delete records/i);

    await page.getByRole("button", { name: /^New session$/i }).first().click();
    const manualTranscript = page.getByLabel(/Paste transcript text/i);
    await expect(manualTranscript).toBeVisible();
    await manualTranscript.fill("[00:00:01] Teacher: Review the worksheet before Friday.");
    const postTranscriptPanel = page.getByLabel(/Post-transcript integrations/i);
    await expect(postTranscriptPanel).toBeVisible();
    await expect(postTranscriptPanel).not.toContainText(/\b(gmail|send|post|delete)\b/i);
    const emailReminder = postTranscriptPanel.getByRole("button", { name: /email reminder/i });
    await expect(emailReminder).toBeVisible();
    await expect(emailReminder).toContainText(/configured email sender/i);
  });
});
