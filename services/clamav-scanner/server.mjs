import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { getClamdVersionReceipt, scanBufferWithClamd } from "./clamd-client.mjs";

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
});
const MAX_RATE_BUCKETS = 10_000;

function json(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, { ...SECURITY_HEADERS, ...headers });
  response.end(JSON.stringify(payload));
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function positiveInteger(value, fallback, { min = 1, max }) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("Scanner configuration is invalid.");
  return parsed;
}

function configured(env) {
  const token = String(env.SCANNER_AUTH_TOKEN || "").trim();
  if (token.length < 32 || token.length > 512) throw new Error("Scanner authorization is not configured.");
  return {
    token,
    host: String(env.CLAMD_HOST || "clamav").trim(),
    port: positiveInteger(env.CLAMD_PORT, 3310, { max: 65_535 }),
    maxFileBytes: positiveInteger(env.MAX_FILE_BYTES, 10 * 1024 * 1024, { max: 10 * 1024 * 1024 }),
    timeoutMs: positiveInteger(env.CLAMD_TIMEOUT_MS, 15_000, { min: 100, max: 60_000 }),
    maxSignatureAgeMs: positiveInteger(env.MAX_SIGNATURE_AGE_HOURS, 48, { min: 1, max: 168 }) * 60 * 60 * 1000,
    rateLimit: positiveInteger(env.SCANNER_RATE_LIMIT_PER_MINUTE, 30, { max: 120 }),
  };
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(raw || request.socket.remoteAddress || "unknown").split(",")[0].trim();
}

async function readBody(request, maxFileBytes) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (!Number.isInteger(contentLength) || contentLength < 1) {
    const error = new Error("A non-empty file is required.");
    error.statusCode = 411;
    throw error;
  }
  if (contentLength > maxFileBytes) {
    request.resume();
    const error = new Error("File is too large.");
    error.statusCode = 413;
    throw error;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxFileBytes) {
      const error = new Error("File is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (totalBytes !== contentLength) {
    const error = new Error("File body is incomplete.");
    error.statusCode = 400;
    throw error;
  }
  return Buffer.concat(chunks);
}

function validReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  if (!["clean", "malicious"].includes(receipt.verdict) || receipt.engine !== "ClamAV") return false;
  if (typeof receipt.engineVersion !== "string" || receipt.engineVersion.length < 1 || receipt.engineVersion.length > 512) return false;
  if (!Number.isFinite(Date.parse(receipt.signatureUpdatedAt)) || !Number.isFinite(Date.parse(receipt.scannedAt))) return false;
  if (!Array.isArray(receipt.threats) || receipt.threats.length > 8) return false;
  if (receipt.verdict === "clean" && receipt.threats.length !== 0) return false;
  if (receipt.verdict === "malicious" && receipt.threats.length < 1) return false;
  return receipt.threats.every((threat) => typeof threat === "string" && threat.length > 0 && threat.length <= 200);
}

export function createScannerServer({ env = process.env, scanImpl = scanBufferWithClamd, healthImpl = getClamdVersionReceipt, now = Date.now } = {}) {
  const rateBuckets = new Map();
  let config;
  try {
    config = configured(env);
  } catch {
    config = null;
  }

  return createServer(async (request, response) => {
    try {
      if (!config) return json(response, 503, { error: "Scanner is unavailable." });

      if (request.method === "GET" && request.url === "/health") {
        const receipt = await healthImpl({
          host: config.host,
          port: config.port,
          timeoutMs: config.timeoutMs,
          maxSignatureAgeMs: config.maxSignatureAgeMs,
          now,
        });
        return json(response, 200, {
          status: "ready",
          engine: receipt.engine,
          signatureUpdatedAt: receipt.signatureUpdatedAt,
        });
      }

      if (request.method !== "POST" || request.url !== "/scan") {
        return json(response, 404, { error: "Route not found." });
      }
      if (!safeEqual(request.headers.authorization, `Bearer ${config.token}`)) {
        request.resume();
        return json(response, 401, { error: "Scanner authorization failed." });
      }

      const rateKey = clientIp(request);
      const nowMs = now();
      for (const [key, value] of rateBuckets) {
        if (value.resetAt <= nowMs) rateBuckets.delete(key);
      }
      if (rateBuckets.size >= MAX_RATE_BUCKETS && !rateBuckets.has(rateKey)) {
        rateBuckets.delete(rateBuckets.keys().next().value);
      }
      const previous = rateBuckets.get(rateKey);
      const bucket = previous && previous.resetAt > nowMs ? previous : { count: 0, resetAt: nowMs + 60_000 };
      bucket.count += 1;
      rateBuckets.set(rateKey, bucket);
      if (bucket.count > config.rateLimit) {
        request.resume();
        return json(response, 429, { error: "Too many scan requests." }, { "Retry-After": String(Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000))) });
      }

      const contentType = String(request.headers["content-type"] || "").toLowerCase().split(";")[0].trim();
      if (contentType !== "application/octet-stream") {
        request.resume();
        return json(response, 415, { error: "Use application/octet-stream." });
      }
      const body = await readBody(request, config.maxFileBytes);
      const receipt = await scanImpl(body, {
        host: config.host,
        port: config.port,
        timeoutMs: config.timeoutMs,
        maxFileBytes: config.maxFileBytes,
        maxSignatureAgeMs: config.maxSignatureAgeMs,
        now,
      });
      if (!validReceipt(receipt)) throw new Error("Scanner receipt is invalid.");
      return json(response, 200, receipt);
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 503;
      const message = statusCode < 500 ? error.message : "ClamAV could not complete the scan.";
      return json(response, statusCode, { error: message });
    }
  });
}

export { scanBufferWithClamd } from "./clamd-client.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = positiveInteger(process.env.PORT, 8787, { max: 65_535 });
  const server = createScannerServer();
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`ClassLoop ClamAV gateway listening on port ${port}.\n`);
  });
}
