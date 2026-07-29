import { createClient, type Session as SupabaseSession, type SupabaseClient } from "@supabase/supabase-js";
import {
  cloudAuthStateFromSession,
  shouldQueueCloudRequest,
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
  stripePaymentLinkConfigured: boolean;
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
  code?:
    | "not_configured"
    | "invalid_email"
    | "invalid_credentials"
    | "email_confirmation_required"
    | "password_reset_requested"
    | "signup_failed"
    | "signin_failed";
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
    detail: "Unlimited sessions, online meeting capture, delivery proof, private analytics, and JSON/CSV/print report exports.",
    sessionLimit: Number.POSITIVE_INFINITY,
  },
];

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;
const stripePaymentLinkUrl = viteEnv.VITE_STRIPE_PAYMENT_LINK_URL?.trim() ?? "";
const classLoopPublicUrl = viteEnv.VITE_CLASSLOOP_PUBLIC_URL || "https://classloop-followup.vercel.app";
const offlineQueueKey = "classloop:cloud-offline-queue:v1";
const passwordResetRequestMessage =
  "If a ClassLoop cloud account exists for that email, a password reset email will be sent.";

let supabaseClient: SupabaseClient | null = null;
let passwordRecoverySessionPromise: Promise<SupabaseSession | null> | null = null;

export function getBackendStatus(): BackendStatus {
  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
  const stripeConfigured = Boolean(stripePaymentLinkUrl);
  const stripeEmbeddedConfigured = false;
  const stripePaymentLinkConfigured = Boolean(stripePaymentLinkUrl);
  return {
    supabaseConfigured,
    stripeConfigured,
    stripeEmbeddedConfigured,
    stripePaymentLinkConfigured,
    webReady: supabaseConfigured && stripeConfigured,
  };
}

export function getStripePaymentLinkUrl() {
  return stripePaymentLinkUrl;
}

export function buildStripePaymentLinkUrl({
  email,
  clientReferenceId,
}: {
  email?: string;
  clientReferenceId?: string;
} = {}) {
  if (!stripePaymentLinkUrl) {
    throw new Error("Stripe Payment Link is not configured for this ClassLoop build.");
  }
  const url = new URL(stripePaymentLinkUrl);
  if (email) url.searchParams.set("prefilled_email", normalizeCloudEmail(email));
  if (clientReferenceId) url.searchParams.set("client_reference_id", clientReferenceId);
  return url.toString();
}

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
}

export function __setSupabaseClientForTests(client: SupabaseClient | null) {
  supabaseClient = client;
  passwordRecoverySessionPromise = null;
}

function normalizeCloudEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidAccountEmail(email: string) {
  const normalizedEmail = normalizeCloudEmail(email);
  if (
    !normalizedEmail ||
    normalizedEmail.length > 254 ||
    /\s/.test(normalizedEmail) ||
    /[\u0000-\u001f\u007f]/.test(normalizedEmail)
  ) {
    return false;
  }

  const parts = normalizedEmail.split("@");
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;
  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart) ||
    !domain ||
    domain.length > 253 ||
    domain.includes("..")
  ) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    return false;
  }
  return /^[a-z]{2,63}$/i.test(labels[labels.length - 1] ?? "");
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

export function getCloudPasswordRecoveryRedirectUrl() {
  const base =
    classLoopPublicUrl ||
    (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)
      ? window.location.origin
      : "https://classloop-followup.vercel.app");
  return `${base.replace(/\/+$/, "")}/?cloud=recovery`;
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
  void email;
  return false;
}

export function manualProBillingProfileForEmail(email = ""): BillingProfile | null {
  void email;
  return null;
}

export function isManualProBillingProfile(profile?: BillingProfile | null) {
  return Boolean(profile?.customerId?.startsWith("manual_pro_"));
}

export function isStripeBillingPortalUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com";
  } catch {
    return false;
  }
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

function supabaseErrorText(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "");
  return String(error);
}

function isInvalidCredentialsError(error: unknown) {
  const text = supabaseErrorText(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "invalid_credentials" || /invalid login credentials/i.test(text);
}

function isAccountExistsError(error: unknown) {
  const text = supabaseErrorText(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return (
    code === "user_already_exists" ||
    code === "email_exists" ||
    /user already registered|already registered|already exists|email.*already/i.test(text)
  );
}

function isEmailConfirmationError(error: unknown) {
  const text = supabaseErrorText(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "email_not_confirmed" || /email.*not.*confirmed|confirm.*email|email.*confirmation/i.test(text);
}

function clearLegacyCloudQueue() {
  const storage = cloudQueueStorage();
  if (!storage) return;
  storage.removeItem(offlineQueueKey);
}

function clearSupabaseLocalSessionStorage() {
  if (!supabaseUrl || typeof window === "undefined") return;
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    if (!projectRef) return;
    const storagePrefix = `sb-${projectRef}-auth-token`;
    [window.localStorage, window.sessionStorage].forEach((storage) => {
      Object.keys(storage)
        .filter((key) => key === storagePrefix || key.startsWith(`${storagePrefix}-`))
        .forEach((key) => storage.removeItem(key));
    });
  } catch {
    // Supabase sign-out remains the primary cleanup path.
  }
}

// Previous builds could leave raw request bodies in this plaintext queue.
// Clear it as soon as this module loads, including while the user is signed out.
clearLegacyCloudQueue();

export function getQueuedCloudOperationCount() {
  clearLegacyCloudQueue();
  return 0;
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
  clearLegacyCloudQueue();
  return { flushed: 0, remaining: [] };
}

export async function signIntoCloud(email: string, password: string): Promise<CloudAuthResult> {
  const normalizedEmail = normalizeCloudEmail(email);
  if (!isValidAccountEmail(normalizedEmail)) {
    return { ok: false, code: "invalid_email", message: "Enter a valid email address." };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, code: "not_configured", message: "Cloud sync is not available in this build." };
  const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) {
    if (isEmailConfirmationError(error)) return emailConfirmationRequiredResult(email);
    if (isInvalidCredentialsError(error)) {
      return {
        ok: false,
        code: "invalid_credentials",
        message: "Email not associated with a ClassLoop cloud account, or the cloud password is different.",
      };
    }
    return { ok: false, code: "signin_failed", message: "Unable to sign in to cloud sync right now." };
  }
  await flushQueuedCloudRequests();
  return { ok: true, message: "Cloud sync connected.", session: data.session };
}

export async function createCloudAccount(email: string, password: string, options: CloudAccountOptions = {}): Promise<CloudAuthResult> {
  const normalizedEmail = normalizeCloudEmail(email);
  if (!isValidAccountEmail(normalizedEmail)) {
    return { ok: false, code: "invalid_email", message: "Enter a valid email address." };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, code: "not_configured", message: "Account creation is not available in this build." };
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
    if (isAccountExistsError(error)) {
      return emailConfirmationRequiredResult(
        normalizedEmail,
        "Check your inbox for a confirmation link. If you already use this email in ClassLoop, sign in or request a password reset instead.",
        options.redirectRoute ?? "dashboard",
      );
    }
    if (isEmailConfirmationError(error)) return emailConfirmationRequiredResult(normalizedEmail, undefined, options.redirectRoute ?? "dashboard");
    return { ok: false, code: "signup_failed", message: "Unable to create a cloud account right now." };
  }
  await flushQueuedCloudRequests();
  if (!data.session) {
    return {
      ok: false,
      code: "email_confirmation_required",
      email: normalizedEmail,
      redirectUrl,
      message:
        "Check your inbox for a confirmation link. If you already use this email in ClassLoop, sign in or request a password reset instead.",
      session: null,
    };
  }
  return { ok: true, message: "Cloud account created and connected.", session: data.session };
}

export async function resendCloudConfirmation(email: string, redirectUrl = getCloudEmailRedirectUrl("dashboard")): Promise<CloudAuthResult> {
  const normalizedEmail = normalizeCloudEmail(email);
  if (!isValidAccountEmail(normalizedEmail)) {
    return { ok: false, code: "invalid_email", message: "Enter a valid email address." };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: "Cloud email is not available in this build." };
  const { error } = await client.auth.resend({
    type: "signup",
    email: normalizedEmail,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });
  if (error) {
    return {
      ok: false,
      email: normalizedEmail,
      redirectUrl,
      message: "Unable to resend the confirmation email right now. Check spam or try again in a minute.",
    };
  }
  return {
    ok: true,
    email: normalizedEmail,
    redirectUrl,
    message: "Confirmation email sent again. Check inbox, spam, promotions, and school-filtered mail.",
  };
}

export async function requestCloudPasswordReset(email: string): Promise<CloudAuthResult> {
  const normalizedEmail = normalizeCloudEmail(email);
  if (!isValidAccountEmail(normalizedEmail)) {
    return { ok: false, code: "invalid_email", message: "Enter a valid email address." };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, code: "not_configured", message: "Cloud password reset is not available in this build." };
  await client.auth
    .resetPasswordForEmail(normalizedEmail, {
      redirectTo: getCloudPasswordRecoveryRedirectUrl(),
    })
    .catch(() => undefined);
  return {
    ok: true,
    code: "password_reset_requested",
    email: normalizedEmail,
    redirectUrl: getCloudPasswordRecoveryRedirectUrl(),
    message: passwordResetRequestMessage,
  };
}

export async function updateCloudPassword(newPassword: string): Promise<CloudAuthResult> {
  if (newPassword.length < 8) {
    return { ok: false, message: "Use at least 8 characters for the new password." };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, code: "not_configured", message: "Cloud password update is not available in this build." };
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, message: "Unable to update the cloud password. Request a fresh reset link and try again." };
  }
  return { ok: true, message: "Cloud password updated. Sign in with the new password." };
}

export function getCloudPasswordRecoverySession(): Promise<SupabaseSession | null> {
  if (passwordRecoverySessionPromise) return passwordRecoverySessionPromise;
  if (typeof window === "undefined") return Promise.resolve(null);

  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const implicitAccessToken =
    hashParams.get("type") === "recovery" ? hashParams.get("access_token") : null;
  const implicitRefreshToken =
    hashParams.get("type") === "recovery" ? hashParams.get("refresh_token") : null;
  const pkceRecoveryCode =
    url.searchParams.get("cloud") === "recovery" ? url.searchParams.get("code") : null;
  if (!implicitAccessToken && !pkceRecoveryCode) return Promise.resolve(null);

  const client = getSupabaseClient();
  if (!client) return Promise.resolve(null);

  passwordRecoverySessionPromise = new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let subscription: { unsubscribe: () => void } | null = null;
    const finish = (session: SupabaseSession | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      subscription?.unsubscribe();
      resolve(session);
    };
    const authChange = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") finish(session);
    });
    subscription = authChange.data.subscription;
    if (settled) subscription.unsubscribe();

    if (pkceRecoveryCode) {
      void client.auth
        .exchangeCodeForSession(pkceRecoveryCode)
        .then(({ data, error }) => finish(error ? null : data.session))
        .catch(() => finish(null));
    } else {
      void client.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) {
            finish(null);
            return;
          }
          if (
            implicitAccessToken &&
            data.session?.access_token === implicitAccessToken
          ) {
            finish(data.session);
            return;
          }
          if (implicitAccessToken && implicitRefreshToken) {
            void client.auth
              .setSession({
                access_token: implicitAccessToken,
                refresh_token: implicitRefreshToken,
              })
              .then(({ data: recoveryData, error: recoveryError }) =>
                finish(recoveryError ? null : recoveryData.session),
              )
              .catch(() => finish(null));
          }
        })
        .catch(() => finish(null));
    }
    timeoutId = setTimeout(() => finish(null), 2_000);
  });
  return passwordRecoverySessionPromise;
}

export async function requestCloudEmailChange(
  currentEmail: string,
  password: string,
  nextEmail: string,
  redirectRoute = "dashboard",
): Promise<CloudAuthResult> {
  const normalizedCurrentEmail = normalizeCloudEmail(currentEmail);
  const normalizedNextEmail = normalizeCloudEmail(nextEmail);
  if (!isValidAccountEmail(normalizedCurrentEmail) || !isValidAccountEmail(normalizedNextEmail)) {
    return { ok: false, code: "invalid_email", message: "Enter a valid email address." };
  }
  const client = getSupabaseClient();
  if (!client) return { ok: false, message: "Cloud email changes are not available in this build." };
  const redirectUrl = getCloudEmailRedirectUrl(redirectRoute);

  let session = await getCloudSession();
  if (!session || normalizeCloudEmail(session.user.email ?? "") !== normalizedCurrentEmail) {
    const signInResult = await signIntoCloud(normalizedCurrentEmail, password);
    if (signInResult.code === "email_confirmation_required") {
      await resendCloudConfirmation(normalizedCurrentEmail, getCloudEmailRedirectUrl("dashboard")).catch(() => undefined);
      return {
        ...signInResult,
        message: "Confirm your current email before changing it. ClassLoop sent another confirmation email.",
      };
    }
    if (!signInResult.ok || !signInResult.session) {
      return { ok: false, message: signInResult.message || "Current password is incorrect." };
    }
    session = signInResult.session;
  }

  const { data, error } = await client.auth.updateUser(
    { email: normalizedNextEmail },
    { emailRedirectTo: redirectUrl },
  );
  if (error) {
    if (/already|registered|exists|duplicate/i.test(error.message)) {
      return { ok: false, message: "That email is already connected to a ClassLoop cloud account." };
    }
    if (isEmailConfirmationError(error)) {
      return emailConfirmationRequiredResult(normalizedCurrentEmail, "Confirm your current email before changing it.", redirectRoute);
    }
    return { ok: false, message: "Unable to request that email change right now." };
  }

  return {
    ok: false,
    code: "email_confirmation_required",
    email: normalizedNextEmail,
    redirectUrl,
    message: "Confirmation sent to the new email. Confirm it before using that address to sign in.",
    session: data.user ? session : null,
  };
}

export async function ensureCloudAccount(email: string, password: string, options: CloudAccountOptions = {}): Promise<CloudAuthResult> {
  const signInResult = await signIntoCloud(email, password);
  if (signInResult.ok) {
    return { ...signInResult, message: "Existing ClassLoop cloud account connected." };
  }
  if (signInResult.code === "not_configured" || signInResult.code === "email_confirmation_required") {
    return signInResult;
  }
  if (signInResult.code !== "invalid_credentials") {
    return signInResult;
  }

  const createResult = await createCloudAccount(email, password, options);
  return createResult;
}

export async function signOutCloud() {
  const client = getSupabaseClient();
  try {
    if (client) {
      const result = await client.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
    }
  } finally {
    clearSupabaseLocalSessionStorage();
    clearLegacyCloudQueue();
  }
}

export async function cloudRequest<T>(path: string, options: RequestInit = {}, expectedEmail?: string) {
  const session = await getCloudSession();
  const authState = cloudAuthStateFromSession(session);
  if (authState.status === "signed_out") {
    throw new Error("Sign in to cloud sync before continuing.");
  }
  if (authState.status === "expired") {
    throw new Error("Cloud session expired. Sign in again to continue cloud sync.");
  }
  if (expectedEmail && normalizeCloudEmail(authState.email) !== normalizeCloudEmail(expectedEmail)) {
    throw new Error("The connected cloud account does not match this ClassLoop login. Sign in again before continuing.");
  }

  let response: Response;
  try {
    response = await authorizedCloudFetch(path, options, authState.accessToken);
  } catch (error) {
    if (shouldQueueCloudRequest(options.method ?? "GET")) throw new Error("Cloud request failed.");
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Cloud request failed. Try again later.");
  }
  return data as T;
}

export async function getCloudProfile(expectedEmail?: string) {
  return cloudRequest<CloudProfile>("/api/profile", {}, expectedEmail);
}
