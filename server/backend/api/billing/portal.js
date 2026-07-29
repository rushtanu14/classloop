import { assertIpRateLimit, httpError, json, methodNotAllowed, requiredEnv, requireUser, sendApiError } from "../_shared.js";
import { isManualProCustomerId } from "./manual-pro.js";
import { createStripeClient } from "./stripe-client.js";

const PORTAL_RATE_LIMIT = { endpoint: "billing-portal", limit: 30, windowMs: 10 * 60 * 1000 };
const PORTAL_USER_RATE_LIMIT = { endpoint: "billing-portal", limit: 20, windowMs: 10 * 60 * 1000 };

export function billingPortalSessionOptions(profile = {}, baseUrl = "") {
  const profileRow = profile ?? {};
  const customerId = String(profileRow.stripe_customer_id ?? "").trim();
  const subscriptionId = String(profileRow.subscription_id ?? "").trim();
  if (!customerId) {
    throw httpError(400, "Complete Stripe Checkout before opening the billing portal.");
  }
  if (isManualProCustomerId(customerId)) {
    throw httpError(400, "Pro is enabled as included access for this account, so there is no Stripe subscription to cancel.");
  }
  if (!subscriptionId || isManualProCustomerId(subscriptionId)) {
    throw httpError(400, "No active Stripe subscription is attached to this account.");
  }

  const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, "");
  const billingReturnUrl = `${normalizedBaseUrl}/#/billing`;
  return {
    customer: customerId,
    return_url: billingReturnUrl,
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: {
        subscription: subscriptionId,
      },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: `${billingReturnUrl}?billing=subscription-updated`,
        },
      },
    },
  };
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, PORTAL_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: PORTAL_USER_RATE_LIMIT });
    const stripe = createStripeClient();
    const { data: profile, error } = await supabase
      .from("classloop_profiles")
      .select("stripe_customer_id, subscription_id")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;

    const baseUrl = requiredEnv("CLASSLOOP_PUBLIC_URL");
    const portal = await stripe.billingPortal.sessions.create(
      billingPortalSessionOptions(profile, baseUrl),
    );

    return json(response, 200, { url: portal.url });
  } catch (error) {
    return sendApiError(response, error, "Unable to open billing portal.");
  }
}
