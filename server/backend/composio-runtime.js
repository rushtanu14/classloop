import { createHash } from "node:crypto";
import { Composio } from "@composio/core";
import {
  allowedToolsForIntegration,
  classLoopComposioIntegrations,
} from "./composio-integrations.js";
import { httpError, requiredEnv } from "./api/_shared.js";

const ACTIVE_STATUS = "ACTIVE";
const PENDING_STATUSES = new Set(["INITIALIZING", "INITIATED"]);
const RECONNECT_STATUSES = new Set(["FAILED", "EXPIRED", "INACTIVE", "REVOKED"]);
const SECRET_KEY_PATTERN =
  /(?:^|_)(?:access_token|refresh_token|id_token|session_token|token|client_secret|consumer_secret|webhook_secret|signing_secret|secret|password|authorization|cookie|api_key|private_key|oauth|credential)(?:$|_)/i;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_PREVIEW_ARRAY_ITEMS = 50;
const MAX_PREVIEW_OBJECT_KEYS = 100;
const MAX_PREVIEW_STRING_CHARS = 20_000;
const MAX_PREVIEW_TOTAL_CHARS = 200_000;
const MAX_PREVIEW_NODES = 5_000;
const MAX_READ_ARGUMENT_BYTES = 20_000;
const MAX_READ_ARGUMENT_KEYS = 50;
const MAX_READ_ARGUMENT_ARRAY_ITEMS = 100;
const MAX_READ_ARGUMENT_STRING_CHARS = 2_000;

const previewPlans = Object.freeze({
  google_classroom: {
    tool: "GOOGLE_CLASSROOM_COURSES_LIST",
    arguments: () => ({ pageSize: 20 }),
  },
  zoom: {
    tool: "ZOOM_LIST_MEETINGS",
    arguments: () => ({ userId: "me", type: "scheduled", page_size: 20 }),
  },
  googlecalendar: {
    tool: "GOOGLECALENDAR_LIST_CALENDARS",
    arguments: () => ({ max_results: 20, show_deleted: false, show_hidden: false }),
  },
  googlemeet: {
    tool: "GOOGLEMEET_LIST_CONFERENCE_RECORDS",
    arguments: () => ({ page_size: 20 }),
  },
  googledrive: {
    tool: "GOOGLEDRIVE_FIND_FILE",
    arguments: (query) => ({
      q: query ? `name contains '${escapeGoogleQueryValue(query)}' and trashed = false` : "trashed = false",
      pageSize: 20,
    }),
  },
  googledocs: {
    tool: "GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT",
    arguments: (query) => ({
      document_id: googleResourceId(query, "document"),
      include_tables: true,
      include_headers: true,
      include_footers: true,
    }),
  },
  googlesheets: {
    tool: "GOOGLESHEETS_GET_SPREADSHEET_INFO",
    arguments: (query) => ({
      spreadsheet_id: googleResourceId(query, "spreadsheet"),
      include_grid_data: false,
    }),
  },
  googletasks: {
    tool: "GOOGLETASKS_LIST_TASK_LISTS",
    arguments: () => ({ maxResults: 20 }),
  },
  googleforms: {
    tool: "GOOGLEFORMS_GET_FORM",
    arguments: (query) => ({ formId: googleResourceId(query, "form") }),
  },
  canvas: {
    tool: "CANVAS_LIST_COURSES",
    arguments: () => ({ per_page: 20 }),
  },
  blackboard: {
    tool: "BLACKBOARD_GET_COURSES",
    arguments: () => ({ limit: 20 }),
  },
  outlook: {
    tool: "OUTLOOK_QUERY_EMAILS",
    arguments: () => ({ top: 20 }),
  },
  microsoft_teams: {
    tool: "MICROSOFT_TEAMS_LIST_USER_JOINED_TEAMS",
    arguments: () => ({ user_id: "me" }),
  },
  slack: {
    tool: "SLACK_LIST_ALL_CHANNELS",
    arguments: () => ({ limit: 50, exclude_archived: true }),
  },
  notion: {
    tool: "NOTION_SEARCH_NOTION_PAGE",
    arguments: (query) => ({ query, page_size: 20 }),
  },
});

let cachedClient;

function requestSignal(timeoutMs) {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function safeUserIdSource(user) {
  const userId = typeof user?.id === "string" ? user.id.trim() : "";
  if (!userId || userId.length > 256) {
    throw httpError(401, "Sign in before connecting an integration.");
  }
  return userId;
}

export function classLoopComposioUserId(user) {
  const digest = createHash("sha256").update(safeUserIdSource(user), "utf8").digest("hex");
  return `classloop_${digest.slice(0, 40)}`;
}

export async function requireTeacherIntegrationUser(supabase, user) {
  const { data, error } = await supabase
    .from("classloop_profiles")
    .select("role")
    .eq("id", safeUserIdSource(user))
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== "teacher") {
    throw httpError(403, "Only a teacher account can connect classroom integrations.");
  }
  return user;
}

export function createComposioRuntimeClient() {
  if (!cachedClient) {
    cachedClient = new Composio({
      apiKey: requiredEnv("COMPOSIO_API_KEY"),
      allowTracking: false,
      disableVersionCheck: true,
    });
  }
  return cachedClient;
}

export function integrationForId(integrationId, env = process.env) {
  const integration = classLoopComposioIntegrations.find((candidate) => candidate.id === integrationId);
  if (!integration || integration.id === "gmail" || integration.toolkit === "gmail") {
    throw httpError(400, "Unknown ClassLoop integration.");
  }
  const authConfigId = String(env[integration.authConfigEnv] || "").trim();
  if (!authConfigId) {
    throw httpError(409, `${integration.label} still needs administrator setup before a teacher can connect it.`);
  }
  return { integration, authConfigId };
}

function accountsForIntegration(accounts, integration, authConfigId) {
  return accounts.filter(
    (account) =>
      account?.toolkit?.slug === integration.toolkit &&
      account?.authConfig?.id === authConfigId,
  );
}

function newestAccount(accounts) {
  return [...accounts].sort((left, right) =>
    String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || "")),
  )[0];
}

function connectionBinding(userId, authConfigId, connectedAccountId) {
  return createHash("sha256")
    .update(`${userId}\0${authConfigId}\0${connectedAccountId}`, "utf8")
    .digest("hex");
}

async function activeTeacherIntegrationContext(user, integrationId, options = {}) {
  const env = options.env ?? process.env;
  const composio = options.composio ?? createComposioRuntimeClient();
  const { integration, authConfigId } = integrationForId(integrationId, env);
  const userId = classLoopComposioUserId(user);
  let accountsResponse;
  try {
    accountsResponse = await composio.connectedAccounts.list(
      {
        userIds: [userId],
        authConfigIds: [authConfigId],
        toolkitSlugs: [integration.toolkit],
        statuses: [ACTIVE_STATUS],
        limit: 20,
      },
      { signal: requestSignal(10_000) },
    );
  } catch {
    throw httpError(502, `${integration.label} connection status is temporarily unavailable.`);
  }
  const activeAccount = newestAccount(
    (accountsResponse?.items ?? []).filter(
      (account) =>
        account.status === ACTIVE_STATUS &&
        !account.isDisabled &&
        account?.toolkit?.slug === integration.toolkit &&
        account?.authConfig?.id === authConfigId,
    ),
  );
  if (!activeAccount?.id) {
    throw httpError(409, `Connect ${integration.label} before previewing records.`);
  }
  return {
    env,
    composio,
    integration,
    authConfigId,
    userId,
    activeAccount,
    connectionBinding: connectionBinding(userId, authConfigId, activeAccount.id),
  };
}

export function connectionState(accounts, integration, authConfigId) {
  const matching = accountsForIntegration(accounts, integration, authConfigId);
  const active = newestAccount(
    matching.filter((account) => account.status === ACTIVE_STATUS && !account.isDisabled),
  );
  if (active) {
    return { connectionStatus: "connected", connected: true, updatedAt: active.updatedAt || undefined };
  }

  const pending = newestAccount(
    matching.filter((account) => PENDING_STATUSES.has(account.status) && !account.isDisabled),
  );
  if (pending) {
    return { connectionStatus: "connecting", connected: false, updatedAt: pending.updatedAt || undefined };
  }

  const reconnect = newestAccount(
    matching.filter((account) => account.isDisabled || RECONNECT_STATUSES.has(account.status)),
  );
  if (reconnect) {
    return { connectionStatus: "reconnect", connected: false, updatedAt: reconnect.updatedAt || undefined };
  }

  return { connectionStatus: "needs_oauth", connected: false };
}

export function safeComposioConnectUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "connect.composio.dev" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    )
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function classLoopIntegrationCallbackUrl(integrationId, env = process.env) {
  const baseUrl = String(env.CLASSLOOP_PUBLIC_URL || "").trim();
  if (!baseUrl) throw httpError(503, "Hosted integration callback is not configured.");
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw httpError(503, "Hosted integration callback is not configured.");
  }
  if (url.protocol !== "https:") {
    throw httpError(503, "Hosted integration callback is not configured.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = `/integrations?composio=connected&integration=${encodeURIComponent(integrationId)}`;
  return url.toString();
}

export async function listTeacherConnections(user, options = {}) {
  const env = options.env ?? process.env;
  const composio = options.composio ?? createComposioRuntimeClient();
  const configured = classLoopComposioIntegrations
    .map((integration) => ({
      integration,
      authConfigId: String(env[integration.authConfigEnv] || "").trim(),
    }))
    .filter(({ authConfigId }) => Boolean(authConfigId));
  const userId = classLoopComposioUserId(user);
  let response = { items: [] };
  if (configured.length) {
    try {
      response = await composio.connectedAccounts.list(
        {
          userIds: [userId],
          toolkitSlugs: configured.map(({ integration }) => integration.toolkit),
          limit: 100,
        },
        { signal: requestSignal(10_000) },
      );
    } catch {
      throw httpError(502, "Connected integration status is temporarily unavailable.");
    }
  }
  const accounts = Array.isArray(response?.items) ? response.items : [];

  return configured.map(({ integration, authConfigId }) => ({
    integrationId: integration.id,
    toolkit: integration.toolkit,
    ...connectionState(accounts, integration, authConfigId),
  }));
}

export async function connectTeacherIntegration(user, integrationId, options = {}) {
  const env = options.env ?? process.env;
  const composio = options.composio ?? createComposioRuntimeClient();
  const { integration, authConfigId } = integrationForId(integrationId, env);
  const userId = classLoopComposioUserId(user);
  let existing;
  try {
    existing = await composio.connectedAccounts.list(
      {
        userIds: [userId],
        authConfigIds: [authConfigId],
        toolkitSlugs: [integration.toolkit],
        limit: 20,
      },
      { signal: requestSignal(10_000) },
    );
  } catch {
    throw httpError(502, `${integration.label} connection status is temporarily unavailable.`);
  }
  const state = connectionState(existing?.items ?? [], integration, authConfigId);
  if (state.connected) {
    return { integrationId, toolkit: integration.toolkit, ...state };
  }

  let request;
  try {
    request = await composio.connectedAccounts.link(
      userId,
      authConfigId,
      {
        callbackUrl: classLoopIntegrationCallbackUrl(integrationId, env),
        alias: `classloop-${integration.id}`,
        allowMultiple: false,
        experimental: { accountType: "PRIVATE" },
      },
      { signal: requestSignal(10_000) },
    );
  } catch {
    throw httpError(502, `${integration.label} sign-in could not be started right now.`);
  }
  const redirectUrl = safeComposioConnectUrl(request?.redirectUrl);
  if (!redirectUrl) {
    throw httpError(502, "The integration provider did not return a trusted sign-in link.");
  }
  return {
    integrationId,
    toolkit: integration.toolkit,
    connectionStatus: "authorization_required",
    connected: false,
    redirectUrl,
  };
}

function escapeGoogleQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function googleResourceId(value, resourceType) {
  const query = typeof value === "string" ? value.trim() : "";
  if (!query) {
    throw httpError(400, `Paste a Google ${resourceType} link or id before previewing.`);
  }
  if (/^[A-Za-z0-9_-]{10,200}$/.test(query)) return query;

  let url;
  try {
    url = new URL(query);
  } catch {
    throw httpError(400, `Paste a valid Google ${resourceType} link or id.`);
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw httpError(400, `Paste a valid Google ${resourceType} link or id.`);
  }
  const pathParts = url.pathname.split("/").filter(Boolean);
  const dIndex = pathParts.indexOf("d");
  const eIndex = pathParts.indexOf("e");
  const candidate =
    resourceType === "form" && dIndex >= 0 && pathParts[dIndex + 1] === "e"
      ? pathParts[dIndex + 2]
      : dIndex >= 0
        ? pathParts[dIndex + 1]
        : resourceType === "form" && eIndex >= 0
          ? pathParts[eIndex + 1]
          : "";
  if (!candidate || !/^[A-Za-z0-9_-]{10,200}$/.test(candidate)) {
    throw httpError(400, `Paste a valid Google ${resourceType} link or id.`);
  }
  return candidate;
}

export function previewPlanForIntegration(integrationId, query = "", env = process.env) {
  const { integration } = integrationForId(integrationId, env);
  const plan = previewPlans[integration.id];
  if (!plan) throw httpError(409, `${integration.label} does not have a safe preview action yet.`);
  const safeQuery = typeof query === "string" ? query.trim().slice(0, 240) : "";
  const allowedTools = allowedToolsForIntegration(integration, env);
  if (!allowedTools.includes(plan.tool)) {
    throw httpError(409, `${integration.label} preview is disabled by the server allowlist.`);
  }
  if (/(?:^|_)(?:CREATE|UPDATE|DELETE|SEND|POST|PUBLISH|SHARE)(?:_|$)/.test(plan.tool)) {
    throw httpError(409, `${integration.label} preview must use a read-only tool.`);
  }
  return {
    integration,
    tool: plan.tool,
    arguments: plan.arguments(safeQuery),
  };
}

function sanitizeValue(value, budget, depth = 0) {
  if (budget.remaining <= 0 || budget.nodesRemaining <= 0) {
    budget.truncated = true;
    return "[truncated]";
  }
  budget.nodesRemaining -= 1;
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    budget.remaining = Math.max(0, budget.remaining - 16);
    return value;
  }
  if (typeof value === "string") {
    const allowed = Math.max(0, Math.min(MAX_PREVIEW_STRING_CHARS, budget.remaining));
    const sanitized = value.slice(0, allowed);
    budget.remaining -= sanitized.length;
    if (sanitized.length < value.length) budget.truncated = true;
    return sanitized;
  }
  if (depth >= 8) {
    budget.truncated = true;
    return "[nested data omitted]";
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PREVIEW_ARRAY_ITEMS) budget.truncated = true;
    return value
      .slice(0, MAX_PREVIEW_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, budget, depth + 1));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > MAX_PREVIEW_OBJECT_KEYS) budget.truncated = true;
    const safe = {};
    for (const [key, entryValue] of entries.slice(0, MAX_PREVIEW_OBJECT_KEYS)) {
      const displayKey = key.slice(0, 200);
      if (displayKey.length < key.length) budget.truncated = true;
      if (FORBIDDEN_OBJECT_KEYS.has(displayKey.toLowerCase())) {
        budget.truncated = true;
        continue;
      }
      const keyCost = displayKey.length + 4;
      if (budget.remaining < keyCost || budget.nodesRemaining <= 0) {
        budget.truncated = true;
        break;
      }
      budget.remaining -= keyCost;
      const normalizedKey = displayKey
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .toLowerCase();
      if (SECRET_KEY_PATTERN.test(normalizedKey)) {
        safe[displayKey] = "[redacted]";
      } else {
        safe[displayKey] = sanitizeValue(entryValue, budget, depth + 1);
      }
    }
    return safe;
  }
  return String(value);
}

export function sanitizeComposioPreviewData(value) {
  const budget = {
    remaining: MAX_PREVIEW_TOTAL_CHARS,
    nodesRemaining: MAX_PREVIEW_NODES,
    truncated: false,
  };
  const data = sanitizeValue(value, budget);
  if (JSON.stringify(data).length > MAX_PREVIEW_TOTAL_CHARS) {
    return {
      data: { notice: "Provider preview exceeded ClassLoop's safe response limit." },
      truncated: true,
    };
  }
  return { data, truncated: budget.truncated };
}

function validateReadArguments(value, depth = 0) {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw httpError(400, "Integration read arguments are invalid.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > MAX_READ_ARGUMENT_STRING_CHARS) {
      throw httpError(400, "Integration read arguments are too large.");
    }
    return;
  }
  if (depth >= 6) throw httpError(400, "Integration read arguments are nested too deeply.");
  if (Array.isArray(value)) {
    if (value.length > MAX_READ_ARGUMENT_ARRAY_ITEMS) {
      throw httpError(400, "Integration read arguments are too large.");
    }
    value.forEach((entry) => validateReadArguments(entry, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > MAX_READ_ARGUMENT_KEYS) {
      throw httpError(400, "Integration read arguments are too large.");
    }
    for (const [key, entryValue] of entries) {
      if (!key || key.length > 120 || FORBIDDEN_OBJECT_KEYS.has(key.toLowerCase())) {
        throw httpError(400, "Integration read arguments contain an invalid field.");
      }
      validateReadArguments(entryValue, depth + 1);
    }
    return;
  }
  throw httpError(400, "Integration read arguments are invalid.");
}

function safeReadArguments(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Integration read arguments must be an object.");
  }
  validateReadArguments(value);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_READ_ARGUMENT_BYTES) {
    throw httpError(400, "Integration read arguments are too large.");
  }
  return value;
}

function attachSelectionContext(payload, binding) {
  Object.defineProperty(payload, "selectionContext", {
    enumerable: false,
    configurable: false,
    writable: false,
    value: Object.freeze({ connectionBinding: binding }),
  });
  return payload;
}

export async function executeTeacherIntegrationReadTool(
  user,
  integrationId,
  toolSlug,
  argumentsValue,
  options = {},
) {
  const env = options.env ?? process.env;
  const { integration } = integrationForId(integrationId, env);
  const allowedTools = allowedToolsForIntegration(integration, env);
  if (!allowedTools.includes(toolSlug)) {
    throw httpError(409, `${integration.label} read tool is disabled by the server allowlist.`);
  }
  if (/(?:^|_)(?:CREATE|UPDATE|DELETE|SEND|POST|PUBLISH|SHARE)(?:_|$)/.test(toolSlug)) {
    throw httpError(409, `${integration.label} detail import must use a read-only tool.`);
  }
  const args = safeReadArguments(argumentsValue);
  const context = await activeTeacherIntegrationContext(user, integrationId, options);
  let tool;
  try {
    tool = await context.composio.tools.getRawComposioToolBySlug(
      toolSlug,
      undefined,
      { signal: requestSignal(10_000) },
    );
  } catch {
    throw httpError(502, `${context.integration.label} read tool is temporarily unavailable.`);
  }
  if (
    tool?.slug !== toolSlug ||
    !tool?.version ||
    tool?.toolkit?.slug !== context.integration.toolkit
  ) {
    throw httpError(502, "The integration tool version could not be verified.");
  }
  const { activeAccount } = context;
  let result;
  try {
    result = await context.composio.tools.execute(
      toolSlug,
      {
        userId: context.userId,
        connectedAccountId: activeAccount.id,
        arguments: args,
        version: tool.version,
      },
      { signal: requestSignal(20_000) },
    );
  } catch {
    throw httpError(502, `${context.integration.label} could not return details right now.`);
  }
  if (!result?.successful) {
    throw httpError(502, `${context.integration.label} could not return details right now.`);
  }
  const sanitized = sanitizeComposioPreviewData(result.data ?? {});
  return attachSelectionContext({
    integrationId,
    toolkit: context.integration.toolkit,
    tool: toolSlug,
    version: tool.version,
    ...sanitized,
  }, context.connectionBinding);
}

export async function previewTeacherIntegration(user, integrationId, query = "", options = {}) {
  const env = options.env ?? process.env;
  const plan = previewPlanForIntegration(integrationId, query, env);
  return executeTeacherIntegrationReadTool(
    user,
    integrationId,
    plan.tool,
    plan.arguments,
    options,
  );
}
