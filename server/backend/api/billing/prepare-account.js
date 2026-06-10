import {
  assertIpRateLimit,
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
    return json(response, 409, {
      error: "Create and confirm your ClassLoop account before checkout. Use the confirmation email from account creation, then retry Upgrade to Pro.",
      email: payload.email,
    });
  } catch (error) {
    return sendApiError(response, error, "Unable to prepare billing account.");
  }
}
