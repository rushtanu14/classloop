import {
  assertIpRateLimit,
  json,
  methodNotAllowed,
  originUrl,
  readJsonBody,
  requireUser,
  requiredEnv,
  sendApiError,
} from "../_shared.js";
import { validateCheckoutPayload } from "../validators.js";
import { isManualProCustomerId, isManualProEmail } from "./manual-pro.js";
import { createStripeClient } from "./stripe-client.js";

const CHECKOUT_RATE_LIMIT = { endpoint: "billing-checkout", limit: 30, windowMs: 10 * 60 * 1000 };
const CHECKOUT_USER_RATE_LIMIT = { endpoint: "billing-checkout", limit: 10, windowMs: 10 * 60 * 1000 };
const CHECKOUT_BODY_MAX_BYTES = 1_000;

export function checkoutReturnUrls(baseUrl) {
  return {
    success_url: `${baseUrl}/#/billing?billing=success`,
    cancel_url: `${baseUrl}/#/billing?billing=canceled`,
  };
}

export function embeddedCheckoutReturnUrl(baseUrl) {
  return `${baseUrl}/#/checkout?billing=success`;
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, CHECKOUT_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const { supabase, user } = await requireUser(request, response, { rateLimit: CHECKOUT_USER_RATE_LIMIT });
    const body = validateCheckoutPayload(
      await readJsonBody(request, {
        maxBytes: CHECKOUT_BODY_MAX_BYTES,
        name: "Checkout request",
      }),
    );
    const stripe = createStripeClient();
    const tier = body.tier;
    const price = requiredEnv("STRIPE_PRO_PRICE_ID");
    const baseUrl = process.env.CLASSLOOP_PUBLIC_URL || originUrl(request);
    const embedded = body?.uiMode === "embedded";
    if (isManualProEmail(user.email || "")) {
      return json(response, 409, { error: "Pro is already enabled for this ClassLoop account." });
    }
    const { data: profile } = await supabase
      .from("classloop_profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();
    const customerId =
      (profile?.stripe_customer_id && !isManualProCustomerId(profile.stripe_customer_id) ? profile.stripe_customer_id : "") ||
      (
        await stripe.customers.create({
          email: user.email || undefined,
          metadata: { supabaseUserId: user.id },
        })
      ).id;

    await supabase.from("classloop_profiles").upsert({
      id: user.id,
      email: user.email || "",
      role: "teacher",
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    });

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      ...(embedded
        ? {
            ui_mode: "embedded",
            return_url: embeddedCheckoutReturnUrl(baseUrl),
          }
        : checkoutReturnUrls(baseUrl)),
      subscription_data: {
        metadata: {
          supabaseUserId: user.id,
          tier,
        },
      },
      metadata: {
        supabaseUserId: user.id,
        tier,
      },
    });

    if (embedded && !checkout.client_secret) {
      throw new Error("Stripe did not return an embedded checkout client secret.");
    }

    return json(response, 200, embedded ? { clientSecret: checkout.client_secret } : { url: checkout.url });
  } catch (error) {
    return sendApiError(response, error, "Unable to create checkout session.");
  }
}
