const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

const automatedGate = [
  "npm run test:security",
  "npm run test:import",
  "npm run test:cloud",
  "npm run test:entitlements",
  "npm run test:stripe",
  "npm run build",
  "npm run test:browser",
  "npm run test:web",
  "npm run test:desktop:state",
  "npm run test:desktop:first-run",
  "npm run test:release:distribution",
  "npm run drill:rollback",
  "npm run drill:incidents",
  "git diff --check",
];

const operatorModes = [
  ["Playwright", "Repeatable browser workflows, downloads, mobile viewports, and accessibility checks."],
  ["Browser plugin", "Interactive local or hosted route traversal, screenshots, visual QA, and responsive inspection."],
  ["Chrome plugin", "Profile-dependent hosted checks, installed-PWA behavior, cookies, and browser-specific persistence."],
  ["Computer Use", "Native Electron app, installers, OS dialogs, file picker, microphone/screen-capture prompts, and clean-machine launch."],
  ["Supabase/Stripe plugins", "Live hosted auth, RLS, profile state, checkout, portal, webhook, and entitlement verification."],
  ["GitHub/Vercel/Netlify plugins", "Remote branch, PR, deploy, preview, build-log, protected-preview, and rollback evidence."],
  ["Gmail/Slack/Notion/Drive/Canva/Jam/Granola", "Alpha feedback capture, support-burden notes, bug recordings, docs, and project-memory updates."],
];

const sections = [
  [
    "Launch Confidence Mini Checklist (Screenshots)",
    "Browser/Chrome plugin + Computer Use on clean devices",
    [
      "From a clean desktop browser profile, open `/` and capture a screenshot that includes the build marker.",
      "Open `#/download` and capture a screenshot confirming installer links are either external-download-host URLs or clearly marked `Packaging pending`; Vercel Blob URLs must not appear as ready downloads.",
      "Open `/?demoOnly=1` and capture screenshots of the demo chooser + teacher dashboard (demo banner visible).",
      "On a clean phone (Safari/Chrome), open the hosted URL and capture screenshots of the Add to phone flow and standalone mode if installed.",
      "Run one redacted real-class solo simulation (or single-teacher pilot) through import -> review -> publish and capture notes/screenshots of any confusing steps.",
      "On matching clean hosts (macOS arm64, Windows x64/arm64, Linux x64/arm64), capture screenshots of the OS trust prompt and the first-run dashboard after launching the installer.",
      "Download `SHA256SUMS.txt` from the external release host, not Vercel Blob, and record checksum verification output for at least one installer per OS family (macOS/Windows/Linux).",
    ],
  ],
  [
    "Public Landing, Hosted Demo, And PWA",
    "Browser or Chrome plugin",
    [
      "Open `/`, `#/features`, `#/screenshots`, `#/docs`, `#/privacy`, `#/terms`, `#/eula`, `#/support`, `#/donate`, and `#/download` on desktop, tablet, and phone widths.",
      "Verify missing macOS, Windows, and Linux URLs say `Packaging pending` before and after click.",
      "Temporarily fail, corrupt, and Vercel-Blob-point `public/classloop-downloads.json`; verify the Download route keeps installers pending with visible recovery copy.",
      "Confirm hosted demo uses sample teacher/student choices and never exposes account creation fields in demo-only mode.",
      "Verify Add to phone/PWA controls, manifest, service worker, icon, standalone start URL, and mobile readability.",
      "Check docs/privacy/terms/eula/support/donate/download copy for legal/support clarity and no misleading live-sync, billing, or installer claims.",
    ],
  ],
  [
    "Teacher Core Flow",
    "Playwright, Browser plugin, or Computer Use for packaged app",
    [
      "Run import -> review -> approve -> publish for Math review, CS workshop, Club meeting, General classroom, and Study group templates.",
      "Edit recap, essential questions, participation events, action items, resources, attendance, and student-specific follow-ups before publish.",
      "Inspect publish preview for every student, verify publish audit, save or skip the roster prompt, and export report JSON/CSV/print.",
      "Repeat back-to-back imports and confirm sessions, rosters, follow-ups, resources, and participation signals do not bleed between sessions.",
    ],
  ],
  [
    "Student Portal And Role Boundaries",
    "Playwright or Browser plugin",
    [
      "Sign in as rostered students and verify only that student's sessions appear.",
      "Mark complete, verify submitted state, return as teacher, mark reviewed, and confirm only the intended student changes.",
      "Directly open teacher-only routes (`#/analytics`, `#/classes`, `#/rosters`, `#/billing`, `#/privacy`) while signed in as a student.",
      "Create a second teacher and unrelated student; verify no sessions, rosters, classes, drafts, reports, or preferences leak across accounts.",
    ],
  ],
  [
    "Parser, Scale, And Durability",
    "Automated import tests plus Browser plugin for UI review",
    [
      "Paste comma, pipe, semicolon, tabular, numbered, compressed, Google Classroom, alias-column, and malformed rosters.",
      "Paste Zoom, Zoom chat, VTT, dotted VTT, Teams, Meet captions, generic labels, no-speaker prose, transcript-only inputs, and compliance-note labels.",
      "Run a large 100+ student transcript in the UI; record parse latency, spinner behavior, memory growth, and responsiveness.",
      "Corrupt desktop state, verify read-only recovery and blocked overwrite, restore backup, and confirm data returns.",
    ],
  ],
  [
    "Hosted Sync, Billing, Entitlements",
    "Supabase/Stripe plugins for live projects, Playwright for local fallbacks",
    [
      "With credentials absent, confirm desktop/local mode works and hosted sync/billing failures are clear.",
      "With test credentials configured, verify Supabase login/logout, token expiry, upload/download, conflict resolution, and offline queue behavior.",
      "Verify the Pro button opens the hidden embedded Stripe Checkout page, hosted Checkout fallback still works, return-to-ClassLoop verification keeps Pro locked until paid webhook/profile confirmation, and portal, downgrade/cancel, canceled/past-due/unpaid states, and locked-feature UI behave correctly.",
      "Attempt client-side entitlement tampering and confirm profile/API helpers ignore paid fields submitted by the client.",
    ],
  ],
  [
    "Desktop Installers And Clean Hosts",
    "Computer Use on clean macOS/Windows/Linux hosts",
    [
      "Build or install macOS arm64, Windows x64/arm64 where supported, and Linux x64/arm64 artifacts on matching clean machines.",
      "Launch first-run, create account, confirm `.classloop-data.json` and `.classloop-storage-key` live in user data, relaunch, and sign back in.",
      "Inspect signing/notarization/Gatekeeper/SmartScreen/AppImage warnings and whether they block a normal teacher; only inspect `.deb` installers if they were built on a Linux host.",
      "Do not publish desktop installers until signed/notarized macOS first-run passes and Windows/Linux first-run is verified on matching clean machines.",
    ],
  ],
  [
    "Accessibility, Security, Legal, Ops",
    "Playwright, shell scripts, Browser/Chrome, and Computer Use",
    [
      "Keyboard through login, dashboard, import, review, preview, report, student dashboard, privacy, billing, tutorial, and public routes.",
      "Verify visible focus, logical focus order, accessible names, live status announcements, contrast, mobile readability, and no horizontal overflow.",
      "Trigger loading-state delay, malformed transcript, malformed URL, sync API down, non-JSON sync response, billing API down, browser storage read/write failure, desktop storage corruption, and package init failure states.",
      "Confirm Terms, Privacy, EULA, support contact, data retention, child-appropriate safety, and demo-data ephemerality before public signup.",
      "Run rollback and incident drills; classify findings as correctness errors, feature issues, cohesion improvements, suggested features, and remaining gaps.",
    ],
  ],
];

function markdown() {
  const lines = [
    "# ClassLoop Full Manual QA Checklist",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This checklist complements the automated suite. Use it for human review, Browser/Chrome automation, or Computer Use when native desktop or OS prompts are involved.",
    "",
    "## Automated Gate To Run First",
    "",
    ...automatedGate.map((command) => `- \`${command}\``),
    "",
    "## Operator Modes And Plugins",
    "",
    ...operatorModes.map(([mode, use]) => `- **${mode}**: ${use}`),
    "",
    "## Manual Checks",
    "",
  ];

  sections.forEach(([title, owner, checks], index) => {
    lines.push(`### ${index + 1}. ${title}`, "", `Recommended operator: ${owner}`, "");
    checks.forEach((check) => lines.push(`- [ ] ${check}`));
    lines.push("");
  });

  lines.push(
    "## Manual QA Report Template",
    "",
    "| Area | Status | Evidence | Correctness error | Feature issue | Cohesion improvement | Suggested new feature | Owner / next step |",
    "|---|---|---|---|---|---|---|---|",
    "| Example | PASS/FAIL/BLOCKED | URL, screenshot, log, command, or notes | Broken behavior/regression | Missing/awkward expected behavior | Polish/naming/layout/workflow issue | New useful capability | Person/action/date |",
    "",
    "### Required Summary",
    "",
    "- Correctness errors found:",
    "- Feature issues found:",
    "- Suggested new features:",
    "- Cohesion improvements:",
    "- Remaining coverage gaps:",
    "- Cross-platform checks not yet run on real hardware:",
    "",
  );
  return lines.join("\n");
}

function main() {
  const output = markdown();
  if (process.argv.includes("--write")) {
    const outDir = path.join(rootDir, "test-results");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "classloop-manual-qa-checklist.md");
    fs.writeFileSync(outPath, output);
    console.log(`Wrote ${path.relative(rootDir, outPath)}`);
    return;
  }
  console.log(output);
}

main();
