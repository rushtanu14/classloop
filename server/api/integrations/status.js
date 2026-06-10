import { assertIpRateLimit, json, methodNotAllowed, sendApiError } from "../_shared.js";

function emailConfig() {
  if (process.env.CLASSLOOP_SMTP_HOST) {
    const senderEmail = process.env.CLASSLOOP_NO_REPLY_EMAIL || process.env.CLASSLOOP_SMTP_FROM || process.env.CLASSLOOP_SMTP_USER;
    const senderName = process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop";
    return {
      configured: true,
      provider: process.env.CLASSLOOP_SMTP_PROVIDER || (process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply SMTP" : "SMTP"),
      from: senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail,
      replyTo: process.env.CLASSLOOP_REPLY_TO || undefined,
    };
  }

  if (process.env.CLASSLOOP_GMAIL_USER && process.env.CLASSLOOP_GMAIL_APP_PASSWORD) {
    const senderEmail = process.env.CLASSLOOP_NO_REPLY_EMAIL || process.env.CLASSLOOP_GMAIL_FROM || process.env.CLASSLOOP_GMAIL_USER;
    const senderName = process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop";
    return {
      configured: true,
      provider: process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply Gmail SMTP" : "Gmail SMTP",
      from: senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail,
      replyTo: process.env.CLASSLOOP_REPLY_TO || undefined,
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
    return json(response, 200, { email: emailConfig() });
  } catch (error) {
    return sendApiError(response, error, "Unable to load integration status.");
  }
}
