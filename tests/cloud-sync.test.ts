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
  __setSupabaseClientForTests,
  buildStripePaymentLinkUrl,
  cloudRequest,
  createCloudAccount,
  ensureCloudAccount,
  getBackendStatus,
  getCloudAuthState,
  getCloudPasswordRecoveryRedirectUrl,
  getCloudSession,
  isStripeBillingPortalUrl,
  requestCloudPasswordReset,
  requestCloudEmailChange,
  resendCloudConfirmation,
  signIntoCloud,
  signOutCloud,
  updateCloudPassword,
} from "../src/cloud.js";
import { partitionSessionsAndDraftByRetention, partitionSessionsByRetention } from "../src/retention.js";
import {
  mergeOwnerCloudWorkspaceState,
  parseCloudWorkspaceResponse,
  reassignOwnerEmailInWorkspace,
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
  isStripeBillingPortalUrl("https://billing.stripe.com/p/session/cancel"),
  true,
  "Stripe billing portal URLs should be accepted",
);
assertEqual(
  isStripeBillingPortalUrl("https://billing.stripe.com.attacker.test/p/session/cancel"),
  false,
  "lookalike Stripe hostnames must be rejected",
);
assertEqual(
  isStripeBillingPortalUrl("http://billing.stripe.com/p/session/cancel"),
  false,
  "Stripe billing portal URLs must use HTTPS",
);
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

const reassignedWorkspace = reassignOwnerEmailInWorkspace(
  localWorkspace,
  "teacher-a@classloop.test",
  "teacher-a-new@classloop.test",
);
assertEqual(
  reassignedWorkspace.sessions.find((session) => session.id === "teacher-a-session")?.ownerEmail,
  "teacher-a-new@classloop.test",
  "local email changes must migrate owned sessions to the new address",
);
assertEqual(
  reassignedWorkspace.personalMeetings.find((meeting) => meeting.id === "teacher-a-meeting")?.ownerEmail,
  "teacher-a-new@classloop.test",
  "local email changes must migrate personal meetings",
);
assertEqual(
  reassignedWorkspace.draft?.ownerEmail,
  "teacher-a-new@classloop.test",
  "local email changes must migrate the active draft",
);
assertEqual(
  reassignedWorkspace.auditLog.find((entry) => entry.id === "teacher-a-audit")?.actorEmail,
  "teacher-a-new@classloop.test",
  "local email changes must migrate owned audit history",
);
assertEqual(
  reassignedWorkspace.sessions.find((session) => session.id === "teacher-b-session")?.ownerEmail,
  "teacher-b@classloop.test",
  "local email changes must not alter another account's workspace",
);

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
  (await signIntoCloud("bad email@example.com", "password")).code,
  "invalid_email",
  "cloud signin should reject an invalid email before checking Supabase configuration",
);
assertEqual(
  (await createCloudAccount("bad email@example.com", "password")).code,
  "invalid_email",
  "cloud signup should reject an invalid email before checking Supabase configuration",
);
assertEqual(
  (await createCloudAccount("bad()local@example.com", "password")).code,
  "invalid_email",
  "cloud signup should reject invalid unquoted local-part characters",
);
assertEqual(
  (await resendCloudConfirmation("bad email@example.com")).code,
  "invalid_email",
  "confirmation resend should reject an invalid email before checking Supabase configuration",
);
assertEqual(
  (await requestCloudEmailChange("teacher@classloop.test", "password", "bad email@example.com")).code,
  "invalid_email",
  "cloud email changes should reject an invalid new email before checking Supabase configuration",
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

const originalFetch = globalThis.fetch;
const testWindow = globalThis as typeof globalThis & {
  window?: {
    localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  };
};
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  },
});

let getSessionEmail = "teacher@classloop.test";
const resetPasswordRequests: Array<{ email: string; redirectTo?: string }> = [];
const updateUserRequests: Array<{ password?: string }> = [];
let signOutCalledWith: unknown = null;
let failSignOut = false;
let failUpdateUser = false;
let signupIdentityMode: "confirmed_existing" | "new_unconfirmed" = "confirmed_existing";
__setSupabaseClientForTests({
  auth: {
    getSession: async () => ({
      data: {
        session: {
          access_token: "mock-access-token",
          expires_at: futureExpiry,
          user: { email: getSessionEmail },
        },
      },
    }),
    resetPasswordForEmail: async (email: string, options: { redirectTo?: string }) => {
      resetPasswordRequests.push({ email, redirectTo: options.redirectTo });
      return { data: {}, error: null };
    },
    signUp: async ({ email }: { email: string }) => ({
      data: {
        session: null,
        user: {
          email,
          identities: signupIdentityMode === "confirmed_existing" ? [] : [{ id: "new-email-identity" }],
        },
      },
      error: null,
    }),
    updateUser: async (payload: { password?: string }) => {
      updateUserRequests.push(payload);
      if (failUpdateUser) return { data: { user: null }, error: new Error("expired recovery session") };
      return { data: { user: { email: getSessionEmail } }, error: null };
    },
    signOut: async (options?: unknown) => {
      signOutCalledWith = options;
      if (failSignOut) throw new Error("sign out failed");
      return { error: null };
    },
  },
} as never);

const passwordReset = await requestCloudPasswordReset(" Teacher@ClassLoop.test ");
assertEqual(passwordReset.ok, true, "cloud password reset should return a generic success for valid email");
assertEqual(
  passwordReset.code,
  "password_reset_requested",
  "cloud password reset should use a non-secret request status",
);
assertEqual(
  passwordReset.message,
  "If a ClassLoop cloud account exists for that email, a password reset email will be sent.",
  "cloud password reset should not reveal whether the account exists",
);
assertEqual(resetPasswordRequests[0]?.email, "teacher@classloop.test", "cloud password reset should normalize the email");
assertEqual(
  resetPasswordRequests[0]?.redirectTo,
  getCloudPasswordRecoveryRedirectUrl(),
  "cloud password reset should use the ClassLoop recovery redirect",
);
assertEqual(
  (await requestCloudPasswordReset("bad email@example.com")).code,
  "invalid_email",
  "cloud password reset should reject malformed emails before Supabase calls",
);
const shortPasswordUpdate = await updateCloudPassword("short");
assertEqual(shortPasswordUpdate.ok, false, "cloud password update should reject short passwords");
assertEqual(
  updateUserRequests.length,
  0,
  "cloud password update should reject short passwords before calling Supabase",
);
const passwordUpdate = await updateCloudPassword("new-cloud-password");
assertEqual(passwordUpdate.ok, true, "cloud password update should succeed for a recovery session");
assertEqual(
  passwordUpdate.message,
  "Cloud password updated. Sign in with the new password.",
  "cloud password update should return a safe success message",
);
assertEqual(
  updateUserRequests[0]?.password,
  "new-cloud-password",
  "cloud password update should pass only the new password to Supabase",
);
failUpdateUser = true;
const failedPasswordUpdate = await updateCloudPassword("another-cloud-password");
assertEqual(failedPasswordUpdate.ok, false, "cloud password update should handle Supabase failures safely");
assertEqual(
  failedPasswordUpdate.message,
  "Unable to update the cloud password. Request a fresh reset link and try again.",
  "cloud password update should not expose Supabase error details",
);
const existingSignup = await createCloudAccount("existing@classloop.test", "classloop-password");
assertEqual(
  existingSignup.code,
  "email_confirmation_required",
  "duplicate-safe signup responses should not reveal whether an account already exists",
);
signupIdentityMode = "new_unconfirmed";
const newUnconfirmedSignup = await createCloudAccount("new-unconfirmed@classloop.test", "classloop-password");
assertEqual(
  newUnconfirmedSignup.code,
  "email_confirmation_required",
  "no-session signup with a non-empty identities array should remain an unconfirmed new signup",
);
assertEqual(
  existingSignup.message,
  newUnconfirmedSignup.message,
  "new and duplicate no-session signups should use the same account-enumeration-safe message",
);

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
await assertRejects(
  cloudRequest("/api/cloud-state", { method: "GET" }, "other@classloop.test"),
  /does not match this ClassLoop login/i,
  "cloud requests should fail closed when the Supabase session email is not the active local account",
);
assertEqual(fetchCalls, 0, "cloud request email mismatch must fail before sending the API request");
await cloudRequest("/api/cloud-state", { method: "GET" }, "teacher@classloop.test");
assertEqual(fetchCalls, 1, "cloud request should continue when the session email matches the expected email");

storage.set("classloop:cloud-offline-queue:v1", JSON.stringify([{ body: "legacy-sensitive-data" }]));
failSignOut = true;
await assertRejects(signOutCloud(), /sign out failed/i, "signOutCloud should surface local Supabase sign-out failures");
assertEqual(
  testWindow.window?.localStorage.getItem("classloop:cloud-offline-queue:v1"),
  null,
  "signOutCloud should clear the legacy queue even when Supabase sign-out fails",
);
assertEqual(
  JSON.stringify(signOutCalledWith),
  JSON.stringify({ scope: "local" }),
  "signOutCloud should clear the local Supabase session only",
);

globalThis.fetch = originalFetch;
__setSupabaseClientForTests(null);
