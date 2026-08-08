import { expect, test, type Page } from "@playwright/test";

async function openSignInForm(page: Page) {
  const heading = page.getByText(/Sign in to ClassLoop/i);
  if (await heading.isVisible().catch(() => false)) return;
  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const button = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await button.isVisible().catch(() => false)) await button.click();
  else await page.locator(".auth-mode-link").click();
}

async function signInTeacher(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.goto("/#/dashboard");
  await openSignInForm(page);
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await page.getByPlaceholder("name@example.com").fill("teacher@classloop.demo");
  await page.getByPlaceholder("Enter password").fill("classloop-teacher");
  await page.locator("form.login-form button[type='submit']").click();
  const walkthrough = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await walkthrough.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await walkthrough.isVisible().catch(() => false)) {
    await walkthrough.getByRole("button", { name: /skip/i }).click({ force: true });
  }
}

test("teacher searches verified free APIs and explicitly adds a resource", async ({ page }) => {
  let capturedQuery = "";
  await page.route("**/api/free-resources?**", async (route) => {
    capturedQuery = new URL(route.request().url()).searchParams.get("q") ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: capturedQuery,
        cached: false,
        results: [
          {
            id: "wikipedia:24544",
            title: "Photosynthesis",
            url: "https://en.wikipedia.org/wiki/Photosynthesis",
            description: "Biological process to convert light into chemical energy",
            source: "Wikipedia",
            kind: "article",
          },
          {
            id: "spoofed:1",
            title: "Spoofed provider result",
            url: "https://en.wikipedia.org.attacker.test/Photosynthesis",
            description: "Must not reach the teacher review list.",
            source: "Wikipedia",
            kind: "article",
          },
        ],
        warnings: [],
      }),
    });
  });

  await signInTeacher(page);
  await page.getByRole("button", { name: /new session/i }).first().click();
  await page.getByRole("button", { name: /use geometry sample/i }).click();
  await page.getByRole("button", { name: /generate draft/i }).click();
  await expect(page.getByText(/edit the draft before publishing/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: /follow-up/i }).click();

  await expect(
    page.getByText(/never sends the transcript, roster, notes, or student details/i),
  ).toBeVisible();
  await page.getByLabel(/search free learning resources/i).fill("photosynthesis");
  await page.getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByRole("heading", { name: "Photosynthesis" })).toBeVisible();
  await expect(page.getByText("Spoofed provider result")).toHaveCount(0);
  expect(capturedQuery).toBe("photosynthesis");

  await page.getByRole("button", { name: /add photosynthesis/i }).click();
  await expect(page.locator('input[value="https://en.wikipedia.org/wiki/Photosynthesis"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /added photosynthesis/i })).toBeDisabled();
});
