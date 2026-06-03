import { strict as assert } from "node:assert";
import {
  applySubscriptionProfileUpdate,
  currentPeriodEnd,
  planTierForSubscriptionStatus,
  subscriptionProfilePayload,
} from "../api/billing/entitlements.js";
import { stripeApiVersion } from "../api/billing/stripe-client.js";
import { checkoutReturnUrls, embeddedCheckoutReturnUrl } from "../api/billing/checkout.js";
import { checkoutSessionPaymentAccepted, checkoutSessionUserId, subscriptionIdFromInvoice } from "../api/billing/webhook.js";
import {
  applyManualProGrantToRow,
  isManualProCustomerId,
  manualProCustomerId,
  manualProProfileColumns,
} from "../api/billing/manual-pro.js";
import { billingProfileFromRow, profilePatchColumns } from "../api/profile.js";
import { isPaidPlan, manualProBillingProfileForEmail } from "../.test-build/src/cloud.js";

function fakeSupabase() {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        update(payload) {
          return {
            async eq(column, value) {
              calls.push({ table, payload, column, value });
              return { error: null };
            },
          };
        },
      };
    },
  };
}

assert.equal(isPaidPlan({ tier: "free", status: "not_configured" }), false, "Free accounts should not have Pro access");
assert.equal(
  isPaidPlan({ tier: "pro", status: "active" }),
  false,
  "Local Pro state without a Stripe customer must not unlock paid features",
);
assert.equal(
  isPaidPlan({ tier: "pro", status: "active", customerId: "cus_verified" }),
  true,
  "Active Pro subscriptions with a Stripe customer should unlock paid features",
);
assert.deepEqual(
  manualProBillingProfileForEmail(" RUSHILCPM02@gmail.com "),
  {
    tier: "pro",
    status: "active",
    customerId: "manual_pro_rushilcpm02_gmail_com",
  },
  "Rushil's owner email should resolve to a trusted manual Pro profile",
);
assert.equal(isPaidPlan(manualProBillingProfileForEmail("rushilcpm02@gmail.com")), true, "Manual owner Pro should unlock paid features");
assert.equal(manualProBillingProfileForEmail("teacher@classloop.test"), null, "Other emails should not receive manual Pro");
assert.equal(
  isPaidPlan({ tier: "pro", status: "trialing", customerId: "cus_trial" }),
  false,
  "Trialing subscriptions should not unlock paid features before payment is accepted",
);
assert.equal(isPaidPlan({ tier: "pro", status: "past_due" }), false, "Past-due Pro subscriptions should not unlock paid features");
assert.equal(isPaidPlan({ tier: "pro", status: "canceled" }), false, "Canceled Pro subscriptions should not unlock paid features");
assert.equal(isPaidPlan({ tier: "pro", status: "unpaid" }), false, "Unpaid Pro subscriptions should not unlock paid features");
assert.equal(isPaidPlan({ tier: "pro", status: "paused" }), false, "Paused Pro subscriptions should not unlock paid features");

assert.equal(planTierForSubscriptionStatus("pro", "active"), "pro");
assert.equal(planTierForSubscriptionStatus("pro", "trialing"), "free");
assert.equal(planTierForSubscriptionStatus("pro", "past_due"), "free");
assert.equal(planTierForSubscriptionStatus("pro", "canceled"), "free");
assert.equal(planTierForSubscriptionStatus("pro", "unpaid"), "free");
assert.equal(planTierForSubscriptionStatus("pro", "incomplete_expired"), "free");

assert.equal(
  currentPeriodEnd({ current_period_end: 1_778_544_000 }),
  "2026-05-12T00:00:00.000Z",
  "Stripe subscription period seconds should be stored as ISO time",
);
assert.equal(currentPeriodEnd({}), null, "missing Stripe subscription period should stay null");
assert.equal(stripeApiVersion, "2026-04-22.dahlia", "Stripe SDK should use the current pinned API version");
assert.equal(subscriptionIdFromInvoice({ subscription: "sub_legacy" }), "sub_legacy", "legacy invoice subscription ids should be supported");
assert.equal(
  subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_parent" } } }),
  "sub_parent",
  "latest invoice parent subscription ids should be supported",
);
assert.deepEqual(
  checkoutReturnUrls("https://classloop-followup.vercel.app"),
  {
    success_url: "https://classloop-followup.vercel.app/#/billing?billing=success",
    cancel_url: "https://classloop-followup.vercel.app/#/billing?billing=canceled",
  },
  "Stripe Checkout must return users to the billing verifier, not directly grant Pro on the dashboard",
);
assert.equal(
  embeddedCheckoutReturnUrl("https://classloop-followup.vercel.app"),
  "https://classloop-followup.vercel.app/#/checkout?billing=success",
  "Hidden checkout verifier route should still resolve to the billing success flow",
);
assert.equal(
  checkoutSessionUserId({ client_reference_id: "supabase-user-from-payment-link" }),
  "supabase-user-from-payment-link",
  "Stripe Payment Link checkout sessions should map client_reference_id to the Supabase profile",
);
assert.equal(
  checkoutSessionUserId({
    client_reference_id: "fallback-client-ref",
    metadata: { supabaseUserId: "metadata-user-id" },
  }),
  "metadata-user-id",
  "Explicit Checkout metadata should win over Payment Link client_reference_id",
);
assert.equal(checkoutSessionPaymentAccepted({ payment_status: "paid" }), true, "paid Checkout sessions may update entitlements");
assert.equal(
  checkoutSessionPaymentAccepted({ payment_status: "no_payment_required" }),
  false,
  "Checkout sessions with no accepted payment must not update entitlements",
);
assert.equal(
  checkoutSessionPaymentAccepted({ payment_status: "unpaid" }),
  false,
  "unpaid Checkout sessions must not update Pro entitlements",
);

const activePayload = subscriptionProfilePayload({
  customerId: "cus_active",
  tier: "pro",
  status: "active",
  subscriptionId: "sub_active",
  currentPeriodEndIso: "2026-06-12T00:00:00.000Z",
  updatedAt: "2026-05-12T12:00:00.000Z",
});
assert.deepEqual(activePayload, {
  stripe_customer_id: "cus_active",
  subscription_id: "sub_active",
  plan_tier: "pro",
  subscription_status: "active",
  current_period_end: "2026-06-12T00:00:00.000Z",
  updated_at: "2026-05-12T12:00:00.000Z",
});

const canceledPayload = subscriptionProfilePayload({
  customerId: "cus_canceled",
  tier: "pro",
  status: "canceled",
  subscriptionId: "sub_canceled",
  currentPeriodEndIso: "2026-06-12T00:00:00.000Z",
  updatedAt: "2026-05-12T12:00:00.000Z",
});
assert.equal(canceledPayload.plan_tier, "free", "Webhook cancellation should downgrade backend-owned entitlement to Free");
assert.equal(canceledPayload.subscription_status, "canceled");

const userTargetSupabase = fakeSupabase();
await applySubscriptionProfileUpdate(userTargetSupabase, {
  customerId: "cus_user",
  userId: "supabase-user-1",
  tier: "pro",
  status: "active",
  subscriptionId: "sub_active",
  currentPeriodEndIso: "2026-06-12T00:00:00.000Z",
  updatedAt: "2026-05-12T12:00:00.000Z",
});
assert.equal(userTargetSupabase.calls[0].table, "classloop_profiles");
assert.equal(userTargetSupabase.calls[0].column, "id", "checkout webhook should update entitlement by Supabase user id when metadata exists");
assert.equal(userTargetSupabase.calls[0].value, "supabase-user-1");
assert.equal(userTargetSupabase.calls[0].payload.plan_tier, "pro");

const customerTargetSupabase = fakeSupabase();
await applySubscriptionProfileUpdate(customerTargetSupabase, {
  customerId: "cus_existing",
  tier: "pro",
  status: "canceled",
  subscriptionId: "sub_existing",
  currentPeriodEndIso: null,
  updatedAt: "2026-05-12T12:00:00.000Z",
});
assert.equal(customerTargetSupabase.calls[0].column, "stripe_customer_id", "subscription update without user metadata should target the Stripe customer");
assert.equal(customerTargetSupabase.calls[0].value, "cus_existing");
assert.equal(customerTargetSupabase.calls[0].payload.plan_tier, "free");

const maliciousPatch = profilePatchColumns({
  role: "teacher",
  noTrainingOnStudentData: false,
  plan_tier: "pro",
  subscription_status: "active",
  stripe_customer_id: "cus_attacker",
  billingProfile: { tier: "pro", status: "active" },
});
assert.deepEqual(
  maliciousPatch,
  { role: "teacher", no_training_on_student_data: false },
  "Profile PATCH must ignore client-submitted paid entitlement fields",
);

const invalidProfilePatch = profilePatchColumns({
  role: "owner",
  no_training_on_student_data: false,
  planTier: "pro",
  subscriptionId: "sub_attacker",
  currentPeriodEnd: "2026-06-12T00:00:00.000Z",
});
assert.deepEqual(
  invalidProfilePatch,
  {},
  "Profile PATCH must ignore invalid roles, snake-case privacy tampering, and camelCase paid entitlement fields",
);

const profile = billingProfileFromRow({
  plan_tier: "pro",
  subscription_status: "active",
  stripe_customer_id: "cus_profile",
  current_period_end: "2026-06-12T00:00:00.000Z",
});
assert.deepEqual(profile, {
  tier: "pro",
  status: "active",
  customerId: "cus_profile",
  currentPeriodEnd: "2026-06-12T00:00:00.000Z",
});

assert.equal(manualProCustomerId("rushilcpm02@gmail.com"), "manual_pro_rushilcpm02_gmail_com");
assert.equal(isManualProCustomerId("manual_pro_rushilcpm02_gmail_com"), true, "Manual Pro ids should be distinguishable from Stripe ids");
assert.deepEqual(manualProProfileColumns("teacher@classloop.test"), {}, "Non-owner emails should not get manual Pro columns");
assert.deepEqual(
  applyManualProGrantToRow({
    email: "rushilcpm02@gmail.com",
    plan_tier: "free",
    subscription_status: "not_configured",
  }),
  {
    email: "rushilcpm02@gmail.com",
    plan_tier: "pro",
    subscription_status: "active",
    stripe_customer_id: "manual_pro_rushilcpm02_gmail_com",
    subscription_id: "manual_pro_owner_grant",
    current_period_end: null,
  },
  "Profile rows for Rushil's email should be upgraded by the trusted server helper",
);
assert.deepEqual(
  billingProfileFromRow({
    email: "rushilcpm02@gmail.com",
    plan_tier: "free",
    subscription_status: "not_configured",
  }),
  {
    tier: "pro",
    status: "active",
    customerId: "manual_pro_rushilcpm02_gmail_com",
    currentPeriodEnd: undefined,
  },
  "Hosted profile responses should expose manual Pro for Rushil's email",
);
