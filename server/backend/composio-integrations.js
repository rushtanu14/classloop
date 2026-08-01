export const classLoopComposioServerName = "classloop-preview-connectors";
export const defaultClassLoopComposioUserId = "classloop-teacher-local";

export const classLoopComposioIntegrations = [
  {
    id: "google_classroom",
    toolkit: "google_classroom",
    label: "Google Classroom",
    category: "Classroom core",
    priority: "core",
    authConfigEnv: "COMPOSIO_GOOGLE_CLASSROOM_AUTH_CONFIG_ID",
    authProvisioning: "custom_google_oauth",
    mode: "preview_first",
    purpose: "Read course rosters, announcements, coursework, and materials for teacher-reviewed imports.",
    allowedTools: [
      "GOOGLE_CLASSROOM_COURSES_LIST",
      "GOOGLE_CLASSROOM_COURSES_STUDENTS_LIST",
      "GOOGLE_CLASSROOM_COURSES_ANNOUNCEMENTS_LIST",
      "GOOGLE_CLASSROOM_COURSE_WORK_LIST",
      "GOOGLE_CLASSROOM_COURSE_WORK_MATERIALS_LIST",
    ],
  },
  {
    id: "zoom",
    toolkit: "zoom",
    label: "Zoom",
    category: "Classroom core",
    priority: "core",
    authConfigEnv: "COMPOSIO_ZOOM_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Preview meetings, participants, recordings, summaries, and transcript availability before importing into ClassLoop.",
    allowedTools: [
      "ZOOM_LIST_MEETINGS",
      "ZOOM_GET_A_MEETING",
      "ZOOM_GET_PAST_MEETING_PARTICIPANTS",
      "ZOOM_LIST_ALL_RECORDINGS",
      "ZOOM_GET_MEETING_RECORDINGS",
      "ZOOM_GET_A_MEETING_SUMMARY",
    ],
  },
  {
    id: "googlecalendar",
    toolkit: "googlecalendar",
    label: "Google Calendar",
    category: "Classroom core",
    priority: "core",
    authConfigEnv: "COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Read calendars and events so teachers can review schedule context inside ClassLoop.",
    allowedTools: [
      "GOOGLECALENDAR_LIST_CALENDARS",
      "GOOGLECALENDAR_EVENTS_LIST",
      "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
    ],
  },
  {
    id: "googlemeet",
    toolkit: "googlemeet",
    label: "Google Meet",
    category: "Meeting capture",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_MEET_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Preview Meet spaces, recordings, transcripts, and participant details for transcript-first imports.",
    allowedTools: [
      "GOOGLEMEET_LIST_CONFERENCE_RECORDS",
      "GOOGLEMEET_GET_CONFERENCE_RECORD_BY_NAME",
      "GOOGLEMEET_LIST_PARTICIPANT_SESSIONS",
      "GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID",
      "GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID",
      "GOOGLEMEET_LIST_TRANSCRIPT_ENTRIES",
    ],
  },
  {
    id: "googledrive",
    toolkit: "googledrive",
    label: "Google Drive",
    category: "Class materials",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Search teacher-owned class materials for explicit, reviewed imports.",
    allowedTools: [
      "GOOGLEDRIVE_FIND_FILE",
      "GOOGLEDRIVE_GET_FILE_METADATA",
    ],
  },
  {
    id: "googledocs",
    toolkit: "googledocs",
    label: "Google Docs",
    category: "Class materials",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Read teacher-selected documents for explicit, reviewed imports.",
    allowedTools: [
      "GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT",
    ],
  },
  {
    id: "googlesheets",
    toolkit: "googlesheets",
    label: "Google Sheets",
    category: "Rosters and analytics",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Read teacher-selected roster and analytics spreadsheets for reviewed imports.",
    allowedTools: [
      "GOOGLESHEETS_GET_SPREADSHEET_INFO",
      "GOOGLESHEETS_BATCH_GET",
      "GOOGLESHEETS_VALUES_GET",
    ],
  },
  {
    id: "googletasks",
    toolkit: "googletasks",
    label: "Google Tasks",
    category: "Follow-up tasks",
    priority: "optional",
    authConfigEnv: "COMPOSIO_GOOGLE_TASKS_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Read teacher task lists for follow-up and next-class context.",
    allowedTools: [
      "GOOGLETASKS_LIST_TASK_LISTS",
      "GOOGLETASKS_LIST_TASKS",
    ],
  },
  {
    id: "googleforms",
    toolkit: "googleforms",
    label: "Google Forms",
    category: "Student check-ins",
    priority: "optional",
    authConfigEnv: "COMPOSIO_GOOGLE_FORMS_AUTH_CONFIG_ID",
    authProvisioning: "custom_google_oauth",
    mode: "preview_first",
    purpose: "Read teacher-selected forms and responses for reviewed imports.",
    allowedTools: ["GOOGLEFORMS_GET_FORM", "GOOGLEFORMS_LIST_RESPONSES"],
  },
  {
    id: "canvas",
    toolkit: "canvas",
    label: "Canvas",
    category: "LMS",
    priority: "optional",
    authConfigEnv: "COMPOSIO_CANVAS_AUTH_CONFIG_ID",
    authProvisioning: "custom_instance_credentials",
    mode: "preview_first",
    purpose: "Preview Canvas courses, assignments, announcements, and submission context for schools using Canvas.",
    allowedTools: [
      "CANVAS_LIST_COURSES",
      "CANVAS_GET_ALL_ASSIGNMENTS",
      "CANVAS_LIST_ANNOUNCEMENTS",
    ],
  },
  {
    id: "blackboard",
    toolkit: "blackboard",
    label: "Blackboard",
    category: "LMS",
    priority: "optional",
    authConfigEnv: "COMPOSIO_BLACKBOARD_AUTH_CONFIG_ID",
    authProvisioning: "custom_institution_oauth",
    mode: "preview_first",
    purpose: "Preview Blackboard course announcements, engagement, and LMS context for schools using Blackboard.",
    allowedTools: [
      "BLACKBOARD_GET_COURSES",
      "BLACKBOARD_GET_COURSE",
      "BLACKBOARD_GET_ANNOUNCEMENTS",
    ],
  },
  {
    id: "outlook",
    toolkit: "outlook",
    label: "Outlook",
    category: "Microsoft schools",
    priority: "optional",
    authConfigEnv: "COMPOSIO_OUTLOOK_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Read Microsoft-school email and calendar context for teacher-reviewed imports.",
    allowedTools: [
      "OUTLOOK_QUERY_EMAILS",
      "OUTLOOK_GET_CALENDAR_VIEW",
      "OUTLOOK_LIST_EVENTS",
    ],
  },
  {
    id: "microsoft_teams",
    toolkit: "microsoft_teams",
    label: "Microsoft Teams",
    category: "Microsoft schools",
    priority: "optional",
    authConfigEnv: "COMPOSIO_MICROSOFT_TEAMS_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Preview Teams meetings, channels, and class communication context for Microsoft-school deployments.",
    allowedTools: [
      "MICROSOFT_TEAMS_LIST_USER_JOINED_TEAMS",
      "MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS",
      "MICROSOFT_TEAMS_CHATS_GET_ALL_CHATS",
      "MICROSOFT_TEAMS_TEAMS_LIST_CHANNEL_MESSAGES",
    ],
  },
  {
    id: "slack",
    toolkit: "slack",
    label: "Slack",
    category: "Team communication",
    priority: "optional",
    authConfigEnv: "COMPOSIO_SLACK_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Search staff/team context and prepare reviewed support or operations updates for school teams using Slack.",
    allowedTools: ["SLACK_LIST_ALL_CHANNELS", "SLACK_SEARCH_MESSAGES", "SLACK_FETCH_CONVERSATION_HISTORY"],
  },
  {
    id: "notion",
    toolkit: "notion",
    label: "Notion",
    category: "Knowledge base",
    priority: "optional",
    authConfigEnv: "COMPOSIO_NOTION_AUTH_CONFIG_ID",
    authProvisioning: "composio_managed_oauth",
    mode: "preview_first",
    purpose: "Search teacher-selected Notion pages for reviewed context imports.",
    allowedTools: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_GET_PAGE_MARKDOWN", "NOTION_QUERY_DATABASE"],
  },
];

const immutableAllowedToolsByIntegrationId = new Map(
  classLoopComposioIntegrations.map((integration) => [
    integration.id,
    Object.freeze([...integration.allowedTools]),
  ]),
);

export function splitEnvList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedToolsForIntegration(integration, env = process.env) {
  const overrideName = `COMPOSIO_${integration.id.toUpperCase()}_ALLOWED_TOOLS`;
  const override = splitEnvList(env[overrideName]);
  const safeMaximum = immutableAllowedToolsByIntegrationId.get(integration.id) ?? [];
  if (!override.length) return [...safeMaximum];
  const requested = new Set(override);
  return safeMaximum.filter((tool) => requested.has(tool));
}

export function composioIntegrationStatus(env = process.env) {
  return classLoopComposioIntegrations.map((integration) => ({
    ...integration,
    authConfigured: Boolean(env[integration.authConfigEnv]),
    allowedToolsEnv: `COMPOSIO_${integration.id.toUpperCase()}_ALLOWED_TOOLS`,
    allowedTools: allowedToolsForIntegration(integration, env),
  }));
}

export function selectedComposioIntegrations(env = process.env) {
  return composioIntegrationStatus(env).filter((integration) => integration.authConfigured);
}

export function buildComposioCreatePayload(env = process.env) {
  const selected = selectedComposioIntegrations(env);
  return {
    // @composio/core 0.14.0's legacy MCP wrapper processes `toolkit` and
    // `authConfigId` with an else-if. Separate entries ensure the remote MCP
    // config receives both the toolkit slugs and the exact auth config ids.
    toolkits: selected.flatMap((integration) => [
      { toolkit: integration.toolkit },
      { authConfigId: env[integration.authConfigEnv] },
    ]),
    allowedTools: Array.from(new Set(selected.flatMap((integration) => integration.allowedTools))).filter(Boolean),
    manuallyManageConnections: true,
  };
}
