#!/usr/bin/env node

import { Composio } from "@composio/core";
import {
  buildComposioCreatePayload,
  classLoopComposioServerName,
  composioIntegrationStatus,
  defaultClassLoopComposioUserId,
  selectedComposioIntegrations,
} from "../server/backend/composio-integrations.js";

const serverName = classLoopComposioServerName;
const userId = process.env.COMPOSIO_CLASSLOOP_USER_ID || defaultClassLoopComposioUserId;

function desiredConfig() {
  const toolkits = composioIntegrationStatus(process.env);
  return {
    serverName,
    userId,
    mcpConfigId: process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID || "",
    configuredToolkitCount: toolkits.filter((toolkit) => toolkit.authConfigured).length,
    toolkits,
    createPayload: buildComposioCreatePayload(process.env),
  };
}

function printPlan() {
  const config = desiredConfig();
  console.log(JSON.stringify(config, null, 2));
  if (!process.env.COMPOSIO_API_KEY) {
    console.error("Set COMPOSIO_API_KEY before running with --apply or --generate.");
  }
  const toolkits = composioIntegrationStatus(process.env);
  const missingCore = toolkits
    .filter((toolkit) => toolkit.priority === "core" && !toolkit.authConfigured)
    .map((toolkit) => toolkit.authConfigEnv);
  const missingOptional = toolkits
    .filter((toolkit) => toolkit.priority !== "core" && !toolkit.authConfigured)
    .map((toolkit) => toolkit.authConfigEnv);
  if (missingCore.length) {
    console.error(`Missing core auth config ids for: ${missingCore.join(", ")}`);
  }
  if (missingOptional.length) {
    console.error(`Optional auth config ids not set: ${missingOptional.join(", ")}`);
  }
}

async function applyConfig() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is required for --apply.");
  const selected = selectedComposioIntegrations(process.env);
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
