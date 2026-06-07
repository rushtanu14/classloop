const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");

const protectedHandlers = [
  { rel: "api/cloud-state.js", method: "GET", label: "cloud sync read" },
  { rel: "api/profile.js", method: "GET", label: "profile/auth read" },
  { rel: "api/billing/checkout.js", method: "POST", label: "billing checkout" },
  { rel: "api/billing/portal.js", method: "POST", label: "billing portal" },
];

const syntaxFiles = [
  "api/_shared.js",
  "api/validators.js",
  "api/config.js",
  "api/cloud-state.js",
  "api/feedback.js",
  "api/profile.js",
  "api/billing/checkout.js",
  "api/billing/portal.js",
  "api/billing/webhook.js",
  "api/billing/entitlements.js",
];

function fail(message) {
  throw new Error(message);
}

function runCommand(label, command, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_PRO_PRICE_ID: "",
      STRIPE_WEBHOOK_SECRET: "",
    },
  });
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status}.`);
  console.log(`PASS ${label}`);
}

function mockRequest({ method = "GET", headers = {}, body } = {}) {
  return {
    method,
    headers: {
      host: "classloop-drill.local",
      "x-forwarded-proto": "https",
      ...headers,
    },
    body,
    async *[Symbol.asyncIterator]() {
      if (body === undefined || body === null) return;
      yield Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    },
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    end(payload = "") {
      this.body = String(payload);
      return this;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

async function importModule(relPath) {
  const url = pathToFileURL(path.join(rootDir, relPath));
  url.search = `?drill=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return import(url.href);
}

async function callHandler(relPath, requestOptions) {
  const module = await importModule(relPath);
  const handler = module.default;
  if (typeof handler !== "function") fail(`${relPath} does not export a default handler.`);
  const response = mockResponse();
  await handler(mockRequest(requestOptions), response);
  return response;
}

function verifySyntax() {
  for (const relPath of syntaxFiles) {
    runCommand(`syntax check ${relPath}`, process.execPath, ["--check", relPath]);
  }
}

async function verifyApiFailClosed() {
  for (const handler of protectedHandlers) {
    const response = await callHandler(handler.rel, {
      method: handler.method,
      body: handler.body,
    });
    const payload = response.json();
    if (response.statusCode !== 401) {
      fail(`${handler.label} should fail closed with 401 when auth is unavailable; got ${response.statusCode}.`);
    }
    if (!/(sign in with supabase|sign in before using cloud sync)/i.test(payload.error || "")) {
      fail(`${handler.label} returned unclear outage/auth copy: ${JSON.stringify(payload)}`);
    }
    console.log(`PASS ${handler.label} fails closed with clear auth message`);
  }

  const feedbackResponse = await callHandler("api/feedback.js", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { rating: 5, note: "drill", role: "student", source: "incident_drill", transcript: "Drill transcript" },
  });
  const feedbackPayload = feedbackResponse.json();
  if (feedbackResponse.statusCode !== 503) {
    fail(`product feedback write should fail closed with 503 when hosted credentials are unavailable; got ${feedbackResponse.statusCode}.`);
  }
  if (!/(feedback storage is not configured|support intake is temporarily unavailable)/i.test(feedbackPayload.error || "")) {
    fail(`product feedback outage copy should explain missing hosted credentials: ${JSON.stringify(feedbackPayload)}`);
  }
  console.log("PASS product feedback write fails closed when hosted credentials are missing");

  const configResponse = await callHandler("api/config.js", { method: "GET" });
  const config = configResponse.json();
  if (configResponse.statusCode !== 200) fail(`/api/config should remain readable during credential outages.`);
  if (config.supabaseConfigured !== false || config.stripeConfigured !== false) {
    fail(`/api/config should report missing Supabase/Stripe credentials during outage drill: ${JSON.stringify(config)}`);
  }
  console.log("PASS public config reports missing hosted credentials without crashing");

  const webhookGet = await callHandler("api/billing/webhook.js", { method: "GET" });
  if (webhookGet.statusCode !== 405) fail(`Stripe webhook GET should be rejected with 405, got ${webhookGet.statusCode}.`);
  console.log("PASS Stripe webhook rejects unsupported methods");

  const webhookPost = await callHandler("api/billing/webhook.js", {
    method: "POST",
    headers: { "stripe-signature": "test-signature" },
    body: Buffer.from("{}"),
  });
  const webhookPayload = webhookPost.json();
  if (webhookPost.statusCode !== 503 || !/(hosted service is not configured|hosted service is not available right now)/i.test(webhookPayload.error || "")) {
    fail(`Stripe webhook should explain missing credentials during billing outage drill: ${JSON.stringify(webhookPayload)}`);
  }
  console.log("PASS Stripe webhook surfaces billing outage clearly");
}

function verifySupabaseSchema() {
  const schema = fs.readFileSync(path.join(rootDir, "supabase", "schema.sql"), "utf8");
  const checks = [
    ["profiles table", /create table if not exists public\.classloop_profiles/i],
    ["workspace state table", /create table if not exists public\.classloop_workspace_state/i],
    ["pilot feedback table", /create table if not exists public\.classloop_pilot_feedback/i],
    ["transcript-attached feedback column", /classloop_pilot_feedback add column if not exists transcript text not null default ''/i],
    ["profile RLS", /alter table public\.classloop_profiles enable row level security/i],
    ["workspace RLS", /alter table public\.classloop_workspace_state enable row level security/i],
    ["feedback RLS", /alter table public\.classloop_pilot_feedback enable row level security/i],
    ["own-profile policy", /profiles_select_own/i],
    ["own-workspace policy", /workspace_state_select_own/i],
    ["own-feedback policy", /feedback_insert_own/i],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(schema)) fail(`Supabase schema is missing ${label}.`);
    console.log(`PASS Supabase schema includes ${label}`);
  }
}

function verifyRunbookCoverage() {
  const checks = [
    ["incident auth outage runbook", "ops/incident-response.md", /Auth Outage/i],
    ["incident sync outage runbook", "ops/incident-response.md", /Sync Outage/i],
    ["incident billing outage runbook", "ops/incident-response.md", /Billing Outage/i],
    ["incident parser regression runbook", "ops/incident-response.md", /Parser Regression/i],
    ["rollback packaging-pending fallback", "ops/rollback-drill.md", /Packaging pending/i],
    ["rollback clean-host first-run step", "ops/rollback-drill.md", /test:desktop:first-run/i],
    ["manual QA checklist script", "scripts/manual-qa-checklist.cjs", /Correctness errors found/i],
    ["manual QA operator modes", "scripts/manual-qa-checklist.cjs", /Computer Use/i],
    ["legal baseline", "LEGAL.md", /not legal advice/i],
    ["legal school-safety baseline", "LEGAL.md", /COPPA/i],
    ["legal education-records baseline", "LEGAL.md", /FERPA/i],
    ["testing response format", "TESTING.md", /correctness errors/i],
  ];
  for (const [label, relPath, pattern] of checks) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) fail(`${label} is missing ${relPath}.`);
    const text = fs.readFileSync(fullPath, "utf8");
    if (!pattern.test(text)) fail(`${label} is missing required coverage.`);
    console.log(`PASS ${label}`);
  }
}

async function main() {
  verifySyntax();
  verifySupabaseSchema();
  verifyRunbookCoverage();
  await verifyApiFailClosed();

  runCommand("cloud auth/sync outage regression tests", "npm", ["run", "test:cloud"]);
  runCommand("billing entitlement regression tests", "npm", ["run", "test:entitlements"]);
  runCommand("parser regression tests", "npm", ["run", "test:import"]);

  console.log("\nIncident drill passed:");
  console.log("- Auth outage: protected APIs fail closed with clear sign-in guidance.");
  console.log("- Sync outage: cloud auth states, conflict handling, and offline queue behavior passed.");
  console.log("- Billing outage: checkout/portal require auth, webhook rejects bad/missing configuration, entitlement mapping passed.");
  console.log("- Parser regression: realistic import regression suite passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
