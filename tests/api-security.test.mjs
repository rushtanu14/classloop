import { strict as assert } from "node:assert";
import fs from "node:fs";
import vm from "node:vm";
import { assertCronAuthorization } from "../server/backend/api/ops/supabase-keepalive.js";
import { assertIpRateLimit, httpError, readJsonBody, sendApiError } from "../server/backend/api/_shared.js";
import { cloudStateReadResponse } from "../server/backend/api/cloud-state.js";
import {
  validateBillingAccountPayload,
  validateCheckoutPayload,
  validateCloudWorkspaceStatePayload,
  validateEmailRecapPayload,
  validateFeedbackPayload,
  validateProfilePatchPayload,
} from "../server/backend/api/validators.js";
import { billingPreparedProfileRow } from "../server/backend/api/billing/prepare-account.js";
import { billingPortalSessionOptions } from "../server/backend/api/billing/portal.js";
import { applyManualProGrantToRow } from "../server/backend/api/billing/manual-pro.js";
import {
  assertRecapEmailAuthorization,
  saveWorkspaceState,
  studentEmail,
} from "../server/backend/api/email/send-recaps.js";

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

function loadDesktopEmailContract() {
  const source = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");
  assert.match(
    source,
    /assertLocalRecapEmailAuthorization\(state, session\)/,
    "Desktop recap delivery must authorize against the server-loaded workspace and session.",
  );
  assert.match(
    source,
    /includeAccessInstructions:\s*body\.includeAccessInstructions/,
    "Desktop recap delivery must forward the validated access-instructions choice.",
  );
  const start = source.indexOf("function isPlainObject");
  const end = source.indexOf("async function handleStateApi");
  assert.ok(start >= 0 && end > start, "Desktop email contract functions should remain available for regression testing.");
  return vm.runInNewContext(
    `${source.slice(start, end)}
    ({
      assertLocalRecapEmailAuthorization,
      textForStudentEmail,
      validateEmailRequestPayload,
    });`,
    { Buffer, process, URL },
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
};

const authenticatedOwnerEmail = "teacher@classloop.test";
const validCloudSession = (overrides = {}) => ({
  id: "session-owned",
  ownerEmail: authenticatedOwnerEmail,
  isDemo: false,
  title: "Owned cloud session",
  type: "Math review",
  date: "2026-07-27",
  status: "published",
  students: [],
  transcript: "Class recap transcript.",
  notes: "",
  recap: "Students reviewed the lesson.",
  essentialQuestions: [],
  attendance: {},
  resources: [],
  actionItems: [],
  participationEvents: [],
  followUps: [],
  unmatchedParticipants: [],
  importWarnings: [],
  transcriptAliases: {},
  deliveryLogs: [],
  publishAudit: [],
  submissions: [],
  ...overrides,
});
const validPersonalMeeting = {
  id: "meeting-owned",
  ownerEmail: authenticatedOwnerEmail,
  title: "Owned personal meeting",
  date: "2026-07-27",
  minutes: "Meeting notes.",
  context: "",
  recap: "",
  resources: [],
  questions: [],
  tasks: [],
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};
const validClassGroup = {
  id: "class-owned",
  ownerEmail: authenticatedOwnerEmail,
  name: "Period 4",
  description: "",
  defaultSessionType: "Math review",
  students: [],
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};
const validRosterTemplate = {
  id: "roster-owned",
  ownerEmail: authenticatedOwnerEmail,
  name: "Period 4 roster",
  sessionType: "Math review",
  students: [],
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};
const validAuditLogEntry = {
  id: "audit-owned",
  actorEmail: authenticatedOwnerEmail,
  actorRole: "teacher",
  action: "cloud_upload",
  detail: "Uploaded the owned workspace.",
  createdAt: "2026-07-27T00:00:00.000Z",
};
const ownedWorkspaceState = {
  ...validWorkspaceState,
  sessions: [validCloudSession()],
  personalMeetings: [validPersonalMeeting],
  draft: validCloudSession({ id: "draft-owned", status: "draft" }),
  classGroups: [validClassGroup],
  rosterTemplates: [validRosterTemplate],
  auditLog: [validAuditLogEntry],
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
const confirmedTeacher = {
  id: "teacher-1",
  email: "teacher@classloop.test",
  email_confirmed_at: "2026-07-27T00:00:00.000Z",
};
assert.deepEqual(
  billingPortalSessionOptions(
    {
      stripe_customer_id: "cus_verified",
      subscription_id: "sub_verified",
    },
    "https://classloop.test/",
  ),
  {
    customer: "cus_verified",
    return_url: "https://classloop.test/#/billing",
    flow_data: {
      type: "subscription_cancel",
      subscription_cancel: {
        subscription: "sub_verified",
      },
      after_completion: {
        type: "redirect",
        redirect: {
          return_url: "https://classloop.test/#/billing?billing=subscription-updated",
        },
      },
    },
  },
  "Billing portal sessions should open Stripe's direct cancellation flow for the authenticated subscription.",
);
assertThrowsStatus(
  () => billingPortalSessionOptions({ stripe_customer_id: "", subscription_id: "" }, "https://classloop.test"),
  400,
  /Complete Stripe Checkout/i,
);
assertThrowsStatus(
  () => billingPortalSessionOptions(null, "https://classloop.test"),
  400,
  /Complete Stripe Checkout/i,
);
assertThrowsStatus(
  () => billingPortalSessionOptions({ stripe_customer_id: "cus_verified", subscription_id: "" }, "https://classloop.test"),
  400,
  /active Stripe subscription/i,
);
assertThrowsStatus(
  () =>
    billingPortalSessionOptions(
      {
        stripe_customer_id: "manual_pro_owner",
        subscription_id: "manual_pro_owner_grant",
      },
      "https://classloop.test",
    ),
  400,
  /no Stripe subscription/i,
);
const stripeBackedOwnerProfile = {
  email: "rushilcpm02@gmail.com",
  plan_tier: "pro",
  subscription_status: "active",
  stripe_customer_id: "cus_real_subscription",
  subscription_id: "sub_real_subscription",
  current_period_end: "2026-08-31T00:00:00.000Z",
};
assert.deepEqual(
  applyManualProGrantToRow(stripeBackedOwnerProfile),
  stripeBackedOwnerProfile,
  "A real Stripe subscription must take precedence over the included owner grant.",
);
const ownedPublishedSession = {
  id: "session-1",
  ownerEmail: "teacher@classloop.test",
  status: "published",
};
assert.doesNotThrow(() => assertRecapEmailAuthorization({
  user: confirmedTeacher,
  profile: { role: "teacher", email_delivery_enabled: true },
  session: ownedPublishedSession,
}));
assertThrowsStatus(
  () => assertRecapEmailAuthorization({
    user: confirmedTeacher,
    profile: { role: "teacher", email_delivery_enabled: false },
    session: ownedPublishedSession,
  }),
  403,
  /not enabled/i,
);
assertThrowsStatus(
  () => assertRecapEmailAuthorization({
    user: { ...confirmedTeacher, email: "attacker@classloop.test" },
    profile: { role: "teacher", email_delivery_enabled: true },
    session: ownedPublishedSession,
  }),
  403,
  /authenticated teacher/i,
);
assert.equal(
  studentEmail({
    id: "revoked-student",
    name: "Revoked Student",
    email: "revoked@classloop.test",
    linkedAccountEmail: "",
  }),
  "",
  "An explicitly unlinked student must not fall back to the roster email for delivery.",
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

assert.deepEqual(validateProfilePatchPayload({ noTrainingOnStudentData: true }), {
  noTrainingOnStudentData: true,
});
assertThrowsStatus(
  () => validateProfilePatchPayload({ noTrainingOnStudentData: false }),
  400,
  /cannot be disabled/i,
);
assertThrowsStatus(() => validateProfilePatchPayload({ role: "teacher" }), 400, /unsupported field/i);
assertThrowsStatus(() => validateProfilePatchPayload({ plan_tier: "pro" }), 400, /unsupported field/i);

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
  recipients: ["maya@classloop.test"],
  includeAccessInstructions: true,
}), {
  sessionId: "session-1",
  recipients: ["maya@classloop.test"],
  includeAccessInstructions: true,
});
assertThrowsStatus(() => validateEmailRecapPayload({ sessionId: "session-1", ownerEmail: "attacker@classloop.test" }), 400, /unsupported field/i);
assertThrowsStatus(() => validateEmailRecapPayload({ sessionId: "session-1", bcc: ["attacker@classloop.test"] }), 400, /unsupported field/i);
assertThrowsStatus(() => validateEmailRecapPayload({ sessionId: "session-1", recipients: ["bad-email"] }), 400, /expected format/i);
assertThrowsStatus(
  () => validateEmailRecapPayload({
    sessionId: "session-1",
    recipients: Array.from({ length: 101 }, (_, index) => `student${index}@classloop.test`),
  }),
  400,
  /at most 100/i,
);

const desktopEmailContract = loadDesktopEmailContract();
const desktopEmailPayload = desktopEmailContract.validateEmailRequestPayload({
  sessionId: "session-1",
  recipients: ["MAYA@CLASSLOOP.TEST"],
  includeAccessInstructions: true,
});
assert.equal(desktopEmailPayload.sessionId, "session-1");
assert.deepEqual([...desktopEmailPayload.recipients], ["maya@classloop.test"]);
assert.equal(desktopEmailPayload.includeAccessInstructions, true);
assertThrowsStatus(
  () => desktopEmailContract.validateEmailRequestPayload({
    sessionId: "session-1",
    ownerEmail: "attacker@classloop.test",
  }),
  400,
  /unsupported field/i,
);
assertThrowsStatus(
  () => desktopEmailContract.validateEmailRequestPayload({
    sessionId: "session-1",
    includeAccessInstructions: "yes",
  }),
  400,
  /must be a boolean/i,
);
const desktopTeacherState = {
  accounts: [{ role: "teacher", email: "teacher@classloop.test" }],
};
assert.doesNotThrow(() =>
  desktopEmailContract.assertLocalRecapEmailAuthorization(desktopTeacherState, ownedPublishedSession),
);
assertThrowsStatus(
  () => desktopEmailContract.assertLocalRecapEmailAuthorization(
    { accounts: [{ role: "student", email: "teacher@classloop.test" }] },
    ownedPublishedSession,
  ),
  403,
  /teacher-owned session/i,
);
const accessEmailText = desktopEmailContract.textForStudentEmail(
  { title: "Class recap", recap: "Review loops.", followUps: [], resources: [] },
  { id: "maya", name: "Maya", email: "maya@classloop.test" },
  true,
);
assert.match(accessEmailText, /Student access:/);
assert.match(accessEmailText, /maya@classloop\.test/);
assert.doesNotMatch(
  desktopEmailContract.textForStudentEmail(
    { title: "Class recap", recap: "Review loops.", followUps: [], resources: [] },
    { id: "maya", name: "Maya", email: "maya@classloop.test" },
    false,
  ),
  /Student access:/,
);

assertThrowsStatus(
  () => validateCloudWorkspaceStatePayload(validWorkspaceState),
  403,
  /authenticated account email/i,
);
assert.deepEqual(
  validateCloudWorkspaceStatePayload(validWorkspaceState, { ownerEmail: authenticatedOwnerEmail }),
  validWorkspaceState,
);
assertThrowsStatus(
  () =>
    validateCloudWorkspaceStatePayload(
      {
        ...validWorkspaceState,
        privacySettings: {
          ...validWorkspaceState.privacySettings,
          noTrainingOnStudentData: false,
        },
      },
      { ownerEmail: authenticatedOwnerEmail },
    ),
  400,
  /no-training protection/i,
);
for (const retentionDays of [29, 2_556]) {
  assertThrowsStatus(
    () =>
      validateCloudWorkspaceStatePayload(
        {
          ...validWorkspaceState,
          privacySettings: {
            ...validWorkspaceState.privacySettings,
            retentionDays,
          },
        },
        { ownerEmail: authenticatedOwnerEmail },
    ),
    400,
    /below the minimum|above the maximum/i,
  );
}
assert.doesNotThrow(() =>
  validateCloudWorkspaceStatePayload(ownedWorkspaceState, { ownerEmail: " Teacher@ClassLoop.test " }),
);
const legacyCaptureWorkspace = {
  ...validWorkspaceState,
  sessions: [
    validCloudSession({
      capture: {
        mode: "in_person",
        sourceLabel: "Legacy in-person class capture",
        capturedAt: "2026-07-27T00:00:00.000Z",
        durationSeconds: 60,
        transcriptSource: "live_transcription",
      },
    }),
  ],
};
assert.equal(
  validateCloudWorkspaceStatePayload(legacyCaptureWorkspace, {
    ownerEmail: authenticatedOwnerEmail,
  }).sessions[0].capture.mode,
  "in_person",
  "Legacy cloud sessions should stay readable without restoring the removed in-person control.",
);
assert.doesNotThrow(() =>
  validateCloudWorkspaceStatePayload(
    {
      ...validWorkspaceState,
      sessions: [
        validCloudSession({
          students: [{
            id: "revoked-student",
            name: "Revoked Student",
            email: "revoked@classloop.test",
            linkedAccountEmail: "",
            avatarColor: "#10b981",
            aliases: [],
          }],
        }),
      ],
    },
    { ownerEmail: authenticatedOwnerEmail },
  ),
);
assert.doesNotThrow(() =>
  validateCloudWorkspaceStatePayload(
    {
      ...validWorkspaceState,
      auditLog: [validAuditLogEntry],
    },
    { ownerEmail: authenticatedOwnerEmail },
  ),
);
assertThrowsStatus(
  () =>
    validateCloudWorkspaceStatePayload(
      {
        ...validWorkspaceState,
        auditLog: [{
          ...validAuditLogEntry,
          id: "audit-foreign",
          actorEmail: "attacker@classloop.test",
        }],
      },
      { ownerEmail: authenticatedOwnerEmail },
    ),
  400,
  /workspace owner/i,
);
[
  { sessions: [validCloudSession({ ownerEmail: "attacker@classloop.test" })] },
  { sessions: [validCloudSession({ ownerEmail: undefined })] },
  { draft: validCloudSession({ id: "draft-foreign", ownerEmail: "attacker@classloop.test" }) },
  { personalMeetings: [{ ...validPersonalMeeting, ownerEmail: "attacker@classloop.test" }] },
  { classGroups: [{ ...validClassGroup, ownerEmail: "attacker@classloop.test" }] },
  { rosterTemplates: [{ ...validRosterTemplate, ownerEmail: "attacker@classloop.test" }] },
  { auditLog: [{ ...validAuditLogEntry, actorEmail: "attacker@classloop.test" }] },
].forEach((override) => {
  assertThrowsStatus(
    () =>
      validateCloudWorkspaceStatePayload(
        { ...ownedWorkspaceState, ...override },
        { ownerEmail: authenticatedOwnerEmail },
      ),
    400,
    /workspace owner/i,
  );
});
assertThrowsStatus(
  () =>
    validateCloudWorkspaceStatePayload({
      ...validWorkspaceState,
      accounts: [{
        id: "teacher",
        role: "teacher",
        email: "teacher@classloop.test",
        name: "Teacher",
        passwordHash: "must-never-sync",
        createdAt: "2026-07-27T00:00:00.000Z",
      }],
      billingProfile: { tier: "pro", status: "active", customerId: "cus_attacker" },
    }, { ownerEmail: authenticatedOwnerEmail }),
  400,
  /must not include local identity or billing fields/i,
);
let savedWorkspaceRow = null;
await saveWorkspaceState(
  {
    from: (table) => {
      assert.equal(table, "classloop_workspace_state");
      return {
        upsert: async (row) => {
          savedWorkspaceRow = row;
          return { error: null };
        },
      };
    },
  },
  "teacher-user-id",
  authenticatedOwnerEmail,
  validWorkspaceState,
);
assert.equal(savedWorkspaceRow.owner_id, "teacher-user-id");
assert.deepEqual(
  savedWorkspaceRow.state,
  validWorkspaceState,
  "Post-send delivery state must pass authenticated-owner validation before persistence.",
);
const cloudRead = cloudStateReadResponse({
  state: validWorkspaceState,
  updated_at: "2026-07-27T12:00:00.000Z",
});
assert.equal(cloudRead.payload, validWorkspaceState, "Cloud GET should preserve the legacy raw workspace response.");
assert.equal(cloudRead.headers["X-ClassLoop-Updated-At"], "2026-07-27T12:00:00.000Z");
assert.equal(
  Object.hasOwn(cloudRead.payload, "state"),
  false,
  "Cloud GET must not wrap workspace data in a state property that legacy clients ignore.",
);
assertThrowsStatus(
  () =>
    validateCloudWorkspaceStatePayload(
      { ...validWorkspaceState, entitlementOverride: { tier: "pro" } },
      { ownerEmail: authenticatedOwnerEmail },
    ),
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
