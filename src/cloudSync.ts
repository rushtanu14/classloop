export type CloudAuthState =
  | { status: "signed_out" }
  | { status: "signed_in"; email: string; accessToken: string; expiresAt?: number }
  | { status: "expired"; email: string; accessToken: string; expiresAt?: number };

export type CloudSessionLike = {
  access_token?: string | null;
  expires_at?: number | null;
  user?: {
    email?: string | null;
  } | null;
} | null;

export type CloudAuthEvent =
  | { type: "login"; session: CloudSessionLike }
  | { type: "logout" }
  | { type: "token_expired"; nowMs?: number }
  | { type: "refresh"; session: CloudSessionLike };

export type CloudStateSnapshot<T> = {
  state: T | null;
  updatedAt?: string;
};

export type CloudConflictResolution<T> = {
  winner: "local" | "remote" | "none";
  state: T | null;
  reason: "local_only" | "remote_only" | "local_newer" | "remote_newer" | "same_timestamp" | "empty";
};

export type QueuedCloudOperation = {
  id: string;
  path: string;
  method: string;
  body?: string;
  createdAt: string;
  attempts: number;
};

export function cloudAuthStateFromSession(session: CloudSessionLike, nowMs = Date.now()): CloudAuthState {
  if (!session?.access_token) return { status: "signed_out" };
  const email = session.user?.email ?? "";
  const expiresAt = typeof session.expires_at === "number" ? session.expires_at : undefined;
  if (expiresAt && expiresAt * 1000 <= nowMs) {
    return { status: "expired", email, accessToken: session.access_token, expiresAt };
  }
  return { status: "signed_in", email, accessToken: session.access_token, expiresAt };
}

export function transitionCloudAuthState(current: CloudAuthState, event: CloudAuthEvent): CloudAuthState {
  if (event.type === "logout") return { status: "signed_out" };
  if (event.type === "login" || event.type === "refresh") {
    return cloudAuthStateFromSession(event.session);
  }
  if (event.type === "token_expired" && current.status === "signed_in") {
    const nowMs = event.nowMs ?? Date.now();
    if (current.expiresAt && current.expiresAt * 1000 <= nowMs) {
      return {
        status: "expired",
        email: current.email,
        accessToken: current.accessToken,
        expiresAt: current.expiresAt,
      };
    }
  }
  return current;
}

function dateValue(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveCloudStateConflict<T>(
  local: CloudStateSnapshot<T>,
  remote: CloudStateSnapshot<T>,
): CloudConflictResolution<T> {
  if (!local.state && !remote.state) return { winner: "none", state: null, reason: "empty" };
  if (local.state && !remote.state) return { winner: "local", state: local.state, reason: "local_only" };
  if (!local.state && remote.state) return { winner: "remote", state: remote.state, reason: "remote_only" };

  const localTime = dateValue(local.updatedAt);
  const remoteTime = dateValue(remote.updatedAt);
  if (remoteTime > localTime) return { winner: "remote", state: remote.state, reason: "remote_newer" };
  if (localTime > remoteTime) return { winner: "local", state: local.state, reason: "local_newer" };
  return { winner: "local", state: local.state, reason: "same_timestamp" };
}

export function shouldQueueCloudRequest(method = "GET") {
  void method;
  return false;
}

export function enqueueCloudOperation(
  queue: QueuedCloudOperation[],
  operation: Pick<QueuedCloudOperation, "path" | "method" | "body">,
  now = new Date(),
) {
  void operation;
  void now;
  return queue;
}

export async function flushCloudOperationQueue(
  queue: QueuedCloudOperation[],
  send: (operation: QueuedCloudOperation) => Promise<void>,
) {
  const remaining: QueuedCloudOperation[] = [];
  let flushed = 0;

  for (const operation of queue) {
    try {
      await send(operation);
      flushed += 1;
    } catch {
      remaining.push({ ...operation, attempts: operation.attempts + 1 });
    }
  }

  return { flushed, remaining };
}
