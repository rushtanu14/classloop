import { assertIpRateLimit, json, methodNotAllowed, originUrl, requireUser, sendApiError } from "../_shared.js";
import { createStripeClient } from "./stripe-client.js";

const PORTAL_RATE_LIMIT = { endpoint: "billing-portal", limit: 30, windowMs: 10 * 60 * 1000 };
const PORTAL_USER_RATE_LIMIT = { endpoint: "billing-portal", limit: 20, windowMs: 10 * 60 * 1000 };

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, PORTAL_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: PORTAL_USER_RATE_LIMIT });
    const stripe = createStripeClient();
    const { data: profile, error } = await supabase
      .from("classloop_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile?.stripe_customer_id) {
      return json(response, 400, { error: "Complete Stripe Checkout before opening the billing portal." });
    }

    const baseUrl = process.env.CLASSLOOP_PUBLIC_URL || originUrl(request);
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/#/billing`,
    });

    return json(response, 200, { url: portal.url });
  } catch (error) {
    return sendApiError(response, error, "Unable to open billing portal.");
  }
}
