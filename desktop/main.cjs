const { app, BrowserWindow, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let nodemailer;

function getNodemailer() {
  if (nodemailer) {
    return nodemailer;
  }
  try {
    nodemailer = require("nodemailer");
    return nodemailer;
  } catch (error) {
    return null;
  }
}

const rootDir = path.join(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const dataFileName = ".classloop-data.json";
const dataKeyFileName = ".classloop-storage-key";
const requestedUserDataDir = process.env.CLASSLOOP_USER_DATA_DIR;
if (requestedUserDataDir) {
  app.setPath("userData", path.resolve(requestedUserDataDir));
}
let dataFileReadError = null;
const localApiRateBuckets = new Map();
const LOCAL_API_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOCAL_API_RATE_LIMIT_MAX = 240;
const LOCAL_STATE_BODY_MAX_BYTES = 8_000_000;
const LOCAL_EMAIL_BODY_MAX_BYTES = 20_000;

const securityHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self), display-capture=()",
};

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function resolveAsset(requestUrl) {
  const parsed = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(parsed.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(distDir, relativePath));

  if (!filePath.startsWith(distDir)) {
    return null;
  }

  return filePath;
}

function emptyWorkspace() {
  return {
    accounts: [],
    sessions: [],
    draft: null,
    demoLoaded: false,
    classGroups: [],
    rosterTemplates: [],
    privacySettings: undefined,
    auditLog: [],
    billingProfile: undefined,
    updatedAt: new Date().toISOString(),
  };
}

function currentDataFilePath() {
  return app.isPackaged || requestedUserDataDir ? path.join(app.getPath("userData"), dataFileName) : path.join(rootDir, dataFileName);
}

function currentDataKeyPath() {
  return path.join(path.dirname(currentDataFilePath()), dataKeyFileName);
}

function readableDataFilePath() {
  const dataFile = currentDataFilePath();
  if (fs.existsSync(dataFile)) {
    return dataFile;
  }

  const legacyDataFile = path.join(rootDir, dataFileName);
  if (app.isPackaged && legacyDataFile !== dataFile && fs.existsSync(legacyDataFile)) {
    return legacyDataFile;
  }

  return dataFile;
}

function dataReadErrorMessage(error) {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return `Unable to read ClassLoop desktop data.${detail}`;
}

function readClassLoopDataKey(options = {}) {
  const keyPath = currentDataKeyPath();
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, "utf8").trim();
    const parsed = raw.startsWith("{") ? JSON.parse(raw) : { key: raw };
    const key = Buffer.from(parsed.key || "", "base64");
    if (key.length !== 32) {
      throw new Error("ClassLoop desktop storage key is invalid.");
    }
    return key;
  }

  if (options.createIfMissing === false) {
    throw new Error("ClassLoop desktop storage key is missing.");
  }

  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(
    keyPath,
    `${JSON.stringify({ version: 1, algorithm: "aes-256-gcm", key: key.toString("base64") }, null, 2)}\n`,
    { mode: 0o600 },
  );
  return key;
}

function encryptWorkspaceState(nextState) {
  const key = readClassLoopDataKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(nextState), "utf8"), cipher.final()]);
  return {
    version: 2,
    encrypted: true,
    algorithm: "aes-256-gcm",
    key: dataKeyFileName,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    payload: encrypted.toString("base64"),
  };
}

function decryptWorkspaceState(stored) {
  if (stored.algorithm !== "aes-256-gcm" || !stored.iv || !stored.authTag) {
    throw new Error(
      "ClassLoop found an older OS-keychain encrypted data file. To avoid password prompts, ClassLoop will not open it automatically. Keep a backup and move it aside to start fresh.",
    );
  }

  const key = readClassLoopDataKey({ createIfMissing: false });
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(stored.iv, "base64"));
  decipher.setAuthTag(Buffer.from(stored.authTag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(stored.payload, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}

function readDataFile(options = {}) {
  try {
    const dataFile = readableDataFilePath();
    if (!fs.existsSync(dataFile)) {
      dataFileReadError = null;
      return emptyWorkspace();
    }

    const stored = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    if (stored.encrypted && stored.payload) {
      dataFileReadError = null;
      return decryptWorkspaceState(stored);
    }
    if (stored.version && stored.payload && stored.encrypted === false) {
      dataFileReadError = null;
      return stored.payload;
    }
    dataFileReadError = null;
    return stored;
  } catch (error) {
    dataFileReadError = dataReadErrorMessage(error);
    if (options.throwOnError) {
      const readError = new Error(dataFileReadError);
      readError.statusCode = 423;
      throw readError;
    }
    return {
      ...emptyWorkspace(),
      readOnly: true,
      readError: dataFileReadError,
    };
  }
}

function withSecurityHeaders(headers = {}) {
  return { ...securityHeaders, ...headers };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, withSecurityHeaders({ "Content-Type": "application/json" }));
  response.end(JSON.stringify(payload));
}

function sendMethodNotAllowed(response, allowedMethods) {
  response.writeHead(405, withSecurityHeaders({ "Content-Type": "application/json", Allow: allowedMethods.join(", ") }));
  response.end(JSON.stringify({ error: "Method not allowed." }));
}

function isTrustedLocalOrigin(origin, host) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.host === host && ["127.0.0.1", "localhost"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isTrustedApiRequest(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method || "GET") && !request.headers.origin) {
    return true;
  }
  return isTrustedLocalOrigin(request.headers.origin, request.headers.host);
}

function localApiClientKey(request) {
  const address = request.socket?.remoteAddress || "unknown";
  return `${request.method || "GET"}:${address}`;
}

function consumeLocalApiRateLimit(request, response, routeName) {
  const now = Date.now();
  for (const [key, bucket] of localApiRateBuckets) {
    if (bucket.resetAt <= now) localApiRateBuckets.delete(key);
  }

  const key = `${routeName}:${localApiClientKey(request)}`;
  const current = localApiRateBuckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + LOCAL_API_RATE_LIMIT_WINDOW_MS,
        };

  bucket.count += 1;
  localApiRateBuckets.set(key, bucket);

  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  response.setHeader("RateLimit-Limit", String(LOCAL_API_RATE_LIMIT_MAX));
  response.setHeader("RateLimit-Remaining", String(Math.max(0, LOCAL_API_RATE_LIMIT_MAX - bucket.count)));
  response.setHeader("RateLimit-Reset", String(resetSeconds));

  if (bucket.count <= LOCAL_API_RATE_LIMIT_MAX) return true;
  response.setHeader("Retry-After", String(resetSeconds));
  sendJson(response, 429, { error: "Too many requests. Please wait a moment and try again." });
  return false;
}

// The local API is loopback-only, but renderer-controlled JSON is still treated
// as untrusted before it can save state or trigger email delivery.
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnexpectedFields(payload, allowedFields, label) {
  if (!isPlainObject(payload)) {
    const error = new Error(`${label} must be an object.`);
    error.statusCode = 400;
    throw error;
  }
  const allowed = new Set(allowedFields);
  const unexpected = Object.keys(payload).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    const error = new Error(`${label} contains unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }
}

function requireJsonContentType(request) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const error = new Error("Use application/json for this request.");
    error.statusCode = 415;
    throw error;
  }
}

function writeDataFile(payload) {
  if (dataFileReadError) {
    const error = new Error(`${dataFileReadError} Fix or export the existing data file before saving new state.`);
    error.statusCode = 423;
    throw error;
  }
  const nextState = {
    accounts: Array.isArray(payload.accounts) ? payload.accounts : [],
    sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
    draft: payload.draft ?? null,
    demoLoaded: Boolean(payload.demoLoaded),
    classGroups: Array.isArray(payload.classGroups) ? payload.classGroups : [],
    rosterTemplates: Array.isArray(payload.rosterTemplates) ? payload.rosterTemplates : [],
    privacySettings: payload.privacySettings,
    auditLog: Array.isArray(payload.auditLog) ? payload.auditLog : [],
    billingProfile: payload.billingProfile,
    updatedAt: new Date().toISOString(),
  };
  const stored = encryptWorkspaceState(nextState);
  const dataFile = currentDataFilePath();
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  return nextState;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function studentEmail(student) {
  return normalizeEmail(student.linkedAccountEmail || student.email);
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
          pass: process.env.CLASSLOOP_GMAIL_APP_PASSWORD,
        },
      },
    };
  }

  return {
    configured: false,
    provider: "Not configured",
  };
}

function textForStudentEmail(session, student) {
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
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendRecapEmails(session, options = {}) {
  const config = emailConfig();
  if (!config.configured) {
    const error = new Error("Email is not configured. Set SMTP or Gmail app-password environment variables before sending.");
    error.statusCode = 503;
    throw error;
  }
  if (!config.from) {
    const error = new Error("Email sender is missing. Set CLASSLOOP_SMTP_FROM or CLASSLOOP_GMAIL_FROM.");
    error.statusCode = 503;
    throw error;
  }

  const mailer = getNodemailer();
  if (!mailer) {
    const error = new Error(
      "Email delivery is currently unavailable because the mailer dependency is not installed. Run `npm install` and restart ClassLoop.",
    );
    error.statusCode = 503;
    throw error;
  }

  const transporter = mailer.createTransport(config.transport);
  const recipients = [];
  const failed = [];
  const onlyEmails = new Set(
    (Array.isArray(options.onlyEmails) ? options.onlyEmails : []).map((email) => normalizeEmail(email)).filter(Boolean),
  );
  const students = deliverableStudents(session).filter((student) => !onlyEmails.size || onlyEmails.has(studentEmail(student)));

  if (onlyEmails.size && !students.length) {
    const error = new Error("No matching failed recipients were found for this published session.");
    error.statusCode = 400;
    throw error;
  }

  for (const student of students) {
    const to = studentEmail(student);
    try {
      await transporter.sendMail({
        from: config.from,
        replyTo: config.replyTo,
        to,
        subject: `ClassLoop recap: ${session.title || "Session follow-up"}`,
        text: textForStudentEmail(session, student),
      });
      recipients.push(to);
    } catch (error) {
      failed.push(`${to}: ${error.message}`);
    }
  }

  if (!recipients.length && failed.length) {
    const error = new Error(`No emails were sent. First failure: ${failed[0]}`);
    error.statusCode = 502;
    throw error;
  }

  return {
    provider: config.provider,
    sentAt: new Date().toISOString(),
    recipients,
    skipped: skippedStudents(session),
    failed,
  };
}

function readRequestBody(request, maxBytes = LOCAL_STATE_BODY_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    let body = "";
    const contentLength = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      reject(error);
      return;
    }
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readJsonRequest(request, maxBytes) {
  requireJsonContentType(request);
  const body = await readRequestBody(request, maxBytes);
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function validateStatePayload(payload) {
  rejectUnexpectedFields(
    payload,
    ["accounts", "sessions", "draft", "demoLoaded", "classGroups", "rosterTemplates", "privacySettings", "auditLog", "billingProfile"],
    "ClassLoop state",
  );
  ["accounts", "sessions", "classGroups", "rosterTemplates", "auditLog"].forEach((key) => {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) {
      const error = new Error(`ClassLoop state.${key} must be an array.`);
      error.statusCode = 400;
      throw error;
    }
  });
  if (payload.privacySettings !== undefined && !isPlainObject(payload.privacySettings)) {
    const error = new Error("ClassLoop state.privacySettings must be an object.");
    error.statusCode = 400;
    throw error;
  }
  if (payload.billingProfile !== undefined && !isPlainObject(payload.billingProfile)) {
    const error = new Error("ClassLoop state.billingProfile must be an object.");
    error.statusCode = 400;
    throw error;
  }
  return payload;
}

function validateEmailRequestPayload(payload) {
  rejectUnexpectedFields(payload, ["sessionId", "ownerEmail", "recipients"], "Email request");
  const sessionId = String(payload.sessionId || "").trim();
  const ownerEmail = normalizeEmail(payload.ownerEmail);
  const recipients = Array.isArray(payload.recipients) ? payload.recipients.map((email) => normalizeEmail(email)).filter(Boolean) : undefined;

  if (!sessionId || sessionId.length > 160 || !ownerEmail || ownerEmail.length > 320) {
    const error = new Error("Session id and owner email are required before sending recap emails.");
    error.statusCode = 400;
    throw error;
  }
  if (recipients && recipients.length > 500) {
    const error = new Error("Email request may include at most 500 recipients.");
    error.statusCode = 400;
    throw error;
  }
  if (recipients?.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    const error = new Error("Email request contains an invalid recipient.");
    error.statusCode = 400;
    throw error;
  }
  return { sessionId, ownerEmail, recipients };
}

async function handleStateApi(request, response) {
  if (request.method === "GET") {
    const state = readDataFile();
    response.writeHead(dataFileReadError ? 423 : 200, withSecurityHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store" }));
    response.end(JSON.stringify(state));
    return true;
  }

  if (request.method === "PUT") {
    try {
      const body = await readJsonRequest(request, LOCAL_STATE_BODY_MAX_BYTES);
      const state = writeDataFile(validateStatePayload(body));
      response.writeHead(200, withSecurityHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store" }));
      response.end(JSON.stringify(state));
    } catch (error) {
      response.writeHead(error.statusCode || 400, withSecurityHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store" }));
      response.end(JSON.stringify({ error: error.message || "Unable to save ClassLoop data." }));
    }
    return true;
  }

  sendMethodNotAllowed(response, ["GET", "PUT"]);
  return true;
}

async function handleIntegrationStatusApi(request, response) {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response, ["GET"]);
    return true;
  }
  const config = emailConfig();
  sendJson(response, 200, {
    email: {
      configured: config.configured,
      provider: config.provider,
      from: config.from,
      replyTo: config.replyTo,
    },
  });
  return true;
}

async function handleEmailApi(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed." });
    return true;
  }

  try {
    const body = validateEmailRequestPayload(await readJsonRequest(request, LOCAL_EMAIL_BODY_MAX_BYTES));
    const sessionId = body.sessionId;
    const ownerEmail = body.ownerEmail;

    const state = readDataFile({ throwOnError: true });
    const session = (Array.isArray(state.sessions) ? state.sessions : []).find((item) => item.id === sessionId);
    if (!session) {
      sendJson(response, 404, { error: "Published session was not found." });
      return true;
    }
    if (session.status !== "published") {
      sendJson(response, 409, { error: "Publish the session before sending recap emails." });
      return true;
    }
    if (normalizeEmail(session.ownerEmail) !== ownerEmail) {
      sendJson(response, 403, { error: "Only the teacher who owns this session can send recap emails." });
      return true;
    }

    const result = await sendRecapEmails(session, { onlyEmails: body.recipients });
    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || "Unable to send student emails." });
  }
  return true;
}

function createStaticServer() {
  const server = http.createServer(async (request, response) => {
    const parsed = new URL(request.url || "/", "http://127.0.0.1");
    if (parsed.pathname.startsWith("/api/") && !consumeLocalApiRateLimit(request, response, parsed.pathname)) {
      return;
    }
    if (parsed.pathname.startsWith("/api/") && !isTrustedApiRequest(request)) {
      sendJson(response, 403, { error: "Blocked untrusted local API origin." });
      return;
    }

    if (parsed.pathname === "/api/state") {
      await handleStateApi(request, response);
      return;
    }
    if (parsed.pathname === "/api/integrations/status") {
      await handleIntegrationStatusApi(request, response);
      return;
    }
    if (parsed.pathname === "/api/email/send-recaps") {
      await handleEmailApi(request, response);
      return;
    }
    const filePath = resolveAsset(request.url || "/");

    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, withSecurityHeaders({
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    }));
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        close: () => server.close(),
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

let staticServer;

function logStartupError(error) {
  const message = error && error.stack ? error.stack : error;
  console.error("ClassLoop desktop startup failed:", message);
}

async function createWindow() {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error("Missing dist/index.html. ClassLoop needs the checked-in app build to run.");
  }

  staticServer = await createStaticServer();

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    title: "ClassLoop",
    backgroundColor: "#020817",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (["https:", "http:", "mailto:"].includes(parsed.protocol)) {
        shell.openExternal(url);
      }
    } catch {
      // Ignore malformed or unsafe external URLs.
    }
    return { action: "deny" };
  });

  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const trusted = (() => {
      try {
        const parsed = new URL(webContents.getURL());
        return parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
      } catch {
        return false;
      }
    })();
    callback(trusted && permission === "media");
  });

  await window.loadURL(`${staticServer.url}/#/dashboard`);
}

process.on("uncaughtException", (error) => {
  logStartupError(error);
  app.exit(1);
});

process.on("unhandledRejection", (error) => {
  logStartupError(error);
  app.exit(1);
});

app.whenReady().then(createWindow).catch((error) => {
  logStartupError(error);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (staticServer) {
    staticServer.close();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
