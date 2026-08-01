import assert from "node:assert/strict";
import {
  classLoopComposioUserId,
  classLoopIntegrationCallbackUrl,
  connectTeacherIntegration,
  connectionState,
  executeTeacherIntegrationReadTool,
  googleResourceId,
  integrationForId,
  previewPlanForIntegration,
  previewTeacherIntegration,
  requireTeacherIntegrationUser,
  safeComposioConnectUrl,
  sanitizeComposioPreviewData,
} from "../server/backend/composio-runtime.js";
import { validateIntegrationConnectPayload } from "../server/backend/api/integrations/connect.js";
import connectHandler from "../server/backend/api/integrations/connect.js";
import connectionsHandler from "../server/backend/api/integrations/connections.js";

function assertThrowsStatus(callback, statusCode, pattern) {
  assert.throws(callback, (error) => {
    assert.equal(error.statusCode, statusCode);
    assert.match(error.message, pattern);
    return true;
  });
}

function apiResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function invokeHandler(handler, request) {
  const response = apiResponse();
  await handler(
    {
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      ...request,
    },
    response,
  );
  return { status: response.statusCode, payload: JSON.parse(response.body || "{}"), headers: response.headers };
}

const teacher = { id: "11111111-2222-4333-8444-555555555555" };
const anotherTeacher = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
const teacherUserId = classLoopComposioUserId(teacher);

function profileSupabase(role) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
        }),
      }),
    }),
  };
}

assert.match(teacherUserId, /^classloop_[a-f0-9]{40}$/);
assert.equal(teacherUserId, classLoopComposioUserId(teacher), "Composio user id must be stable.");
assert.notEqual(teacherUserId, classLoopComposioUserId(anotherTeacher), "Teachers must be isolated.");
assert.equal(teacherUserId.includes(teacher.id), false, "Raw Supabase ids must not be sent as Composio user ids.");
assert.equal(await requireTeacherIntegrationUser(profileSupabase("teacher"), teacher), teacher);
await assert.rejects(
  () => requireTeacherIntegrationUser(profileSupabase("student"), teacher),
  (error) => error.statusCode === 403 && /teacher account/i.test(error.message),
);

assert.equal(
  safeComposioConnectUrl("https://connect.composio.dev/link/lk_example"),
  "https://connect.composio.dev/link/lk_example",
);
[
  "http://connect.composio.dev/link/test",
  "https://connect.composio.dev.evil.test/link/test",
  "https://connect.composio.dev:444/link/test",
  "https://user:password@connect.composio.dev/link/test",
  "https://backend.composio.dev/api/key",
  "javascript:alert(1)",
].forEach((url) => assert.equal(safeComposioConnectUrl(url), ""));

assert.equal(
  classLoopIntegrationCallbackUrl("zoom", {
    CLASSLOOP_PUBLIC_URL: "https://classloop.example/",
  }),
  "https://classloop.example/#/integrations?composio=connected&integration=zoom",
);
assertThrowsStatus(
  () => classLoopIntegrationCallbackUrl("zoom", { CLASSLOOP_PUBLIC_URL: "http://classloop.example" }),
  503,
  /callback/i,
);

const zoomIntegration = integrationForId("zoom", {
  COMPOSIO_ZOOM_AUTH_CONFIG_ID: "ac_zoom",
}).integration;
assertThrowsStatus(
  () => integrationForId("gmail", { COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_gmail" }),
  400,
  /unknown/i,
);
assertThrowsStatus(() => integrationForId("zoom", {}), 409, /administrator setup/i);

assert.deepEqual(connectionState([], zoomIntegration, "ac_zoom"), {
  connectionStatus: "needs_oauth",
  connected: false,
});
assert.deepEqual(
  connectionState(
    [
      {
        status: "ACTIVE",
        isDisabled: false,
        toolkit: { slug: "zoom" },
        authConfig: { id: "ac_zoom" },
        updatedAt: "2026-07-29T20:00:00.000Z",
      },
    ],
    zoomIntegration,
    "ac_zoom",
  ),
  {
    connectionStatus: "connected",
    connected: true,
    updatedAt: "2026-07-29T20:00:00.000Z",
  },
);
assert.equal(
  connectionState(
    [
      {
        status: "ACTIVE",
        isDisabled: false,
        toolkit: { slug: "zoom" },
        authConfig: { id: "ac_someone_else" },
      },
    ],
    zoomIntegration,
    "ac_zoom",
  ).connected,
  false,
  "A connection under another auth config must not unlock this integration.",
);

const runtimeEnv = {
  COMPOSIO_ZOOM_AUTH_CONFIG_ID: "ac_zoom",
  COMPOSIO_GOOGLE_DOCS_AUTH_CONFIG_ID: "ac_docs",
  COMPOSIO_GOOGLE_DRIVE_AUTH_CONFIG_ID: "ac_drive",
  COMPOSIO_OUTLOOK_AUTH_CONFIG_ID: "ac_outlook",
};
assert.deepEqual(previewPlanForIntegration("zoom", "", runtimeEnv), {
  integration: zoomIntegration,
  tool: "ZOOM_LIST_MEETINGS",
  arguments: { userId: "me", type: "scheduled", page_size: 20 },
});
assert.equal(
  previewPlanForIntegration("outlook", "", runtimeEnv).tool,
  "OUTLOOK_QUERY_EMAILS",
  "Outlook preview must read, never draft or send.",
);
assert.equal(
  previewPlanForIntegration("googledrive", "Algebra's review", runtimeEnv).arguments.q,
  "name contains 'Algebra\\'s review' and trashed = false",
);
assert.equal(
  googleResourceId(
    "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit",
    "document",
  ),
  "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
);
assertThrowsStatus(() => googleResourceId("https://evil.example/document/d/abcdefghijk", "document"), 400, /valid/i);
assertThrowsStatus(() => googleResourceId("", "document"), 400, /paste/i);

assert.deepEqual(validateIntegrationConnectPayload({ integrationId: "zoom" }), { integrationId: "zoom" });
assertThrowsStatus(
  () => validateIntegrationConnectPayload({ integrationId: "zoom", userId: "attacker" }),
  400,
  /unsupported field/i,
);
assert.equal((await invokeHandler(connectionsHandler, { method: "GET" })).status, 401);
assert.equal((await invokeHandler(connectHandler, { method: "POST" })).status, 401);
const methodResponse = await invokeHandler(connectHandler, { method: "GET" });
assert.equal(methodResponse.status, 405);
assert.equal(methodResponse.headers.Allow, "POST");

const sanitized = sanitizeComposioPreviewData({
  subject: "Class notes",
  access_token: "provider-secret",
  clientSecret: "provider-client-secret",
  privateKey: "provider-private-key",
  sessionToken: "provider-session-token",
  nested: { authorization: "Bearer secret", body: "safe" },
});
assert.deepEqual(sanitized.data, {
  subject: "Class notes",
  access_token: "[redacted]",
  clientSecret: "[redacted]",
  privateKey: "[redacted]",
  sessionToken: "[redacted]",
  nested: { authorization: "[redacted]", body: "safe" },
});
const prototypePayload = JSON.parse('{"safe":"yes","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
const sanitizedPrototypePayload = sanitizeComposioPreviewData(prototypePayload);
assert.equal(sanitizedPrototypePayload.data.safe, "yes");
assert.equal(Object.hasOwn(sanitizedPrototypePayload.data, "__proto__"), false);
assert.equal(Object.hasOwn(sanitizedPrototypePayload.data, "constructor"), false);
assert.equal({}.polluted, undefined, "Provider payloads must not mutate object prototypes.");
const oversized = sanitizeComposioPreviewData({
  items: Array.from({ length: 80 }, (_, index) => ({ index, value: "x".repeat(5_000) })),
});
assert.equal(oversized.truncated, true);
assert.equal(oversized.data.items.length <= 50, true);
assert.equal(
  JSON.stringify(oversized.data).length <= 200_000,
  true,
  "Sanitized provider previews must remain within the server response budget.",
);

const linkCalls = [];
const connectResult = await connectTeacherIntegration(teacher, "zoom", {
  env: {
    COMPOSIO_ZOOM_AUTH_CONFIG_ID: "ac_zoom",
    CLASSLOOP_PUBLIC_URL: "https://classloop.example",
  },
  composio: {
    connectedAccounts: {
      list: async (query) => {
        linkCalls.push({ type: "list", query });
        return { items: [] };
      },
      link: async (...args) => {
        linkCalls.push({ type: "link", args });
        return { redirectUrl: "https://connect.composio.dev/link/lk_test" };
      },
    },
  },
});
assert.equal(connectResult.connectionStatus, "authorization_required");
assert.equal(linkCalls[0].query.userIds[0], teacherUserId);
assert.equal(linkCalls[1].args[0], teacherUserId);
assert.equal(linkCalls[1].args[1], "ac_zoom");
assert.equal(linkCalls[1].args[2].experimental.accountType, "PRIVATE");

const executeCalls = [];
const previewResult = await previewTeacherIntegration(teacher, "zoom", "", {
  env: runtimeEnv,
  composio: {
    connectedAccounts: {
      list: async (query) => {
        executeCalls.push({ type: "list", query });
        return {
          items: [
            {
              id: "ca_teacher_zoom",
              status: "ACTIVE",
              isDisabled: false,
              toolkit: { slug: "zoom" },
              authConfig: { id: "ac_zoom" },
            },
          ],
        };
      },
    },
    tools: {
      getRawComposioToolBySlug: async (tool) => ({
        slug: tool,
        version: "20260721_00",
        toolkit: { slug: "zoom" },
      }),
      execute: async (tool, params) => {
        executeCalls.push({ type: "execute", tool, params });
        return {
          successful: true,
          data: { meetings: [{ topic: "Algebra" }], refresh_token: "must-not-leak" },
        };
      },
    },
  },
});
assert.equal(previewResult.tool, "ZOOM_LIST_MEETINGS");
assert.equal(previewResult.version, "20260721_00");
assert.equal(previewResult.data.refresh_token, "[redacted]");
assert.equal(Object.keys(previewResult).includes("selectionContext"), false);
assert.match(previewResult.selectionContext.connectionBinding, /^[a-f0-9]{64}$/);
const executeCall = executeCalls.find((call) => call.type === "execute");
assert.equal(executeCall.params.userId, teacherUserId);
assert.equal(executeCall.params.connectedAccountId, "ca_teacher_zoom");
assert.equal(executeCall.params.version, "20260721_00");
assert.equal("dangerouslySkipVersionCheck" in executeCall.params, false);

const detailCalls = [];
const detailResult = await executeTeacherIntegrationReadTool(
  teacher,
  "zoom",
  "ZOOM_GET_A_MEETING",
  { meetingId: 12345678901, show_previous_occurrences: false },
  {
    env: runtimeEnv,
    composio: {
      connectedAccounts: {
        list: async (query) => {
          detailCalls.push({ type: "list", query });
          return {
            items: [
              {
                id: "ca_teacher_zoom",
                status: "ACTIVE",
                isDisabled: false,
                toolkit: { slug: "zoom" },
                authConfig: { id: "ac_zoom" },
              },
            ],
          };
        },
      },
      tools: {
        getRawComposioToolBySlug: async (tool) => ({
          slug: tool,
          version: "20260721_00",
          toolkit: { slug: "zoom" },
        }),
        execute: async (tool, params) => {
          detailCalls.push({ type: "execute", tool, params });
          return {
            successful: true,
            data: {
              topic: "Algebra",
              clientSecret: "must-not-leak",
            },
          };
        },
      },
    },
  },
);
assert.equal(detailResult.tool, "ZOOM_GET_A_MEETING");
assert.equal(detailResult.version, "20260721_00");
assert.equal(detailResult.data.clientSecret, "[redacted]");
assert.match(detailResult.selectionContext.connectionBinding, /^[a-f0-9]{64}$/);
const detailExecute = detailCalls.find((call) => call.type === "execute");
assert.deepEqual(detailExecute.params.arguments, {
  meetingId: 12345678901,
  show_previous_occurrences: false,
});
assert.equal(detailExecute.params.connectedAccountId, "ca_teacher_zoom");
assert.equal(detailExecute.params.userId, teacherUserId);
assert.equal(detailExecute.params.version, "20260721_00");

await assert.rejects(
  () =>
    executeTeacherIntegrationReadTool(
      teacher,
      "zoom",
      "ZOOM_DELETE_A_MEETING",
      { meetingId: 123 },
      { env: runtimeEnv, composio: {} },
    ),
  (error) => error.statusCode === 409 && /allowlist|read-only/i.test(error.message),
);
await assert.rejects(
  () =>
    executeTeacherIntegrationReadTool(
      teacher,
      "zoom",
      "ZOOM_GET_A_MEETING",
      JSON.parse('{"meetingId":123,"__proto__":{"polluted":true}}'),
      { env: runtimeEnv, composio: {} },
    ),
  (error) => error.statusCode === 400 && /arguments/i.test(error.message),
);
await assert.rejects(
  () =>
    executeTeacherIntegrationReadTool(
      teacher,
      "zoom",
      "ZOOM_GET_A_MEETING",
      { meetingId: 123 },
      {
        env: runtimeEnv,
        composio: {
          connectedAccounts: {
            list: async () => ({
              items: [
                {
                  id: "ca_teacher_zoom",
                  status: "ACTIVE",
                  isDisabled: false,
                  toolkit: { slug: "zoom" },
                  authConfig: { id: "ac_zoom" },
                },
              ],
            }),
          },
          tools: {
            getRawComposioToolBySlug: async (tool) => ({
              slug: tool,
              version: "20260721_00",
              toolkit: { slug: "notion" },
            }),
          },
        },
      },
    ),
  (error) => error.statusCode === 502 && /version|tool/i.test(error.message),
);
await assert.rejects(
  () =>
    executeTeacherIntegrationReadTool(
      teacher,
      "zoom",
      "ZOOM_GET_A_MEETING",
      { meetingId: 123 },
      {
        env: runtimeEnv,
        composio: {
          connectedAccounts: {
            list: async () => ({
              items: [
                {
                  id: "ca_wrong_auth_config",
                  status: "ACTIVE",
                  isDisabled: false,
                  toolkit: { slug: "zoom" },
                  authConfig: { id: "ac_someone_else" },
                },
                {
                  id: "ca_disabled",
                  status: "ACTIVE",
                  isDisabled: true,
                  toolkit: { slug: "zoom" },
                  authConfig: { id: "ac_zoom" },
                },
              ],
            }),
          },
        },
      },
    ),
  (error) => error.statusCode === 409 && /connect/i.test(error.message),
);

console.log("Composio runtime checks passed.");
