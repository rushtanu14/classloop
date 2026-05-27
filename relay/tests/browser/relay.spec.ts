import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("Relay keeps the personal meeting flow working", async ({ page }) => {
  await expect(page).toHaveTitle(/Relay/);
  await expect(page.getByRole("link", { name: "Relay home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Paste minutes/ })).toBeVisible();
  await expect(page.getByText(/classroom|teacher|student/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Use sample" }).click();
  await expect(page.getByText("Sample meeting loaded.")).toBeVisible();
  await page.getByRole("button", { name: "Generate draft" }).click();

  await expect(page.getByRole("heading", { name: "Hackathon planning sync" })).toBeVisible();
  await expect(page.getByText("Draft generated.")).toBeVisible();
  await expect(page.getByLabel(/Status for .*demo script/i).first()).toBeVisible();
  await expect(page.locator(".info-panel li", { hasText: "https://docs.google.com/document/d/sample-relay-pitch" })).toBeVisible();

  const firstStatus = page.getByLabel(/Status for .*demo script/i).first();
  await firstStatus.selectOption("complete");
  await expect(firstStatus).toHaveValue("complete");

  const firstDueDate = page.getByLabel(/Due date for .*demo script/i).first();
  await firstDueDate.fill("Friday, 6 PM");
  await expect(firstDueDate).toHaveValue("Friday, 6 PM");

  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.locator('input[value="New follow-up task"]')).toBeVisible();
  await page.getByRole("button", { name: "Remove New follow-up task" }).click();
  await expect(page.locator('input[value="New follow-up task"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Copy recap" }).click();
  await expect(page.getByText("Recap copied.")).toBeVisible();

  await page.getByRole("button", { name: "Copy template" }).click();
  await expect(page.getByText("Template copied.")).toBeVisible();

  await page.getByRole("button", { name: "Download draft JSON" }).click();
  await expect(page.getByText("Draft exported.")).toBeVisible();
});

test("Relay works on a phone-sized viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Use sample" }).click();
  await page.getByRole("button", { name: "Generate draft" }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Meeting minutes" })).toBeVisible();
});
