import { assertIpRateLimit, json, methodNotAllowed, sendApiError } from "../_shared.js";

function emailConfig() {
  if (process.env.CLASSLOOP_SMTP_HOST) {
    return {
      configured: true,
      provider: process.env.CLASSLOOP_SMTP_PROVIDER || (process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply SMTP" : "SMTP"),
    };
  }

  if (process.env.CLASSLOOP_GMAIL_USER && process.env.CLASSLOOP_GMAIL_APP_PASSWORD) {
    return {
      configured: true,
      provider: process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply Gmail SMTP" : "Gmail SMTP",
    };
  }

  return {
    configured: false,
    provider: "Not configured",
  };
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, { endpoint: "integrations-status", limit: 120, windowMs: 60 * 1000 });
    if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
    return json(response, 200, {
      email: emailConfig(),
    });
  } catch (error) {
    return sendApiError(response, error, "Unable to load integration status.");
  }
}
