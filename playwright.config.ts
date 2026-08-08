import { defineConfig, devices } from "@playwright/test";

const testHost = process.env.CLASSLOOP_PLAYWRIGHT_HOST || "127.0.0.1";
const testPort = Number(process.env.CLASSLOOP_PLAYWRIGHT_PORT || 5177);
const baseURL = `http://${testHost}:${testPort}`;
const reuseExistingServer = process.env.CLASSLOOP_REUSE_PLAYWRIGHT_SERVER === "1";
const browserTestEnv =
  "VITE_SUPABASE_URL=https://classloop-playwright.supabase.co " +
  "VITE_SUPABASE_ANON_KEY=classloop-playwright-anon-key " +
  "VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=1 " +
  "VITE_STRIPE_PAYMENT_LINK_URL=https://buy.stripe.com/7sY28qeT16Mh5wi0ZbeME00";

export default defineConfig({
  testDir: "./tests/browser",
  testIgnore: ["**/classloop-web.spec.ts", "**/composio-runtime.spec.ts"],
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: reuseExistingServer
    ? undefined
    : {
        command: `env -u FORCE_COLOR -u NO_COLOR ${browserTestEnv} npm run dev -- --host ${testHost} --port ${testPort} --strictPort`,
        url: baseURL,
        timeout: 60_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
