const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function isIgnored(filePath) {
  return spawnSync("git", ["check-ignore", "-q", filePath], { cwd: rootDir }).status === 0;
}

function trackedFiles() {
  return runGit(["ls-files", "-z"]).split("\0").filter(Boolean);
}

function readText(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), "utf8");
}

function trackedTextFiles(files) {
  const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".dmg", ".exe", ".zip", ".AppImage", ".deb"]);
  return files.filter((relPath) => {
    if (binaryExtensions.has(path.extname(relPath))) return false;
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size > 2_000_000) return false;
    return true;
  });
}

function verifyIgnoredLocalFiles(files) {
  files.forEach((filePath) => {
    if (runGit(["ls-files", filePath]).trim()) {
      fail(`${filePath} is tracked. Remove it from git and keep it local-only.`);
    }
    if (!isIgnored(filePath)) {
      fail(`${filePath} is not ignored by git.`);
    }
  });
}

function verifyNoHighConfidenceSecrets(files) {
  const patterns = [
    { name: "Stripe secret key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
    { name: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/ },
    { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: "GitHub token", pattern: /\bgh[opsu]_[A-Za-z0-9_]{30,}\b/ },
    { name: "OpenAI API key", pattern: /\bsk-proj-[A-Za-z0-9_-]{20,}\b|\bsk-[A-Za-z0-9]{32,}\b/ },
    {
      name: "non-empty server secret env assignment",
      pattern:
        /^(?:SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|CLASSLOOP_GMAIL_APP_PASSWORD|CLASSLOOP_SMTP_PASS)[^\S\r\n]*=[^\S\r\n]*(?!(?:replace-me|your-16-character-app-password)?[^\S\r\n]*$)[^\r\n]+/im,
    },
  ];

  const findings = [];
  files.forEach((relPath) => {
    const text = readText(relPath);
    patterns.forEach(({ name, pattern }) => {
      if (pattern.test(text)) findings.push(`${relPath}: ${name}`);
    });
  });

  if (findings.length) {
    fail(`High-confidence secret patterns found in tracked files:\n${findings.join("\n")}`);
  }
}

function verifyLocalStorageSecurity() {
  const appSource = readText("src/App.tsx");
  const cloudSource = readText("src/cloud.ts");

  const secureBlock = appSource.match(/const secureLocalKeys = \{([\s\S]*?)\};/);
  if (!secureBlock) fail("secureLocalKeys block was not found.");
  const insecureSecureKeys = Array.from(secureBlock[1].matchAll(/"([^"]+)"/g))
    .map((match) => match[1])
    .filter((key) => !key.startsWith("classloop:secure:"));
  if (insecureSecureKeys.length) {
    fail(`secureLocalKeys contains non-secure keys: ${insecureSecureKeys.join(", ")}`);
  }

  const requiredStorageControls = [
    ["AES-GCM browser fallback encryption", /crypto\.subtle\.encrypt\(\{ name: "AES-GCM"/],
    ["legacy plaintext migration removal", /localStorage\.removeItem\(legacyKey\)/],
    ["demo sessions filtered from persistence", /sessions: state\.sessions\.filter\(\(session\) => !isDemoOwnedSession\(session\)\)/],
    ["offline queue is ClassLoop-namespaced", /const offlineQueueKey = "classloop:cloud-offline-queue:v1"/],
  ];
  requiredStorageControls.forEach(([label, pattern]) => {
    if (!pattern.test(label === "offline queue is ClassLoop-namespaced" ? cloudSource : appSource)) {
      fail(`Missing storage control: ${label}`);
    }
  });
}

function verifyDesktopAndHostedSecurity() {
  const appSource = readText("src/App.tsx");
  const desktop = readText("desktop/main.cjs");
  const shared = readText("api/_shared.js");
  const validators = readText("api/validators.js");
  const config = readText("api/config.js");
  const profile = readText("api/profile.js");
  const cloudState = readText("api/cloud-state.js");
  const emailRecaps = readText("api/email/send-recaps.js");
  const feedback = readText("api/feedback.js");
  const checkout = readText("api/billing/checkout.js");
  const prepareAccount = readText("api/billing/prepare-account.js");
  const portal = readText("api/billing/portal.js");
  const webhook = readText("api/billing/webhook.js");
  const schema = readText("supabase/schema.sql");

  const checks = [
    ["desktop uses current ClassLoop data filename", desktop, /const dataFileName = "\.classloop-data\.json"/],
    ["desktop uses prompt-free ClassLoop storage key", desktop, /const dataKeyFileName = "\.classloop-storage-key"/],
    ["desktop encrypts state with AES-GCM", desktop, /crypto\.createCipheriv\("aes-256-gcm"/],
    ["desktop writes restrictive data-file permissions", desktop, /mode: 0o600/],
    ["desktop blocks untrusted mutating local API origins", desktop, /Blocked untrusted local API origin/],
    ["desktop local APIs have rate limiting", desktop, /consumeLocalApiRateLimit/],
    ["desktop local APIs require JSON for write bodies", desktop, /Use application\/json for this request/],
    ["desktop state API rejects unexpected root fields", desktop, /validateStatePayload/],
    ["desktop email API validates request schema", desktop, /validateEmailRequestPayload/],
    ["desktop blocks writes after unreadable encrypted state", desktop, /if \(dataFileReadError\)/],
    ["email send reloads state server-side by session id", desktop, /const state = readDataFile\(\{ throwOnError: true \}\)/],
    ["hosted APIs require bearer Supabase auth", shared, /auth\.startsWith\("Bearer "\)\s*\?\s*auth\.slice\("Bearer "\.length\)/],
    ["server-only Supabase key stays server-side", shared, /SUPABASE_SERVICE_ROLE_KEY/],
    ["hosted APIs share graceful JSON error handling", shared, /sendApiError/],
    ["hosted APIs emit rate-limit headers", shared, /RateLimit-Remaining/],
    ["hosted APIs support IP rate limiting", shared, /assertIpRateLimit/],
    ["hosted APIs support user rate limiting", shared, /assertUserRateLimit/],
    ["hosted APIs require JSON content types for JSON bodies", shared, /Use application\/json for this request/],
    ["hosted APIs use schema validation", shared, /validateSchema/],
    ["API validators reject unexpected fields", shared, /contains unsupported field/],
    ["cloud workspace state has strict schema", validators, /validateCloudWorkspaceStatePayload/],
    ["feedback has strict schema", validators, /validateFeedbackPayload/],
    ["email recap request has strict schema", validators, /validateEmailRecapPayload/],
    ["billing checkout has strict schema", validators, /validateCheckoutPayload/],
    ["profile patch has strict schema", validators, /validateProfilePatchPayload/],
    ["public config has rate limiting", config, /assertIpRateLimit\(request, response/],
    ["profile has IP rate limiting", profile, /assertIpRateLimit\(request, response/],
    ["profile has user rate limiting", profile, /requireUser\(request, response, \{ rateLimit: PROFILE_RATE_LIMIT \}/],
    ["profile patch validates payload before updating", profile, /validateProfilePatchPayload/],
    ["profile patch ignores paid entitlement fields", profile, /profilePatchColumns/],
    ["cloud state has IP rate limiting", cloudState, /assertIpRateLimit\(request, response/],
    ["cloud state has user rate limiting", cloudState, /requireUser\(request, response, \{ rateLimit: CLOUD_STATE_RATE_LIMIT \}/],
    ["cloud state validates payload before storage", cloudState, /validateCloudWorkspaceStatePayload/],
    ["hosted recap email has IP rate limiting", emailRecaps, /assertIpRateLimit\(request, response/],
    ["hosted recap email has user rate limiting", emailRecaps, /requireUser\(request, response, \{ rateLimit: EMAIL_USER_RATE_LIMIT \}/],
    ["hosted recap email validates payload schema", emailRecaps, /validateEmailRecapPayload/],
    ["hosted recap email reloads cloud state server-side", emailRecaps, /loadWorkspaceState\(supabase, user\.id\)/],
    ["hosted recap email writes delivery state after send", emailRecaps, /markSessionEmailsSent/],
    ["Stripe client pins current SDK API version", readText("api/billing/stripe-client.js"), /apiVersion: stripeApiVersion/],
    ["anonymous feedback has IP rate limiting", feedback, /assertIpRateLimit\(request, response/],
    ["authenticated feedback has user rate limiting", feedback, /assertUserRateLimit\(request, response, user/],
    ["anonymous feedback has body limits", feedback, /MAX_FEEDBACK_BODY_CHARS/],
    ["feedback fails closed without hosted credentials", feedback, /Support intake is temporarily unavailable/],
    ["feedback caps transcript context before support storage", feedback, /transcript:\s*storedTranscriptContext\(payload\.transcript\)/],
    ["feedback validates payload schema", feedback, /validateFeedbackPayload/],
    ["feedback reads bounded JSON body", feedback, /readJsonBody\(request/],
    ["student popup feedback omits raw transcript bodies", appSource, /source:\s*"student_followup_popup"[\s\S]*?transcript:\s*""/],
    ["billing checkout has IP rate limiting", checkout, /assertIpRateLimit\(request, response/],
    ["billing checkout has user rate limiting", checkout, /CHECKOUT_USER_RATE_LIMIT/],
    ["billing checkout validates schema", checkout, /validateCheckoutPayload/],
    ["billing prepare account has IP rate limiting", prepareAccount, /assertIpRateLimit\(request, response/],
    ["billing prepare account validates schema", prepareAccount, /validateBillingAccountPayload/],
    ["billing prepare account is guarded legacy flow", prepareAccount, /Create and confirm your ClassLoop account before checkout/],
    ["billing prepare account returns conflict instead of creating accounts", prepareAccount, /json\(response,\s*409/],
    ["billing portal has IP rate limiting", portal, /assertIpRateLimit\(request, response/],
    ["billing portal has user rate limiting", portal, /PORTAL_USER_RATE_LIMIT/],
    ["feedback metadata is sanitized", validators, /metadataValue/],
    ["Stripe webhook verifies raw signed body", webhook, /constructEvent\(rawBody, signature, requiredEnv\("STRIPE_WEBHOOK_SECRET"\)\)/],
    ["Stripe webhook caps raw body size", webhook, /maxWebhookBodyBytes/],
    ["Stripe webhook has IP rate limiting", webhook, /assertIpRateLimit\(request, response/],
    ["Stripe webhook preserves explicit error statuses", webhook, /const statusCode = error\.statusCode \|\| 400/],
    ["Stripe webhook handles invoice renewals", webhook, /event\.type === "invoice\.paid"/],
    ["Stripe webhook handles invoice payment failures", webhook, /event\.type === "invoice\.payment_failed"/],
    ["workspace RLS enabled", schema, /alter table public\.classloop_workspace_state enable row level security/i],
    ["workspace own-record policy exists", schema, /workspace_state_select_own/i],
  ];

  checks.forEach(([label, source, pattern]) => {
    if (!pattern.test(source)) fail(`Missing security control: ${label}`);
  });
  if (/supabase\.auth\.admin\.createUser|email_confirm:\s*true/.test(prepareAccount)) {
    fail("Billing prepare account must not silently create or confirm cloud accounts.");
  }
}

function verifyRuntimeLogging() {
  const files = ["src/App.tsx", "src/cloud.ts", "desktop/main.cjs", "api/_shared.js", "api/cloud-state.js", "api/profile.js", "api/feedback.js"];
  const noisyLogs = [];
  files.forEach((relPath) => {
    const text = readText(relPath);
    const matches = text.match(/console\.(log|debug|info)\(/g) ?? [];
    if (matches.length) noisyLogs.push(relPath);
  });
  if (noisyLogs.length) {
    fail(`Runtime files contain debug/info logs that may leak user data: ${noisyLogs.join(", ")}`);
  }

  const desktop = readText("desktop/main.cjs");
  if (!/ClassLoop desktop startup failed:/.test(desktop)) {
    fail("Desktop startup logging is missing a stable support prefix.");
  }
  const riskyErrorLog = /console\.error\((?!"ClassLoop desktop startup failed:").*(accounts|sessions|transcript|password|payload|student)/is;
  if (riskyErrorLog.test(desktop)) {
    fail("Desktop error logging may include raw classroom state or secrets.");
  }
}

function verifyLegalBaseline() {
  const legalPath = path.join(rootDir, "LEGAL.md");
  if (!fs.existsSync(legalPath)) fail("LEGAL.md is missing.");
  const legal = fs.readFileSync(legalPath, "utf8");
  const appSource = readText("src/App.tsx");
  const requiredLegalLanguage = [
    ["not legal advice disclaimer", /not legal advice/i],
    ["public signup status", /Public Signup Status/i],
    ["legal review required before school-scale hosted use", /Have qualified counsel review final production language/i],
    ["cloud signup requires configured legal/support controls", /Cloud-backed account signup may be enabled when Supabase Auth/i],
    ["demo-only hosted boundary", /Demo-only routes should use sample accounts only/i],
    ["Terms", /Terms/i],
    ["Privacy", /Privacy/i],
    ["EULA", /EULA/i],
    ["Support", /Support/i],
    ["support contact", /rushilcpm02@gmail\.com|VITE_CLASSLOOP_SUPPORT_EMAIL/i],
    ["privacy-safe support requests", /support requests should avoid raw student transcripts/i],
    ["Data retention", /Data Retention/i],
    ["hosted retention SLA before school-scale accounts", /Hosted production retention and deletion SLAs must be legally reviewed before broad school or district-managed hosted accounts are enabled/i],
    ["local desktop encryption", /Desktop data is local-first/i],
    ["manual install-over-replace updates", /manual install-over-replace/i],
    ["no-training default", /no-training/i],
    ["gradebook boundary", /not an official gradebook/i],
    ["Child-appropriate safety", /Child-Appropriate Safety/i],
    ["no unsupervised child public accounts", /should not invite children to create unsupervised public accounts/i],
    ["school privacy laws", /COPPA/i],
    ["education records law", /FERPA/i],
  ];
  requiredLegalLanguage.forEach(([label, pattern]) => {
    if (!pattern.test(legal)) fail(`LEGAL.md is missing ${label} baseline language.`);
  });
  const requiredPublicCopy = [
    ["public privacy route", /ClassLoop Privacy Policy/i],
    ["hosted demo boundary", /Hosted demo boundary/i],
    ["demo-only hosted copy", /Demo-only routes use sample accounts only/i],
    ["local desktop data copy", /Desktop state is encrypted locally/i],
    ["no student-data training copy", /No training on student records/i],
    ["public Terms route", /ClassLoop Terms of Use/i],
    ["public EULA route", /ClassLoop Desktop EULA/i],
    ["public support route", /ClassLoop support/i],
    ["installer feedback route", /ClassLoop installer feedback/i],
  ];
  requiredPublicCopy.forEach(([label, pattern]) => {
    if (!pattern.test(appSource)) fail(`Public app copy is missing ${label}.`);
  });
}

function main() {
  const files = trackedFiles();
  verifyIgnoredLocalFiles([".env.local", ".env.test.local", ".classloop-data.json", ".classloop-storage-key", ".classloop-data.json"]);
  verifyNoHighConfidenceSecrets(trackedTextFiles(files));
  verifyLocalStorageSecurity();
  verifyDesktopAndHostedSecurity();
  verifyRuntimeLogging();
  verifyLegalBaseline();
  console.log("Security baseline passed: secrets, local data tracking, storage encryption, hosted auth, logging, and legal baseline checks are in place.");
}

main();
