import { assertIpRateLimit, getSupabaseAdmin, httpError, json, methodNotAllowed, readRawBody, requiredEnv } from "../_shared.js";
import { applySubscriptionProfileUpdate, currentPeriodEnd } from "./entitlements.js";
import { createStripeClient } from "./stripe-client.js";

const maxWebhookBodyBytes = 1_048_576;
const WEBHOOK_RATE_LIMIT = { endpoint: "stripe-webhook", limit: 300, windowMs: 60 * 1000 };

export const config = {
  api: {
    bodyParser: false,
  },
};

export function subscriptionIdFromInvoice(invoice) {
  const legacySubscription = invoice?.subscription;
  const parentSubscription = invoice?.parent?.subscription_details?.subscription;
  if (typeof legacySubscription === "string") return legacySubscription;
  if (legacySubscription?.id) return legacySubscription.id;
  if (typeof parentSubscription === "string") return parentSubscription;
  if (parentSubscription?.id) return parentSubscription.id;
  return "";
}

async function applySubscriptionUpdate(supabase, subscription, fallbackStatus = "active") {
  await applySubscriptionProfileUpdate(supabase, {
    customerId: String(subscription.customer || ""),
    userId: subscription.metadata?.supabaseUserId,
    tier: "pro",
    status: subscription.status || fallbackStatus,
    subscriptionId: subscription.id,
    currentPeriodEndIso: currentPeriodEnd(subscription),
  });
}

async function applyInvoiceSubscriptionUpdate(stripe, supabase, invoice, fallbackStatus) {
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await applySubscriptionUpdate(supabase, subscription, fallbackStatus);
}

export function checkoutSessionPaymentAccepted(session) {
  return session?.payment_status === "paid";
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, WEBHOOK_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
    const stripe = createStripeClient();
    const signature = request.headers["stripe-signature"];
    if (!signature) throw httpError(400, "Invalid Stripe webhook.");
    const rawBody = await readRawBody(request, {
      maxBytes: maxWebhookBodyBytes,
      name: "Stripe webhook payload",
    });
    const event = stripe.webhooks.constructEvent(rawBody, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
    const supabase = getSupabaseAdmin();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (!checkoutSessionPaymentAccepted(session)) {
        return json(response, 200, { received: true, ignored: "payment_not_accepted" });
      }
      const subscription =
        typeof session.subscription === "string"
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;
      if (subscription) {
        await applySubscriptionUpdate(supabase, subscription);
      } else {
        await applySubscriptionProfileUpdate(supabase, {
          customerId: String(session.customer || ""),
          userId: session.metadata?.supabaseUserId,
          tier: "pro",
          status: "active",
          subscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          currentPeriodEndIso: null,
        });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      await applySubscriptionUpdate(supabase, subscription, "canceled");
    }

    if (event.type === "invoice.paid") {
      await applyInvoiceSubscriptionUpdate(stripe, supabase, event.data.object, "active");
    }

    if (event.type === "invoice.payment_failed") {
      await applyInvoiceSubscriptionUpdate(stripe, supabase, event.data.object, "past_due");
    }

    return json(response, 200, { received: true });
  } catch (error) {
    const statusCode = error.statusCode || 400;
    const message = error.statusCode ? error.message : "Invalid Stripe webhook.";
    return json(response, statusCode, { error: message });
  }
}
