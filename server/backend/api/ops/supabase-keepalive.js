import { createClient } from "@supabase/supabase-js";
import { assertIpRateLimit, getSupabaseAdmin, httpError, json, methodNotAllowed, requiredEnv, sendApiError } from "../_shared.js";

const KEEPALIVE_RATE_LIMIT = { endpoint: "supabase-keepalive", limit: 10, windowMs: 60 * 1000 };
const USER_SEARCH_PAGE_SIZE = 100;
const USER_SEARCH_MAX_PAGES = 20;

function headerValue(headers, name) {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || "";
}

export function assertCronAuthorization(request) {
  const expected = requiredEnv("CRON_SECRET");
  const provided = headerValue(request.headers, "authorization");
  if (provided !== `Bearer ${expected}`) {
    throw httpError(401, "Unauthorized.");
  }
}

function keepaliveCredentials() {
  return {
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    anonKey: process.env.SUPABASE_ANON_KEY || requiredEnv("VITE_SUPABASE_ANON_KEY"),
    email: requiredEnv("SUPABASE_KEEPALIVE_EMAIL").trim().toLowerCase(),
    password: requiredEnv("SUPABASE_KEEPALIVE_PASSWORD"),
  };
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= USER_SEARCH_MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USER_SEARCH_PAGE_SIZE });
    if (error) throw error;
    const user = data?.users?.find((candidate) => (candidate.email || "").toLowerCase() === email);
    if (user) return user;
    if (!data?.users || data.users.length < USER_SEARCH_PAGE_SIZE) return null;
  }
  throw httpError(503, "Unable to confirm Supabase keepalive account.");
}

async function ensureKeepaliveUser(admin, email, password) {
  const existing = await findUserByEmail(admin, email);
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { classloop_system_account: "supabase_keepalive" },
      user_metadata: { purpose: "classloop_supabase_keepalive" },
    });
    if (error) throw error;
    return { created: true, userId: data.user?.id || null };
  }

  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    app_metadata: {
      ...existing.app_metadata,
      classloop_system_account: "supabase_keepalive",
    },
    user_metadata: {
      ...existing.user_metadata,
      purpose: "classloop_supabase_keepalive",
    },
  });
  if (error) throw error;
  return { created: false, userId: existing.id };
}

async function signInKeepaliveUser({ supabaseUrl, anonKey, email, password }) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error || httpError(503, "Supabase keepalive login failed.");
  await client.auth.signOut().catch(() => undefined);
  return data.user.id;
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, KEEPALIVE_RATE_LIMIT);
    if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
    assertCronAuthorization(request);

    const credentials = keepaliveCredentials();
    const admin = getSupabaseAdmin();
    const account = await ensureKeepaliveUser(admin, credentials.email, credentials.password);
    const signedInUserId = await signInKeepaliveUser(credentials);

    return json(response, 200, {
      ok: true,
      provider: "supabase",
      authLogin: "email_password",
      accountCreated: account.created,
      userMatched: Boolean(account.userId && account.userId === signedInUserId),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendApiError(response, error, "Unable to run Supabase keepalive.");
  }
}
