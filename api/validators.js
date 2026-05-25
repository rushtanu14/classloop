import { field, httpError, isPlainObject, validateSchema } from "./_shared.js";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looseIdPattern = /^[A-Za-z0-9._:@/-]{1,160}$/;

const sessionTypes = ["Math review", "CS workshop", "General classroom", "Club meeting", "Study group"];
const taskStatuses = ["todo", "in_progress", "submitted", "reviewed", "complete", "overdue"];
const participationTypes = ["asked_question", "answered_question", "chat", "quiet", "absent"];
const attendanceStatuses = ["present", "absent", "late"];
const studentSubmissionStatuses = ["todo", "working", "submitted", "reviewed"];
const themeKeys = ["abyssal", "classroom", "botanical", "graphite"];
const billingStatuses = ["active", "trialing", "past_due", "canceled", "not_configured", "incomplete", "incomplete_expired", "unpaid", "paused"];
const feedbackSources = ["pilot_feedback", "student_followup_popup", "download_install_feedback", "incident_drill"];

// Feedback metadata is intentionally a small typed record so support context can
// be useful without becoming an unbounded transcript or arbitrary JSON sink.
const metadataValue = (value, name) => {
  if (typeof value === "string") return field.string({ max: 220 })(value, name);
  if (typeof value === "number") return field.number({})(value, name);
  if (typeof value === "boolean") return value;
  throw httpError(400, `${name} must be a string, number, or boolean.`);
};

const optionalIsoDate = field.string({ max: 40, optional: true, pattern: isoDatePattern });
const requiredIsoDate = field.string({ max: 40, pattern: isoDatePattern });
const requiredText = (max) => field.string({ max, trim: false });
const optionalText = (max, defaultValue) => field.string({ max, optional: true, defaultValue, trim: false });
const requiredTrimmed = (max, pattern) => field.string({ max, pattern });
const optionalTrimmed = (max, defaultValue, pattern) => field.string({ max, optional: true, defaultValue, pattern });
const optionalEmail = field.string({ max: 320, optional: true, pattern: emailPattern });

const studentSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  name: requiredTrimmed(160),
  email: field.string({ max: 320, pattern: emailPattern }),
  avatarColor: requiredTrimmed(40),
  guardian: optionalTrimmed(200),
  aliases: field.array(requiredTrimmed(160), { max: 20, optional: true, defaultValue: [] }),
  linkedAccountEmail: optionalEmail,
  inviteSentAt: optionalIsoDate,
};

const resourceSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  title: requiredTrimmed(220),
  url: field.string({ max: 2_048, pattern: /^https?:\/\/[^\s]+$/ }),
  type: field.enum(["video", "worksheet", "link", "slides"]),
  relatedTopic: optionalTrimmed(220, ""),
};

const actionItemSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  title: requiredTrimmed(220),
  description: optionalText(2_000, ""),
  ownerId: optionalTrimmed(160, undefined, looseIdPattern),
  dueDate: field.string({ max: 80 }),
  status: field.enum(taskStatuses),
  source: optionalTrimmed(120, ""),
};

const participationEventSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  studentId: requiredTrimmed(160, looseIdPattern),
  type: field.enum(participationTypes),
  text: optionalText(4_000, ""),
  confidence: field.number({ min: 0, max: 1 }),
  approved: field.boolean({ optional: true, defaultValue: false }),
  sourceLine: optionalText(4_000),
  reviewRequired: field.boolean({ optional: true }),
};

const followUpSchema = {
  studentId: requiredTrimmed(160, looseIdPattern),
  reminder: optionalText(4_000, ""),
  catchUp: optionalText(4_000, ""),
  tasks: field.array(requiredTrimmed(300), { max: 50 }),
  dueDate: field.string({ max: 80 }),
  status: field.enum(taskStatuses),
  score: field.number({ min: 0, max: 100 }),
};

const unmatchedParticipantSchema = {
  name: requiredTrimmed(160),
  lines: field.array(requiredText(2_000), { max: 50 }),
  suggestedStudentId: optionalTrimmed(160, undefined, looseIdPattern),
};

const importWarningSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  severity: field.enum(["info", "warning", "blocking"]),
  title: requiredTrimmed(220),
  message: requiredText(2_000),
  source: requiredTrimmed(120),
  reviewed: field.boolean({ optional: true }),
};

const captureSchema = {
  mode: field.enum(["transcript", "audio", "in_person", "online_meeting"]),
  sourceLabel: requiredTrimmed(220),
  capturedAt: requiredIsoDate,
  durationSeconds: field.number({ min: 0, max: 24 * 60 * 60, optional: true }),
  transcriptSource: field.enum(["file", "paste", "live_transcription", "audio_recording"]),
};

const emailDeliverySchema = {
  status: field.enum(["not_sent", "sent"]),
  sentAt: optionalIsoDate,
  provider: optionalTrimmed(80),
  recipients: field.array(field.string({ max: 320, pattern: emailPattern }), { max: 500 }),
  skipped: field.array(requiredTrimmed(160), { max: 500 }),
  failed: field.array(requiredText(500), { max: 500, optional: true, defaultValue: [] }),
  lastError: optionalText(500),
};

const deliveryLogSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  provider: field.enum(["email"]),
  target: requiredTrimmed(220),
  status: field.enum(["sent", "posted", "failed", "skipped"]),
  message: requiredText(1_000),
  createdAt: requiredIsoDate,
  recipientCount: field.number({ min: 0, max: 500, integer: true, optional: true }),
};

const publishAuditSchema = {
  sessionId: requiredTrimmed(160, looseIdPattern),
  studentId: optionalTrimmed(160, undefined, looseIdPattern),
  type: field.enum(["class_recap", "student_followup", "resource", "delivery", "completion"]),
  message: requiredText(1_000),
  createdAt: requiredIsoDate,
};

const submissionSchema = {
  studentId: requiredTrimmed(160, looseIdPattern),
  sessionId: requiredTrimmed(160, looseIdPattern),
  status: field.enum(studentSubmissionStatuses),
  note: optionalText(2_000, ""),
  submittedAt: optionalIsoDate,
  reviewedAt: optionalIsoDate,
};

const sessionSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  ownerEmail: optionalEmail,
  isDemo: field.boolean({ optional: true, defaultValue: false }),
  classGroupId: optionalTrimmed(160, undefined, looseIdPattern),
  classGroupName: optionalTrimmed(220),
  title: requiredTrimmed(220),
  type: field.enum(sessionTypes),
  date: field.string({ max: 40 }),
  status: field.enum(["draft", "published"]),
  students: field.array(field.object(studentSchema), { max: 500 }),
  transcript: requiredText(300_000),
  notes: optionalText(100_000, ""),
  capture: field.object(captureSchema, { optional: true }),
  recap: optionalText(60_000, ""),
  essentialQuestions: field.array(requiredTrimmed(300), { max: 20 }),
  attendance: field.record(field.enum(attendanceStatuses), { maxKeys: 500, keyMax: 160 }),
  resources: field.array(field.object(resourceSchema), { max: 100 }),
  actionItems: field.array(field.object(actionItemSchema), { max: 500 }),
  participationEvents: field.array(field.object(participationEventSchema), { max: 2_000 }),
  followUps: field.array(field.object(followUpSchema), { max: 500 }),
  unmatchedParticipants: field.array(field.object(unmatchedParticipantSchema), { max: 100, optional: true, defaultValue: [] }),
  importWarnings: field.array(field.object(importWarningSchema), { max: 100, optional: true, defaultValue: [] }),
  transcriptAliases: field.record(requiredTrimmed(160), { maxKeys: 500, keyMax: 160, optional: true, defaultValue: {} }),
  emailDelivery: field.object(emailDeliverySchema, { optional: true }),
  deliveryLogs: field.array(field.object(deliveryLogSchema), { max: 500, optional: true, defaultValue: [] }),
  publishAudit: field.array(field.object(publishAuditSchema), { max: 1_000, optional: true, defaultValue: [] }),
  submissions: field.array(field.object(submissionSchema), { max: 500, optional: true, defaultValue: [] }),
};

const themeSchema = {
  key: field.enum(themeKeys),
  accent: field.string({ max: 40, pattern: /^#[0-9A-Fa-f]{6}$/ }),
  imageUrl: field.string({ max: 2_048, optional: true, defaultValue: "" }),
};

const accountSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  role: field.enum(["teacher", "student"]),
  email: field.string({ max: 320, pattern: emailPattern }),
  name: requiredTrimmed(160),
  passwordHash: field.string({ max: 512 }),
  createdAt: requiredIsoDate,
  theme: field.object(themeSchema, { optional: true }),
  submittedProductFeedbackKeys: field.array(requiredTrimmed(320), { max: 500, optional: true, defaultValue: [] }),
  demo: field.boolean({ optional: true, defaultValue: false }),
};

const classGroupSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  ownerEmail: field.string({ max: 320, pattern: emailPattern }),
  name: requiredTrimmed(220),
  defaultSessionType: field.enum(sessionTypes),
  students: field.array(field.object(studentSchema), { max: 500 }),
  createdAt: requiredIsoDate,
  updatedAt: requiredIsoDate,
};

const rosterTemplateSchema = {
  id: requiredTrimmed(160, looseIdPattern),
  ownerEmail: field.string({ max: 320, pattern: emailPattern }),
  name: requiredTrimmed(220),
  sessionType: field.enum(sessionTypes),
  students: field.array(field.object(studentSchema), { max: 500 }),
  createdAt: requiredIsoDate,
  updatedAt: requiredIsoDate,
};

const privacySettingsSchema = {
  retentionDays: field.number({ min: 1, max: 3_650, integer: true }),
  recordingConsentRequired: field.boolean(),
  allowStudentExport: field.boolean(),
  auditLogEnabled: field.boolean(),
  noTrainingOnStudentData: field.boolean(),
};

const auditLogEntrySchema = {
  id: requiredTrimmed(160, looseIdPattern),
  actorEmail: field.string({ max: 320, pattern: emailPattern }),
  actorRole: field.enum(["teacher", "student"]),
  action: requiredTrimmed(120),
  detail: requiredText(1_000),
  createdAt: requiredIsoDate,
};

const billingProfileSchema = {
  tier: field.enum(["free", "pro"]),
  status: field.enum(billingStatuses),
  customerId: optionalTrimmed(120),
  currentPeriodEnd: optionalIsoDate,
};

// Hosted sync stores a whole workspace snapshot, so the top-level state and known
// nested records are schema-checked before writing to Supabase JSONB.
const cloudWorkspaceStateSchema = {
  accounts: field.array(field.object(accountSchema), { max: 500 }),
  sessions: field.array(field.object(sessionSchema), { max: 250 }),
  draft: field.nullableObject(sessionSchema),
  demoLoaded: field.boolean(),
  classGroups: field.array(field.object(classGroupSchema), { max: 100 }),
  rosterTemplates: field.array(field.object(rosterTemplateSchema), { max: 100 }),
  privacySettings: field.object(privacySettingsSchema),
  auditLog: field.array(field.object(auditLogEntrySchema), { max: 2_000 }),
  billingProfile: field.object(billingProfileSchema),
};

export function validateFeedbackPayload(payload) {
  return validateSchema(
    payload,
    {
      rating: field.number({ min: 1, max: 5, integer: true, optional: true, defaultValue: 3 }),
      note: optionalText(2_000, ""),
      role: field.enum(["teacher", "student"], { optional: true, defaultValue: "teacher" }),
      source: field.enum(feedbackSources, { optional: true, defaultValue: "pilot_feedback" }),
      transcript: optionalText(60_000, ""),
      metadata: field.record(metadataValue, {
        maxKeys: 12,
        keyMax: 50,
        optional: true,
        defaultValue: {},
        keyPattern: /^[A-Za-z0-9_.:-]+$/,
      }),
    },
    { name: "feedback" },
  );
}

export function validateProfilePatchPayload(payload) {
  const patch = validateSchema(
    payload,
    {
      noTrainingOnStudentData: field.boolean({ optional: true }),
      role: field.enum(["teacher", "student"], { optional: true }),
    },
    { name: "profile update" },
  );
  if (patch.noTrainingOnStudentData === undefined && patch.role === undefined) {
    throw httpError(400, "No supported profile updates were provided.");
  }
  return patch;
}

export function validateCheckoutPayload(payload) {
  return validateSchema(
    payload,
    {
      tier: field.enum(["pro"]),
      uiMode: field.enum(["embedded"], { optional: true }),
    },
    { name: "checkout request" },
  );
}

export function validateCloudWorkspaceStatePayload(payload) {
  if (!isPlainObject(payload)) {
    throw httpError(400, "Cloud workspace state must be an object.");
  }
  return validateSchema(payload, cloudWorkspaceStateSchema, { name: "cloud workspace state" });
}
