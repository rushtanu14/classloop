export const paidSubscriptionStatuses = new Set(["active"]);

export function planTierForSubscriptionStatus(tier = "pro", status = "not_configured") {
  return paidSubscriptionStatuses.has(status) ? tier : "free";
}

export function currentPeriodEnd(subscription) {
  const seconds = subscription?.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export function subscriptionProfilePayload({
  customerId,
  tier = "pro",
  status = "not_configured",
  subscriptionId,
  currentPeriodEndIso,
  updatedAt = new Date().toISOString(),
}) {
  return {
    stripe_customer_id: customerId,
    subscription_id: subscriptionId,
    plan_tier: planTierForSubscriptionStatus(tier, status),
    subscription_status: status,
    current_period_end: currentPeriodEndIso,
    updated_at: updatedAt,
  };
}

export async function applySubscriptionProfileUpdate(supabase, { userId, customerId, ...details }) {
  const payload = subscriptionProfilePayload({ customerId, ...details });
  const query = supabase.from("classloop_profiles").update(payload);
  const { error } = userId ? await query.eq("id", userId) : await query.eq("stripe_customer_id", customerId);
  if (error) throw error;
  return payload;
}
