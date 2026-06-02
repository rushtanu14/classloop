import {
  assertIpRateLimit,
  getSupabaseAdmin,
  httpError,
  json,
  methodNotAllowed,
  readJsonBody,
  sendApiError,
} from "../_shared.js";
import { validateBillingAccountPayload } from "../validators.js";
import { manualProProfileColumns } from "./manual-pro.js";

const PREPARE_ACCOUNT_RATE_LIMIT = { endpoint: "billing-prepare-account", limit: 12, windowMs: 10 * 60 * 1000 };
const PREPARE_ACCOUNT_BODY_MAX_BYTES = 1_200;

export function billingPreparedProfileRow(user, payload) {
  return {
    id: user.id,
    email: user.email || payload.email,
    role: payload.role,
    plan_tier: "free",
    subscription_status: "not_configured",
    no_training_on_student_data: true,
    updated_at: new Date().toISOString(),
    ...manualProProfileColumns(user.email || payload.email),
  };
}

function isExistingUserError(error) {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return /already|registered|exists|duplicate|unique/.test(text);
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, PREPARE_ACCOUNT_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);

    const payload = validateBillingAccountPayload(
      await readJsonBody(request, {
        maxBytes: PREPARE_ACCOUNT_BODY_MAX_BYTES,
        name: "Billing account",
      }),
    );
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        name: payload.name,
        role: payload.role,
        source: "classloop_billing_prepare",
      },
    });

    if (error) {
      if (isExistingUserError(error)) {
        throw httpError(409, "A cloud account already exists for this email. Sign in with that cloud password to continue.");
      }
      throw error;
    }

    if (!data?.user?.id) {
      throw httpError(502, "Cloud account was not created. Try again in a moment.");
    }

    const { error: profileError } = await supabase.from("classloop_profiles").upsert(billingPreparedProfileRow(data.user, payload));
    if (profileError) throw profileError;

    return json(response, 200, {
      ready: true,
      email: data.user.email || payload.email,
    });
  } catch (error) {
    return sendApiError(response, error, "Unable to prepare billing account.");
  }
}
