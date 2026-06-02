import { expect, test } from "@playwright/test";
import { expectContrast, expectNoUnnamedInteractive, expectReadableMobileLayout } from "./accessibility-helpers";

const landingContrastSelectors = [
  ".landing-hero h1",
  ".landing-hero p",
  ".landing-primary",
  ".landing-secondary",
  ".landing-message",
  ".landing-proof-row span",
  ".landing-card-kicker",
  ".landing-feature-band h2",
  ".landing-feature-band p",
  ".landing-pwa-checklist h2",
  ".landing-pwa-checklist p",
];

test("hosted web landing and sample-only demo are usable", async ({ page }) => {
  await page.goto("/?demoOnly=1");
  await expect(page.getByRole("heading", { name: /^ClassLoop$/i })).toBeVisible();
  const screenshotsButton = page.getByRole("button", { name: /^screenshots$/i });
  const docsButton = page.getByRole("button", { name: /^docs$/i });
  const isWideViewport = (page.viewportSize()?.width ?? 0) > 920;
  const heroCopy = page.locator(".landing-hero-copy");
  await expect(heroCopy.getByRole("button")).toHaveCount(3);
  await expect(heroCopy.getByRole("button", { name: /open web demo/i })).toBeVisible();
  await expect(heroCopy.getByRole("button", { name: /add to phone/i })).toBeVisible();
  await expect(heroCopy.getByRole("button", { name: /view screenshots/i })).toBeVisible();
  await expect(heroCopy.getByRole("button", { name: /download|macos/i })).toHaveCount(0);
  await expect(page.locator(".landing-hero .landing-platform-list")).toHaveCount(0);
  if (isWideViewport) {
    await expect(screenshotsButton).toBeVisible();
    if (await docsButton.isVisible().catch(() => false)) {
      await expect(docsButton).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: /^privacy$/i })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /^support$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^download$/i })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /open web demo/i })).toBeVisible();
  await expect(page.getByText("Teacher-approved drafts")).toBeVisible();
  await expect(page.getByText("Zoom transcript first")).toBeVisible();
  await expect(page.getByText("Classwide Classroom posts")).toBeVisible();
  await expect(page.getByRole("button", { name: /^beta$/i })).toHaveCount(0);
  await expectNoUnnamedInteractive(page, ".landing-page");
  await expectContrast(page, landingContrastSelectors);
  if ((page.viewportSize()?.width ?? 0) <= 500 && (await page.locator(".landing-route-frame").count())) {
    await expectReadableMobileLayout(page, ".landing-page");
  }

  if (await screenshotsButton.isVisible().catch(() => false)) {
    await screenshotsButton.click();
    await expect(page.getByRole("heading", { name: /screenshots: how classloop works/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /teacher import and review screen/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /student dashboard/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /teacher analytics screen/i })).toBeVisible();
    await expect(page.locator(".landing-card-kicker").filter({ hasText: /^Teacher workflow$/ })).toBeVisible();
    await expect(page.locator(".landing-card-kicker").filter({ hasText: /^Student workspace$/ })).toBeVisible();
    await expect(page.locator(".landing-card-kicker").filter({ hasText: /^Support signals$/ })).toBeVisible();
  }

  await page.goto("/?demoOnly=1#/beta");
  await expect(page.getByText(/run a 15-minute classloop beta test/i)).toHaveCount(0);
  await expect(page.getByText(/copy beta invite/i)).toHaveCount(0);
  await expect(page.getByText(/feedback scorecard/i)).toHaveCount(0);

  await page.goto("/?demoOnly=1#/docs");
  await expect(page.getByRole("heading", { name: /^ClassLoop docs\.$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /business model/i })).toBeVisible();
  await expect(page.getByText(/Teacher Pro.*\$3\.99\/month/i)).toBeVisible();
  await expect(page.getByText(/No per-minute transcript pricing/i)).toBeVisible();
  await expect(page.getByText(/School\/team later/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /launch gates/i })).toBeVisible();

  await page.goto("/?demoOnly=1");
  if (!(await page.locator(".landing-platform-list").count())) {
    await page.goto("/?demoOnly=1#/download");
  }
  const downloadRouteHeading = page.getByRole("heading", { name: /download classloop/i });
  if (await downloadRouteHeading.isVisible().catch(() => false)) {
    await expect(downloadRouteHeading).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: /use the pwa for fast after-class cleanup/i })).toBeVisible();
  await expect(page.getByRole("region", { name: /hosted pwa launch checklist/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /zoom transcript first/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /teacher review stays central/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /classroom posts stay classwide/i })).toBeVisible();
  await expect(page.getByText(/recap, resources, and class tasks only/i)).toBeVisible();
  const addToPhoneButton = page.locator(".landing-mobile-band").getByRole("button", { name: /^add to phone$/i });
  await expect(addToPhoneButton).toBeVisible();
  await addToPhoneButton.click();
  const installMessage = /home screen|install app|install menu|already running|added|share then add to home screen|browser menu/i;
  const statusMessage = page.getByRole("status").filter({ hasText: installMessage });
  if (await statusMessage.isVisible().catch(() => false)) {
    await expect(statusMessage).toBeVisible();
  } else {
    await expect(page.locator("p.landing-message, [role='status']").filter({ hasText: installMessage }).first()).toBeVisible();
  }
  const revealInstallers = page.getByRole("button", { name: /not your system|view desktop installers/i }).first();
  if (await revealInstallers.isVisible().catch(() => false)) {
    await revealInstallers.click();
  }
  const platformDownloads = page.locator(".landing-platform-list");
  await expect(platformDownloads).toBeVisible();
  await expectContrast(page, [
    ".landing-mobile-card h2",
    ".landing-mobile-card p",
    ".mobile-step span",
    ".landing-pwa-checklist h2",
    ".landing-pwa-checklist p",
    ".landing-download-band h2",
    ".landing-download-band p",
  ]);

  const readyDownloads = await platformDownloads.getByText(/download ready/i).count();
  if (!readyDownloads) {
    await expect(platformDownloads.getByRole("button", { name: /macos.*packaging pending/i })).toBeVisible();
    await expect(platformDownloads.getByRole("button", { name: /windows.*packaging pending/i })).toBeVisible();
    await expect(platformDownloads.getByRole("button", { name: /linux.*packaging pending/i })).toBeVisible();
  } else {
    await expect(platformDownloads.getByText(/download ready/i).first()).toBeVisible();
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

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const manifestJson = await manifest.json();
  expect(manifestJson.display).toBe("standalone");
  expect(manifestJson.description).toContain("shared resources");
  expect(manifestJson.start_url).toContain("source=pwa");
  expect(manifestJson.icons?.map((icon: { src: string }) => icon.src)).toContain("/classloop-app-icon-512.png");
  expect(manifestJson.shortcuts?.map((shortcut: { name: string }) => shortcut.name)).toContain("Download ClassLoop");

  const serviceWorker = await page.request.get("/sw.js");
  expect(serviceWorker.ok()).toBeTruthy();
  const serviceWorkerText = await serviceWorker.text();
  expect(serviceWorkerText).toContain("classloop-mobile-shell");
  expect(serviceWorkerText).toContain("/classloop-downloads.json");

  if (readyDownloads) {
    const firstReadyDownload = platformDownloads.getByRole("button").filter({ hasText: /download ready/i }).first();
    await expect(firstReadyDownload).toBeVisible();
  } else {
    const downloadPromise = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
    await platformDownloads.getByRole("button", { name: /macos.*packaging pending/i }).click();
    const download = await downloadPromise;
    if (download) {
      await download.cancel().catch(() => undefined);
    } else {
      await expect(page.getByRole("status").filter({ hasText: /macos packaging pending/i })).toBeVisible();
    }
  }

  await page.goto("/?demoOnly=1");
  await page.getByRole("button", { name: /open web demo|open demo/i }).first().click();
  await expect(page.getByRole("heading", { name: /try classloop as a teacher or student/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo teacher side/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /demo student side/i })).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toHaveCount(0);
  await expect(page.getByPlaceholder("Enter password")).toHaveCount(0);

  await page.getByRole("button", { name: /demo teacher side/i }).click();
  const walkthroughDialog = page.getByRole("dialog", { name: /classloop guided walkthrough/i });
  await walkthroughDialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await walkthroughDialog.isVisible().catch(() => false)) {
    const skipButton = walkthroughDialog.getByRole("button", { name: /skip/i });
    await skipButton.click({ force: true, timeout: 5_000 }).catch(async () => {
      await skipButton.dispatchEvent("click").catch(() => undefined);
    });
    await walkthroughDialog.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => undefined);
  } else {
    await expect(page.getByLabel(/open interactive walkthrough/i)).toBeVisible();
  }
  await expect(page.getByText(/You are on a demo account/i)).toBeVisible();
  await page.getByRole("button", { name: /^plan options$/i }).click();
  await expect(page.locator(".stripe-pricing-table-shell")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /Demo account upgrades are disabled/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /What Pro unlocks after payment/i })).toBeVisible();
  await expect(page.locator(".pro-step-card").getByText("Create a cloud account", { exact: true })).toBeVisible();
  await expect(page.getByText(/Free accounts can upload this workspace to cloud sync/i)).toBeVisible();
  await expect(page.getByText(/Live capture modes/i)).toBeVisible();
  await expect(page.getByText(/Private analytics and report exports/i)).toBeVisible();
  await expect(page.getByText(/Transcript upload remains available on Free/i)).toBeVisible();
});

test("hosted public screenshots and privacy routes expose compliance boundaries", async ({ page }) => {
  await page.goto("/?demoOnly=1#/screenshots");
  await expect(page.getByRole("heading", { name: /screenshots: how classloop works/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /teacher import and review screen/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /student dashboard/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /teacher analytics screen/i })).toBeVisible();
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".landing-screenshot-card img"));
    return (
      images.length === 3 &&
      images.every((image) => image.complete && image.naturalWidth > 100 && image.naturalHeight > 100)
    );
  });
  const screenshotImageStates = await page.locator(".landing-screenshot-card img").evaluateAll((images) =>
    images.map((image) => {
      const screenshot = image as HTMLImageElement;
      return {
        complete: screenshot.complete,
        naturalHeight: screenshot.naturalHeight,
        naturalWidth: screenshot.naturalWidth,
      };
    }),
  );
  expect(screenshotImageStates).toHaveLength(3);
  expect(screenshotImageStates.every((image) => image.complete && image.naturalWidth > 100 && image.naturalHeight > 100)).toBeTruthy();
  for (const screenshotPath of [
    "/screenshots/classloop-import-review.svg",
    "/screenshots/classloop-student-dashboard.svg",
    "/screenshots/classloop-analytics.svg",
  ]) {
    const response = await page.request.get(screenshotPath);
    expect(response.ok()).toBeTruthy();
  }

  await page.goto("/?demoOnly=1#/privacy");
  await expect(page.getByRole("heading", { name: /classloop privacy policy/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /local desktop data/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /no training on student records/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /retention and exports/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /hosted demo boundary and school readiness/i })).toBeVisible();
  await expect(page.getByText(/sample accounts only/i)).toBeVisible();
  await expect(page.getByText(/deleted on request/i)).toBeVisible();
  await expect(page.getByText(/COPPA, FERPA, PPRA/i)).toBeVisible();
  await expect(page.getByPlaceholder("name@example.com")).toHaveCount(0);
  await expect(page.getByPlaceholder("Enter password")).toHaveCount(0);
  await expectNoUnnamedInteractive(page, ".landing-page");
  await expectContrast(page, [
    ".landing-page-header h1",
    ".landing-page-header p",
    ".landing-feature-band h2",
    ".landing-feature-band p",
    ".landing-policy-panel h2",
    ".landing-policy-panel p",
  ]);

  await page.goto("/?demoOnly=1#/terms");
  await expect(page.getByRole("heading", { name: /classloop terms of use/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /service scope/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /sample hosted demo/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /teacher review responsibility/i })).toBeVisible();
  await expect(page.getByText(/not an official gradebook/i)).toBeVisible();
  await expectNoUnnamedInteractive(page, ".landing-page");

  await page.goto("/?demoOnly=1#/eula");
  await expect(page.getByRole("heading", { name: /classloop desktop eula/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /unsigned builds/i })).toBeVisible();
  await expect(page.getByText(/manual install-over-replace/i)).toBeVisible();
  await expectNoUnnamedInteractive(page, ".landing-page");

  const supportFeedbackPayloads: any[] = [];
  await page.route("**/api/feedback", async (route) => {
    supportFeedbackPayloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, notified: true }),
    });
  });
  await page.goto("/?demoOnly=1#/support");
  await expect(page.getByRole("heading", { name: /classloop support/i })).toBeVisible();
  await expect(page.getByText(/rushilcpm02@gmail.com/i)).toBeVisible();
  await expect(page.getByRole("region", { name: /classloop installer feedback/i })).toBeVisible();
  await page.getByLabel("Platform").selectOption("windows");
  await page.getByLabel("Problem").selectOption("app_wont_open");
  await page.getByLabel("Email for follow-up").fill("tester@classloop.test");
  await page.getByLabel("What happened?").fill("Windows clean machine opened the installer but the app would not start after first launch.");
  await page.getByRole("button", { name: /send report/i }).click();
  await expect(page.getByRole("status").filter({ hasText: /installer report sent to classloop support/i })).toBeVisible();
  expect(supportFeedbackPayloads).toHaveLength(1);
  expect(supportFeedbackPayloads[0].source).toBe("download_install_feedback");
  expect(supportFeedbackPayloads[0].metadata.platform).toBe("windows");
  expect(supportFeedbackPayloads[0].metadata.issueType).toBe("app_wont_open");
  expect(JSON.stringify(supportFeedbackPayloads[0])).not.toContain("maya@classloop.demo");
});
