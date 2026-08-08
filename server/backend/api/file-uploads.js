import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  assertIpRateLimit,
  httpError,
  isPlainObject,
  json,
  methodNotAllowed,
  readJsonBody,
  requireUser,
  sendApiError,
} from "./_shared.js";

const UPLOAD_RATE_LIMIT = { endpoint: "file-upload-session", limit: 10, windowMs: 60 * 1000 };
const FINALIZE_RATE_LIMIT = { endpoint: "file-upload-finalize", limit: 10, windowMs: 60 * 1000 };
const UPLOAD_POLICY_SECONDS = 5 * 60;
const SHARE_POLICY_SECONDS = 5 * 365 * 24 * 60 * 60;
const SCAN_READ_POLICY_SECONDS = 60;
const SCAN_RECEIPT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_SIGNATURE_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_SCANNER_RESPONSE_BYTES = 16 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = Object.freeze([".pdf", ".txt", ".md"]);
const ALLOWED_MIME_TYPES = Object.freeze(["application/pdf", "text/plain", "text/markdown"]);
const FILESTACK_HANDLE_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;
const SAFE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,139}$/;
const SAFE_PREFIX_PATTERN = /^cl-[a-f0-9]{12}-[a-f0-9]{24}-$/;

function configuredFilestack(env) {
  const apiKey = String(env.FILESTACK_API_KEY || "").trim();
  const appSecret = String(env.FILESTACK_APP_SECRET || "").trim();
  if (!apiKey || !appSecret || String(env.FILESTACK_SECURITY_ENABLED || "").toLowerCase() !== "true") {
    throw httpError(503, "Secure file upload is unavailable right now.");
  }
  return { apiKey, appSecret };
}

function configuredMalwareScanner(env) {
  const rawUrl = String(env.CLASSLOOP_MALWARE_SCANNER_URL || "").trim();
  const token = String(env.CLASSLOOP_MALWARE_SCANNER_TOKEN || "").trim();
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw httpError(503, "Secure file scanning is unavailable right now.");
  }
  const loopbackHttp =
    url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase());
  if (
    (url.protocol !== "https:" && !loopbackHttp) ||
    url.username ||
    url.password ||
    url.hash ||
    token.length < 32 ||
    token.length > 512
  ) {
    throw httpError(503, "Secure file scanning is unavailable right now.");
  }
  return { url: url.toString(), token };
}

function userSubject(user) {
  const userId = typeof user?.id === "string" ? user.id.trim() : "";
  if (!userId || userId.length > 256) throw httpError(401, "Sign in before uploading a resource.");
  return createHash("sha256").update(userId, "utf8").digest("hex");
}

function signatureFor(value, secret) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function encodePayload(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeFilestackPolicy(policy) {
  if (typeof policy !== "string" || policy.length > 2_000) throw httpError(400, "Invalid upload policy.");
  try {
    return JSON.parse(Buffer.from(policy, "base64url").toString("utf8"));
  } catch {
    throw httpError(400, "Invalid upload policy.");
  }
}

function signedPolicy(payload, appSecret) {
  const policy = encodePayload(payload);
  return { policy, signature: signatureFor(policy, appSecret) };
}

function uploadReceipt(payload, appSecret) {
  const encoded = encodePayload(payload);
  return `${encoded}.${signatureFor(encoded, appSecret)}`;
}

export function verifyUploadReceipt(receipt, { env = process.env, user, nowMs = Date.now() } = {}) {
  const { appSecret } = configuredFilestack(env);
  const [encoded, signature, extra] = typeof receipt === "string" ? receipt.split(".") : [];
  if (!encoded || !signature || extra || !safeEqual(signature, signatureFor(encoded, appSecret))) {
    throw httpError(403, "That upload session is invalid or expired.");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw httpError(403, "That upload session is invalid or expired.");
  }
  if (
    !isPlainObject(payload) ||
    !Number.isInteger(payload.exp) ||
    payload.exp < Math.floor(nowMs / 1000) ||
    payload.sub !== userSubject(user) ||
    typeof payload.prefix !== "string" ||
    !SAFE_PREFIX_PATTERN.test(payload.prefix)
  ) {
    throw httpError(403, "That upload session is invalid or expired.");
  }
  return { prefix: payload.prefix, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

function safeNonce(value) {
  const nonce = String(value || "").toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 24);
  if (nonce.length !== 24) throw httpError(500, "Secure file upload is unavailable right now.", { expose: false });
  return nonce;
}

export function createFilestackUploadSession({ env = process.env, user, nowMs = Date.now(), nonce } = {}) {
  const { apiKey, appSecret } = configuredFilestack(env);
  configuredMalwareScanner(env);
  const expiry = Math.floor(nowMs / 1000) + UPLOAD_POLICY_SECONDS;
  const prefix = `cl-${userSubject(user).slice(0, 12)}-${safeNonce(nonce ?? randomBytes(12).toString("hex"))}-`;
  const security = signedPolicy(
    { expiry, call: ["pick", "store"], maxSize: MAX_FILE_BYTES },
    appSecret,
  );
  return {
    apiKey,
    ...security,
    expiresAt: new Date(expiry * 1000).toISOString(),
    maxSizeBytes: MAX_FILE_BYTES,
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    filenamePrefix: prefix,
    uploadReceipt: uploadReceipt({ exp: expiry, sub: userSubject(user), prefix }, appSecret),
  };
}

function validatedFinalizePayload(payload) {
  if (!isPlainObject(payload)) throw httpError(400, "Upload details must be a JSON object.");
  const keys = Object.keys(payload);
  if (keys.some((key) => !["handle", "uploadReceipt", "originalFilename"].includes(key))) {
    throw httpError(400, "Upload details contain an unsupported field.");
  }
  const handle = typeof payload.handle === "string" ? payload.handle.trim() : "";
  const receipt = typeof payload.uploadReceipt === "string" ? payload.uploadReceipt.trim() : "";
  const originalFilename = typeof payload.originalFilename === "string" ? payload.originalFilename.trim() : "";
  if (!FILESTACK_HANDLE_PATTERN.test(handle)) throw httpError(400, "Filestack returned an invalid file handle.");
  if (!receipt || receipt.length > 2_000) throw httpError(400, "Upload receipt is required.");
  if (!SAFE_FILENAME_PATTERN.test(originalFilename) || /[\\/\u0000-\u001f]/.test(originalFilename)) {
    throw httpError(400, "Use a simple file name without folders or control characters.");
  }
  const extension = originalFilename.slice(originalFilename.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) throw httpError(400, "Only PDF, TXT, and Markdown resources are supported.");
  return { handle, receipt, originalFilename, extension };
}

async function filestackMetadata(handle, { appSecret, fetchImpl, nowMs }) {
  const expiry = Math.floor(nowMs / 1000) + 60;
  const security = signedPolicy({ expiry, call: ["stat"], handle }, appSecret);
  const url = new URL(`https://www.filestackapi.com/api/file/${handle}/metadata`);
  url.searchParams.set("policy", security.policy);
  url.searchParams.set("signature", security.signature);
  url.searchParams.set("filename", "true");
  url.searchParams.set("size", "true");
  url.searchParams.set("mimetype", "true");
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "ClassLoop/1.0" },
      redirect: "error",
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8_000) : undefined,
    });
  } catch {
    throw httpError(502, "Filestack could not verify that upload. Try again.");
  }
  let raw;
  try {
    raw = (await readBoundedResponseBody(response, 32_000)).toString("utf8");
  } catch {
    throw httpError(502, "Filestack could not verify that upload. Try again.");
  }
  if (!response.ok) throw httpError(502, "Filestack could not verify that upload. Try again.");
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(502, "Filestack returned an invalid upload response.");
  }
}

async function readBoundedResponseBody(response, maxBytes, expectedBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Response body exceeded the allowed size.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body was unavailable.");
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response body exceeded the allowed size.");
    }
    chunks.push(Buffer.from(value));
  }
  if (Number.isInteger(expectedBytes) && totalBytes !== expectedBytes) {
    throw new Error("Response body size did not match verified metadata.");
  }
  return Buffer.concat(chunks, totalBytes);
}

async function downloadUploadedFile(handle, metadata, { appSecret, fetchImpl, nowMs }) {
  const expiry = Math.floor(nowMs / 1000) + SCAN_READ_POLICY_SECONDS;
  const security = signedPolicy({ expiry, call: ["read"], handle }, appSecret);
  const url = new URL(`https://cdn.filestackcontent.com/${handle}`);
  url.searchParams.set("policy", security.policy);
  url.searchParams.set("signature", security.signature);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/octet-stream", "User-Agent": "ClassLoop/1.0" },
      redirect: "error",
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8_000) : undefined,
    });
    if (!response.ok) throw new Error("Filestack download failed.");
    return await readBoundedResponseBody(response, MAX_FILE_BYTES, metadata.size);
  } catch {
    throw httpError(502, "ClassLoop could not securely inspect that upload. The file was not shared.");
  }
}

function validatedScanReceipt(value, nowMs) {
  if (!isPlainObject(value)) throw new Error("Invalid scanner receipt.");
  const { verdict, threats, engine, engineVersion, signatureUpdatedAt, scannedAt } = value;
  const signatureTime = Date.parse(signatureUpdatedAt);
  const scanTime = Date.parse(scannedAt);
  if (
    !["clean", "malicious"].includes(verdict) ||
    !Array.isArray(threats) ||
    threats.some((threat) => typeof threat !== "string" || !threat || threat.length > 200) ||
    engine !== "ClamAV" ||
    typeof engineVersion !== "string" ||
    !engineVersion ||
    engineVersion.length > 80 ||
    !Number.isFinite(signatureTime) ||
    !Number.isFinite(scanTime) ||
    signatureTime > nowMs + SCAN_RECEIPT_CLOCK_SKEW_MS ||
    nowMs - signatureTime > MAX_SIGNATURE_AGE_MS ||
    Math.abs(nowMs - scanTime) > SCAN_RECEIPT_CLOCK_SKEW_MS ||
    (verdict === "clean" && threats.length !== 0) ||
    (verdict === "malicious" && threats.length === 0)
  ) {
    throw new Error("Invalid scanner receipt.");
  }
  return { verdict, threats: [...threats], engine, engineVersion, signatureUpdatedAt, scannedAt };
}

async function scanUploadedFile(file, { scanner, fetchImpl, nowMs }) {
  let response;
  try {
    response = await fetchImpl(scanner.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${scanner.token}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(file.byteLength),
        "User-Agent": "ClassLoop/1.0",
      },
      body: file,
      redirect: "error",
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(20_000) : undefined,
    });
    const raw = await readBoundedResponseBody(response, MAX_SCANNER_RESPONSE_BYTES);
    if (!response.ok) throw new Error("Scanner rejected the request.");
    return validatedScanReceipt(JSON.parse(raw.toString("utf8")), nowMs);
  } catch {
    throw httpError(502, "ClassLoop could not complete malware scanning. The file was not shared.");
  }
}

async function deleteFilestackUpload(handle, { apiKey, appSecret, fetchImpl, nowMs }) {
  const expiry = Math.floor(nowMs / 1000) + 60;
  const security = signedPolicy({ expiry, call: ["remove"], handle }, appSecret);
  const url = new URL(`https://www.filestackapi.com/api/file/${handle}`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("policy", security.policy);
  url.searchParams.set("signature", security.signature);
  try {
    await fetchImpl(url, {
      method: "DELETE",
      headers: { Accept: "application/json", "User-Agent": "ClassLoop/1.0" },
      redirect: "error",
      signal: typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(8_000) : undefined,
    });
  } catch {
    // Cleanup is best effort. The original scan failure remains the user-facing result.
  }
}

function validateMetadata(metadata, { prefix, originalFilename, extension }) {
  if (!isPlainObject(metadata)) throw httpError(502, "Filestack returned invalid file metadata.");
  const filename = typeof metadata.filename === "string" ? metadata.filename : "";
  const mimetype = typeof metadata.mimetype === "string" ? metadata.mimetype.toLowerCase() : "";
  const size = Number(metadata.size);
  if (filename !== `${prefix}${originalFilename}`) {
    throw httpError(403, "That file does not belong to this upload session.");
  }
  if (!ALLOWED_MIME_TYPES.includes(mimetype) || !Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) {
    throw httpError(400, "Only PDF, TXT, and Markdown resources up to 10 MB are supported.");
  }
  if (extension === ".pdf" && mimetype !== "application/pdf") {
    throw httpError(400, "The selected PDF did not pass file-type verification.");
  }
  if ([".txt", ".md"].includes(extension) && !mimetype.startsWith("text/")) {
    throw httpError(400, "The selected text resource did not pass file-type verification.");
  }
  return { filename, mimetype, size };
}

function resourceTitle(filename) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Shared class resource";
}

async function authorizeTeacher(request, response, rateLimit) {
  const { supabase, user } = await requireUser(request, response, { rateLimit });
  const { data, error } = await supabase.from("classloop_profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (data?.role !== "teacher") throw httpError(403, "Only a teacher account can upload class resources.");
  return { user };
}

export function createFilestackUploadSessionHandler({
  authorize = (request, response) => authorizeTeacher(request, response, UPLOAD_RATE_LIMIT),
  env = process.env,
  now = Date.now,
  nonce = () => randomBytes(12).toString("hex"),
} = {}) {
  return async function filestackUploadSessionHandler(request, response) {
    try {
      assertIpRateLimit(request, response, UPLOAD_RATE_LIMIT);
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const { user } = await authorize(request, response);
      return json(response, 200, createFilestackUploadSession({ env, user, nowMs: now(), nonce: nonce() }), {
        "Cache-Control": "no-store",
      });
    } catch (error) {
      return sendApiError(response, error, "Secure file upload is unavailable right now.");
    }
  };
}

export function createFilestackFinalizeHandler({
  authorize = (request, response) => authorizeTeacher(request, response, FINALIZE_RATE_LIMIT),
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  return async function filestackFinalizeHandler(request, response) {
    try {
      assertIpRateLimit(request, response, FINALIZE_RATE_LIMIT);
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const { user } = await authorize(request, response);
      const details = validatedFinalizePayload(
        await readJsonBody(request, { maxBytes: 8_000, name: "Upload details" }),
      );
      const nowMs = now();
      const receipt = verifyUploadReceipt(details.receipt, { env, user, nowMs });
      const filestack = configuredFilestack(env);
      const scanner = configuredMalwareScanner(env);
      const { appSecret } = filestack;
      const metadata = await filestackMetadata(details.handle, { appSecret, fetchImpl, nowMs });
      const validatedMetadata = validateMetadata(metadata, { ...details, prefix: receipt.prefix });
      let scan;
      try {
        const file = await downloadUploadedFile(details.handle, validatedMetadata, { appSecret, fetchImpl, nowMs });
        scan = await scanUploadedFile(file, { scanner, fetchImpl, nowMs });
        if (scan.verdict === "malicious") {
          throw httpError(422, "Malware was detected. The file was blocked and not shared.");
        }
      } catch (error) {
        await deleteFilestackUpload(details.handle, { ...filestack, fetchImpl, nowMs });
        throw error;
      }
      const shareExpiry = Math.floor(nowMs / 1000) + SHARE_POLICY_SECONDS;
      const readSecurity = signedPolicy(
        { expiry: shareExpiry, call: ["read"], handle: details.handle },
        appSecret,
      );
      const url = new URL(`https://cdn.filestackcontent.com/${details.handle}`);
      url.searchParams.set("policy", readSecurity.policy);
      url.searchParams.set("signature", readSecurity.signature);
      return json(
        response,
        200,
        {
          title: resourceTitle(details.originalFilename),
          url: url.toString(),
          type: "worksheet",
          relatedTopic: "Teacher-uploaded resource",
          expiresAt: new Date(shareExpiry * 1000).toISOString(),
          scan,
        },
        { "Cache-Control": "no-store" },
      );
    } catch (error) {
      return sendApiError(response, error, "Filestack could not finalize that resource.");
    }
  };
}

export const filestackUploadSessionHandler = createFilestackUploadSessionHandler();
export const filestackFinalizeHandler = createFilestackFinalizeHandler();
