import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildComposioCreatePayload,
  classLoopComposioIntegrations,
  composioIntegrationStatus,
  selectedComposioIntegrations,
} from "../server/backend/composio-integrations.js";

const ids = classLoopComposioIntegrations.map((integration) => integration.id);
const expectedAllowedToolsById = {
  google_classroom: [
    "GOOGLE_CLASSROOM_COURSES_LIST",
    "GOOGLE_CLASSROOM_COURSES_STUDENTS_LIST",
    "GOOGLE_CLASSROOM_COURSES_ANNOUNCEMENTS_LIST",
    "GOOGLE_CLASSROOM_COURSE_WORK_LIST",
    "GOOGLE_CLASSROOM_COURSE_WORK_MATERIALS_LIST",
  ],
  zoom: [
    "ZOOM_LIST_MEETINGS",
    "ZOOM_GET_A_MEETING",
    "ZOOM_GET_PAST_MEETING_PARTICIPANTS",
    "ZOOM_LIST_ALL_RECORDINGS",
    "ZOOM_GET_MEETING_RECORDINGS",
    "ZOOM_GET_A_MEETING_SUMMARY",
  ],
  googlecalendar: [
    "GOOGLECALENDAR_LIST_CALENDARS",
    "GOOGLECALENDAR_EVENTS_LIST",
    "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
  ],
  googlemeet: [
    "GOOGLEMEET_LIST_CONFERENCE_RECORDS",
    "GOOGLEMEET_GET_CONFERENCE_RECORD_BY_NAME",
    "GOOGLEMEET_LIST_PARTICIPANT_SESSIONS",
    "GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID",
    "GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID",
    "GOOGLEMEET_LIST_TRANSCRIPT_ENTRIES",
  ],
  googledrive: [
    "GOOGLEDRIVE_FIND_FILE",
    "GOOGLEDRIVE_GET_FILE_METADATA",
  ],
  googledocs: ["GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT"],
  googlesheets: [
    "GOOGLESHEETS_GET_SPREADSHEET_INFO",
    "GOOGLESHEETS_BATCH_GET",
    "GOOGLESHEETS_VALUES_GET",
  ],
  googletasks: [
    "GOOGLETASKS_LIST_TASK_LISTS",
    "GOOGLETASKS_LIST_TASKS",
  ],
  googleforms: [
    "GOOGLEFORMS_GET_FORM",
    "GOOGLEFORMS_LIST_RESPONSES",
  ],
  canvas: [
    "CANVAS_LIST_COURSES",
    "CANVAS_GET_ALL_ASSIGNMENTS",
    "CANVAS_LIST_ANNOUNCEMENTS",
  ],
  blackboard: [
    "BLACKBOARD_GET_COURSES",
    "BLACKBOARD_GET_COURSE",
    "BLACKBOARD_GET_ANNOUNCEMENTS",
  ],
  outlook: [
    "OUTLOOK_QUERY_EMAILS",
    "OUTLOOK_GET_CALENDAR_VIEW",
    "OUTLOOK_LIST_EVENTS",
  ],
  microsoft_teams: [
    "MICROSOFT_TEAMS_LIST_USER_JOINED_TEAMS",
    "MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS",
    "MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS",
    "MICROSOFT_TEAMS_TEAMS_LIST_CHANNEL_MESSAGES",
  ],
  slack: [
    "SLACK_LIST_ALL_CHANNELS",
    "SLACK_SEARCH_MESSAGES",
    "SLACK_FETCH_CONVERSATION_HISTORY",
  ],
  notion: [
    "NOTION_SEARCH_NOTION_PAGE",
    "NOTION_GET_PAGE_MARKDOWN",
    "NOTION_QUERY_DATABASE",
  ],
};

for (const required of ["google_classroom", "zoom", "googlecalendar"]) {
  assert.ok(ids.includes(required), `Expected ${required} in the ClassLoop Composio manifest.`);
}

assert.equal(
  ids.includes("gmail"),
  false,
  "Gmail delivery must use the server-side SMTP/app-password environment path, not a Composio connector.",
);

for (const useful of ["googlemeet", "googledrive", "googledocs", "googlesheets", "canvas", "blackboard", "outlook", "microsoft_teams"]) {
  assert.ok(ids.includes(useful), `Expected ${useful} as an optional ClassLoop-relevant integration.`);
}

assert.equal(ids.includes("googlesuper"), false, "Use least-privilege Google toolkits instead of broad Google Super by default.");

for (const integration of classLoopComposioIntegrations) {
  assert.deepEqual(
    integration.allowedTools,
    expectedAllowedToolsById[integration.id],
    `${integration.id} must use the current live-validated Composio tool IDs.`,
  );
  assert.match(integration.authConfigEnv, /^COMPOSIO_[A-Z0-9_]+_AUTH_CONFIG_ID$/);
  assert.match(
    integration.authProvisioning,
    /^(?:composio_managed_oauth|custom_google_oauth|custom_instance_credentials|custom_institution_oauth)$/,
    `${integration.id} should document how its auth config is provisioned.`,
  );
  assert.equal(integration.allowedTools.length > 0, true, `${integration.id} should keep a narrow allowed-tools list.`);
  for (const tool of integration.allowedTools) {
    assert.equal(
      !/(?:^|_)(?:CREATE|UPDATE|DELETE|SEND|POST|PUBLISH|APPEND|ADD|COPY|MOVE|SHARE|PERMISSION)(?:_|$)/.test(tool),
      true,
      `${integration.id} must remain read-only until a separate teacher-confirmed action path exists.`,
    );
  }
}

assert.deepEqual(
  classLoopComposioIntegrations
    .filter((integration) => integration.authProvisioning === "composio_managed_oauth")
    .map((integration) => integration.id),
  [
    "zoom",
    "googlecalendar",
    "googlemeet",
    "googledrive",
    "googledocs",
    "googlesheets",
    "googletasks",
    "outlook",
    "microsoft_teams",
    "slack",
    "notion",
  ],
  "Only toolkits with current Composio-managed OAuth support should be auto-provisioned.",
);

const staleToolIds = new Set([
  "GOOGLE_CLASSROOM_LIST_COURSES",
  "GOOGLE_CLASSROOM_LIST_STUDENTS",
  "GOOGLE_CLASSROOM_LIST_ANNOUNCEMENTS",
  "ZOOM_GET_MEETING",
  "ZOOM_LIST_RECORDINGS",
  "ZOOM_GET_MEETING_SUMMARY",
  "GOOGLECALENDAR_LIST_EVENTS",
  "GOOGLEMEET_GET_MEET_DETAILS",
  "GOOGLEMEET_GET_TRANSCRIPT",
  "GOOGLEMEET_GET_TRANSCRIPT_ENTRY",
  "GOOGLEMEET_GET_PARTICIPANT_DETAILS",
  "GOOGLEDRIVE_SEARCH_FILES",
  "GOOGLEDOCS_GET_DOCUMENT",
  "GOOGLESHEETS_BATCH_GET_SPREADSHEET",
  "CANVAS_LIST_ASSIGNMENTS",
  "BLACKBOARD_LIST_COURSES",
  "BLACKBOARD_LIST_ANNOUNCEMENTS",
  "BLACKBOARD_GET_COURSE_DETAILS",
  "OUTLOOK_LIST_MESSAGES",
  "MICROSOFT_TEAMS_LIST_TEAMS",
  "MICROSOFT_TEAMS_LIST_CHANNELS",
  "MICROSOFT_TEAMS_LIST_CHATS",
  "SLACK_LIST_CHANNELS",
]);
const manifestToolIds = classLoopComposioIntegrations.flatMap((integration) => integration.allowedTools);
assert.deepEqual(
  manifestToolIds.filter((tool) => staleToolIds.has(tool)),
  [],
  "The ClassLoop manifest must not regress to stale Composio tool IDs.",
);

const env = {
  COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_gmail",
  COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID: "ac_calendar",
  COMPOSIO_GMAIL_ALLOWED_TOOLS: "GMAIL_CREATE_EMAIL_DRAFT,GMAIL_FETCH_EMAILS",
};

const selected = selectedComposioIntegrations(env);
assert.deepEqual(
  selected.map((integration) => integration.id),
  ["googlecalendar"],
  "COMPOSIO_GMAIL_* variables must not re-enable a removed Gmail connector.",
);

const status = composioIntegrationStatus(env);
assert.equal(status.some((integration) => integration.id === "gmail"), false);
assert.equal(status.find((integration) => integration.id === "googlecalendar")?.authConfigured, true);

const payload = buildComposioCreatePayload(env);
assert.deepEqual(payload.toolkits, [
  { toolkit: "googlecalendar" },
  { authConfigId: "ac_calendar" },
]);
assert.equal(
  payload.toolkits.some((entry) => entry.toolkit && entry.authConfigId),
  false,
  "Legacy Composio MCP payload entries must separate toolkit and auth config ids so neither is silently dropped.",
);
assert.equal(payload.allowedTools.some((tool) => tool.startsWith("GMAIL_")), false);
assert.equal(payload.allowedTools.includes("GOOGLECALENDAR_CREATE_EVENT"), false);
assert.ok(payload.allowedTools.includes("GOOGLECALENDAR_EVENTS_LIST"));

const maliciousOverridePayload = buildComposioCreatePayload({
  COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_gmail",
  COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID: "ac_calendar",
  COMPOSIO_GMAIL_ALLOWED_TOOLS:
    "GMAIL_SEND_EMAIL,GMAIL_CREATE_EMAIL_DRAFT,GOOGLECALENDAR_CREATE_EVENT,GMAIL_CREATE_EMAIL_DRAFT",
  COMPOSIO_GOOGLECALENDAR_ALLOWED_TOOLS:
    "GOOGLECALENDAR_DELETE_EVENT,GOOGLECALENDAR_CREATE_EVENT,GOOGLECALENDAR_EVENTS_LIST",
});
assert.deepEqual(
  maliciousOverridePayload.allowedTools,
  ["GOOGLECALENDAR_EVENTS_LIST"],
  "Environment overrides must only narrow each connector's immutable safe-tool maximum.",
);

const setupScript = readFileSync(new URL("../scripts/setup-composio-mcps.mjs", import.meta.url), "utf8");
assert.match(
  setupScript,
  /composio\.client\.mcp\.update[\s\S]*?allowed_tools:/,
  "Remote MCP updates must use the current API field so removed tools do not remain enabled.",
);
assert.doesNotMatch(
  setupScript,
  /composio\.mcp\.update\(/,
  "The 0.14.0 MCP update wrapper must not reintroduce legacy additive custom-tools behavior.",
);

console.log("Composio manifest checks passed.");
