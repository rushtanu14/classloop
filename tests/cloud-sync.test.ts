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
  cloudRequest,
  createCloudAccount,
  getBackendStatus,
  getCloudAuthState,
  getCloudSession,
  requestCloudEmailChange,
  signIntoCloud,
  signOutCloud,
} from "../src/cloud.js";

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

assert(shouldQueueCloudRequest("PUT"), "PUT cloud sync requests should be queued during network loss");
assert(shouldQueueCloudRequest("PATCH"), "PATCH cloud sync requests should be queued during network loss");
assert(!shouldQueueCloudRequest("GET"), "GET cloud sync requests should not be queued as writes");

const queuedAt = new Date("2026-05-12T12:00:00.000Z");
const queued = enqueueCloudOperation(
  [],
  { path: "/api/cloud-state", method: "put", body: JSON.stringify({ sessions: [] }) },
  queuedAt,
);
assertEqual(queued.length, 1, "offline cloud PUT should be queued once");
assertEqual(queued[0].method, "PUT", "queued cloud method should be normalized");
assertEqual(
  enqueueCloudOperation(queued, { path: "/api/cloud-state", method: "PUT", body: JSON.stringify({ sessions: [] }) }, queuedAt)
    .length,
  1,
  "duplicate offline cloud operations should be deduped",
);

const mixedQueue: QueuedCloudOperation[] = [
  queued[0],
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
assertEqual(flushed.flushed, 1, "offline queue flush should count successful replays");
assertEqual(flushed.remaining.length, 1, "failed cloud queue operations should remain queued");
assertEqual(flushed.remaining[0].attempts, 3, "failed cloud queue operations should increment attempts");

const backendStatus = getBackendStatus();
assertEqual(backendStatus.supabaseConfigured, false, "test environment should model absent Supabase browser credentials");
assertEqual(backendStatus.webReady, false, "absent Supabase credentials should keep hosted web readiness false");
assertEqual(await getCloudSession(), null, "desktop/local app should not require a Supabase session");
assertEqual((await getCloudAuthState()).status, "signed_out", "absent Supabase credentials should be signed out, not crashed");
assertEqual(
  (await signIntoCloud("teacher@classloop.test", "password")).ok,
  false,
  "cloud login should fail gracefully when Supabase credentials are absent",
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
