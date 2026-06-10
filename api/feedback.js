import nodemailer from "nodemailer";
import {
  assertIpRateLimit,
  assertUserRateLimit,
  getSupabaseAdmin,
  httpError,
  json,
  readJsonBody,
  sendApiError,
} from "./_shared.js";
import { validateFeedbackPayload } from "./validators.js";

const FEEDBACK_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_RATE_LIMIT_MAX = 20;
const MAX_FEEDBACK_BODY_CHARS = 90_000;
const MAX_STORED_TRANSCRIPT_CHARS = 4_000;
const MAX_EMAIL_TRANSCRIPT_CHARS = 12_000;

function allowProductFeedbackCors(request, response) {
  const origin = request.headers.origin || "";
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function assertHostedFeedbackConfigured() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw httpError(503, "Support intake is temporarily unavailable.");
  }
}

function emailTranscriptSnippet(transcript) {
  if (!transcript) return "";
  if (transcript.length <= MAX_EMAIL_TRANSCRIPT_CHARS) return transcript;
  return `${transcript.slice(0, MAX_EMAIL_TRANSCRIPT_CHARS)}\n\n[Transcript truncated for email delivery.]`;
}

function storedTranscriptContext(transcript) {
  if (!transcript) return "";
  if (transcript.length <= MAX_STORED_TRANSCRIPT_CHARS) return transcript;
  return `${transcript.slice(0, MAX_STORED_TRANSCRIPT_CHARS)}\n\n[Transcript truncated before support storage.]`;
}

function feedbackEmailConfig() {
  const to = process.env.CLASSLOOP_FEEDBACK_NOTIFY_EMAIL;
  if (!to) return null;

  const senderEmail = process.env.CLASSLOOP_NO_REPLY_EMAIL || process.env.CLASSLOOP_SMTP_FROM || process.env.CLASSLOOP_GMAIL_FROM || process.env.CLASSLOOP_GMAIL_USER;
  const senderName = process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop";
  const from = senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail;

  if (process.env.CLASSLOOP_SMTP_HOST && process.env.CLASSLOOP_SMTP_FROM) {
    return {
      to,
      from: from || process.env.CLASSLOOP_SMTP_FROM,
      transport: {
        host: process.env.CLASSLOOP_SMTP_HOST,
        port: Number(process.env.CLASSLOOP_SMTP_PORT || 587),
        secure: process.env.CLASSLOOP_SMTP_SECURE === "true",
        auth: process.env.CLASSLOOP_SMTP_USER
          ? {
              user: process.env.CLASSLOOP_SMTP_USER,
              pass: process.env.CLASSLOOP_SMTP_PASS,
            }
          : undefined,
      },
    };
  }

  if (process.env.CLASSLOOP_GMAIL_USER && process.env.CLASSLOOP_GMAIL_APP_PASSWORD) {
    const gmailAppPassword = process.env.CLASSLOOP_GMAIL_APP_PASSWORD.replace(/\s+/g, "");
    return {
      to,
      from: from || process.env.CLASSLOOP_GMAIL_USER,
      transport: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.CLASSLOOP_GMAIL_USER,
          pass: gmailAppPassword,
        },
      },
    };
  }

  return null;
}

async function notifyCreator(feedback) {
  const config = feedbackEmailConfig();
  if (!config) return false;
  const feedbackLabel = feedback.source === "download_install_feedback" ? "ClassLoop installer feedback" : "ClassLoop product feedback";
  const metadata = Object.entries(feedback.metadata || {})
    .map(([key, value]) => `- ${key}: ${String(value)}`)
    .join("\n");
  const transcriptSnippet = emailTranscriptSnippet(feedback.transcript);
  const text = [
    `${feedbackLabel}: ${feedback.rating}/5`,
    "",
    `Role: ${feedback.role}`,
    `Source: ${feedback.source}`,
    feedback.note ? ["", "Note:", feedback.note].join("\n") : "",
    metadata ? ["", "Metadata:", metadata].join("\n") : "",
    transcriptSnippet ? ["", "Transcript context:", transcriptSnippet].join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
  await nodemailer.createTransport(config.transport).sendMail({
    from: config.from,
    to: config.to,
    subject: `${feedbackLabel}: ${feedback.rating}/5`,
    text,
  });
  return true;
}

export default async function handler(request, response) {
  allowProductFeedbackCors(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed." }, { Allow: "POST, OPTIONS" });

  try {
    assertIpRateLimit(request, response, {
      endpoint: "feedback",
      limit: FEEDBACK_RATE_LIMIT_MAX,
      windowMs: FEEDBACK_RATE_LIMIT_WINDOW_MS,
    });
    assertHostedFeedbackConfigured();
    const payload = validateFeedbackPayload(
      await readJsonBody(request, {
        maxBytes: MAX_FEEDBACK_BODY_CHARS,
        name: "Feedback payload",
      }),
    );
    const supabase = getSupabaseAdmin();
    const auth = request.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    let user = null;
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (error) throw httpError(401, "Invalid or expired session.");
      user = data.user ?? null;
      assertUserRateLimit(request, response, user, {
        endpoint: "feedback",
        limit: FEEDBACK_RATE_LIMIT_MAX,
        windowMs: FEEDBACK_RATE_LIMIT_WINDOW_MS,
      });
    }
    const feedback = {
      owner_id: user?.id ?? null,
      rating: payload.rating,
      note: payload.note,
      role: payload.role,
      source: payload.source,
      transcript: storedTranscriptContext(payload.transcript),
      metadata: payload.metadata,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("classloop_pilot_feedback").insert({
      ...feedback,
    });
    if (error) throw error;
    const notified = await notifyCreator(feedback).catch((error) => {
      console.warn("[classloop-feedback] notification delivery failed", {
        name: error?.name,
        code: error?.code,
        command: error?.command,
        responseCode: error?.responseCode,
        message: error?.message,
      });
      return false;
    });
    return json(response, 200, { ok: true, notified });
  } catch (error) {
    return sendApiError(response, error, "Unable to save feedback.");
  }
}
