import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { loadIntegrationRecordDetails, mergeIntegrationDraftFields } from "./composio-detail-imports.js";
import { classLoopComposioUserId, previewTeacherIntegration } from "./composio-runtime.js";
import { httpError } from "./api/_shared.js";
const SELECTION_PREFIX = "clsi1";
const SELECTION_AAD = Buffer.from("classloop-integration-selection:v1", "utf8");
const SELECTION_TTL_MS = 12 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;
const MAX_SELECTION_TOKEN_CHARS = 4_096;
const MAX_RECORDS = 25;
const MAX_PROVIDER_ARRAY_ITEMS = 60;
const MAX_PROVIDER_OBJECT_KEYS = 100;
const MAX_PROVIDER_STRING_CHARS = 20_000;
const MAX_PROVIDER_TOTAL_CHARS = 60_000;
const MAX_PROVIDER_NODES = 2_000;
const MAX_TITLE_CHARS = 160;
const MAX_SUBTITLE_CHARS = 240;
const MAX_NOTES_CHARS = 16_000;
const MAX_TRANSCRIPT_CHARS = 25_000;
const MAX_ROSTER_ITEMS = 50;
const MAX_RESOURCE_ITEMS = 12;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SECRET_KEY_PATTERN =
  /(?:^|[_-])(?:access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|token|client[_-]?secret|consumer[_-]?secret|webhook[_-]?secret|signing[_-]?secret|secret|password|authorization|cookie|api[_-]?key|private[_-]?key|oauth|credential)(?:$|[_-])/i;
const PROVIDER_RESOURCE_NAME_PATTERN =
  /^(?:conferenceRecords|spaces|courses|documents|files|forms|taskLists|pages|databases|teams|channels|chats|users)(?:\/[A-Za-z0-9._-]+)+$/i;
const SENSITIVE_URL_PARAMETER_PATTERN =
  /^(?:access[_-]?token|auth|authorization|code|credential|expires?|key|signature|sig|token|x-amz-.+)$/i;
const PROVIDER_LABELS = Object.freeze({
  google_classroom: "Google Classroom",
  zoom: "Zoom",
  googlecalendar: "Google Calendar",
  googlemeet: "Google Meet",
  googledrive: "Google Drive",
  googledocs: "Google Docs",
  googlesheets: "Google Sheets",
  googletasks: "Google Tasks",
  googleforms: "Google Forms",
  canvas: "Canvas",
  blackboard: "Blackboard",
  outlook: "Outlook",
  microsoft_teams: "Microsoft Teams",
  slack: "Slack",
  notion: "Notion",
});
const COLLECTION_KEYS = Object.freeze({
  google_classroom: ["courses", "course"],
  zoom: ["meetings", "recordings"],
  googlecalendar: ["events", "items", "calendars"],
  googlemeet: ["conferenceRecords", "conference_records", "records", "meetings"],
  googledrive: ["files", "items"],
  googledocs: [],
  googlesheets: [],
  googletasks: ["tasks", "taskLists", "task_lists", "items"],
  googleforms: [],
  canvas: ["courses", "assignments", "announcements"],
  blackboard: ["courses", "results", "announcements"],
  outlook: ["messages", "emails", "events", "value"],
  microsoft_teams: ["teams", "channels", "messages", "chats", "value"],
  slack: ["messages", "channels", "items"],
  notion: ["results", "pages", "items"],
});
const ROOT_RECORD_INTEGRATIONS = new Set(["googledocs", "googlesheets", "googleforms"]);
const TITLE_PATHS = [
  "topic",
  "title",
  "name",
  "summary",
  "subject",
  "displayName",
  "display_name",
  "properties.title",
  "properties.name",
  "document.title",
  "documentTitle",
  "info.title",
  "spreadsheet.properties.title",
];
const SUBTITLE_PATHS = [
  "section",
  "agenda",
  "description",
  "bodyPreview",
  "body_preview",
  "channel_name",
  "room",
  "status",
];
const NOTE_PATHS = Object.freeze({
  google_classroom: ["section", "description", "descriptionHeading", "room"],
  zoom: ["agenda", "description", "summary"],
  googlecalendar: ["description", "location", "start.dateTime", "start.date", "end.dateTime", "end.date"],
  googlemeet: ["description", "startTime", "endTime"],
  googledrive: ["description", "mimeType", "modifiedTime"],
  googledocs: ["text", "plainText", "plain_text", "markdown", "content", "body"],
  googlesheets: ["description", "properties.title"],
  googletasks: ["notes", "status", "due"],
  googleforms: ["description", "documentTitle", "info.description"],
  canvas: ["course_code", "description", "term.name", "workflow_state"],
  blackboard: ["description", "availability.available"],
  outlook: ["bodyPreview", "body_preview", "body.content", "receivedDateTime"],
  microsoft_teams: ["description", "text", "body.content", "displayName"],
  slack: ["text", "topic.value", "purpose.value"],
  notion: ["markdown", "text", "content", "description"],
});
const RESOURCE_PATHS = Object.freeze({
  google_classroom: ["alternateLink", "alternate_link"],
  zoom: [],
  googlecalendar: ["htmlLink", "html_link"],
  googlemeet: [],
  googledrive: ["webViewLink", "web_view_link"],
  googledocs: ["documentUrl", "document_url"],
  googlesheets: ["spreadsheetUrl", "spreadsheet_url"],
  googletasks: ["webViewLink", "web_view_link"],
  googleforms: ["responderUri", "responder_uri"],
  canvas: ["html_url"],
  blackboard: ["webUrl", "web_url"],
  outlook: [],
  microsoft_teams: [],
  slack: [],
  notion: ["url", "public_url"],
});
function nowMs(options) {
  const value = typeof options.now === "function" ? options.now() : options.now;
  return Number.isFinite(value) ? Number(value) : Date.now();
}
function cleanString(value, max = MAX_PROVIDER_STRING_CHARS) {
  if (typeof value !== "string") return "";
  const bounded = value.length > max ? value.slice(0, max) : value;
  return bounded
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}
function policyKey(value) {
  return cleanString(value, 120)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}
function isSecretKey(value) {
  return SECRET_KEY_PATTERN.test(policyKey(value));
}
function safeProviderValue(value, budget, depth = 0) {
  if (budget.chars <= 0 || budget.nodes <= 0) {
    budget.truncated = true;
    return "[truncated]";
  }
  budget.nodes -= 1;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const allowed = Math.min(MAX_PROVIDER_STRING_CHARS, budget.chars);
    const safe = cleanString(value, allowed);
    budget.chars -= safe.length;
    if (value.length > allowed) budget.truncated = true;
    return safe;
  }
  if (depth >= 8) {
    budget.truncated = true;
    return "[nested data omitted]";
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PROVIDER_ARRAY_ITEMS) budget.truncated = true;
    return value
      .slice(0, MAX_PROVIDER_ARRAY_ITEMS)
      .map((item) => safeProviderValue(item, budget, depth + 1));
  }
  if (value && typeof value === "object") {
    const safe = Object.create(null);
    const entries = Object.entries(value);
    if (entries.length > MAX_PROVIDER_OBJECT_KEYS) budget.truncated = true;
    for (const [rawKey, entryValue] of entries.slice(0, MAX_PROVIDER_OBJECT_KEYS)) {
      const key = cleanString(rawKey, 120);
      if (!key || DANGEROUS_KEYS.has(key)) {
        if (key) budget.truncated = true;
        continue;
      }
      if (isSecretKey(key)) {
        safe[key] = "[redacted]";
        continue;
      }
      safe[key] = safeProviderValue(entryValue, budget, depth + 1);
    }
    return safe;
  }
  return "";
}
function sanitizeProviderRecord(value) {
  const budget = {
    chars: MAX_PROVIDER_TOTAL_CHARS,
    nodes: MAX_PROVIDER_NODES,
    truncated: false,
  };
  const safe = safeProviderValue(value, budget);
  return { safe, truncated: budget.truncated };
}
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function queryDigest(query) {
  return digest(cleanString(query, 240));
}
function selectionKey(options) {
  const environment = options.env ?? process.env;
  const secret = options.selectionSecret ?? environment.CLASSLOOP_INTEGRATION_SELECTION_SECRET;
  if (typeof secret !== "string" || secret.length < 32) {
    throw httpError(503, "Integration selection security is not configured.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}
function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
function issueSelection(payload, options) {
  const key = selectionKey(options);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(SELECTION_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    SELECTION_PREFIX,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}
function invalidSelection(message = "This integration selection is invalid. Refresh the records and try again.") {
  return httpError(400, message);
}
function openSelection(token, options) {
  if (
    typeof token !== "string" ||
    token.length > MAX_SELECTION_TOKEN_CHARS ||
    !/^clsi1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw invalidSelection();
  }
  const [, ivText, ciphertextText, tagText] = token.split(".");
  try {
    const iv = Buffer.from(ivText, "base64url");
    const ciphertext = Buffer.from(ciphertextText, "base64url");
    const tag = Buffer.from(tagText, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 16) throw new Error("invalid");
    const decipher = createDecipheriv("aes-256-gcm", selectionKey(options), iv);
    decipher.setAAD(SELECTION_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext);
    const allowedKeys = new Set([
      "schemaVersion",
      "userId",
      "integrationId",
      "queryHash",
      "recordIndex",
      "fingerprint",
      "tool",
      "toolVersion",
      "connectionBinding",
      "issuedAt",
      "expiresAt",
    ]);
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      Object.keys(payload).some((key) => !allowedKeys.has(key)) ||
      payload.schemaVersion !== 1 ||
      typeof payload.userId !== "string" ||
      typeof payload.integrationId !== "string" ||
      typeof payload.queryHash !== "string" ||
      !Number.isInteger(payload.recordIndex) ||
      payload.recordIndex < 0 ||
      typeof payload.fingerprint !== "string" ||
      typeof payload.tool !== "string" ||
      typeof payload.toolVersion !== "string" ||
      typeof payload.connectionBinding !== "string" ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt)
    ) {
      throw new Error("invalid");
    }
    return payload;
  } catch (error) {
    if (error?.statusCode === 503) throw error;
    throw invalidSelection();
  }
}
function valueAt(record, path) {
  let current = record;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || DANGEROUS_KEYS.has(part)) return undefined;
    current = current[part];
  }
  return current;
}
function firstText(record, paths, max) {
  for (const path of paths) {
    const value = valueAt(record, path);
    const safe = cleanString(
      typeof value === "number" ? String(value) : value,
      max,
    );
    if (safe && safe !== "[redacted]") return safe;
  }
  return "";
}
function titleFor(record, providerLabel) {
  for (const path of TITLE_PATHS) {
    const title = firstText(record, [path], MAX_TITLE_CHARS);
    if (title && !PROVIDER_RESOURCE_NAME_PATTERN.test(title)) return title;
  }
  return `${providerLabel} classroom record`;
}
function validOccurredAt(value) {
  const safe = cleanString(value, 80);
  if (!safe) return undefined;
  const timestamp = Date.parse(safe);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}
function occurredAtFor(record) {
  for (const path of [
    "start.dateTime",
    "start.date",
    "start_time",
    "startTime",
    "created_time",
    "createdTime",
    "receivedDateTime",
    "due",
    "date",
  ]) {
    const occurredAt = validOccurredAt(valueAt(record, path));
    if (occurredAt) return occurredAt;
  }
  return undefined;
}
function findCollection(root, preferredKeys) {
  if (!root || typeof root !== "object") return null;
  const preferred = new Set(preferredKeys);
  const queue = [{ value: root, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value) || depth > 5) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      if (preferred.has(key) && Array.isArray(child)) return child;
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === "object" && !Array.isArray(child)) {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return null;
}
function fallbackCollection(root) {
  if (!root || typeof root !== "object") return null;
  for (const [key, value] of Object.entries(root)) {
    if (
      !DANGEROUS_KEYS.has(key) &&
      !["values", "rows", "students", "participants", "attendees", "transcript"].includes(key) &&
      Array.isArray(value) &&
      value.length &&
      value.every((item) => item && typeof item === "object")
    ) {
      return value;
    }
  }
  return null;
}
function rawCandidates(integrationId, safeData) {
  if (Array.isArray(safeData)) return safeData;
  if (ROOT_RECORD_INTEGRATIONS.has(integrationId)) return [safeData];
  const preferred = findCollection(safeData, COLLECTION_KEYS[integrationId] ?? []);
  if (preferred) return preferred;
  const fallback = fallbackCollection(safeData);
  if (fallback) return fallback;
  if (safeData && typeof safeData === "object") return [safeData];
  return [{ content: safeData }];
}
function actorName(entry) {
  return firstText(
    entry,
    [
      "speaker_name",
      "speakerName",
      "speaker",
      "user_name",
      "userName",
      "author.displayName",
      "author.name",
      "profile.name.fullName",
      "name",
    ],
    120,
  );
}
function semanticText(value, max = MAX_PROVIDER_STRING_CHARS) {
  if (typeof value === "string") return cleanString(value, max);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((entry) => {
        if (typeof entry === "string") return cleanString(entry, max);
        if (!entry || typeof entry !== "object") return "";
        const text = firstText(entry, ["text", "content", "body.content", "message", "markdown"], max);
        const actor = actorName(entry);
        return text ? (actor ? `${actor}: ${text}` : text) : "";
      })
      .filter(Boolean)
      .join("\n")
      .slice(0, max);
  }
  if (value && typeof value === "object") {
    for (const path of ["entries", "items", "segments", "text", "content", "body.content", "markdown"]) {
      const nested = valueAt(value, path);
      const text = semanticText(nested, max);
      if (text) return text;
    }
  }
  return "";
}
function transcriptFor(record, integrationId) {
  if (!["zoom", "googlemeet"].includes(integrationId)) return "";
  for (const path of [
    "transcript",
    "transcript.entries",
    "transcriptEntries",
    "transcript_entries",
    "captions",
    "segments",
  ]) {
    const transcript = semanticText(valueAt(record, path), MAX_TRANSCRIPT_CHARS);
    if (transcript) return transcript;
  }
  return "";
}
function noteValues(record, integrationId) {
  const notes = [];
  let remaining = MAX_NOTES_CHARS;
  for (const path of NOTE_PATHS[integrationId] ?? []) {
    if (remaining <= 0) break;
    const text = semanticText(valueAt(record, path), remaining);
    if (!text || text === "[redacted]" || notes.includes(text)) continue;
    notes.push(text);
    remaining -= text.length;
  }
  return notes.slice(0, 20);
}
function safeEmail(value) {
  const email = cleanString(value, 254).toLowerCase();
  if (
    !email ||
    email.startsWith(".") ||
    email.includes("..") ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(email)
  ) {
    return "";
  }
  return email;
}
function rosterPerson(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = firstText(
    value,
    [
      "name",
      "displayName",
      "fullName",
      "profile.name.fullName",
      "profile.name.givenName",
      "user.name",
    ],
    120,
  );
  const rawEmail = cleanString(
    valueAt(value, "email") ??
      valueAt(value, "emailAddress") ??
      valueAt(value, "profile.emailAddress") ??
      valueAt(value, "user.email"),
    254,
  );
  const email = safeEmail(rawEmail);
  if (rawEmail && !email) return null;
  if (!name || /^(?:student\s+)?name$/i.test(name)) return null;
  const person = { name };
  if (email) person.email = email;
  return person;
}
function findArrayByKey(root, keys, depth = 0) {
  if (!root || typeof root !== "object" || depth > 6) return null;
  for (const [key, value] of Object.entries(root)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (keys.includes(key) && Array.isArray(value)) return value;
  }
  for (const value of Object.values(root)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = findArrayByKey(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
function sheetRoster(record) {
  const values = findArrayByKey(record, ["values", "rows"]);
  if (!Array.isArray(values) || !values.length) return [];
  if (values.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
    return values.map(rosterPerson).filter(Boolean);
  }
  if (!values.every(Array.isArray)) return [];
  const rows = values.slice(0, MAX_ROSTER_ITEMS + 1);
  const header = rows[0].map((cell) => cleanString(cell, 80).toLowerCase());
  const nameIndex = header.findIndex((cell) => /(?:student\s*)?name/.test(cell));
  const emailIndex = header.findIndex((cell) => /e-?mail/.test(cell));
  const hasHeader = nameIndex >= 0 || emailIndex >= 0;
  return rows.slice(hasHeader ? 1 : 0).map((row) => {
    const name = cleanString(row[nameIndex >= 0 ? nameIndex : 0], 120);
    const rawEmail = cleanString(row[emailIndex >= 0 ? emailIndex : 1], 254);
    const email = safeEmail(rawEmail);
    if (rawEmail && !email) return null;
    if (!name) return null;
    return email ? { name, email } : { name };
  }).filter(Boolean);
}
function rosterFor(record, integrationId) {
  let people = [];
  if (integrationId === "googlesheets") people = sheetRoster(record);
  if (integrationId === "google_classroom") {
    const students = findArrayByKey(record, ["students", "roster"]);
    people = Array.isArray(students) ? students.map(rosterPerson).filter(Boolean) : [];
  }
  const seen = new Set();
  return people.filter((person) => {
    const key = `${person.email || ""}\0${person.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ROSTER_ITEMS);
}
function safeHttpUrl(value) {
  const text = cleanString(value, 1_200);
  if (!text || text === "[redacted]") return "";
  try {
    const url = new URL(text);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    if ([...url.searchParams.keys()].some((key) => SENSITIVE_URL_PARAMETER_PATTERN.test(key))) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}
function resourcesFor(record, integrationId, title) {
  const resources = [];
  for (const path of RESOURCE_PATHS[integrationId] ?? []) {
    const url = safeHttpUrl(valueAt(record, path));
    if (url && !resources.some((resource) => resource.url === url)) {
      resources.push({ title, url });
      if (resources.length >= MAX_RESOURCE_ITEMS) break;
    }
  }
  return resources;
}
function normalizeFields(record, integrationId, title) {
  const fields = {};
  if (title) fields.title = title;
  const transcript = transcriptFor(record, integrationId);
  if (transcript) fields.transcript = transcript;
  const notes = noteValues(record, integrationId);
  if (notes.length) fields.notes = notes;
  const roster = rosterFor(record, integrationId);
  if (roster.length) fields.roster = roster;
  const resources = resourcesFor(record, integrationId, title);
  if (resources.length) fields.resources = resources;
  return fields;
}
function candidateFor(record, integrationId) {
  const providerLabel = PROVIDER_LABELS[integrationId] ?? "Connected provider";
  const title = titleFor(record, providerLabel);
  const subtitle = firstText(record, SUBTITLE_PATHS, MAX_SUBTITLE_CHARS);
  const occurredAt = occurredAtFor(record);
  const fields = normalizeFields(record, integrationId, title);
  const availableFields = Object.keys(fields);
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    availableFields,
    fields,
  };
}
function selectionPayload(user, integrationId, query, preview, recordIndex, fingerprint, options) {
  const issuedAt = Math.trunc(nowMs(options));
  const connectionBinding = cleanString(preview?.selectionContext?.connectionBinding, 128);
  if (!/^[a-f0-9]{64}$/.test(connectionBinding)) {
    throw httpError(502, "The provider connection could not be bound to this selection.");
  }
  return {
    schemaVersion: 1,
    userId: classLoopComposioUserId(user),
    integrationId,
    queryHash: queryDigest(query),
    recordIndex,
    fingerprint,
    tool: cleanString(preview?.tool, 160),
    toolVersion: cleanString(preview?.version, 160),
    connectionBinding,
    issuedAt,
    expiresAt: issuedAt + SELECTION_TTL_MS,
  };
}
function sanitizedCandidates(preview, integrationId) {
  if (preview?.integrationId && preview.integrationId !== integrationId) {
    throw httpError(502, "The integration provider returned the wrong record type.");
  }
  const { safe, truncated: sanitizerTruncated } = sanitizeProviderRecord(preview?.data ?? {});
  const source = rawCandidates(integrationId, safe);
  const candidates = source.slice(0, MAX_RECORDS).map((record, index) => {
    const normalizedRecord =
      record && typeof record === "object" && !Array.isArray(record)
        ? record
        : Object.assign(Object.create(null), { content: record });
    return {
      index,
      record: normalizedRecord,
      fingerprint: digest(`${integrationId}\0${stableStringify(normalizedRecord)}`),
      candidate: candidateFor(normalizedRecord, integrationId),
    };
  });
  return {
    candidates,
    truncated:
      Boolean(preview?.truncated) ||
      sanitizerTruncated ||
      source.length > MAX_RECORDS,
  };
}
export function extractIntegrationRecords(user, preview, integrationId, query = "", options = {}) {
  selectionKey(options);
  const { candidates, truncated } = sanitizedCandidates(preview, integrationId);
  return {
    integrationId,
    providerLabel: PROVIDER_LABELS[integrationId] ?? "Connected provider",
    records: candidates.map(({ index, fingerprint, candidate }) => ({
      selectionKey: issueSelection(
        selectionPayload(user, integrationId, query, preview, index, fingerprint, options),
        options,
      ),
      integrationId,
      title: candidate.title,
      ...(candidate.subtitle ? { subtitle: candidate.subtitle } : {}),
      ...(candidate.occurredAt ? { occurredAt: candidate.occurredAt } : {}),
      availableFields: candidate.availableFields,
    })),
    truncated,
    warnings: truncated
      ? [{ code: "provider_preview_truncated", message: "Only the first safe provider records are shown." }]
      : [],
  };
}
export async function listIntegrationRecords(user, integrationId, query = "", options = {}) {
  selectionKey(options);
  const previewIntegration = options.previewIntegration ?? previewTeacherIntegration;
  const preview = await previewIntegration(user, integrationId, cleanString(query, 240), options.previewOptions);
  return extractIntegrationRecords(user, preview, integrationId, query, options);
}
function validateSelectionContext(payload, user, integrationId, query, options) {
  const currentTime = Math.trunc(nowMs(options));
  if (payload.expiresAt < currentTime) {
    throw invalidSelection("This integration selection expired. Refresh the records and choose it again.");
  }
  if (
    payload.issuedAt > currentTime + MAX_FUTURE_SKEW_MS ||
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > 15 * 60 * 1000 ||
    !safeEqual(payload.userId, classLoopComposioUserId(user)) ||
    !safeEqual(payload.integrationId, integrationId) ||
    !safeEqual(payload.queryHash, queryDigest(query))
  ) {
    throw invalidSelection();
  }
}
function opaqueReceipt(prefix, user, integrationId, fingerprint, importedAt) {
  return `${prefix}_${digest(
    `${prefix}\0${classLoopComposioUserId(user)}\0${integrationId}\0${fingerprint}\0${importedAt}`,
  ).slice(0, 24)}`;
}
function warningsFor(candidate, previewTruncated, detailWarnings = []) {
  const warnings = [
    {
      code: "review_before_apply",
      message: "Review these imported fields before creating or updating a ClassLoop session.",
    },
  ];
  if (previewTruncated) {
    warnings.push({
      code: "provider_preview_truncated",
      message: "The provider limited this preview, so some source content may be omitted.",
    });
  }
  if (candidate.availableFields.length === 1 && candidate.availableFields[0] === "title") {
    warnings.push({
      code: "limited_source_fields",
      message: "This provider record only supplied a title in the safe read-only preview.",
    });
  }
  return [...warnings, ...detailWarnings].filter(
    (warning, index, all) =>
      all.findIndex(
        (candidateWarning) =>
          candidateWarning.code === warning.code &&
          candidateWarning.message === warning.message,
      ) === index,
  ).slice(0, 12);
}
export async function previewIntegrationDraft(
  user,
  integrationId,
  query,
  selectionKey,
  options = {},
) {
  const selection = openSelection(selectionKey, options);
  validateSelectionContext(selection, user, integrationId, query, options);
  const previewIntegration = options.previewIntegration ?? previewTeacherIntegration;
  const preview = await previewIntegration(user, integrationId, cleanString(query, 240), options.previewOptions);
  if (
    !safeEqual(selection.tool, cleanString(preview?.tool, 160)) ||
    !safeEqual(selection.toolVersion, cleanString(preview?.version, 160)) ||
    !safeEqual(
      selection.connectionBinding,
      cleanString(preview?.selectionContext?.connectionBinding, 128),
    )
  ) {
    throw httpError(409, "The provider preview changed. Refresh the records and choose it again.");
  }
  const { candidates, truncated } = sanitizedCandidates(preview, integrationId);
  const selected = candidates[selection.recordIndex];
  if (!selected || !safeEqual(selected.fingerprint, selection.fingerprint)) {
    throw httpError(409, "The selected provider record changed. Refresh the records and choose it again.");
  }
  const detailLoader = options.detailLoader ?? loadIntegrationRecordDetails;
  const details = await detailLoader(
    user,
    integrationId,
    selected.record,
    selection.connectionBinding,
    {
      executeReadTool: options.executeReadTool,
      runtimeOptions: options.detailRuntimeOptions ?? options.previewOptions,
    },
  );
  const fields = mergeIntegrationDraftFields(
    selected.candidate.fields,
    details?.fields ?? {},
  );
  const candidate = {
    ...selected.candidate,
    fields,
    availableFields: Object.keys(fields),
  };
  const importedAt = new Date(Math.trunc(nowMs(options))).toISOString();
  const patch = {
    schemaVersion: 1,
    importId: opaqueReceipt("cli", user, integrationId, selected.fingerprint, importedAt),
    integrationId,
    providerLabel: PROVIDER_LABELS[integrationId] ?? "Connected provider",
    sourceLabel: candidate.title,
    ...(candidate.occurredAt ? { occurredAt: candidate.occurredAt } : {}),
    fields: candidate.fields,
    warnings: warningsFor(candidate, truncated || Boolean(details?.truncated), details?.warnings ?? []),
    receipt: {
      id: opaqueReceipt("clr", user, integrationId, selected.fingerprint, importedAt),
      importedAt,
    },
  };
  return { integrationId, patch };
}
