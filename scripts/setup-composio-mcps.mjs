#!/usr/bin/env node

import { Composio } from "@composio/core";
import {
  buildComposioCreatePayload,
  classLoopComposioIntegrations,
  classLoopComposioServerName,
  composioIntegrationStatus,
  defaultClassLoopComposioUserId,
  selectedComposioIntegrations,
} from "../server/backend/composio-integrations.js";

const serverName = classLoopComposioServerName;
const userId = process.env.COMPOSIO_CLASSLOOP_USER_ID || defaultClassLoopComposioUserId;
const flags = new Set(process.argv.slice(2));

function generatedUrlOutput(url) {
  return flags.has("--show-url")
    ? { url }
    : {
        urlConfigured: Boolean(url),
        url: "[redacted; rerun with --show-url in a private terminal]",
      };
}

function redactedIdOutput(value, label = "id") {
  return flags.has("--show-ids")
    ? { [label]: value }
    : {
        [`${label}Configured`]: Boolean(value),
        [label]: value ? "[redacted; rerun with --show-ids in a private terminal]" : "",
      };
}

function redactedAuthConfigIdOutput(value) {
  return redactedIdOutput(value, "authConfigId");
}

function requireApiKey(action) {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) throw new Error(`COMPOSIO_API_KEY is required for ${action}.`);
  return apiKey;
}

function authConfigName(integration) {
  return `ClassLoop ${integration.label} (preview-only)`;
}

function configuredIntegrations() {
  return selectedComposioIntegrations(process.env);
}

function rawCreatePayload() {
  return buildComposioCreatePayload(process.env);
}

function desiredConfig() {
  const toolkits = composioIntegrationStatus(process.env);
  const createPayload = rawCreatePayload();
  return {
    serverName,
    userId,
    ...redactedIdOutput(process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID || "", "mcpConfigId"),
    configuredToolkitCount: toolkits.filter((toolkit) => toolkit.authConfigured).length,
    toolkits,
    createPayload: {
      ...createPayload,
      toolkits: createPayload.toolkits.map((toolkit) => ({
        toolkit: toolkit.toolkit,
        ...redactedAuthConfigIdOutput(toolkit.authConfigId),
      })),
    },
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

async function provisionManagedAuthConfigs() {
  const composio = new Composio({ apiKey: requireApiKey("--provision-managed") });
  const integrations = classLoopComposioIntegrations.filter(
    (integration) => integration.authProvisioning === "composio_managed_oauth",
  );
  const authConfigs = [];

  for (const integration of integrations) {
    const name = authConfigName(integration);
    const listed = await composio.authConfigs.list({ toolkit: integration.toolkit, limit: 100 });
    const existing = listed.items.find((item) => item.name === name && item.status === "ENABLED");
    if (existing) {
      authConfigs.push({
        toolkit: integration.toolkit,
        authConfigEnv: integration.authConfigEnv,
        ...redactedAuthConfigIdOutput(existing.id),
        status: "reused",
      });
      continue;
    }

    const created = await composio.authConfigs.create(integration.toolkit, {
      type: "use_composio_managed_auth",
      name,
      isEnabledForToolRouter: true,
      toolAccessConfig: {
        toolsForConnectedAccountCreation: integration.allowedTools,
      },
    });
    authConfigs.push({
      toolkit: integration.toolkit,
      authConfigEnv: integration.authConfigEnv,
      ...redactedAuthConfigIdOutput(created.id),
      status: "created",
    });
  }

  console.log(
    JSON.stringify(
      {
        authConfigs,
        customAuthStillRequired: classLoopComposioIntegrations
          .filter((integration) => integration.authProvisioning !== "composio_managed_oauth")
          .map((integration) => ({
            toolkit: integration.toolkit,
            authConfigEnv: integration.authConfigEnv,
            authProvisioning: integration.authProvisioning,
          })),
        instructions: [
          "Rerun with --show-ids in a private terminal, then save each authConfigId under its authConfigEnv in .env.local and the server hosting environment.",
          "Run with --apply after the desired auth config ids are present.",
          "Run with --connect --show-url to create teacher OAuth links.",
        ],
      },
      null,
      2,
    ),
  );
}

async function listConnections() {
  const composio = new Composio({ apiKey: requireApiKey("--connections") });
  const integrations = configuredIntegrations();
  if (!integrations.length) throw new Error("At least one COMPOSIO_*_AUTH_CONFIG_ID is required.");
  const result = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: integrations.map((integration) => integration.toolkit),
    limit: 100,
  });
  console.log(
    JSON.stringify(
      {
        userId,
        connections: result.items.map((item) => ({
          toolkit: item.toolkit.slug,
          status: item.status,
          alias: item.alias || undefined,
          isDisabled: item.isDisabled,
          updatedAt: item.updatedAt,
        })),
      },
      null,
      2,
    ),
  );
}

async function createConnectionLinks() {
  const composio = new Composio({ apiKey: requireApiKey("--connect") });
  const integrations = configuredIntegrations();
  if (!integrations.length) throw new Error("At least one COMPOSIO_*_AUTH_CONFIG_ID is required.");
  const existing = await composio.connectedAccounts.list({
    userIds: [userId],
    toolkitSlugs: integrations.map((integration) => integration.toolkit),
    limit: 100,
  });
  const callbackUrl = process.env.COMPOSIO_CLASSLOOP_CALLBACK_URL || undefined;
  const connections = [];

  for (const integration of integrations) {
    const active = existing.items.find(
      (item) => item.toolkit.slug === integration.toolkit && item.status === "ACTIVE" && !item.isDisabled,
    );
    if (active) {
      connections.push({ toolkit: integration.toolkit, status: "active" });
      continue;
    }
    const pending = existing.items.find(
      (item) =>
        item.toolkit.slug === integration.toolkit &&
        ["INITIALIZING", "INITIATED"].includes(item.status) &&
        !item.isDisabled,
    );
    if (pending && !flags.has("--force-links")) {
      connections.push({
        toolkit: integration.toolkit,
        status: "pending",
        note: "Rerun with --force-links --show-url only if the original OAuth link was lost or expired.",
      });
      continue;
    }
    const request = await composio.connectedAccounts.link(
      userId,
      process.env[integration.authConfigEnv],
      callbackUrl ? { callbackUrl } : undefined,
    );
    connections.push({
      toolkit: integration.toolkit,
      status: "authorization_required",
      ...generatedUrlOutput(request.redirectUrl),
    });
  }

  console.log(
    JSON.stringify(
      {
        userId,
        connections,
        instructions: [
          "Open each authorization_required URL and finish provider consent.",
          "Run with --connections afterward and require ACTIVE status before executing provider tools.",
        ],
      },
      null,
      2,
    ),
  );
}

async function applyConfig() {
  const apiKey = requireApiKey("--apply");
  const selected = configuredIntegrations();
  if (!selected.length) throw new Error("At least one COMPOSIO_*_AUTH_CONFIG_ID is required for --apply.");
  const createPayload = rawCreatePayload();
  const composio = new Composio({ apiKey });
  const existingMcpConfigId = process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID;
  let mcpConfigId;
  let operation;
  if (existingMcpConfigId) {
    // @composio/core 0.14.0's wrapper sends the legacy `custom_tools`
    // field on update. The current API expects `allowed_tools`; using the
    // generated client directly is required to remove a previously allowed
    // tool instead of leaving the old permission behind.
    await composio.client.mcp.update(existingMcpConfigId, {
      name: serverName,
      allowed_tools: createPayload.allowedTools,
      toolkits: selected.map((integration) => integration.toolkit),
      auth_config_ids: selected.map((integration) => process.env[integration.authConfigEnv]),
      managed_auth_via_composio: createPayload.manuallyManageConnections,
    });
    mcpConfigId = existingMcpConfigId;
    operation = "updated";
  } else {
    const mcp = await composio.mcp.create(serverName, createPayload);
    mcpConfigId = mcp.id;
    operation = "created";
  }
  const verifiedConfig = await composio.mcp.get(mcpConfigId);
  if (
    verifiedConfig.authConfigIds.length !== selected.length ||
    verifiedConfig.toolkits.length !== selected.length ||
    verifiedConfig.allowedTools.length !== createPayload.allowedTools.length
  ) {
    throw new Error(
      "Composio MCP verification failed: the remote toolkit, auth-config, or allowed-tool counts do not match the ClassLoop manifest.",
    );
  }
  const generated = await composio.mcp.generate(userId, mcpConfigId);
  console.log(
    JSON.stringify(
      {
        serverName,
        ...redactedIdOutput(mcpConfigId, "mcpConfigId"),
        operation,
        userId,
        verifiedToolkitCount: verifiedConfig.toolkits.length,
        verifiedAuthConfigCount: verifiedConfig.authConfigIds.length,
        verifiedAllowedToolCount: verifiedConfig.allowedTools.length,
        ...generatedUrlOutput(generated.url),
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
  const apiKey = requireApiKey("--generate");
  const mcpConfigId = process.env.COMPOSIO_CLASSLOOP_MCP_CONFIG_ID;
  if (!mcpConfigId) throw new Error("COMPOSIO_CLASSLOOP_MCP_CONFIG_ID is required for --generate.");
  const composio = new Composio({ apiKey });
  const generated = await composio.mcp.generate(userId, mcpConfigId);
  console.log(
    JSON.stringify({ serverName, ...redactedIdOutput(mcpConfigId, "mcpConfigId"), userId, ...generatedUrlOutput(generated.url) }, null, 2),
  );
}

try {
  if (flags.has("--provision-managed")) {
    await provisionManagedAuthConfigs();
  } else if (flags.has("--connections")) {
    await listConnections();
  } else if (flags.has("--connect")) {
    await createConnectionLinks();
  } else if (flags.has("--apply")) {
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
