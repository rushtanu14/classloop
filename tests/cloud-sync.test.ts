import {
  cloudAuthStateFromSession,
  enqueueCloudOperation,
  flushCloudOperationQueue,
  resolveCloudStateConflict,
  shouldQueueCloudRequest,
  transitionCloudAuthState,
  type QueuedCloudOperation,
} from "../src/cloudSync.js";
import {
  buildStripePaymentLinkUrl,
  cloudRequest,
  createCloudAccount,
  ensureCloudAccount,
  getBackendStatus,
  getCloudAuthState,
  getCloudSession,
  requestCloudEmailChange,
  signIntoCloud,
  signOutCloud,
} from "../src/cloud.js";
import { partitionSessionsAndDraftByRetention, partitionSessionsByRetention } from "../src/retention.js";
import {
  mergeOwnerCloudWorkspaceState,
  parseCloudWorkspaceResponse,
  toOwnerCloudWorkspaceState,
} from "../src/cloudWorkspace.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

async function assertRejects(promise: Promise<unknown>, pattern: RegExp, message: string) {
  try {
    await promise;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(pattern.test(text), `${message}. Got: ${text}`);
    return;
  }
  throw new Error(`${message}. Expected rejection.`);
}

const nowMs = Date.now();
const futureExpiry = Math.floor((nowMs + 60 * 60_000) / 1000);
const pastExpiry = Math.floor((nowMs - 60_000) / 1000);

const signedIn = cloudAuthStateFromSession(
  {
    access_token: "token-live",
    expires_at: futureExpiry,
    user: { email: "teacher@classloop.test" },
  },
  nowMs,
);
assertEqual(signedIn.status, "signed_in", "valid Supabase session should be signed in");
assert(signedIn.status === "signed_in" && signedIn.email === "teacher@classloop.test", "signed-in state should preserve account email");

const expired = cloudAuthStateFromSession(
  {
    access_token: "token-expired",
    expires_at: pastExpiry,
    user: { email: "teacher@classloop.test" },
  },
  nowMs,
);
assertEqual(expired.status, "expired", "expired Supabase session should be detected before sync calls");

const loggedIn = transitionCloudAuthState({ status: "signed_out" }, {
  type: "login",
  session: {
    access_token: "token-live",
    expires_at: futureExpiry,
    user: { email: "teacher@classloop.test" },
  },
});
assertEqual(loggedIn.status, "signed_in", "login transition should enter signed-in state");
assertEqual(transitionCloudAuthState(loggedIn, { type: "logout" }).status, "signed_out", "logout transition should clear cloud auth state");
assertEqual(
  transitionCloudAuthState(loggedIn, { type: "token_expired", nowMs: futureExpiry * 1000 + 1_000 }).status,
  "expired",
  "token-expired transition should move signed-in sessions to expired",
);

const localState = { sessions: [{ id: "local-session" }] };
const remoteState = { sessions: [{ id: "remote-session" }] };
assertEqual(
  resolveCloudStateConflict(
    { state: localState, updatedAt: "2026-05-12T12:00:00.000Z" },
    { state: remoteState, updatedAt: "2026-05-12T12:05:00.000Z" },
  ).winner,
  "remote",
  "newer remote cloud state should win conflict resolution",
);
assertEqual(
  resolveCloudStateConflict(
    { state: localState, updatedAt: "2026-05-12T12:10:00.000Z" },
    { state: remoteState, updatedAt: "2026-05-12T12:05:00.000Z" },
  ).winner,
  "local",
  "newer local state should win conflict resolution",
);
assertEqual(
  resolveCloudStateConflict({ state: localState }, { state: remoteState }).reason,
  "same_timestamp",
  "missing timestamps should preserve local edits instead of silently overwriting",
);

const retentionResult = partitionSessionsByRetention(
  [
    { id: "expired", date: "2025-01-01" },
    { id: "kept", date: "2026-07-20" },
    { id: "invalid", date: "not-a-date" },
  ],
  30,
  new Date("2026-07-27T12:00:00.000Z"),
);
assertEqual(retentionResult.expired.length, 1, "retention should identify sessions older than the configured window");
assertEqual(retentionResult.expired[0].id, "expired", "retention should identify the correct expired session");
assertEqual(retentionResult.retained.length, 2, "recent and invalid-date sessions should be retained safely");

const retentionWithDraft = partitionSessionsAndDraftByRetention(
  [{ id: "published", date: "2026-07-20" }],
  { id: "expired-draft", date: "2025-01-01" },
  30,
  new Date("2026-07-27T12:00:00.000Z"),
);
assertEqual(retentionWithDraft.expired.length, 1, "retention should include an expired active draft");
assertEqual(retentionWithDraft.expired[0].id, "expired-draft", "retention should identify the expired draft");

const localWorkspace = {
  accounts: [{ passwordHash: "must-never-sync" }],
  billingProfile: { tier: "pro", customerId: "cus_server_owned" },
  sessions: [
    { id: "teacher-a-session", ownerEmail: "Teacher-A@ClassLoop.test" },
    { id: "teacher-b-session", ownerEmail: "teacher-b@classloop.test" },
    { id: "unowned-session" },
  ],
  personalMeetings: [
    { id: "teacher-a-meeting", ownerEmail: "teacher-a@classloop.test" },
    { id: "teacher-b-meeting", ownerEmail: "teacher-b@classloop.test" },
  ],
  draft: { id: "teacher-a-draft", ownerEmail: "teacher-a@classloop.test" } as {
    id: string;
    ownerEmail: string;
  } | null,
  demoLoaded: false,
  classGroups: [
    { id: "teacher-a-class", ownerEmail: "teacher-a@classloop.test" },
    { id: "teacher-b-class", ownerEmail: "teacher-b@classloop.test" },
  ],
  rosterTemplates: [
    { id: "teacher-a-roster", ownerEmail: "teacher-a@classloop.test" },
    { id: "teacher-b-roster", ownerEmail: "teacher-b@classloop.test" },
  ],
  privacySettings: { retentionDays: 365 },
  auditLog: [
    { id: "teacher-a-audit", actorEmail: "teacher-a@classloop.test" },
    { id: "teacher-b-audit", actorEmail: "teacher-b@classloop.test" },
  ],
};
const cloudWorkspace = toOwnerCloudWorkspaceState(localWorkspace, "teacher-a@classloop.test");
assertEqual("accounts" in cloudWorkspace, false, "cloud workspace DTO must remove local accounts");
assertEqual("billingProfile" in cloudWorkspace, false, "cloud workspace DTO must remove billing entitlements");
assertEqual(cloudWorkspace.sessions.length, 1, "cloud upload must include only the authenticated owner's sessions");
assertEqual(cloudWorkspace.sessions[0].id, "teacher-a-session", "cloud upload should preserve the current owner's session");
assertEqual(cloudWorkspace.personalMeetings.length, 1, "cloud upload must not include another owner's personal meetings");
assertEqual(cloudWorkspace.classGroups.length, 1, "cloud upload must not include another owner's classes");
assertEqual(cloudWorkspace.rosterTemplates.length, 1, "cloud upload must not include another owner's rosters");
assertEqual(cloudWorkspace.auditLog.length, 1, "cloud upload must not include another owner's audit history");

const mergedWorkspace = mergeOwnerCloudWorkspaceState(
  localWorkspace,
  {
    ...cloudWorkspace,
    sessions: [{ id: "teacher-a-cloud-session", ownerEmail: "teacher-a@classloop.test" }],
    personalMeetings: [{ id: "teacher-a-cloud-meeting", ownerEmail: "teacher-a@classloop.test" }],
    draft: null,
  },
  "teacher-a@classloop.test",
);
assertEqual(
  mergedWorkspace.sessions.some((session) => session.id === "teacher-b-session"),
  true,
  "cloud download must preserve another owner's sessions",
);
assertEqual(
  mergedWorkspace.sessions.some((session) => session.id === "teacher-a-session"),
  false,
  "cloud download should replace only the current owner's previous sessions",
);
assertEqual(
  mergedWorkspace.sessions.some((session) => session.id === "teacher-a-cloud-session"),
  true,
  "cloud download should merge the current owner's cloud sessions",
);
assertEqual(
  mergedWorkspace.personalMeetings.some((meeting) => meeting.id === "teacher-b-meeting"),
  true,
  "cloud download must preserve another owner's personal meetings",
);
assertEqual(mergedWorkspace.draft, null, "cloud download should clear only the current owner's missing cloud draft");

const rawCloudResponse = parseCloudWorkspaceResponse<typeof cloudWorkspace>(cloudWorkspace);
assertEqual(rawCloudResponse?.state.sessions?.length, 1, "raw legacy cloud snapshots should remain readable");
const wrappedCloudResponse = parseCloudWorkspaceResponse<typeof cloudWorkspace>({
  state: cloudWorkspace,
  updatedAt: "2026-07-27T12:00:00.000Z",
});
assertEqual(wrappedCloudResponse?.state.sessions?.length, 1, "wrapped cloud snapshots should remain readable");
assertEqual(
  wrappedCloudResponse?.updatedAt,
  "2026-07-27T12:00:00.000Z",
  "wrapped cloud snapshot timestamps should remain available",
);

assert(!shouldQueueCloudRequest("PUT"), "Sensitive cloud snapshots must not be persisted for silent replay");
assert(!shouldQueueCloudRequest("PATCH"), "Sensitive cloud writes must require an explicit retry");
assert(!shouldQueueCloudRequest("GET"), "GET cloud sync requests should not be queued as writes");

const queuedAt = new Date("2026-05-12T12:00:00.000Z");
const queued = enqueueCloudOperation(
  [],
  { path: "/api/cloud-state", method: "put", body: JSON.stringify({ sessions: [] }) },
  queuedAt,
);
assertEqual(queued.length, 0, "offline cloud PUT should not be persisted");
assertEqual(
  enqueueCloudOperation(queued, { path: "/api/cloud-state", method: "PUT", body: JSON.stringify({ sessions: [] }) }, queuedAt)
    .length,
  0,
  "offline cloud operations should remain unqueued",
);

const mixedQueue: QueuedCloudOperation[] = [
  {
    id: "cloud-op-failing",
    path: "/api/cloud-state",
    method: "PUT",
    body: JSON.stringify({ sessions: [{ id: "retry-me" }] }),
    createdAt: queuedAt.toISOString(),
    attempts: 2,
  },
];
const flushed = await flushCloudOperationQueue(mixedQueue, async (operation) => {
  if (operation.id === "cloud-op-failing") throw new Error("still offline");
});
assertEqual(flushed.flushed, 0, "legacy queue flush should not report a failed replay as successful");
assertEqual(flushed.remaining.length, 1, "failed cloud queue operations should remain queued");
assertEqual(flushed.remaining[0].attempts, 3, "failed cloud queue operations should increment attempts");

const backendStatus = getBackendStatus();
assertEqual(backendStatus.supabaseConfigured, false, "test environment should model absent Supabase browser credentials");
assertEqual(backendStatus.stripePaymentLinkConfigured, false, "Stripe Payment Links must require explicit build configuration");
assertEqual(backendStatus.webReady, false, "absent Supabase credentials should keep hosted web readiness false");
try {
  buildStripePaymentLinkUrl({ email: "teacher@classloop.test" });
  throw new Error("missing Stripe Payment Link configuration should reject URL construction");
} catch (error) {
  assert(
    /not configured/i.test(error instanceof Error ? error.message : String(error)),
    "missing Stripe Payment Link configuration should return a clear error",
  );
}
assertEqual(await getCloudSession(), null, "desktop/local app should not require a Supabase session");
assertEqual((await getCloudAuthState()).status, "signed_out", "absent Supabase credentials should be signed out, not crashed");
assertEqual(
  (await signIntoCloud("teacher@classloop.test", "password")).code,
  "not_configured",
  "cloud login should identify absent Supabase credentials",
);
assertEqual(
  (await signIntoCloud("teacher@classloop.test", "password")).ok,
  false,
  "cloud login should fail gracefully when Supabase credentials are absent",
);
assertEqual(
  (await createCloudAccount("teacher@classloop.test", "password")).code,
  "not_configured",
  "cloud signup should identify absent Supabase credentials",
);
assertEqual(
  (await ensureCloudAccount("teacher@classloop.test", "password")).code,
  "not_configured",
  "automatic cloud provisioning should not block local accounts when Supabase credentials are absent",
);
assertEqual(
  (await createCloudAccount("teacher@classloop.test", "password")).ok,
  false,
  "cloud signup should fail gracefully when Supabase credentials are absent",
);
assertEqual(
  (await requestCloudEmailChange("teacher@classloop.test", "password", "new-teacher@classloop.test")).ok,
  false,
  "cloud email changes should fail gracefully when Supabase credentials are absent",
);
await signOutCloud();
await assertRejects(
  cloudRequest("/api/cloud-state", { method: "PUT", body: "{}" }),
  /Sign in to cloud sync/i,
  "cloud sync writes without credentials should fail before touching the network",
);
