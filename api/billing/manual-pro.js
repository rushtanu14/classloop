const manualProEmails = new Set(["rushilcpm02@gmail.com"]);

export function normalizeManualProEmail(email = "") {
  return String(email).trim().toLowerCase();
}

export function isManualProEmail(email = "") {
  return manualProEmails.has(normalizeManualProEmail(email));
}

export function manualProCustomerId(email = "") {
  const normalized = normalizeManualProEmail(email);
  if (!isManualProEmail(normalized)) return "";
  return `manual_pro_${normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

export function isManualProCustomerId(customerId = "") {
  return String(customerId).startsWith("manual_pro_");
}

export function manualProProfileColumns(email = "") {
  const customerId = manualProCustomerId(email);
  if (!customerId) return {};
  return {
    plan_tier: "pro",
    subscription_status: "active",
    stripe_customer_id: customerId,
    subscription_id: "manual_pro_owner_grant",
    current_period_end: null,
  };
}

export function applyManualProGrantToRow(row) {
  if (!row || !isManualProEmail(row.email)) return row;
  return {
    ...row,
    ...manualProProfileColumns(row.email),
  };
}
