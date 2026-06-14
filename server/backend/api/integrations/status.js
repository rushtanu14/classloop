import { assertIpRateLimit, json, methodNotAllowed, sendApiError } from "../_shared.js";

function emailConfig() {
  if (process.env.CLASSLOOP_SMTP_HOST) {
    const senderEmail = process.env.CLASSLOOP_NO_REPLY_EMAIL || process.env.CLASSLOOP_SMTP_FROM || process.env.CLASSLOOP_SMTP_USER;
    const senderName = process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop";
    return {
      configured: true,
      provider: process.env.CLASSLOOP_SMTP_PROVIDER || (process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply SMTP" : "SMTP"),
      from: senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail,
      replyTo: process.env.CLASSLOOP_REPLY_TO || undefined,
    };
  }

  if (process.env.CLASSLOOP_GMAIL_USER && process.env.CLASSLOOP_GMAIL_APP_PASSWORD) {
    const senderEmail = process.env.CLASSLOOP_NO_REPLY_EMAIL || process.env.CLASSLOOP_GMAIL_FROM || process.env.CLASSLOOP_GMAIL_USER;
    const senderName = process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop";
    return {
      configured: true,
      provider: process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply Gmail SMTP" : "Gmail SMTP",
      from: senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail,
      replyTo: process.env.CLASSLOOP_REPLY_TO || undefined,
    };
  }

  return {
    configured: false,
    provider: "Not configured",
  };
}

const localMcpCapabilities = {
  available: true,
  transport: "stdio",
  command: "node",
  args: ["dist-mcp/mcp/classloop-server.js"],
  redactionDefault: "strict",
  resources: [
    "classloop://workspace/summary",
    "classloop://sessions",
    "classloop://sessions/{sessionId}",
    "classloop://sessions/{sessionId}/report",
    "classloop://students/{studentId}/followups",
    "classloop://launch/status",
  ],
  tools: [
    "classloop_create_import_draft",
    "classloop_parse_transcript_preview",
    "classloop_prepare_classroom_post",
    "classloop_export_session_report",
    "classloop_add_teacher_note",
  ],
  prompts: [
    "review_session_before_publish",
    "find_student_followup_gaps",
    "summarize_alpha_feedback",
    "prepare_support_safe_bug_report",
    "launch_readiness_check",
  ],
};

const composioToolkits = [
  {
    id: "google_classroom",
    label: "Google Classroom",
    authConfigEnv: "COMPOSIO_GOOGLE_CLASSROOM_AUTH_CONFIG_ID",
    mode: "preview_first",
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
    label: "Zoom",
    authConfigEnv: "COMPOSIO_ZOOM_AUTH_CONFIG_ID",
    mode: "preview_first",
    allowedTools: [
      "ZOOM_LIST_MEETINGS",
      "ZOOM_GET_MEETING",
      "ZOOM_LIST_MEETING_PARTICIPANTS",
      "ZOOM_LIST_RECORDINGS",
      "ZOOM_GET_RECORDING",
    ],
  },
  {
    id: "gmail",
    label: "Gmail",
    authConfigEnv: "COMPOSIO_GMAIL_AUTH_CONFIG_ID",
    mode: "draft_only",
    allowedTools: ["GMAIL_CREATE_DRAFT", "GMAIL_FETCH_EMAILS", "GMAIL_SEARCH_EMAILS"],
  },
];

function composioConfig() {
  return {
    configured: Boolean(process.env.COMPOSIO_API_KEY),
    serverName: "classloop-preview-connectors",
    mcpConfigIdConfigured: Boolean(process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID),
    userIdConfigured: Boolean(process.env.COMPOSIO_CLASSLOOP_USER_ID),
    toolkits: composioToolkits.map((toolkit) => ({
      ...toolkit,
      authConfigured: Boolean(process.env[toolkit.authConfigEnv]),
    })),
  };
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, { endpoint: "integrations-status", limit: 120, windowMs: 60 * 1000 });
    if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
    return json(response, 200, {
      email: emailConfig(),
      localMcp: localMcpCapabilities,
      composio: composioConfig(),
    });
  } catch (error) {
    return sendApiError(response, error, "Unable to load integration status.");
  }
}
