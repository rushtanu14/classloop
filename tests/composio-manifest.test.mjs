import assert from "node:assert/strict";

import {
  buildComposioCreatePayload,
  classLoopComposioIntegrations,
  composioIntegrationStatus,
  selectedComposioIntegrations,
} from "../server/backend/composio-integrations.js";

const ids = classLoopComposioIntegrations.map((integration) => integration.id);

for (const required of ["google_classroom", "zoom", "gmail", "googlecalendar"]) {
  assert.ok(ids.includes(required), `Expected ${required} in the ClassLoop Composio manifest.`);
}

for (const useful of ["googlemeet", "googledrive", "googledocs", "googlesheets", "canvas", "blackboard", "outlook", "microsoft_teams"]) {
  assert.ok(ids.includes(useful), `Expected ${useful} as an optional ClassLoop-relevant integration.`);
}

assert.equal(ids.includes("googlesuper"), false, "Use least-privilege Google toolkits instead of broad Google Super by default.");

for (const integration of classLoopComposioIntegrations) {
  assert.match(integration.authConfigEnv, /^COMPOSIO_[A-Z0-9_]+_AUTH_CONFIG_ID$/);
  assert.equal(integration.allowedTools.length > 0, true, `${integration.id} should keep a narrow allowed-tools list.`);
}

const env = {
  COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_gmail",
  COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID: "ac_calendar",
  COMPOSIO_GMAIL_ALLOWED_TOOLS: "GMAIL_CREATE_EMAIL_DRAFT,GMAIL_FETCH_EMAILS",
};

const selected = selectedComposioIntegrations(env);
assert.deepEqual(selected.map((integration) => integration.id), ["gmail", "googlecalendar"]);

const status = composioIntegrationStatus(env);
assert.equal(status.find((integration) => integration.id === "gmail")?.allowedTools.length, 2);
assert.equal(status.find((integration) => integration.id === "googlecalendar")?.authConfigured, true);

const payload = buildComposioCreatePayload(env);
assert.deepEqual(payload.toolkits, [
  { toolkit: "gmail", authConfigId: "ac_gmail" },
  { toolkit: "googlecalendar", authConfigId: "ac_calendar" },
]);
assert.ok(payload.allowedTools.includes("GMAIL_CREATE_EMAIL_DRAFT"));
assert.ok(payload.allowedTools.includes("GOOGLECALENDAR_CREATE_EVENT"));

console.log("Composio manifest checks passed.");

