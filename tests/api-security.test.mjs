import { strict as assert } from "node:assert";
import { assertCronAuthorization } from "../server/backend/api/ops/supabase-keepalive.js";
import { assertIpRateLimit, httpError, readJsonBody, sendApiError } from "../server/backend/api/_shared.js";
import {
  validateBillingAccountPayload,
  validateCheckoutPayload,
  validateCloudWorkspaceStatePayload,
  validateEmailRecapPayload,
  validateFeedbackPayload,
  validateProfilePatchPayload,
} from "../server/backend/api/validators.js";
import { billingPreparedProfileRow } from "../server/backend/api/billing/prepare-account.js";

function assertThrowsStatus(fn, statusCode, messagePattern) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error.statusCode, statusCode);
      if (messagePattern) assert.match(error.message, messagePattern);
      return true;
    },
  );
}

function mockRequest({ method = "POST", headers = {}, body = {} } = {}) {
  return {
    method,
    headers: {
      host: "classloop.test",
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
      ...headers,
    },
    body,
    async *[Symbol.asyncIterator]() {
      if (body === undefined || body === null) return;
      yield Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    },
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    end(payload = "") {
      this.body = String(payload);
      return this;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

const validWorkspaceState = {
  accounts: [],
  sessions: [],
  personalMeetings: [],
  draft: null,
  demoLoaded: false,
  classGroups: [],
  rosterTemplates: [],
  privacySettings: {
    retentionDays: 180,
    recordingConsentRequired: true,
    allowStudentExport: true,
    auditLogEnabled: true,
    noTrainingOnStudentData: true,
  },
  auditLog: [],
  billingProfile: {
    tier: "free",
    status: "not_configured",
  },
};

const validFeedback = validateFeedbackPayload({
  rating: 5,
  note: "Useful follow-up",
  role: "student",
  source: "student_followup_popup",
  transcript: "Student said hello.",
  metadata: { page: "student", score: 5, helpful: true },
});
assert.equal(validFeedback.rating, 5);
assert.equal(validFeedback.metadata.page, "student");

assertThrowsStatus(
  () => validateFeedbackPayload({ rating: 5, role: "student", source: "student_followup_popup", surprise: true }),
  400,
  /unsupported field/i,
);
assertThrowsStatus(
  () => validateFeedbackPayload({ rating: "5", role: "student", source: "student_followup_popup" }),
  400,
  /finite number/i,
);
assertThrowsStatus(
  () => validateFeedbackPayload({ rating: 5, role: "student", source: "student_followup_popup", metadata: { bad: { nested: true } } }),
  400,
  /string, number, or boolean/i,
);

assert.deepEqual(validateProfilePatchPayload({ role: "teacher", noTrainingOnStudentData: false }), {
  role: "teacher",
  noTrainingOnStudentData: false,
});
assert.deepEqual(validateProfilePatchPayload({ role: "individual" }), { role: "individual" });
assertThrowsStatus(() => validateProfilePatchPayload({ plan_tier: "pro" }), 400, /unsupported field/i);
assertThrowsStatus(() => validateProfilePatchPayload({ role: "owner" }), 400, /one of/i);

assert.deepEqual(validateCheckoutPayload({ tier: "pro", uiMode: "embedded" }), { tier: "pro", uiMode: "embedded" });
assertThrowsStatus(() => validateCheckoutPayload({ tier: "free" }), 400, /one of/i);
assertThrowsStatus(() => validateCheckoutPayload({ tier: "pro", price: "price_attacker" }), 400, /unsupported field/i);

const validBillingAccount = validateBillingAccountPayload({
  email: "teacher@classloop.test",
  password: "teacher-pass-123",
  role: "teacher",
  name: "Ms. Rivera",
});
assert.deepEqual(validBillingAccount, {
  email: "teacher@classloop.test",
  password: "teacher-pass-123",
  role: "teacher",
  name: "Ms. Rivera",
});
assertThrowsStatus(() => validateBillingAccountPayload({ email: "teacher@classloop.test", password: "short", role: "teacher" }), 400, /too short/i);
assertThrowsStatus(() => validateBillingAccountPayload({ email: "teacher@classloop.test", password: "teacher-pass-123", role: "student" }), 400, /one of/i);
assertThrowsStatus(
  () => validateBillingAccountPayload({ email: "teacher@classloop.test", password: "teacher-pass-123", role: "teacher", plan_tier: "pro" }),
  400,
  /unsupported field/i,
);
const preparedProfile = billingPreparedProfileRow(
  { id: "00000000-0000-4000-8000-000000000123", email: "teacher@classloop.test" },
  validBillingAccount,
);
assert.equal(preparedProfile.plan_tier, "free");
assert.equal(preparedProfile.subscription_status, "not_configured");
assert.equal(preparedProfile.no_training_on_student_data, true);
const preparedOwnerProfile = billingPreparedProfileRow(
  { id: "00000000-0000-4000-8000-000000000124", email: "rushilcpm02@gmail.com" },
  { ...validBillingAccount, email: "rushilcpm02@gmail.com" },
);
assert.equal(preparedOwnerProfile.plan_tier, "pro");
assert.equal(preparedOwnerProfile.subscription_status, "active");
assert.equal(preparedOwnerProfile.stripe_customer_id, "manual_pro_rushilcpm02_gmail_com");

assert.deepEqual(validateEmailRecapPayload({
  sessionId: "session-1",
  ownerEmail: "teacher@classloop.test",
  recipients: ["maya@classloop.test"],
  includeAccessInstructions: true,
}), {
  sessionId: "session-1",
  ownerEmail: "teacher@classloop.test",
  recipients: ["maya@classloop.test"],
  includeAccessInstructions: true,
});
assertThrowsStatus(() => validateEmailRecapPayload({ sessionId: "session-1", ownerEmail: "teacher@classloop.test", bcc: ["attacker@classloop.test"] }), 400, /unsupported field/i);
assertThrowsStatus(() => validateEmailRecapPayload({ sessionId: "session-1", ownerEmail: "teacher@classloop.test", recipients: ["bad-email"] }), 400, /expected format/i);

assert.deepEqual(validateCloudWorkspaceStatePayload(validWorkspaceState), validWorkspaceState);
assertThrowsStatus(
  () => validateCloudWorkspaceStatePayload({ ...validWorkspaceState, entitlementOverride: { tier: "pro" } }),
  400,
  /unsupported field/i,
);

const rateResponse = mockResponse();
const rateRequest = mockRequest({ headers: { "x-forwarded-for": "198.51.100.10" } });
const endpoint = `api-security-test-${Date.now()}`;
assertIpRateLimit(rateRequest, rateResponse, { endpoint, limit: 2, windowMs: 60_000 });
assertIpRateLimit(rateRequest, rateResponse, { endpoint, limit: 2, windowMs: 60_000 });
assertThrowsStatus(() => assertIpRateLimit(rateRequest, rateResponse, { endpoint, limit: 2, windowMs: 60_000 }), 429, /too many/i);
assert.ok(rateResponse.headers["retry-after"], "429 responses should include Retry-After.");
assert.ok(rateResponse.headers["ratelimit-remaining"], "rate-limit headers should be emitted.");

const oldCronSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "cron-test-secret";
assert.doesNotThrow(() =>
  assertCronAuthorization(mockRequest({ method: "GET", headers: { authorization: "Bearer cron-test-secret" } })),
);
assertThrowsStatus(() => assertCronAuthorization(mockRequest({ method: "GET" })), 401, /unauthorized/i);
if (oldCronSecret === undefined) {
  delete process.env.CRON_SECRET;
} else {
  process.env.CRON_SECRET = oldCronSecret;
}

await assert.rejects(
  readJsonBody(mockRequest({ headers: { "content-type": "text/plain" }, body: "{}" })),
  (error) => {
    assert.equal(error.statusCode, 415);
    assert.match(error.message, /application\/json/i);
    return true;
  },
);

const safeErrorResponse = mockResponse();
sendApiError(safeErrorResponse, new Error("database stack trace with secret"), "Safe fallback.");
assert.equal(safeErrorResponse.statusCode, 500);
assert.deepEqual(safeErrorResponse.json(), { error: "Safe fallback." });

const exposedErrorResponse = mockResponse();
sendApiError(exposedErrorResponse, httpError(400, "Bad input."));
assert.equal(exposedErrorResponse.statusCode, 400);
assert.deepEqual(exposedErrorResponse.json(), { error: "Bad input." });

console.log("API security tests passed: rate limits, strict schemas, JSON content types, and safe errors are enforced.");
