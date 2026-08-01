import { assertIpRateLimit, json, methodNotAllowed, sendApiError } from "../_shared.js";
import {
  classLoopComposioServerName,
  composioIntegrationStatus,
} from "../../composio-integrations.js";

function emailConfig() {
  if (process.env.CLASSLOOP_SMTP_HOST) {
    return {
      configured: true,
      provider: process.env.CLASSLOOP_SMTP_PROVIDER || (process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply SMTP" : "SMTP"),
    };
  }

  if (process.env.CLASSLOOP_GMAIL_USER && process.env.CLASSLOOP_GMAIL_APP_PASSWORD) {
    return {
      configured: true,
      provider: process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply Gmail SMTP" : "Gmail SMTP",
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

function composioConfig() {
  const toolkits = composioIntegrationStatus(process.env);
  return {
    configured: Boolean(process.env.COMPOSIO_API_KEY),
    serverName: classLoopComposioServerName,
    mcpConfigIdConfigured: Boolean(process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID),
    userIdConfigured: Boolean(process.env.COMPOSIO_CLASSLOOP_USER_ID),
    configuredToolkitCount: toolkits.filter((toolkit) => toolkit.authConfigured).length,
    coreToolkitCount: toolkits.filter((toolkit) => toolkit.priority === "core").length,
    configuredCoreToolkitCount: toolkits.filter((toolkit) => toolkit.priority === "core" && toolkit.authConfigured).length,
    toolkits,
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
