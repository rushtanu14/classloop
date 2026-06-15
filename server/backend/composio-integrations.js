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
    mode: "preview_first",
    purpose: "Preview course rosters, class announcements, coursework, and materials before teacher-confirmed posting.",
    allowedTools: [
      "GOOGLE_CLASSROOM_LIST_COURSES",
      "GOOGLE_CLASSROOM_LIST_STUDENTS",
      "GOOGLE_CLASSROOM_LIST_ANNOUNCEMENTS",
      "GOOGLE_CLASSROOM_CREATE_ANNOUNCEMENT",
      "GOOGLE_CLASSROOM_CREATE_COURSE_WORK",
      "GOOGLE_CLASSROOM_CREATE_COURSE_WORK_MATERIAL",
    ],
  },
  {
    id: "zoom",
    toolkit: "zoom",
    label: "Zoom",
    category: "Classroom core",
    priority: "core",
    authConfigEnv: "COMPOSIO_ZOOM_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Preview meetings, participants, recordings, summaries, and transcript availability before importing into ClassLoop.",
    allowedTools: [
      "ZOOM_LIST_MEETINGS",
      "ZOOM_GET_MEETING",
      "ZOOM_GET_PAST_MEETING_PARTICIPANTS",
      "ZOOM_LIST_RECORDINGS",
      "ZOOM_GET_MEETING_RECORDINGS",
      "ZOOM_GET_MEETING_SUMMARY",
    ],
  },
  {
    id: "gmail",
    toolkit: "gmail",
    label: "Gmail",
    category: "Classroom core",
    priority: "core",
    authConfigEnv: "COMPOSIO_GMAIL_AUTH_CONFIG_ID",
    mode: "draft_only",
    purpose: "Create teacher-reviewed draft recap emails and search a teacher-owned mailbox when explicitly requested.",
    allowedTools: ["GMAIL_CREATE_EMAIL_DRAFT", "GMAIL_FETCH_EMAILS", "GMAIL_SEARCH_EMAILS"],
  },
  {
    id: "googlecalendar",
    toolkit: "googlecalendar",
    label: "Google Calendar",
    category: "Classroom core",
    priority: "core",
    authConfigEnv: "COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Prepare class follow-up events, reminders, office-hours holds, and next meeting drafts for teacher approval.",
    allowedTools: [
      "GOOGLECALENDAR_LIST_CALENDARS",
      "GOOGLECALENDAR_LIST_EVENTS",
      "GOOGLECALENDAR_CREATE_EVENT",
      "GOOGLECALENDAR_UPDATE_EVENT",
    ],
  },
  {
    id: "googlemeet",
    toolkit: "googlemeet",
    label: "Google Meet",
    category: "Meeting capture",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_MEET_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Preview Meet spaces, recordings, transcripts, and participant details for transcript-first imports.",
    allowedTools: [
      "GOOGLEMEET_GET_MEET_DETAILS",
      "GOOGLEMEET_GET_CONFERENCE_RECORD_BY_NAME",
      "GOOGLEMEET_GET_TRANSCRIPT",
      "GOOGLEMEET_GET_TRANSCRIPT_ENTRY",
      "GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID",
      "GOOGLEMEET_GET_PARTICIPANT_DETAILS",
    ],
  },
  {
    id: "googledrive",
    toolkit: "googledrive",
    label: "Google Drive",
    category: "Class materials",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Search teacher-owned class materials, create export folders, and prepare shared resources for review.",
    allowedTools: [
      "GOOGLEDRIVE_SEARCH_FILES",
      "GOOGLEDRIVE_CREATE_FOLDER",
      "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
      "GOOGLEDRIVE_COPY_FILE",
      "GOOGLEDRIVE_CREATE_PERMISSION",
    ],
  },
  {
    id: "googledocs",
    toolkit: "googledocs",
    label: "Google Docs",
    category: "Class materials",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Create teacher-reviewed recap documents, meeting notes, support-safe reports, and handoff drafts.",
    allowedTools: [
      "GOOGLEDOCS_CREATE_DOCUMENT",
      "GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN",
      "GOOGLEDOCS_GET_DOCUMENT",
      "GOOGLEDOCS_COPY_DOCUMENT",
    ],
  },
  {
    id: "googlesheets",
    toolkit: "googlesheets",
    label: "Google Sheets",
    category: "Rosters and analytics",
    priority: "high",
    authConfigEnv: "COMPOSIO_GOOGLE_SHEETS_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Import roster spreadsheets and prepare teacher-reviewed analytics or completion exports.",
    allowedTools: [
      "GOOGLESHEETS_BATCH_GET_SPREADSHEET",
      "GOOGLESHEETS_CREATE_SPREADSHEET",
      "GOOGLESHEETS_ADD_SHEET_TO_EXISTING_SPREADSHEET",
      "GOOGLESHEETS_APPEND_VALUES",
      "GOOGLESHEETS_UPDATE_VALUES",
    ],
  },
  {
    id: "googletasks",
    toolkit: "googletasks",
    label: "Google Tasks",
    category: "Follow-up tasks",
    priority: "optional",
    authConfigEnv: "COMPOSIO_GOOGLE_TASKS_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Prepare teacher personal task reminders for follow-up, grading, and next-class prep.",
    allowedTools: [
      "GOOGLETASKS_LIST_TASK_LISTS",
      "GOOGLETASKS_LIST_TASKS",
      "GOOGLETASKS_CREATE_TASK",
      "GOOGLETASKS_UPDATE_TASK",
    ],
  },
  {
    id: "googleforms",
    toolkit: "googleforms",
    label: "Google Forms",
    category: "Student check-ins",
    priority: "optional",
    authConfigEnv: "COMPOSIO_GOOGLE_FORMS_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Prepare teacher-reviewed exit tickets, check-ins, and feedback forms.",
    allowedTools: ["GOOGLEFORMS_CREATE_FORM", "GOOGLEFORMS_GET_FORM", "GOOGLEFORMS_LIST_RESPONSES"],
  },
  {
    id: "canvas",
    toolkit: "canvas",
    label: "Canvas",
    category: "LMS",
    priority: "optional",
    authConfigEnv: "COMPOSIO_CANVAS_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Preview Canvas courses, assignments, announcements, and submission context for schools using Canvas.",
    allowedTools: [
      "CANVAS_LIST_COURSES",
      "CANVAS_LIST_ASSIGNMENTS",
      "CANVAS_LIST_ANNOUNCEMENTS",
      "CANVAS_CREATE_ASSIGNMENT",
      "CANVAS_CREATE_ANNOUNCEMENT",
    ],
  },
  {
    id: "blackboard",
    toolkit: "blackboard",
    label: "Blackboard",
    category: "LMS",
    priority: "optional",
    authConfigEnv: "COMPOSIO_BLACKBOARD_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Preview Blackboard course announcements, engagement, and LMS context for schools using Blackboard.",
    allowedTools: [
      "BLACKBOARD_LIST_COURSES",
      "BLACKBOARD_LIST_ANNOUNCEMENTS",
      "BLACKBOARD_CREATE_ANNOUNCEMENT",
      "BLACKBOARD_GET_COURSE_DETAILS",
    ],
  },
  {
    id: "outlook",
    toolkit: "outlook",
    label: "Outlook",
    category: "Microsoft schools",
    priority: "optional",
    authConfigEnv: "COMPOSIO_OUTLOOK_AUTH_CONFIG_ID",
    mode: "draft_only",
    purpose: "Support Microsoft-school email and calendar draft workflows without bypassing teacher review.",
    allowedTools: ["OUTLOOK_LIST_MESSAGES", "OUTLOOK_CREATE_DRAFT", "OUTLOOK_LIST_EVENTS", "OUTLOOK_CREATE_EVENT"],
  },
  {
    id: "microsoft_teams",
    toolkit: "microsoft_teams",
    label: "Microsoft Teams",
    category: "Microsoft schools",
    priority: "optional",
    authConfigEnv: "COMPOSIO_MICROSOFT_TEAMS_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Preview Teams meetings, channels, and class communication context for Microsoft-school deployments.",
    allowedTools: [
      "MICROSOFT_TEAMS_LIST_TEAMS",
      "MICROSOFT_TEAMS_LIST_CHANNELS",
      "MICROSOFT_TEAMS_LIST_CHATS",
      "MICROSOFT_TEAMS_CREATE_MEETING",
    ],
  },
  {
    id: "slack",
    toolkit: "slack",
    label: "Slack",
    category: "Team communication",
    priority: "optional",
    authConfigEnv: "COMPOSIO_SLACK_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Search staff/team context and prepare reviewed support or operations updates for school teams using Slack.",
    allowedTools: ["SLACK_LIST_CHANNELS", "SLACK_SEARCH_MESSAGES", "SLACK_FETCH_CONVERSATION_HISTORY"],
  },
  {
    id: "notion",
    toolkit: "notion",
    label: "Notion",
    category: "Knowledge base",
    priority: "optional",
    authConfigEnv: "COMPOSIO_NOTION_AUTH_CONFIG_ID",
    mode: "preview_first",
    purpose: "Prepare teacher-reviewed meeting notes, pilot feedback, product tasks, and school ops documentation.",
    allowedTools: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_CREATE_NOTION_PAGE", "NOTION_UPDATE_NOTION_PAGE"],
  },
];

export function splitEnvList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedToolsForIntegration(integration, env = process.env) {
  const overrideName = `COMPOSIO_${integration.id.toUpperCase()}_ALLOWED_TOOLS`;
  const override = splitEnvList(env[overrideName]);
  return override.length ? override : integration.allowedTools;
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
    toolkits: selected.map((integration) => ({
      toolkit: integration.toolkit,
      authConfigId: env[integration.authConfigEnv],
    })),
    allowedTools: Array.from(new Set(selected.flatMap((integration) => integration.allowedTools))).filter(Boolean),
    manuallyManageConnections: true,
  };
}
