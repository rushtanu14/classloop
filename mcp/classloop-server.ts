import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  addTeacherNotePreview,
  classLoopMcpPrompts,
  classLoopMcpResources,
  classLoopMcpTools,
  createImportDraftPreview,
  exportSessionReport,
  launchStatus,
  parseTranscriptPreview,
  prepareClassroomPost,
  readClassLoopWorkspace,
  redactionModeFromEnv,
  redactSession,
  sessionDetail,
  sessionList,
  sessionReport,
  studentFollowUps,
  workspaceSummary,
} from "./classloop-core.js";

const statePath = process.env.CLASSLOOP_MCP_STATE_PATH;
const mode = redactionModeFromEnv();

const server = new McpServer({
  name: "classloop-local",
  version: "0.1.0",
});

function workspace() {
  return readClassLoopWorkspace({ statePath, mode });
}

function jsonResource(uri: URL, payload: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function jsonTool(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function sessionResourceList() {
  return {
    resources: sessionList(workspace(), { mode, statePath }).map((session) => ({
      uri: `classloop://sessions/${encodeURIComponent(session.id)}`,
      name: session.id,
      title: session.title,
      mimeType: "application/json",
    })),
  };
}

server.registerResource(
  "workspace-summary",
  "classloop://workspace/summary",
  {
    title: "ClassLoop Workspace Summary",
    description: "Redacted summary of the local ClassLoop workspace and available MCP capabilities.",
    mimeType: "application/json",
  },
  (uri) => jsonResource(uri, workspaceSummary(workspace(), { mode, statePath })),
);

server.registerResource(
  "sessions",
  "classloop://sessions",
  {
    title: "ClassLoop Sessions",
    description: "Redacted list of ClassLoop sessions and draft session metadata.",
    mimeType: "application/json",
  },
  (uri) => jsonResource(uri, sessionList(workspace(), { mode, statePath })),
);

server.registerResource(
  "session-detail",
  new ResourceTemplate("classloop://sessions/{sessionId}", {
    list: sessionResourceList,
  }),
  {
    title: "ClassLoop Session Detail",
    description: "Redacted session detail without raw transcript text.",
    mimeType: "application/json",
  },
  (uri, variables) => jsonResource(uri, sessionDetail(workspace(), String(variables.sessionId), { mode, statePath })),
);

server.registerResource(
  "session-report",
  new ResourceTemplate("classloop://sessions/{sessionId}/report", {
    list: () => ({
      resources: sessionList(workspace(), { mode, statePath }).map((session) => ({
        uri: `classloop://sessions/${encodeURIComponent(session.id)}/report`,
        name: `${session.id}-report`,
        title: `${session.title} report`,
        mimeType: "application/json",
      })),
    }),
  }),
  {
    title: "ClassLoop Session Report",
    description: "Redacted teacher report with class-wide tasks, resources, and follow-up summaries.",
    mimeType: "application/json",
  },
  (uri, variables) => jsonResource(uri, sessionReport(workspace(), String(variables.sessionId), { mode, statePath })),
);

server.registerResource(
  "student-followups",
  new ResourceTemplate("classloop://students/{studentId}/followups", {
    list: undefined,
  }),
  {
    title: "ClassLoop Student Follow-ups",
    description: "Redacted follow-up summaries for one student id across sessions.",
    mimeType: "application/json",
  },
  (uri, variables) => jsonResource(uri, studentFollowUps(workspace(), String(variables.studentId), { mode, statePath })),
);

server.registerResource(
  "launch-status",
  "classloop://launch/status",
  {
    title: "ClassLoop Launch Status",
    description: "Launch readiness inputs with workspace and public route pointers.",
    mimeType: "application/json",
  },
  (uri) => jsonResource(uri, launchStatus(workspace(), { mode, statePath })),
);

const sessionTypeSchema = z.enum(["Math review", "CS workshop", "General classroom", "Club meeting", "Study group"]);

server.registerTool(
  "classloop_create_import_draft",
  {
    title: "Create Import Draft Preview",
    description: "Parse a transcript, roster, notes, and resources into a redacted ClassLoop session preview. Does not save or publish.",
    inputSchema: {
      title: z.string().optional(),
      template: sessionTypeSchema.optional(),
      transcript: z.string().min(1),
      roster: z.string().optional(),
      notes: z.string().optional(),
      resources: z.string().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  (input) => jsonTool(createImportDraftPreview(input, { mode, statePath })),
);

server.registerTool(
  "classloop_parse_transcript_preview",
  {
    title: "Parse Transcript Preview",
    description: "Return redacted speaker/resource counts and optional generated preview when a roster is provided.",
    inputSchema: {
      title: z.string().optional(),
      template: sessionTypeSchema.optional(),
      transcript: z.string().min(1),
      roster: z.string().optional(),
      notes: z.string().optional(),
      resources: z.string().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  (input) => jsonTool(parseTranscriptPreview(input, { mode, statePath })),
);

server.registerTool(
  "classloop_prepare_classroom_post",
  {
    title: "Prepare Classroom Post",
    description: "Build a class-wide Google Classroom post draft from an existing ClassLoop session. Does not post externally.",
    inputSchema: {
      sessionId: z.string().min(1),
      postType: z.enum(["announcement", "assignment", "material"]).optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      dueDate: z.string().optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  (input) => jsonTool(prepareClassroomPost(workspace(), input, { mode, statePath })),
);

server.registerTool(
  "classloop_export_session_report",
  {
    title: "Export Session Report",
    description: "Return a redacted ClassLoop session report as JSON or Markdown. Does not write files.",
    inputSchema: {
      sessionId: z.string().min(1),
      format: z.enum(["json", "markdown"]).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  (input) => jsonTool(exportSessionReport(workspace(), input, { mode, statePath })),
);

server.registerTool(
  "classloop_add_teacher_note",
  {
    title: "Add Teacher Note Preview",
    description: "Prepare a teacher-note change for review. This preview scaffold does not mutate the ClassLoop workspace.",
    inputSchema: {
      sessionId: z.string().min(1),
      note: z.string().min(1),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  (input) => jsonTool(addTeacherNotePreview(workspace(), input, { mode, statePath })),
);

function promptText(title: string, body: string) {
  return {
    description: title,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: body,
        },
      },
    ],
  };
}

server.registerPrompt(
  "review_session_before_publish",
  {
    title: "Review Session Before Publish",
    description: "Checklist prompt for reviewing a session before student publishing.",
    argsSchema: {
      sessionId: z.string().optional(),
    },
  },
  ({ sessionId }) =>
    promptText(
      "Review a ClassLoop session before publishing",
      [
        `Use ClassLoop MCP resources to review ${sessionId ? `session ${sessionId}` : "the current draft session"} before publishing.`,
        "Check class-wide recap accuracy, import warnings, student-specific follow-ups, resources, due dates, and publish audit gaps.",
        "Do not request raw transcript text unless the teacher explicitly opts into local redaction mode.",
      ].join("\n"),
    ),
);

server.registerPrompt(
  "find_student_followup_gaps",
  {
    title: "Find Student Follow-up Gaps",
    description: "Audit student follow-up completeness and clarity.",
    argsSchema: {
      sessionId: z.string().optional(),
    },
  },
  ({ sessionId }) =>
    promptText(
      "Find student follow-up gaps",
      [
        `Inspect ${sessionId ? `session ${sessionId}` : "the ClassLoop session list"} for missing or weak student follow-ups.`,
        "Prioritize absent, quiet, overdue, and unmatched students. Keep suggested changes teacher-reviewable.",
      ].join("\n"),
    ),
);

server.registerPrompt(
  "summarize_alpha_feedback",
  {
    title: "Summarize Alpha Feedback",
    description: "Prompt for grouping alpha feedback into product themes.",
  },
  () =>
    promptText(
      "Summarize ClassLoop alpha feedback",
      "Use redacted ClassLoop workspace context and support-safe notes to group alpha feedback into product themes, bugs, risks, and next fixes.",
    ),
);

server.registerPrompt(
  "prepare_support_safe_bug_report",
  {
    title: "Prepare Support-Safe Bug Report",
    description: "Prompt for turning an issue into a privacy-safe bug report.",
  },
  () =>
    promptText(
      "Prepare a support-safe ClassLoop bug report",
      "Create a bug report with environment, expected behavior, actual behavior, reproduction steps, and impact. Exclude raw transcripts, student emails, secrets, grades, and tokens.",
    ),
);

server.registerPrompt(
  "launch_readiness_check",
  {
    title: "Launch Readiness Check",
    description: "Prompt for launch readiness using local ClassLoop MCP resources.",
  },
  () =>
    promptText(
      "Run a ClassLoop launch readiness check",
      [
        "Use classloop://launch/status, public route expectations, release manifest status, and redacted workspace context.",
        "Report blockers, proof already present, and the smallest safe next action.",
      ].join("\n"),
    ),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

export { classLoopMcpPrompts, classLoopMcpResources, classLoopMcpTools, redactSession };
