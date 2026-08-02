import { defineConfig, devices } from "@playwright/test";

const testHost = process.env.CLASSLOOP_PLAYWRIGHT_HOST || "127.0.0.1";
const testPort = Number(process.env.CLASSLOOP_PLAYWRIGHT_PORT || 5177);
const baseURL = `http://${testHost}:${testPort}`;
const browserTestEnv =
  "VITE_CLASSLOOP_INTERNAL_INTEGRATION_UI=1 " +
  "VITE_SUPABASE_URL=https://classloop-playwright.supabase.co " +
  "VITE_SUPABASE_ANON_KEY=classloop-playwright-anon-key " +
  "VITE_STRIPE_PAYMENT_LINK_URL=https://buy.stripe.com/7sY28qeT16Mh5wi0ZbeME00";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["**/composio-runtime.spec.ts"],
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `env -u FORCE_COLOR -u NO_COLOR ${browserTestEnv} npm run dev -- --host ${testHost} --port ${testPort} --strictPort`,
    url: baseURL,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
