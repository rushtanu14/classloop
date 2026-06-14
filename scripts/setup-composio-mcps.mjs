#!/usr/bin/env node

import { Composio } from "@composio/core";

const serverName = "classloop-preview-connectors";
const userId = process.env.COMPOSIO_CLASSLOOP_USER_ID || "classloop-teacher-local";

const toolkits = [
  {
    id: "google_classroom",
    label: "Google Classroom",
    authEnv: "COMPOSIO_GOOGLE_CLASSROOM_AUTH_CONFIG_ID",
    purpose: "Preview course rosters, class announcements, coursework, and course materials before teacher-confirmed posting.",
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
    authEnv: "COMPOSIO_ZOOM_AUTH_CONFIG_ID",
    purpose: "Preview meeting metadata, participants, recordings, and transcript availability before importing into ClassLoop.",
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
    authEnv: "COMPOSIO_GMAIL_AUTH_CONFIG_ID",
    purpose: "Create teacher-reviewed draft recap emails and search a teacher-owned mailbox when explicitly requested.",
    allowedTools: ["GMAIL_CREATE_DRAFT", "GMAIL_FETCH_EMAILS", "GMAIL_SEARCH_EMAILS"],
  },
];

function selectedToolkits() {
  return toolkits
    .map((toolkit) => ({
      toolkit,
      authConfigId: process.env[toolkit.authEnv],
    }))
    .filter((entry) => entry.authConfigId);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function desiredConfig() {
  const selected = selectedToolkits();
  return {
    serverName,
    userId,
    mcpConfigId: process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID || "",
    toolkits: toolkits.map((toolkit) => ({
      id: toolkit.id,
      label: toolkit.label,
      authEnv: toolkit.authEnv,
      authConfigured: Boolean(process.env[toolkit.authEnv]),
      purpose: toolkit.purpose,
      allowedTools: toolkit.allowedTools,
    })),
    createPayload: {
      toolkits: selected.map((entry) => ({ toolkit: entry.toolkit.id, authConfigId: entry.authConfigId })),
      allowedTools: unique(selected.flatMap((entry) => entry.toolkit.allowedTools)),
      manuallyManageConnections: true,
    },
  };
}

function printPlan() {
  const config = desiredConfig();
  console.log(JSON.stringify(config, null, 2));
  if (!process.env.COMPOSIO_API_KEY) {
    console.error("Set COMPOSIO_API_KEY before running with --apply or --generate.");
  }
  const missing = toolkits.filter((toolkit) => !process.env[toolkit.authEnv]).map((toolkit) => toolkit.authEnv);
  if (missing.length) {
    console.error(`Missing auth config ids for: ${missing.join(", ")}`);
  }
}

async function applyConfig() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for --apply.");
  const selected = selectedToolkits();
  if (!selected.length) throw new Error("At least one COMPOSIO_*_AUTH_CONFIG_ID is required for --apply.");
  const config = desiredConfig();
  const composio = new Composio({ apiKey });
  const mcp = await composio.mcp.create(serverName, config.createPayload);
  const generated = await composio.mcp.generate(userId, mcp.id);
  console.log(
    JSON.stringify(
      {
        serverName,
        mcpConfigId: mcp.id,
        userId,
        url: generated.url,
        instructions: [
          "Save COMPOSIO_CLASSLOOP_MCP_CONFIG_ID to your server environment.",
          "Give MCP clients the generated URL only after the teacher has connected the matching Composio account.",
          "Keep direct publish/send actions disabled unless ClassLoop adds an in-app confirmation step.",
        ],
      },
      null,
      2,
    ),
  );
}

async function generateUrl() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const mcpConfigId = process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for --generate.");
  if (!mcpConfigId) throw new Error("COMPOSIO_CLASSLOOP_MCP_CONFIG_ID is required for --generate.");
  const composio = new Composio({ apiKey });
  const generated = await composio.mcp.generate(userId, mcpConfigId);
  console.log(JSON.stringify({ serverName, mcpConfigId, userId, url: generated.url }, null, 2));
}

const flags = new Set(process.argv.slice(2));

try {
  if (flags.has("--apply")) {
    await applyConfig();
  } else if (flags.has("--generate")) {
    await generateUrl();
  } else {
    printPlan();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

