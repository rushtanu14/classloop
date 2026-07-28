import nodemailer from "nodemailer";
import {
  assertIpRateLimit,
  httpError,
  json,
  methodNotAllowed,
  readJsonBody,
  requireUser,
  sendApiError,
} from "../_shared.js";
import { validateCloudWorkspaceStatePayload, validateEmailRecapPayload } from "../validators.js";

const EMAIL_RATE_LIMIT = { endpoint: "email-send-recaps", limit: 30, windowMs: 10 * 60 * 1000 };
const EMAIL_USER_RATE_LIMIT = { endpoint: "email-send-recaps", limit: 10, windowMs: 10 * 60 * 1000 };
const EMAIL_BODY_MAX_BYTES = 20_000;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function assertRecapEmailAuthorization({ user, profile, session }) {
  if (!user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
    throw httpError(403, "Confirm your account email before sending student recaps.");
  }
  if (profile?.role !== "teacher") {
    throw httpError(403, "Only teacher accounts can send student recaps.");
  }
  if (profile?.email_delivery_enabled !== true) {
    throw httpError(403, "Hosted email delivery is not enabled for this workspace.");
  }
  if (normalizeEmail(session?.ownerEmail) !== normalizeEmail(user.email)) {
    throw httpError(403, "Only the authenticated teacher who owns this session can send recap emails.");
  }
}

function studentEmail(student) {
  return normalizeEmail(student?.linkedAccountEmail || student?.email);
}

function deliverableStudents(session) {
  return Array.isArray(session.students)
    ? session.students.filter((student) => {
        const email = studentEmail(student);
        return email && !email.endsWith("@classloop.local");
      })
    : [];
}

function skippedStudents(session) {
  return Array.isArray(session.students)
    ? session.students
        .filter((student) => {
          const email = studentEmail(student);
          return !email || email.endsWith("@classloop.local");
        })
        .map((student) => student.name || "Unnamed student")
    : [];
}

function emailConfig() {
  if (process.env.CLASSLOOP_SMTP_HOST) {
    const senderEmail = process.env.CLASSLOOP_NO_REPLY_EMAIL || process.env.CLASSLOOP_SMTP_FROM || process.env.CLASSLOOP_SMTP_USER;
    const senderName = process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop";
    return {
      configured: true,
      provider: process.env.CLASSLOOP_SMTP_PROVIDER || (process.env.CLASSLOOP_NO_REPLY_EMAIL ? "No-reply SMTP" : "SMTP"),
      from: senderName && senderEmail ? `${senderName} <${senderEmail}>` : senderEmail,
      replyTo: process.env.CLASSLOOP_REPLY_TO || undefined,
      transport: {
        host: process.env.CLASSLOOP_SMTP_HOST,
        port: Number(process.env.CLASSLOOP_SMTP_PORT || 587),
        secure: process.env.CLASSLOOP_SMTP_SECURE === "true" || process.env.CLASSLOOP_SMTP_PORT === "465",
        auth: process.env.CLASSLOOP_SMTP_USER
          ? {
              user: process.env.CLASSLOOP_SMTP_USER,
              pass: process.env.CLASSLOOP_SMTP_PASS || "",
            }
          : undefined,
      },
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
      transport: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.CLASSLOOP_GMAIL_USER,
          pass: process.env.CLASSLOOP_GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
        },
      },
    };
  }

  return { configured: false, provider: "Not configured" };
}

function textForStudentEmail(session, student, includeAccessInstructions = false) {
  const followUp = Array.isArray(session.followUps)
    ? session.followUps.find((item) => item.studentId === student.id)
    : null;
  const resources = Array.isArray(session.resources) ? session.resources : [];
  const tasks = followUp?.tasks?.length ? followUp.tasks : ["Review the session recap and complete the assigned work."];

  return [
    `Hi ${student.name || "there"},`,
    "",
    `Your ClassLoop follow-up is ready for ${session.title || "today's class"}.`,
    "",
    "Recap:",
    session.recap || "A session recap is available in ClassLoop.",
    "",
    "Your next steps:",
    ...tasks.map((task) => `- ${task}`),
    followUp?.reminder ? ["", "Reminder:", followUp.reminder].join("\n") : "",
    followUp?.dueDate ? `\nDue: ${followUp.dueDate}` : "",
    resources.length
      ? ["", "Resources:", ...resources.map((resource) => `- ${resource.title || resource.url}: ${resource.url}`)].join("\n")
      : "",
    "",
    "Open ClassLoop with your roster email to see the full student dashboard.",
    includeAccessInstructions
      ? [
          "",
          "Student access:",
          `- Use this roster email: ${studentEmail(student)}`,
          "- Open ClassLoop and choose Student sign in.",
          "- If ClassLoop sends an access email, use the link or code sent to this address.",
        ].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendRecapEmails(session, onlyRecipients, includeAccessInstructions = false) {
  const config = emailConfig();
  if (!config.configured) {
    throw httpError(503, "Email delivery is not available right now.");
  }
  if (!config.from) {
    throw httpError(503, "Email delivery is not available right now.");
  }

  const transporter = nodemailer.createTransport(config.transport);
  const onlyEmails = new Set((Array.isArray(onlyRecipients) ? onlyRecipients : []).map(normalizeEmail).filter(Boolean));
  const students = deliverableStudents(session).filter((student) => !onlyEmails.size || onlyEmails.has(studentEmail(student)));
  if (onlyEmails.size && !students.length) {
    throw httpError(400, "No matching recipients were found for this published session.");
  }

  const recipients = [];
  const failed = [];
  for (const student of students) {
    const to = studentEmail(student);
    try {
      await transporter.sendMail({
        from: config.from,
        replyTo: config.replyTo,
        to,
        subject: `ClassLoop recap: ${session.title || "Session follow-up"}`,
        text: textForStudentEmail(session, student, includeAccessInstructions),
      });
      recipients.push(to);
    } catch (error) {
      failed.push(`${to}: ${error.message}`);
    }
  }

  if (!recipients.length && failed.length) {
    throw httpError(502, `No emails were sent. First failure: ${failed[0]}`);
  }

  return {
    provider: config.provider,
    sentAt: new Date().toISOString(),
    recipients,
    skipped: skippedStudents(session),
    failed,
  };
}

function markSessionEmailsSent(session, result) {
  return {
    ...session,
    emailDelivery: {
      status: "sent",
      provider: result.provider,
      sentAt: result.sentAt,
      recipients: result.recipients,
      skipped: result.skipped,
      failed: result.failed,
      lastError: result.failed.length ? result.failed[0] : undefined,
    },
    deliveryLogs: [
      {
        id: `delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        provider: "email",
        target: "Student recap email",
        status: result.failed.length ? "failed" : "sent",
        message: result.failed.length
          ? `Sent ${result.recipients.length}; failed ${result.failed.length}.`
          : `Sent recap emails to ${result.recipients.length} students.`,
        recipientCount: result.recipients.length,
        createdAt: result.sentAt,
      },
      ...(session.deliveryLogs ?? []),
    ],
  };
}

async function loadWorkspaceState(supabase, userId) {
  const { data, error } = await supabase
    .from("classloop_workspace_state")
    .select("state")
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.state) throw httpError(404, "Hosted workspace state was not found.");
  return data.state;
}

async function loadEmailDeliveryProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("classloop_profiles")
    .select("role,email_delivery_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(403, "A ClassLoop teacher profile is required.");
  return data;
}

async function saveWorkspaceState(supabase, userId, state) {
  const payload = validateCloudWorkspaceStatePayload(state);
  const { error } = await supabase.from("classloop_workspace_state").upsert({
    owner_id: userId,
    state: payload,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export default async function handler(request, response) {
  try {
    assertIpRateLimit(request, response, EMAIL_RATE_LIMIT);
    if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);

    const { supabase, user } = await requireUser(request, response, { rateLimit: EMAIL_USER_RATE_LIMIT });
    const body = validateEmailRecapPayload(
      await readJsonBody(request, {
        maxBytes: EMAIL_BODY_MAX_BYTES,
        name: "Email recap request",
      }),
    );

    const state = await loadWorkspaceState(supabase, user.id);
    const profile = await loadEmailDeliveryProfile(supabase, user.id);
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const sessionIndex = sessions.findIndex((item) => item.id === body.sessionId);
    const session = sessions[sessionIndex];
    if (!session) throw httpError(404, "Published session was not found.");
    if (session.status !== "published") throw httpError(409, "Publish the session before sending recap emails.");
    assertRecapEmailAuthorization({ user, profile, session });

    const result = await sendRecapEmails(session, body.recipients, body.includeAccessInstructions);
    const nextState = {
      ...state,
      sessions: sessions.map((item, index) => (index === sessionIndex ? markSessionEmailsSent(item, result) : item)),
    };
    await saveWorkspaceState(supabase, user.id, nextState);

    return json(response, 200, result);
  } catch (error) {
    return sendApiError(response, error, "Unable to send student emails.");
  }
}
