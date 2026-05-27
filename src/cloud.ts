import { createClient, type Session as SupabaseSession, type SupabaseClient } from "@supabase/supabase-js";
import {
  cloudAuthStateFromSession,
  enqueueCloudOperation,
  flushCloudOperationQueue,
  shouldQueueCloudRequest,
  type QueuedCloudOperation,
} from "./cloudSync.js";

export type PlanTier = "free" | "pro";

export type BillingProfile = {
  tier: PlanTier;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "not_configured"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused";
  customerId?: string;
  currentPeriodEnd?: string;
};

export type BackendStatus = {
  supabaseConfigured: boolean;
  stripeConfigured: boolean;
  stripeEmbeddedConfigured: boolean;
  webReady: boolean;
};

export type CloudProfile = {
  email: string;
  role: "teacher" | "student" | "individual";
  billingProfile: BillingProfile;
  noTrainingOnStudentData: boolean;
};

export type CloudAuthResult = {
  ok: boolean;
  message: string;
  session?: SupabaseSession | null;
};

export const planCatalog = [
  {
    tier: "free" as const,
    name: "Free",
    price: "$0",
    detail: "1 generated session per day, Google/Zoom workflow, student accounts, recap email delivery, and roster tools.",
    sessionLimit: 1,
  },
  {
    tier: "pro" as const,
    name: "Pro",
    price: "$3.99/mo",
    detail: "Unlimited generated sessions plus private analytics and JSON/CSV/print report exports.",
    sessionLimit: Number.POSITIVE_INFINITY,
  },
];

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;
const stripePublishableKey = viteEnv.VITE_STRIPE_PUBLISHABLE_KEY;
const offlineQueueKey = "classloop:cloud-offline-queue:v1";

let supabaseClient: SupabaseClient | null = null;

export function getBackendStatus(): BackendStatus {
  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
  const stripeConfigured = Boolean(viteEnv.VITE_STRIPE_PRO_PRICE_ID);
  const stripeEmbeddedConfigured = Boolean(stripePublishableKey);
  return {
    supabaseConfigured,
    stripeConfigured,
    stripeEmbeddedConfigured,
    webReady: supabaseConfigured && stripeConfigured,
  };
}

export function getStripePublishableKey() {
  return stripePublishableKey || "";
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!supabaseClient) supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}

export function planForTier(tier: PlanTier) {
  return planCatalog.find((plan) => plan.tier === tier) ?? planCatalog[0];
}

export function isPaidPlan(profile?: BillingProfile | null) {
  return Boolean(profile?.customerId && profile.tier === "pro" && profile.status === "active");
}

export async function getCloudSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export async function getCloudAuthState() {
  return cloudAuthStateFromSession(await getCloudSession());
}

function cloudQueueStorage() {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    return null;
  }
  return storage;
}

function readCloudQueue(): QueuedCloudOperation[] {
  const storage = cloudQueueStorage();
  if (!storage) {
    return [];
  }
  try {
    const parsed = JSON.parse(storage.getItem(offlineQueueKey) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCloudQueue(queue: QueuedCloudOperation[]) {
  const storage = cloudQueueStorage();
  if (!storage) return;
  if (!queue.length) {
    storage.removeItem(offlineQueueKey);
    return;
  }
  storage.setItem(offlineQueueKey, JSON.stringify(queue.slice(-25)));
}

export function getQueuedCloudOperationCount() {
  return readCloudQueue().length;
}

async function authorizedCloudFetch(path: string, operation: RequestInit, accessToken: string) {
  return fetch(path, {
    ...operation,
    headers: {
      "Content-Type": "application/json",
      ...(operation.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function flushQueuedCloudRequests() {
  const session = await getCloudSession();
  const authState = cloudAuthStateFromSession(session);
  if (authState.status !== "signed_in") {
    return { flushed: 0, remaining: readCloudQueue() };
  }

  const result = await flushCloudOperationQueue(readCloudQueue(), async (operation) => {
    const response = await authorizedCloudFetch(
      operation.path,
      {
        method: operation.method,
        body: operation.body,
      },
      authState.accessToken,
    );
    if (!response.ok) throw new Error(`Queued cloud request failed with status ${response.status}.`);
  });
  writeCloudQueue(result.remaining);
  return result;
}

export async function signIntoCloud(email: string, password: string): Promise<CloudAuthResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: "Add Supabase keys to .env.local before using cloud sync." };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: `Unable to sign in: ${error.message}` };
  await flushQueuedCloudRequests();
  return { ok: true, message: "Cloud sync connected.", session: data.session };
}

export async function createCloudAccount(email: string, password: string): Promise<CloudAuthResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: "Add Supabase keys to .env.local before creating cloud accounts." };
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { ok: false, message: `Unable to create cloud account: ${error.message}` };
  await flushQueuedCloudRequests();
  return { ok: true, message: "Cloud account created. Check email if confirmation is enabled.", session: data.session };
}

export async function signOutCloud() {
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
  writeCloudQueue([]);
}

export async function cloudRequest<T>(path: string, options: RequestInit = {}) {
  const session = await getCloudSession();
  const authState = cloudAuthStateFromSession(session);
  if (authState.status === "signed_out") {
    throw new Error("Sign in with Supabase before using hosted sync.");
  }
  if (authState.status === "expired") {
    throw new Error("Cloud session expired. Sign in again to continue hosted sync.");
  }

  let response: Response;
  try {
    response = await authorizedCloudFetch(path, options, authState.accessToken);
  } catch (error) {
    const method = options.method ?? "GET";
    if (shouldQueueCloudRequest(method)) {
      writeCloudQueue(
        enqueueCloudOperation(readCloudQueue(), {
          path,
          method,
          body: typeof options.body === "string" ? options.body : undefined,
        }),
      );
      throw new Error("Network unavailable. Queued cloud sync operation for retry.");
    }
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Cloud request failed with status ${response.status}.`);
  }
  return data as T;
}

export async function createCheckoutSession(tier: Exclude<PlanTier, "free">) {
  return cloudRequest<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

export async function createEmbeddedCheckoutSession(tier: Exclude<PlanTier, "free">) {
  return cloudRequest<{ clientSecret: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ tier, uiMode: "embedded" }),
  });
}

export async function createBillingPortalSession() {
  return cloudRequest<{ url: string }>("/api/billing/portal", { method: "POST" });
}

export async function getCloudProfile() {
  return cloudRequest<CloudProfile>("/api/profile");
}
