import { createClient } from "@supabase/supabase-js";

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 120;
const MAX_RATE_BUCKETS = 10_000;
const JSON_CONTENT_TYPE = "application/json";
const apiRateBuckets = new Map();

// API responses are JSON-only and cache-hostile because these endpoints handle auth,
// billing, sync, or student-adjacent payloads.
const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": JSON_CONTENT_TYPE,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Permissions-Policy":
    "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=(), xr-spatial-tracking=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

function setHeader(response, name, value) {
  if (typeof response.setHeader === "function") {
    response.setHeader(name, value);
    return;
  }
  if (typeof response.status === "function") {
    response.status(response.statusCode || 200).setHeader(name, value);
  }
}

export function json(response, status, payload, headers = {}) {
  if (typeof response.status === "function") response.status(status);
  response.statusCode = status;
  Object.entries({ ...securityHeaders, ...headers }).forEach(([name, value]) => setHeader(response, name, value));
  response.end(JSON.stringify(payload));
}

export function httpError(statusCode, message, { expose = true, details } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = expose;
  if (details) error.details = details;
  return error;
}

export function sendApiError(response, error, fallbackMessage = "Request failed.") {
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = statusCode < 500 || error?.expose ? error?.message || fallbackMessage : fallbackMessage;
  return json(response, statusCode, { error: message });
}

export function methodNotAllowed(response, allowedMethods) {
  return json(response, 405, { error: "Method not allowed." }, { Allow: allowedMethods.join(", ") });
}

export function originUrl(request) {
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host;
  const protocol = request.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${host}`;
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw httpError(503, "Hosted service is not available right now.");
  return value;
}

export function clientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const realIp = request.headers["x-real-ip"] || request.headers["cf-connecting-ip"];
  const rawForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const firstForwarded = rawForwarded ? rawForwarded.split(",")[0]?.trim() : "";
  const rawRealIp = Array.isArray(realIp) ? realIp[0] : realIp;
  return firstForwarded || rawRealIp || request.socket?.remoteAddress || "unknown";
}

function cleanupRateBuckets(now) {
  for (const [key, bucket] of apiRateBuckets) {
    if (bucket.resetAt <= now) apiRateBuckets.delete(key);
  }
  if (apiRateBuckets.size <= MAX_RATE_BUCKETS) return;
  const overflow = apiRateBuckets.size - MAX_RATE_BUCKETS;
  for (const key of Array.from(apiRateBuckets.keys()).slice(0, overflow)) {
    apiRateBuckets.delete(key);
  }
}

// In-memory buckets are a serverless-friendly guardrail, not a replacement for a
// provider-level WAF. They still stop common burst/retry abuse and return graceful 429s.
export function assertRateLimit(request, response, options = {}) {
  const now = Date.now();
  cleanupRateBuckets(now);

  const windowMs = options.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const limit = options.limit ?? DEFAULT_RATE_LIMIT_MAX;
  const identity = options.identity || `ip:${clientIp(request)}`;
  const endpoint = options.endpoint || "api";
  const key = `${endpoint}:${identity}`;
  const current = apiRateBuckets.get(key);
  const bucket =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + windowMs,
        };

  bucket.count += 1;
  apiRateBuckets.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  setHeader(response, "RateLimit-Limit", String(limit));
  setHeader(response, "RateLimit-Remaining", String(remaining));
  setHeader(response, "RateLimit-Reset", String(resetSeconds));

  if (bucket.count > limit) {
    setHeader(response, "Retry-After", String(resetSeconds));
    throw httpError(429, "Too many requests. Please wait a moment and try again.");
  }

  return { remaining, resetSeconds };
}

export function assertIpRateLimit(request, response, options = {}) {
  return assertRateLimit(request, response, {
    ...options,
    identity: `ip:${clientIp(request)}`,
  });
}

export function assertUserRateLimit(request, response, user, options = {}) {
  if (!user?.id) return null;
  return assertRateLimit(request, response, {
    ...options,
    identity: `user:${user.id}`,
  });
}

function headerValue(headers, name) {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || "";
}

function assertJsonContentType(request) {
  const contentType = headerValue(request.headers, "content-type").toLowerCase();
  if (!contentType.includes(JSON_CONTENT_TYPE)) {
    throw httpError(415, "Use application/json for this request.");
  }
}

function assertContentLength(request, maxBytes, name) {
  const contentLength = Number(headerValue(request.headers, "content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError(413, `${name} is too large.`);
  }
}

async function rawRequestBody(request, maxBytes, name) {
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > maxBytes) throw httpError(413, `${name} is too large.`);
    return request.body.toString("utf8");
  }
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > maxBytes) throw httpError(413, `${name} is too large.`);
    return request.body;
  }
  if (request.body && typeof request.body === "object") {
    const serialized = JSON.stringify(request.body);
    if (Buffer.byteLength(serialized) > maxBytes) throw httpError(413, `${name} is too large.`);
    return serialized;
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) throw httpError(413, `${name} is too large.`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonBody(request, { maxBytes = 64_000, allowEmpty = false, name = "Request body" } = {}) {
  assertJsonContentType(request);
  assertContentLength(request, maxBytes, name);
  const raw = await rawRequestBody(request, maxBytes, name);
  if (!raw.trim()) {
    if (allowEmpty) return {};
    throw httpError(400, `${name} is required.`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, `${name} must be valid JSON.`);
  }
}

export async function readRawBody(request, { maxBytes = 1_048_576, name = "Request body" } = {}) {
  assertContentLength(request, maxBytes, name);
  if (Buffer.isBuffer(request.body)) {
    if (request.body.length > maxBytes) throw httpError(413, `${name} is too large.`);
    return request.body;
  }
  if (typeof request.body === "string") {
    const body = Buffer.from(request.body);
    if (body.length > maxBytes) throw httpError(413, `${name} is too large.`);
    return body;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) throw httpError(413, `${name} is too large.`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

// The small schema helpers intentionally reject unknown fields to avoid mass-assignment
// bugs, especially around billing/profile state that must remain server-owned.
export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanText(value) {
  return String(value).normalize("NFC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function validateSchema(value, schema, { name = "payload" } = {}) {
  if (!isPlainObject(value)) {
    throw httpError(400, `${name} must be an object.`);
  }

  const allowed = new Set(Object.keys(schema));
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) {
    throw httpError(400, `${name} contains unsupported field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}.`);
  }

  const result = {};
  for (const [key, validator] of Object.entries(schema)) {
    const nextValue = validator(value[key], `${name}.${key}`);
    if (nextValue !== undefined) result[key] = nextValue;
  }
  return result;
}

function isMissing(value) {
  return value === undefined || value === null;
}

export const field = {
  string({ max, min = 0, optional = false, defaultValue, trim = true, pattern } = {}) {
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (typeof value !== "string") throw httpError(400, `${name} must be a string.`);
      const safe = trim ? cleanText(value).trim() : cleanText(value);
      if (safe.length < min) throw httpError(400, `${name} is too short.`);
      if (max !== undefined && safe.length > max) throw httpError(400, `${name} must be ${max} characters or fewer.`);
      if (pattern && !pattern.test(safe)) throw httpError(400, `${name} is not in the expected format.`);
      return safe;
    };
  },
  boolean({ optional = false, defaultValue } = {}) {
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (typeof value !== "boolean") throw httpError(400, `${name} must be true or false.`);
      return value;
    };
  },
  number({ min, max, integer = false, optional = false, defaultValue } = {}) {
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) throw httpError(400, `${name} must be a finite number.`);
      if (integer && !Number.isInteger(value)) throw httpError(400, `${name} must be an integer.`);
      if (min !== undefined && value < min) throw httpError(400, `${name} is below the minimum value.`);
      if (max !== undefined && value > max) throw httpError(400, `${name} is above the maximum value.`);
      return value;
    };
  },
  enum(values, { optional = false, defaultValue } = {}) {
    const allowed = new Set(values);
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (typeof value !== "string" || !allowed.has(value)) {
        throw httpError(400, `${name} must be one of: ${values.join(", ")}.`);
      }
      return value;
    };
  },
  object(schema, { optional = false, defaultValue } = {}) {
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      return validateSchema(value, schema, { name });
    };
  },
  nullableObject(schema) {
    return (value, name) => {
      if (value === null || value === undefined) return null;
      return validateSchema(value, schema, { name });
    };
  },
  array(itemValidator, { max, optional = false, defaultValue = [] } = {}) {
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (!Array.isArray(value)) throw httpError(400, `${name} must be an array.`);
      if (max !== undefined && value.length > max) throw httpError(400, `${name} may include at most ${max} items.`);
      return value.map((item, index) => itemValidator(item, `${name}[${index}]`));
    };
  },
  record(valueValidator, { maxKeys = 100, keyMax = 120, optional = false, defaultValue = {}, keyPattern } = {}) {
    return (value, name) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (!isPlainObject(value)) throw httpError(400, `${name} must be an object.`);
      const entries = Object.entries(value);
      if (entries.length > maxKeys) throw httpError(400, `${name} may include at most ${maxKeys} keys.`);
      return entries.reduce((safe, [key, entryValue]) => {
        const safeKey = cleanText(key).trim();
        if (!safeKey || safeKey.length > keyMax) throw httpError(400, `${name} contains an invalid key.`);
        if (keyPattern && !keyPattern.test(safeKey)) throw httpError(400, `${name} contains an invalid key.`);
        safe[safeKey] = valueValidator(entryValue, `${name}.${safeKey}`);
        return safe;
      }, {});
    };
  },
  anyJson({ optional = false, defaultValue, maxString = 10_000, maxDepth = 8 } = {}) {
    const validate = (value, name, depth) => {
      if (isMissing(value)) {
        if (optional) return defaultValue;
        throw httpError(400, `${name} is required.`);
      }
      if (typeof value === "string") {
        const safe = cleanText(value);
        if (safe.length > maxString) throw httpError(400, `${name} must be ${maxString} characters or fewer.`);
        return safe;
      }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw httpError(400, `${name} must be a finite number.`);
        return value;
      }
      if (typeof value === "boolean" || value === null) return value;
      if (depth >= maxDepth) throw httpError(400, `${name} is nested too deeply.`);
      if (Array.isArray(value)) return value.map((item, index) => validate(item, `${name}[${index}]`, depth + 1));
      if (isPlainObject(value)) {
        return Object.entries(value).reduce((safe, [key, entryValue]) => {
          const safeKey = cleanText(key).trim();
          if (!safeKey || safeKey.length > 120) throw httpError(400, `${name} contains an invalid key.`);
          safe[safeKey] = validate(entryValue, `${name}.${safeKey}`, depth + 1);
          return safe;
        }, {});
      }
      throw httpError(400, `${name} must be JSON-compatible.`);
    };
    return (value, name) => validate(value, name, 0);
  },
};

export function getSupabaseAdmin() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function requireUser(request, response, options = {}) {
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) {
    throw httpError(401, "Sign in before using cloud sync.");
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw httpError(401, "Invalid or expired session.");
  }
  if (options.rateLimit && response) {
    assertUserRateLimit(request, response, data.user, options.rateLimit);
  }
  return { supabase, user: data.user };
}

export function publicConfig() {
  return {
    version: "classloop-free-pro-2026-05-10",
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID),
  };
}
