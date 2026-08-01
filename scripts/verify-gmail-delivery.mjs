#!/usr/bin/env node

import { createHash } from "node:crypto";
import nodemailer from "nodemailer";

const allowedArguments = new Set(["--send"]);
const unsupportedArgument = process.argv.slice(2).find((argument) => !allowedArguments.has(argument));
if (unsupportedArgument) {
  console.error(JSON.stringify({ ok: false, error: "unsupported_argument" }));
  process.exit(2);
}

const sendRequested = process.argv.includes("--send");
const user = String(process.env.CLASSLOOP_GMAIL_USER || "").trim();
const password = String(process.env.CLASSLOOP_GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
const from = String(
  process.env.CLASSLOOP_NO_REPLY_EMAIL ||
    process.env.CLASSLOOP_GMAIL_FROM ||
    process.env.CLASSLOOP_GMAIL_USER ||
    "",
).trim();
const senderName = String(process.env.CLASSLOOP_NO_REPLY_NAME || "ClassLoop").trim();

if (!user || !from || password.length < 16) {
  console.error(JSON.stringify({ ok: false, error: "gmail_environment_incomplete" }));
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user, pass: password },
});

try {
  await transporter.verify();
  const result = {
    ok: true,
    provider: "gmail-smtp",
    authenticated: true,
    selfTestSent: false,
  };

  if (sendRequested) {
    const sentAt = new Date().toISOString();
    const message = await transporter.sendMail({
      from: senderName ? `${senderName} <${from}>` : from,
      to: user,
      subject: `ClassLoop Gmail delivery verification ${sentAt}`,
      text: [
        "ClassLoop Gmail delivery verification succeeded.",
        "",
        "This message was sent only to the configured sender account.",
        `Verification time: ${sentAt}`,
      ].join("\n"),
    });
    result.selfTestSent = true;
    result.providerAccepted = Array.isArray(message.accepted) && message.accepted.length > 0;
    result.receipt = createHash("sha256")
      .update(String(message.messageId || sentAt), "utf8")
      .digest("hex")
      .slice(0, 16);
  }

  console.log(JSON.stringify(result));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "gmail_verification_failed",
      code: typeof error?.code === "string" ? error.code.slice(0, 40) : undefined,
      responseCode: Number.isInteger(error?.responseCode) ? error.responseCode : undefined,
    }),
  );
  process.exit(1);
} finally {
  transporter.close();
}
