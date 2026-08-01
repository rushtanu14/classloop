import { timingSafeEqual } from "node:crypto";
import { httpError } from "./api/_shared.js";
import { executeTeacherIntegrationReadTool } from "./composio-runtime.js";

const MAX_TEXT_CHARS = 2_000;
const MAX_NOTES_CHARS = 16_000;
const MAX_TRANSCRIPT_CHARS = 25_000;
const MAX_ROSTER_ITEMS = 50;
const MAX_RESOURCE_ITEMS = 12;
const MAX_DETAIL_ITEMS = 100;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const PROVIDER_RESOURCE_NAME_PATTERN =
  /^(?:conferenceRecords|spaces|courses|documents|files|forms|taskLists|pages|databases|teams|channels|chats|users)(?:\/[A-Za-z0-9._-]+)+$/i;
const SENSITIVE_URL_PARAMETER =
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

function cleanText(value, max = MAX_TEXT_CHARS) {
  if (typeof value !== "string") return "";
  const bounded = value.length > max ? value.slice(0, max) : value;
  return bounded
    .normalize("NFC")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function valueAt(value, path) {
  let current = value;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || DANGEROUS_KEYS.has(part)) return undefined;
    current = current[part];
  }
  return current;
}

function firstText(value, paths, max = MAX_TEXT_CHARS) {
  for (const path of paths) {
    const candidate = valueAt(value, path);
    const text = cleanText(typeof candidate === "number" ? String(candidate) : candidate, max);
    if (text && text !== "[redacted]") return text;
  }
  return "";
}

function firstIdentifier(value, paths, max = 500) {
  for (const path of paths) {
    const candidate = valueAt(value, path);
    if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= 0) {
      return candidate;
    }
    const text = cleanText(candidate, max);
    if (text && text !== "[redacted]") return text;
  }
  return "";
}

function arraysByKey(value, keys, depth = 0, results = []) {
  if (!value || typeof value !== "object" || depth > 7 || results.length >= 20) return results;
  if (Array.isArray(value)) {
    value.slice(0, MAX_DETAIL_ITEMS).forEach((entry) => arraysByKey(entry, keys, depth + 1, results));
    return results;
  }
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    if (keys.includes(key) && Array.isArray(child)) results.push(child.slice(0, MAX_DETAIL_ITEMS));
  }
  for (const [key, child] of Object.entries(value)) {
    if (!DANGEROUS_KEYS.has(key) && child && typeof child === "object") {
      arraysByKey(child, keys, depth + 1, results);
    }
  }
  return results;
}

function firstArray(value, keys) {
  return arraysByKey(value, keys)[0] ?? [];
}

function firstLabel(value, paths, max = MAX_TEXT_CHARS) {
  for (const path of paths) {
    const label = firstText(value, [path], max);
    if (label && !PROVIDER_RESOURCE_NAME_PATTERN.test(label)) return label;
  }
  return "";
}

function allArrays(value, keys) {
  return arraysByKey(value, keys).flat().slice(0, MAX_DETAIL_ITEMS);
}

function safeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
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

function rosterEntry(value) {
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
  const rawEmail = firstText(
    value,
    ["email", "user_email", "emailAddress", "profile.emailAddress", "user.email"],
    254,
  );
  const email = safeEmail(rawEmail);
  if ((!name && !email) || (rawEmail && !email)) return null;
  return email ? { name: name || email, email } : { name };
}

function rosterFromItems(items) {
  const seen = new Set();
  return items
    .map(rosterEntry)
    .filter(Boolean)
    .filter((person) => {
      const key = `${person.email || ""}\0${person.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ROSTER_ITEMS);
}

function rosterFromValues(data) {
  const rows = firstArray(data, ["values", "rows"]);
  if (!rows.length || !rows.every(Array.isArray)) return [];
  const header = rows[0].map((cell) => cleanText(cell, 80).toLowerCase());
  const nameIndex = header.findIndex((cell) => /(?:student\s*)?name/.test(cell));
  const emailIndex = header.findIndex((cell) => /e-?mail/.test(cell));
  const hasHeader = nameIndex >= 0 || emailIndex >= 0;
  return rows
    .slice(hasHeader ? 1 : 0, MAX_ROSTER_ITEMS + (hasHeader ? 1 : 0))
    .map((row) => {
      const name = cleanText(row[nameIndex >= 0 ? nameIndex : 0], 120);
      const rawEmail = cleanText(row[emailIndex >= 0 ? emailIndex : 1], 254);
      const email = safeEmail(rawEmail);
      if ((!name && !email) || (rawEmail && !email)) return null;
      return email ? { name: name || email, email } : { name };
    })
    .filter(Boolean);
}

function safeUrl(value) {
  const text = cleanText(value, 1_200);
  if (!text || text === "[redacted]") return "";
  try {
    const url = new URL(text);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    if ([...url.searchParams.keys()].some((key) => SENSITIVE_URL_PARAMETER.test(key))) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function resourcesFromItems(items, fallbackTitle, paths) {
  const resources = [];
  const cleanFallback = cleanText(fallbackTitle, 160);
  const safeFallback =
    cleanFallback && !PROVIDER_RESOURCE_NAME_PATTERN.test(cleanFallback)
      ? cleanFallback
      : "Class material";
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const title =
      firstLabel(item, ["link.title", "title", "summary", "name"], 160) ||
      safeFallback;
    for (const path of paths) {
      const url = safeUrl(valueAt(item, path));
      if (url && !resources.some((resource) => resource.url === url)) {
        resources.push({ title, url });
        if (resources.length >= MAX_RESOURCE_ITEMS) return resources;
      }
    }
  }
  return resources;
}

function noteLine(value, titlePaths, bodyPaths) {
  const title = firstLabel(value, titlePaths, 300);
  const body = firstText(value, bodyPaths, 1_500);
  if (title && body && title !== body) return `${title} — ${body}`;
  return title || body;
}

function noteLines(items, titlePaths, bodyPaths) {
  const notes = [];
  let chars = 0;
  for (const item of items.slice(0, MAX_DETAIL_ITEMS)) {
    const line = noteLine(item, titlePaths, bodyPaths);
    if (!line || notes.includes(line)) continue;
    const remaining = MAX_NOTES_CHARS - chars;
    if (remaining <= 0) break;
    const bounded = line.slice(0, remaining);
    notes.push(bounded);
    chars += bounded.length;
  }
  return notes;
}

function mergeFields(base, addition) {
  const next = { ...base };
  if (addition.transcript) {
    next.transcript = [next.transcript, addition.transcript].filter(Boolean).join("\n").slice(0, MAX_TRANSCRIPT_CHARS);
  }
  if (addition.notes?.length) {
    const notes = [...(next.notes ?? []), ...addition.notes];
    let chars = 0;
    next.notes = notes.filter((note, index) => notes.indexOf(note) === index).map((note) => {
      const bounded = note.slice(0, Math.max(0, MAX_NOTES_CHARS - chars));
      chars += bounded.length;
      return bounded;
    }).filter(Boolean);
  }
  if (addition.roster?.length) {
    const roster = [...(next.roster ?? []), ...addition.roster];
    const seen = new Set();
    next.roster = roster.filter((person) => {
      const key = `${person.email || ""}\0${person.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_ROSTER_ITEMS);
  }
  if (addition.resources?.length) {
    const resources = [...(next.resources ?? []), ...addition.resources];
    const seen = new Set();
    next.resources = resources.filter((resource) => {
      if (seen.has(resource.url)) return false;
      seen.add(resource.url);
      return true;
    }).slice(0, MAX_RESOURCE_ITEMS);
  }
  return next;
}
export { mergeFields as mergeIntegrationDraftFields };

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function genericWarning(integrationId, code = "provider_detail_unavailable") {
  return {
    code,
    message: `${PROVIDER_LABELS[integrationId] ?? "The provider"} could not load one optional detail source.`,
  };
}

function transcriptFromEntries(entries) {
  return entries
    .slice(0, MAX_DETAIL_ITEMS)
    .map((entry) => {
      const text = firstText(entry, ["text", "content", "body.content", "message"], 2_000);
      const actor = firstText(
        entry,
        ["speaker_name", "speakerName", "speaker", "user_name", "participant", "name"],
        120,
      );
      const safeActor = actor && !actor.includes("/") ? actor : "";
      return text ? (safeActor ? `${safeActor}: ${text}` : text) : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

function answerStrings(value, depth = 0, answers = []) {
  if (answers.length >= MAX_DETAIL_ITEMS || depth > 8) return answers;
  if (typeof value === "string") {
    const text = cleanText(value, 1_000);
    if (text && !answers.includes(text)) answers.push(text);
    return answers;
  }
  if (Array.isArray(value)) {
    value.slice(0, MAX_DETAIL_ITEMS).forEach((entry) => answerStrings(entry, depth + 1, answers));
    return answers;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (!DANGEROUS_KEYS.has(key) && ["value", "textAnswers", "answers"].includes(key)) {
        answerStrings(child, depth + 1, answers);
      } else if (child && typeof child === "object") {
        answerStrings(child, depth + 1, answers);
      }
    }
  }
  return answers;
}

export async function loadIntegrationRecordDetails(
  user,
  integrationId,
  record,
  expectedConnectionBinding,
  options = {},
) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw httpError(400, "The selected provider record is invalid.");
  }
  if (!/^[a-f0-9]{64}$/.test(expectedConnectionBinding)) {
    throw httpError(409, "The provider connection changed. Refresh the records and choose it again.");
  }

  const executeReadTool = options.executeReadTool ?? executeTeacherIntegrationReadTool;
  const warnings = [];
  let fields = {};
  let truncated = false;

  const run = async (tool, args) => {
    try {
      const result = await executeReadTool(
        user,
        integrationId,
        tool,
        args,
        options.runtimeOptions,
      );
      if (
        result?.integrationId !== integrationId ||
        result?.tool !== tool ||
        !safeEqual(
          result?.selectionContext?.connectionBinding,
          expectedConnectionBinding,
        )
      ) {
        throw httpError(409, "The provider connection changed. Refresh the records and choose it again.");
      }
      truncated = truncated || Boolean(result.truncated);
      return result.data ?? {};
    } catch (error) {
      if (error?.statusCode === 409 || error?.statusCode === 401 || error?.statusCode === 403) throw error;
      warnings.push(genericWarning(integrationId));
      return null;
    }
  };

  if (integrationId === "google_classroom") {
    const courseId = firstIdentifier(record, ["id", "courseId", "course_id"]);
    if (courseId) {
      const students = await run("GOOGLE_CLASSROOM_COURSES_STUDENTS_LIST", { courseId: String(courseId), pageSize: 100 });
      const courseWork = await run("GOOGLE_CLASSROOM_COURSE_WORK_LIST", {
        courseId: String(courseId),
        pageSize: 50,
        courseWorkStates: ["PUBLISHED"],
      });
      const materials = await run("GOOGLE_CLASSROOM_COURSE_WORK_MATERIALS_LIST", {
        courseId: String(courseId),
        pageSize: 50,
      });
      fields = mergeFields(fields, {
        roster: rosterFromItems(allArrays(students, ["students"])),
        notes: [
          ...noteLines(allArrays(courseWork, ["courseWork", "course_work", "items"]), ["title", "name"], ["description", "dueDate"]),
          ...noteLines(allArrays(materials, ["courseWorkMaterial", "courseWorkMaterials", "materials"]), ["title", "name"], ["description"]),
        ],
        resources: resourcesFromItems(
          allArrays(materials, ["courseWorkMaterial", "courseWorkMaterials", "materials"]),
          firstText(record, ["name", "title"], 160) || "Class material",
          ["alternateLink", "link.url", "driveFile.driveFile.alternateLink", "form.formUrl", "youtubeVideo.alternateLink"],
        ),
      });
    }
  } else if (integrationId === "zoom") {
    const numericId = firstIdentifier(record, ["id", "meeting_id"]);
    const instanceId = firstIdentifier(record, ["uuid", "meeting_uuid"]) || numericId;
    const numericMeetingId =
      typeof numericId === "number"
        ? numericId
        : /^\d{6,15}$/.test(String(numericId)) && Number.isSafeInteger(Number(numericId))
          ? Number(numericId)
          : 0;
    const meeting = numericMeetingId
      ? await run("ZOOM_GET_A_MEETING", { meetingId: numericMeetingId, show_previous_occurrences: false })
      : null;
    const participants = instanceId
      ? await run("ZOOM_GET_PAST_MEETING_PARTICIPANTS", { meetingId: String(instanceId), page_size: 100 })
      : null;
    const recordings = instanceId
      ? await run("ZOOM_GET_MEETING_RECORDINGS", { meetingId: String(instanceId) })
      : null;
    const summary =
      instanceId && !/^\d+$/.test(String(instanceId))
        ? await run("ZOOM_GET_A_MEETING_SUMMARY", { meetingId: String(instanceId) })
        : null;
    const recordingFiles = allArrays(recordings, ["recording_files", "recordingFiles"]);
    const transcriptAvailable = recordingFiles.some((file) =>
      /transcript/i.test(firstText(file, ["file_type", "recording_type", "fileType", "recordingType"], 100)),
    );
    fields = mergeFields(fields, {
      roster: rosterFromItems(allArrays(participants, ["participants"])),
      notes: [
        ...noteLines([meeting, summary].filter(Boolean), ["topic", "title"], ["agenda", "summary", "overview", "summary_details.overview"]),
        ...(transcriptAvailable ? ["A Zoom transcript recording is available for this meeting."] : []),
      ],
    });
  } else if (integrationId === "googlecalendar") {
    const calendarId = firstIdentifier(record, ["id", "calendarId", "calendar_id"]);
    if (calendarId) {
      const events = await run("GOOGLECALENDAR_EVENTS_LIST", {
        calendarId: String(calendarId),
        maxResults: 50,
        singleEvents: true,
        showDeleted: false,
        orderBy: "startTime",
      });
      const items = allArrays(events, ["items", "events"]);
      fields = mergeFields(fields, {
        notes: noteLines(items, ["summary", "title"], ["description", "location", "start.dateTime", "start.date"]),
        resources: resourcesFromItems(items, "Calendar event", ["htmlLink", "html_link"]),
      });
    }
  } else if (integrationId === "googlemeet") {
    const resourceName = firstIdentifier(record, ["name"]);
    const match = String(resourceName).match(/^conferenceRecords\/([A-Za-z0-9_-]{1,300})$/);
    if (match) {
      const conferenceId = match[1];
      const conference = await run("GOOGLEMEET_GET_CONFERENCE_RECORD_BY_NAME", { name: String(resourceName) });
      const transcripts = await run("GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID", {
        conference_record_id: conferenceId,
        page_size: 10,
      });
      const transcriptRecords = allArrays(transcripts, ["transcripts"]);
      const entrySets = [];
      for (const transcript of transcriptRecords.slice(0, 2)) {
        const transcriptName = firstIdentifier(transcript, ["name"]);
        const transcriptMatch = String(transcriptName).match(/\/transcripts\/([A-Za-z0-9_-]{1,300})$/);
        if (!transcriptMatch) continue;
        const entries = await run("GOOGLEMEET_LIST_TRANSCRIPT_ENTRIES", {
          conference_record_id: conferenceId,
          transcript_id: transcriptMatch[1],
          page_size: 100,
        });
        entrySets.push(...allArrays(entries, ["transcriptEntries", "transcript_entries", "entries"]));
      }
      fields = mergeFields(fields, {
        transcript: transcriptFromEntries(entrySets),
        notes: noteLines([conference].filter(Boolean), ["space.displayName", "name"], ["startTime", "endTime"]),
      });
    }
  } else if (integrationId === "googledrive") {
    const fileId = firstIdentifier(record, ["id", "fileId", "file_id"]);
    if (fileId) {
      const metadata = await run("GOOGLEDRIVE_GET_FILE_METADATA", {
        fileId: String(fileId),
        fields: "id,name,mimeType,modifiedTime,webViewLink,description",
        supportsAllDrives: true,
      });
      fields = mergeFields(fields, {
        notes: noteLines([metadata].filter(Boolean), ["name"], ["description", "mimeType", "modifiedTime"]),
        resources: resourcesFromItems([metadata].filter(Boolean), firstText(record, ["name"], 160) || "Drive file", ["webViewLink", "web_view_link"]),
      });
    }
  } else if (integrationId === "googlesheets") {
    const spreadsheetId = firstIdentifier(record, ["spreadsheetId", "spreadsheet_id", "id"]);
    if (spreadsheetId) {
      const values = await run("GOOGLESHEETS_VALUES_GET", {
        spreadsheet_id: String(spreadsheetId),
        range: "A1:Z200",
        start_row: 1,
        end_row: 200,
        major_dimension: "ROWS",
        value_render_option: "FORMATTED_VALUE",
        date_time_render_option: "FORMATTED_STRING",
      });
      fields = mergeFields(fields, { roster: rosterFromValues(values) });
    }
  } else if (integrationId === "googletasks") {
    const tasklistId = firstIdentifier(record, ["id", "tasklistId", "tasklist_id"]);
    if (tasklistId) {
      const tasks = await run("GOOGLETASKS_LIST_TASKS", {
        tasklistId: String(tasklistId),
        maxResults: 100,
        showCompleted: true,
        showDeleted: false,
        showHidden: false,
      });
      fields = mergeFields(fields, {
        notes: noteLines(allArrays(tasks, ["items", "tasks"]), ["title"], ["notes", "due", "status"]),
      });
    }
  } else if (integrationId === "googleforms") {
    const formId = firstIdentifier(record, ["formId", "form_id", "id"]);
    if (formId) {
      const responses = await run("GOOGLEFORMS_LIST_RESPONSES", {
        form_id: String(formId),
        page_size: 100,
      });
      const answers = answerStrings(allArrays(responses, ["responses"]));
      fields = mergeFields(fields, {
        notes: answers.slice(0, 50).map((answer) => `Form response — ${answer}`),
      });
    }
  } else if (integrationId === "canvas") {
    const courseId = firstIdentifier(record, ["id", "course_id"]);
    if (courseId !== "") {
      const assignments = await run("CANVAS_GET_ALL_ASSIGNMENTS", {
        course_id: String(courseId),
        per_page: 50,
      });
      const announcements = await run("CANVAS_LIST_ANNOUNCEMENTS", {
        context_codes: [`course_${courseId}`],
        per_page: 50,
        active_only: true,
      });
      fields = mergeFields(fields, {
        notes: [
          ...noteLines(allArrays(assignments, ["assignments", "items"]), ["name", "title"], ["description", "due_at"]),
          ...noteLines(allArrays(announcements, ["announcements", "items"]), ["title"], ["message", "body"]),
        ],
        resources: resourcesFromItems(
          [
            ...allArrays(assignments, ["assignments", "items"]),
            ...allArrays(announcements, ["announcements", "items"]),
          ],
          firstText(record, ["name"], 160) || "Canvas item",
          ["html_url"],
        ),
      });
    }
  } else if (integrationId === "blackboard") {
    const courseId = firstIdentifier(record, ["id", "courseId", "course_id"]);
    if (courseId) {
      const announcements = await run("BLACKBOARD_GET_ANNOUNCEMENTS", { limit: 50 });
      const items = allArrays(announcements, ["results", "announcements", "items"]);
      const scoped = items.filter((item) => {
        const itemCourse = firstIdentifier(item, ["courseId", "course_id", "course.id"]);
        return itemCourse && String(itemCourse) === String(courseId);
      });
      if (items.length && !scoped.length) {
        warnings.push({
          code: "provider_scope_limited",
          message: "Blackboard could not verify announcements for the selected course, so none were imported.",
        });
      }
      fields = mergeFields(fields, {
        notes: noteLines(scoped, ["title", "name"], ["body", "message", "description"]),
      });
    }
  } else if (integrationId === "outlook") {
    const messageId = firstIdentifier(record, ["id", "messageId", "message_id"]);
    if (messageId) {
      const escaped = String(messageId).replace(/'/g, "''").slice(0, 500);
      const messages = await run("OUTLOOK_QUERY_EMAILS", {
        top: 1,
        user_id: "me",
        filter: `id eq '${escaped}'`,
        select: ["subject", "body", "bodyPreview", "receivedDateTime", "webLink"],
      });
      fields = mergeFields(fields, {
        notes: noteLines(allArrays(messages, ["value", "messages", "items"]), ["subject"], ["body.content", "bodyPreview"]),
      });
    }
  } else if (integrationId === "microsoft_teams") {
    const teamId = firstIdentifier(record, ["id", "team_id"]);
    if (teamId && /^[0-9a-f-]{36}$/i.test(String(teamId))) {
      const channels = await run("MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS", {
        team_id: String(teamId),
        select: "id,displayName,description",
        include_shared_channels: false,
      });
      const channelItems = allArrays(channels, ["value", "channels", "items"]);
      const messages = [];
      for (const channel of channelItems.slice(0, 3)) {
        const channelId = firstIdentifier(channel, ["id", "channel_id"]);
        if (!channelId) continue;
        const response = await run("MICROSOFT_TEAMS_TEAMS_LIST_CHANNEL_MESSAGES", {
          team_id: String(teamId),
          channel_id: String(channelId),
          top: 50,
        });
        messages.push(...allArrays(response, ["value", "messages", "items"]));
      }
      fields = mergeFields(fields, {
        notes: noteLines(messages, ["from.user.displayName", "subject"], ["body.content", "bodyPreview", "text"]),
      });
    }
  } else if (integrationId === "slack") {
    const channelId = firstIdentifier(record, ["id", "channel"]);
    if (channelId) {
      const history = await run("SLACK_FETCH_CONVERSATION_HISTORY", {
        channel: String(channelId),
        limit: 100,
        include_all_metadata: false,
      });
      const messages = allArrays(history, ["messages", "items"]);
      fields = mergeFields(fields, {
        notes: messages.map((message) => {
          const text = firstText(message, ["text"], 1_500);
          const actor = firstText(message, ["user_name", "username"], 120);
          return text ? (actor ? `${actor}: ${text}` : text) : "";
        }).filter(Boolean),
      });
    }
  } else if (integrationId === "notion") {
    const pageId = firstIdentifier(record, ["id", "page_id", "pageId"]);
    if (pageId) {
      const page = await run("NOTION_GET_PAGE_MARKDOWN", {
        page_id: String(pageId),
        include_transcript: true,
      });
      const markdown = firstText(page, ["markdown", "content", "text"], MAX_NOTES_CHARS);
      const transcript = firstText(page, ["transcript"], MAX_TRANSCRIPT_CHARS);
      fields = mergeFields(fields, {
        notes: markdown ? [markdown] : [],
        transcript,
      });
    }
  }

  const uniqueWarnings = warnings.filter(
    (warning, index) =>
      warnings.findIndex(
        (candidate) => candidate.code === warning.code && candidate.message === warning.message,
      ) === index,
  ).slice(0, 10);
  if (truncated) {
    uniqueWarnings.push({
      code: "provider_detail_truncated",
      message: "The provider limited this detail response, so some source content may be omitted.",
    });
  }
  return { fields, warnings: uniqueWarnings, truncated };
}
