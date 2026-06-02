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
  code?: "email_confirmation_required";
  email?: string;
  redirectUrl?: string;
  session?: SupabaseSession | null;
};

export type CloudAccountOptions = {
  role?: CloudProfile["role"];
  name?: string;
  redirectRoute?: string;
  source?: string;
};

export const planCatalog = [
  {
    tier: "free" as const,
    name: "Free",
    price: "$0",
    detail: "1 generated session per day, transcript import, student accounts, recap email delivery, roster tools, and multi-device cloud sync.",
    sessionLimit: 1,
  },
  {
    tier: "pro" as const,
    name: "Pro",
    price: "$3.99/mo",
    detail: "Unlimited sessions, live in-person/online capture, delivery proof, private analytics, and JSON/CSV/print report exports.",
    sessionLimit: Number.POSITIVE_INFINITY,
  },
];

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const defaultStripePublishableKey =
  "pk_live_51TVPunCZ4fp9VxAWEaKlZRDYDXbXORPxpWfa8MQ4YbZ2HRGo82H0FroVWaYPDfRj6eImeDQB3c21umsipqTsSX0q005Nt906Yz";
const defaultStripePricingTableId = "prctbl_1TdX6hCZ4fp9VxAW8RoGLMmZ";
const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;
const stripePublishableKey = viteEnv.VITE_STRIPE_PUBLISHABLE_KEY || defaultStripePublishableKey;
const stripePricingTableId = viteEnv.VITE_STRIPE_PRICING_TABLE_ID || defaultStripePricingTableId;
const classLoopPublicUrl = viteEnv.VITE_CLASSLOOP_PUBLIC_URL || "https://classloop-followup.vercel.app";
const offlineQueueKey = "classloop:cloud-offline-queue:v1";
const manualProEmails = new Set(["rushilcpm02@gmail.com"]);

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

export function getStripePricingTableConfig() {
  return {
    pricingTableId: stripePricingTableId || "",
    publishableKey: stripePublishableKey || "",
  };
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!supabaseClient) supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}

function normalizeCloudEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getCloudEmailRedirectUrl(route = "billing") {
  const safeRoute = route.replace(/^[#/]+/, "").replace(/[^a-z0-9-?=&_]/gi, "") || "billing";
  const base =
    classLoopPublicUrl ||
    (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)
      ? window.location.origin
      : "https://classloop-followup.vercel.app");
  return `${base.replace(/\/+$/, "")}/#/${safeRoute}${safeRoute.includes("?") ? "&" : "?"}cloud=confirmed`;
}

function isEmailConfirmationError(error: unknown) {
  const text = error instanceof Error ? error.message : `${(error as { message?: string; code?: string })?.message ?? ""} ${(error as { code?: string })?.code ?? ""}`;
  return /email.*not.*confirmed|confirm.*email|email.*confirmation/i.test(text);
}

function emailConfirmationRequiredResult(
  email: string,
  message = "Confirm your email to finish linking this ClassLoop cloud account.",
  redirectRoute = "billing",
): CloudAuthResult {
  return {
    ok: false,
    code: "email_confirmation_required",
    email: normalizeCloudEmail(email),
    redirectUrl: getCloudEmailRedirectUrl(redirectRoute),
    message,
    session: null,
  };
}

export function planForTier(tier: PlanTier) {
  return planCatalog.find((plan) => plan.tier === tier) ?? planCatalog[0];
}

export function isPaidPlan(profile?: BillingProfile | null) {
  return Boolean(profile?.customerId && profile.tier === "pro" && profile.status === "active");
}

export function isManualProEmail(email = "") {
  return normalizeCloudEmail(email) ? manualProEmails.has(normalizeCloudEmail(email)) : false;
}

export function manualProBillingProfileForEmail(email = ""): BillingProfile | null {
  const normalized = normalizeCloudEmail(email);
  if (!isManualProEmail(normalized)) return null;
  return {
    tier: "pro",
    status: "active",
    customerId: `manual_pro_${normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
  };
}

export function isManualProBillingProfile(profile?: BillingProfile | null) {
  return Boolean(profile?.customerId?.startsWith("manual_pro_"));
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
  if (!client) return { ok: false, message: "Cloud sync is not available in this build." };
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (isEmailConfirmationError(error)) return emailConfirmationRequiredResult(email);
    if (/invalid|credential|password/i.test(error.message)) {
      return { ok: false, message: "Email or password is incorrect." };
    }
    return { ok: false, message: "Unable to sign in right now. Try again later." };
  }
  await flushQueuedCloudRequests();
  return { ok: true, message: "Cloud sync connected.", session: data.session };
}

export async function createCloudAccount(email: string, password: string, options: CloudAccountOptions = {}): Promise<CloudAuthResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: "Account creation is not available in this build." };
  const normalizedEmail = normalizeCloudEmail(email);
  const redirectUrl = getCloudEmailRedirectUrl(options.redirectRoute ?? "dashboard");
  const { data, error } = await client.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: {
        product: "ClassLoop",
        plan: "free",
        role: options.role,
        name: options.name,
        source: options.source ?? "classloop_account_creation",
      },
    },
  });
  if (error) {
    if (isEmailConfirmationError(error)) return emailConfirmationRequiredResult(normalizedEmail, undefined, options.redirectRoute ?? "dashboard");
    if (/already|registered|exists/i.test(error.message)) {
      return { ok: false, message: "That email already has a ClassLoop account. Sign in instead or reset the password." };
    }
    return { ok: false, message: "Unable to create this account right now. Try again later." };
  }
  await flushQueuedCloudRequests();
  if (!data.session) {
    return {
      ok: true,
      code: "email_confirmation_required",
      email: normalizedEmail,
      redirectUrl,
      message: "Cloud account created. Confirm your email, then sign in to ClassLoop with the same password.",
      session: null,
    };
  }
  return { ok: true, message: "Cloud account created and connected.", session: data.session };
}

export async function prepareBillingCloudAccount(
  email: string,
  password: string,
  role: "teacher",
  name = "",
): Promise<{ ready: true; email: string }> {
  const response = await fetch("/api/billing/prepare-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role, name }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback =
      response.status === 404
        ? "Payment setup is not available in this build."
        : "Unable to prepare payment right now.";
    throw new Error(data.error || fallback);
  }
  return data as { ready: true; email: string };
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
    throw new Error("Sign in to cloud sync before continuing.");
  }
  if (authState.status === "expired") {
    throw new Error("Cloud session expired. Sign in again to continue cloud sync.");
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
    throw new Error(data.error || "Cloud request failed. Try again later.");
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
