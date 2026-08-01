import assert from "node:assert/strict";
import {
  extractIntegrationRecords,
  listIntegrationRecords,
  previewIntegrationDraft,
} from "../server/backend/composio-imports.js";
import { loadIntegrationRecordDetails } from "../server/backend/composio-detail-imports.js";
import {
  validateIntegrationRecordsPayload,
} from "../server/backend/api/integrations/records.js";
import {
  validateIntegrationImportPreviewPayload,
} from "../server/backend/api/integrations/import-preview.js";
import recordsHandler from "../server/backend/api/integrations/records.js";
import importPreviewHandler from "../server/backend/api/integrations/import-preview.js";

const teacher = { id: "11111111-2222-4333-8444-555555555555" };
const anotherTeacher = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
const selectionSecret = "test-only-selection-secret-that-is-longer-than-thirty-two-characters";
const now = Date.parse("2026-07-29T20:00:00.000Z");
const connectionBinding = "a".repeat(64);

function assertThrowsStatus(callback, statusCode, pattern) {
  assert.throws(callback, (error) => {
    assert.equal(error.statusCode, statusCode);
    assert.match(error.message, pattern);
    return true;
  });
}

async function assertRejectsStatus(callback, statusCode, pattern) {
  await assert.rejects(callback, (error) => {
    assert.equal(error.statusCode, statusCode);
    assert.match(error.message, pattern);
    return true;
  });
}

function previewFor(integrationId, data, extra = {}) {
  const {
    connectionBinding: boundConnection = connectionBinding,
    ...previewOverrides
  } = extra;
  const preview = {
    integrationId,
    toolkit: integrationId,
    tool: `READ_${integrationId.toUpperCase()}`,
    version: "20260729_00",
    data,
    truncated: false,
    ...previewOverrides,
  };
  Object.defineProperty(preview, "selectionContext", {
    enumerable: false,
    value: {
      connectionBinding: boundConnection,
    },
  });
  return preview;
}

function previewStub(fixtures) {
  return async (_user, integrationId) => {
    const fixture = fixtures[integrationId];
    if (!fixture) throw new Error(`Missing fixture for ${integrationId}`);
    return typeof fixture === "function" ? fixture() : fixture;
  };
}

function importOptions(fixtures, overrides = {}) {
  return {
    previewIntegration: previewStub(fixtures),
    detailLoader: async () => ({ fields: {}, warnings: [], truncated: false }),
    selectionSecret,
    now,
    ...overrides,
  };
}

async function roundTrip(integrationId, data, query = "") {
  const fixture = previewFor(integrationId, data);
  const options = importOptions({ [integrationId]: fixture });
  const listed = await listIntegrationRecords(teacher, integrationId, query, options);
  assert.equal(listed.integrationId, integrationId);
  assert.equal(listed.records.length > 0, true);
  assert.match(listed.records[0].selectionKey, /^clsi1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const imported = await previewIntegrationDraft(
    teacher,
    integrationId,
    query,
    listed.records[0].selectionKey,
    options,
  );
  return { listed, imported };
}

{
  const { listed, imported } = await roundTrip("zoom", {
    meetings: [
      {
        id: "provider-meeting-123",
        topic: "Algebra review",
        agenda: "Quadratic equations and homework",
        transcript: [
          { speaker_name: "Ms. Rivera", text: "Let us review factoring." },
          { speaker_name: "Maya", text: "Can we use the box method?" },
        ],
        join_url: "https://zoom.example/j/123",
        access_token: "provider-secret-must-never-leak",
      },
    ],
  });
  assert.equal(listed.records[0].title, "Algebra review");
  assert.equal(JSON.stringify(listed).includes("provider-meeting-123"), false);
  assert.equal(JSON.stringify(listed).includes("provider-secret-must-never-leak"), false);
  assert.equal(imported.patch.schemaVersion, 1);
  assert.match(imported.patch.importId, /^cli_[a-f0-9]{24}$/);
  assert.equal(imported.patch.integrationId, "zoom");
  assert.equal(imported.patch.providerLabel, "Zoom");
  assert.equal(imported.patch.sourceLabel, "Algebra review");
  assert.equal(imported.patch.fields.title, "Algebra review");
  assert.match(imported.patch.fields.transcript, /Ms\. Rivera: Let us review factoring/);
  assert.deepEqual(Object.keys(imported.patch.fields).sort(), ["notes", "title", "transcript"]);
  assert.match(imported.patch.receipt.id, /^clr_[a-f0-9]{24}$/);
  assert.equal(JSON.stringify(imported).includes("provider-meeting-123"), false);
  assert.equal(JSON.stringify(imported).includes("provider-secret-must-never-leak"), false);
  assert.equal(JSON.stringify(imported).includes("zoom.example/j/123"), false);
}

{
  const { imported } = await roundTrip("googledocs", {
    title: "Cell division lab notes",
    text: "Mitosis observations and the homework questions.",
    document_id: "provider-doc-id",
  });
  assert.equal(imported.patch.fields.title, "Cell division lab notes");
  assert.match(imported.patch.fields.notes.join("\n"), /Mitosis observations/);
  assert.equal(JSON.stringify(imported).includes("provider-doc-id"), false);
}

{
  const { imported } = await roundTrip("googlesheets", {
    title: "Period 4 roster",
    values: [
      ["Student Name", "Email"],
      ["Aaliyah Carter", "aaliyah@example.edu"],
      ["Danny Reyes", "danny@example.edu"],
    ],
    spreadsheet_id: "provider-sheet-id",
  });
  assert.equal(imported.patch.fields.title, "Period 4 roster");
  assert.deepEqual(imported.patch.fields.roster, [
    { name: "Aaliyah Carter", email: "aaliyah@example.edu" },
    { name: "Danny Reyes", email: "danny@example.edu" },
  ]);
}

{
  const { imported } = await roundTrip("google_classroom", {
    courses: [
      {
        id: "course-provider-id",
        name: "AP Biology",
        section: "Period 2",
        description: "Cell division",
        alternateLink: "https://classroom.google.com/c/example",
        students: [
          { profile: { name: { fullName: "Priya Mehta" }, emailAddress: "priya@example.edu" } },
        ],
      },
    ],
  });
  assert.equal(imported.patch.fields.title, "AP Biology");
  assert.match(imported.patch.fields.notes.join("\n"), /Period 2/);
  assert.deepEqual(imported.patch.fields.roster, [
    { name: "Priya Mehta", email: "priya@example.edu" },
  ]);
}

{
  const { imported } = await roundTrip("googlecalendar", {
    items: [
      {
        id: "event-provider-id",
        summary: "Chemistry review",
        description: "Bring the worksheet.",
        start: { dateTime: "2026-07-30T17:00:00Z" },
        htmlLink: "https://calendar.google.com/event?eid=safe",
      },
    ],
  });
  assert.equal(imported.patch.fields.title, "Chemistry review");
  assert.match(imported.patch.fields.notes.join("\n"), /Bring the worksheet/);
  assert.deepEqual(imported.patch.fields.resources, [
    {
      title: "Chemistry review",
      url: "https://calendar.google.com/event?eid=safe",
    },
  ]);
}

for (const [integrationId, data, expected] of [
  [
    "slack",
    { messages: [{ channel_name: "teachers", user_name: "Lee", text: "Review chapter 4." }] },
    /Review chapter 4/,
  ],
  [
    "notion",
    { results: [{ title: "Unit plan", markdown: "Essential question: Why do cells divide?" }] },
    /Essential question/,
  ],
]) {
  const { imported } = await roundTrip(integrationId, data);
  assert.match(imported.patch.fields.notes.join("\n"), expected);
}

for (const fixture of [
  {
    integrationId: "googlemeet",
    data: {
      conferenceRecords: [
        {
          name: "Geometry study hall",
          transcript: [{ speaker: "Maya", text: "I need help with proofs." }],
        },
      ],
    },
    field: "transcript",
    expected: /Maya: I need help with proofs/,
  },
  {
    integrationId: "googledrive",
    data: {
      files: [
        {
          name: "Unit 3 worksheet",
          description: "Practice problems",
          webViewLink: "https://drive.google.com/file/d/example/view",
        },
      ],
    },
    field: "resources",
    expected: /drive\.google\.com/,
  },
  {
    integrationId: "googletasks",
    data: { tasks: [{ title: "Grade exit tickets", notes: "Before Friday" }] },
    field: "notes",
    expected: /Before Friday/,
  },
  {
    integrationId: "googleforms",
    data: { info: { title: "Unit check-in", description: "Student reflection responses" } },
    field: "notes",
    expected: /Student reflection/,
    expectedTitle: "Unit check-in",
  },
  {
    integrationId: "canvas",
    data: { courses: [{ name: "Physics", course_code: "PHY-2" }] },
    field: "notes",
    expected: /PHY-2/,
  },
  {
    integrationId: "blackboard",
    data: { courses: [{ name: "World History", description: "Industrial Revolution" }] },
    field: "notes",
    expected: /Industrial Revolution/,
  },
  {
    integrationId: "outlook",
    data: { value: [{ subject: "Class follow-up", bodyPreview: "Bring lab goggles." }] },
    field: "notes",
    expected: /Bring lab goggles/,
  },
  {
    integrationId: "microsoft_teams",
    data: { value: [{ displayName: "Period 5 team", description: "Shared class channel" }] },
    field: "notes",
    expected: /Shared class channel/,
  },
]) {
  const { listed, imported } = await roundTrip(fixture.integrationId, fixture.data);
  assert.equal(listed.records[0].availableFields.includes(fixture.field), true);
  assert.match(JSON.stringify(imported.patch.fields[fixture.field]), fixture.expected);
  if (fixture.expectedTitle) assert.equal(imported.patch.fields.title, fixture.expectedTitle);
}

{
  const { listed, imported } = await roundTrip("googlemeet", {
    conferenceRecords: [
      {
        name: "conferenceRecords/provider-record-id",
        transcript: [{ speaker: "Priya", text: "We finished the lab." }],
      },
    ],
  });
  assert.equal(JSON.stringify(listed).includes("provider-record-id"), false);
  assert.equal(JSON.stringify(imported).includes("provider-record-id"), false);
}

{
  const { imported } = await roundTrip("blackboard", {
    courses: [
      {
        name: "World History",
        courseId: "provider-course-id",
        description: "Read chapter 6.",
      },
    ],
  });
  assert.equal(JSON.stringify(imported).includes("provider-course-id"), false);
}

{
  const { imported } = await roundTrip("googledrive", {
    files: [
      {
        name: "Teacher-only answer key",
        webViewLink: "https://drive.google.com/file/d/example/view?access_token=must-not-leak",
        accessToken: "camel-case-secret",
        clientSecret: "another-secret",
      },
    ],
  });
  assert.equal("resources" in imported.patch.fields, false);
  assert.equal(JSON.stringify(imported).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(imported).includes("camel-case-secret"), false);
  assert.equal(JSON.stringify(imported).includes("another-secret"), false);
}

{
  const { imported } = await roundTrip("googledrive", {
    files: [
      {
        name: "Safe teacher resource",
        webViewLink: "https://drive.google.com/file/d/example/view#access_token=fragment-secret",
      },
    ],
  });
  assert.deepEqual(imported.patch.fields.resources, [
    {
      title: "Safe teacher resource",
      url: "https://drive.google.com/file/d/example/view",
    },
  ]);
  assert.equal(JSON.stringify(imported).includes("fragment-secret"), false);
}

{
  const data = {
    meetings: [{ topic: "Original meeting", agenda: "First result" }],
  };
  const fixtures = {
    zoom: () => previewFor("zoom", structuredClone(data)),
  };
  const options = importOptions(fixtures);
  const listed = await listIntegrationRecords(teacher, "zoom", "", options);
  data.meetings[0].agenda = "Provider changed this record";
  await assertRejectsStatus(
    () => previewIntegrationDraft(teacher, "zoom", "", listed.records[0].selectionKey, options),
    409,
    /refresh/i,
  );
}

{
  const listed = await listIntegrationRecords(
    teacher,
    "zoom",
    "",
    importOptions({ zoom: previewFor("zoom", { meetings: [] }) }),
  );
  assert.deepEqual(listed.records, []);
}

{
  const listed = await listIntegrationRecords(
    teacher,
    "zoom",
    "",
    importOptions({
      zoom: previewFor("zoom", [
        { topic: "Direct meeting one" },
        { topic: "Direct meeting two" },
      ]),
    }),
  );
  assert.deepEqual(listed.records.map((record) => record.title), [
    "Direct meeting one",
    "Direct meeting two",
  ]);
}

{
  const fixture = previewFor("zoom", { meetings: [{ topic: "Scoped meeting" }] });
  const options = importOptions({ zoom: fixture });
  const listed = await listIntegrationRecords(teacher, "zoom", "period 4", options);
  const listedAgain = await listIntegrationRecords(teacher, "zoom", "period 4", options);
  assert.notEqual(
    listed.records[0].selectionKey,
    listedAgain.records[0].selectionKey,
    "Each selection must use a fresh AES-GCM nonce.",
  );
  await assertRejectsStatus(
    () => previewIntegrationDraft(anotherTeacher, "zoom", "period 4", listed.records[0].selectionKey, options),
    400,
    /selection/i,
  );
  await assertRejectsStatus(
    () => previewIntegrationDraft(teacher, "notion", "period 4", listed.records[0].selectionKey, {
      ...options,
      previewIntegration: previewStub({ notion: previewFor("notion", { results: [{ title: "Other" }] }) }),
    }),
    400,
    /selection/i,
  );
  await assertRejectsStatus(
    () => previewIntegrationDraft(teacher, "zoom", "changed query", listed.records[0].selectionKey, options),
    400,
    /selection/i,
  );
  await assertRejectsStatus(
    () =>
      previewIntegrationDraft(teacher, "zoom", "period 4", listed.records[0].selectionKey, {
        ...options,
        previewIntegration: previewStub({
          zoom: previewFor("zoom", { meetings: [{ topic: "Scoped meeting" }] }, { version: "changed" }),
        }),
      }),
    409,
    /refresh/i,
  );
  await assertRejectsStatus(
    () =>
      previewIntegrationDraft(teacher, "zoom", "period 4", listed.records[0].selectionKey, {
        ...options,
        previewIntegration: previewStub({
          zoom: previewFor(
            "zoom",
            { meetings: [{ topic: "Scoped meeting" }] },
            { connectionBinding: "b".repeat(64) },
          ),
        }),
      }),
    409,
    /refresh/i,
  );

  const tokenParts = listed.records[0].selectionKey.split(".");
  tokenParts[2] = `${tokenParts[2].slice(0, -1)}${tokenParts[2].endsWith("A") ? "B" : "A"}`;
  await assertRejectsStatus(
    () => previewIntegrationDraft(teacher, "zoom", "period 4", tokenParts.join("."), options),
    400,
    /selection/i,
  );

  await assertRejectsStatus(
    () =>
      previewIntegrationDraft(teacher, "zoom", "period 4", listed.records[0].selectionKey, {
        ...options,
        now: now + 13 * 60 * 1000,
      }),
    400,
    /expired/i,
  );

  const futureOptions = { ...options, now: now + 2 * 60 * 1000 };
  const futureListed = await listIntegrationRecords(teacher, "zoom", "future", futureOptions);
  await assertRejectsStatus(
    () =>
      previewIntegrationDraft(teacher, "zoom", "future", futureListed.records[0].selectionKey, {
        ...options,
        now,
      }),
    400,
    /selection/i,
  );
}

assertThrowsStatus(
  () =>
    extractIntegrationRecords(teacher, previewFor("zoom", { meetings: [] }), "zoom", "", {
      env: { COMPOSIO_API_KEY: "must-not-be-used-for-selection-encryption" },
    }),
  503,
  /selection/i,
);

{
  const malicious = JSON.parse(
    '{"meetings":[{"topic":"Safe title","__proto__":{"polluted":"yes"},"constructor":{"password":"leak"},"prototype":{"token":"leak"}}]}',
  );
  const listed = await listIntegrationRecords(
    teacher,
    "zoom",
    "",
    importOptions({ zoom: previewFor("zoom", malicious) }),
  );
  assert.equal({}.polluted, undefined);
  assert.equal(JSON.stringify(listed).includes("leak"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(listed.records[0], "__proto__"), false);
}

{
  const large = {
    meetings: Array.from({ length: 80 }, (_, index) => ({
      topic: `Meeting ${index} ${"x".repeat(5_000)}`,
      agenda: "y".repeat(50_000),
    })),
  };
  const listed = await listIntegrationRecords(
    teacher,
    "zoom",
    "",
    importOptions({ zoom: previewFor("zoom", large) }),
  );
  assert.equal(listed.records.length, 25);
  assert.equal(listed.truncated, true);
  assert.equal(JSON.stringify(listed).length < 120_000, true);
  assert.equal(listed.records.every((record) => record.title.length <= 160), true);
  const imported = await previewIntegrationDraft(
    teacher,
    "zoom",
    "",
    listed.records[0].selectionKey,
    importOptions({ zoom: previewFor("zoom", large) }),
  );
  assert.equal(
    (imported.patch.fields.notes ?? []).reduce((total, note) => total + note.length, 0) <= 20_000,
    true,
  );
  assert.equal(JSON.stringify(imported).length < 80_000, true);
}

{
  const values = [
    ["Student Name", "Email"],
    ...Array.from({ length: 120 }, (_, index) => [
      `Student ${index} ${"n".repeat(150)}`,
      `student${index}@example.edu`,
    ]),
  ];
  const { imported } = await roundTrip("googlesheets", {
    title: "Oversized roster",
    values,
  });
  assert.equal(imported.patch.fields.roster.length, 50);
  assert.equal(imported.patch.fields.roster.every((person) => person.name.length <= 120), true);
  assert.equal(JSON.stringify(imported).length < 80_000, true);
}

{
  const { imported } = await roundTrip("googlesheets", {
    title: "Roster validation",
    values: [
      ["Name", "Email"],
      ["Valid Student", "valid.student@example.edu"],
      ["Invalid Student", "not-an-email"],
      ["Missing Email Student", ""],
    ],
  });
  assert.deepEqual(imported.patch.fields.roster, [
    { name: "Valid Student", email: "valid.student@example.edu" },
    { name: "Missing Email Student" },
  ]);
}

{
  const { imported } = await roundTrip("google_classroom", {
    courses: [
      {
        name: "Alias safety",
        students: [
          {
            name: "Maya Chen",
            email: "maya@example.edu",
            aliases: Array.from({ length: 20 }, (_, index) => `Alias ${index} ${"a".repeat(100)}`),
          },
        ],
      },
    ],
  });
  assert.deepEqual(imported.patch.fields.roster[0], {
    name: "Maya Chen",
    email: "maya@example.edu",
  });
}

function detailExecutor(fixtures, calls, binding = connectionBinding) {
  return async (_user, integrationId, tool, args) => {
    calls.push({ integrationId, tool, args });
    const fixture = fixtures[tool];
    if (fixture instanceof Error) throw fixture;
    if (fixture === undefined) throw new Error(`Unexpected detail tool ${tool}`);
    const data = typeof fixture === "function" ? fixture(args) : fixture;
    const response = {
      integrationId,
      toolkit: integrationId,
      tool,
      version: "20260729_00",
      data,
      truncated: false,
    };
    Object.defineProperty(response, "selectionContext", {
      enumerable: false,
      value: { connectionBinding: binding },
    });
    return response;
  };
}

async function loadDetails(integrationId, record, fixtures, binding = connectionBinding) {
  const calls = [];
  const details = await loadIntegrationRecordDetails(
    teacher,
    integrationId,
    record,
    connectionBinding,
    { executeReadTool: detailExecutor(fixtures, calls, binding) },
  );
  return { calls, details };
}

{
  const preview = previewFor("googlesheets", {
    spreadsheetId: "sheet-provider-id",
    properties: { title: "Period 4 roster" },
  });
  const calls = [];
  const options = importOptions(
    { googlesheets: preview },
    {
      detailLoader: undefined,
      executeReadTool: detailExecutor(
        {
          GOOGLESHEETS_VALUES_GET: {
            values: [
              ["Name", "Email"],
              ["Aaliyah Carter", "aaliyah@example.edu"],
            ],
          },
        },
        calls,
      ),
    },
  );
  const listed = await listIntegrationRecords(teacher, "googlesheets", "", options);
  const imported = await previewIntegrationDraft(
    teacher,
    "googlesheets",
    "",
    listed.records[0].selectionKey,
    options,
  );
  assert.equal(calls[0].tool, "GOOGLESHEETS_VALUES_GET");
  assert.deepEqual(imported.patch.fields.roster, [
    { name: "Aaliyah Carter", email: "aaliyah@example.edu" },
  ]);
  assert.equal(imported.patch.receipt.id.startsWith("clr_"), true);
}

{
  const { calls, details } = await loadDetails(
    "google_classroom",
    { id: "course-provider-id", name: "AP Biology" },
    {
      GOOGLE_CLASSROOM_COURSES_STUDENTS_LIST: {
        students: [
          { profile: { name: { fullName: "Priya Mehta" }, emailAddress: "priya@example.edu" } },
        ],
      },
      GOOGLE_CLASSROOM_COURSE_WORK_LIST: {
        courseWork: [{ title: "Cell division essay", description: "Due Friday" }],
      },
      GOOGLE_CLASSROOM_COURSE_WORK_MATERIALS_LIST: {
        courseWorkMaterial: [
          {
            title: "Mitosis slides",
            materials: [{ link: { title: "Slides", url: "https://school.example/mitosis" } }],
          },
        ],
      },
    },
  );
  assert.deepEqual(calls.map((call) => call.tool), [
    "GOOGLE_CLASSROOM_COURSES_STUDENTS_LIST",
    "GOOGLE_CLASSROOM_COURSE_WORK_LIST",
    "GOOGLE_CLASSROOM_COURSE_WORK_MATERIALS_LIST",
  ]);
  assert.equal(calls.every((call) => call.args.courseId === "course-provider-id"), true);
  assert.deepEqual(details.fields.roster, [{ name: "Priya Mehta", email: "priya@example.edu" }]);
  assert.match(details.fields.notes.join("\n"), /Cell division essay/);
  assert.deepEqual(details.fields.resources, [
    { title: "Slides", url: "https://school.example/mitosis" },
  ]);
}

{
  const { details } = await loadDetails(
    "google_classroom",
    { id: "course-provider-id", name: "AP Biology" },
    {
      GOOGLE_CLASSROOM_COURSES_STUDENTS_LIST: { students: [] },
      GOOGLE_CLASSROOM_COURSE_WORK_LIST: { courseWork: [] },
      GOOGLE_CLASSROOM_COURSE_WORK_MATERIALS_LIST: {
        courseWorkMaterial: [
          {
            name: "courses/course-provider-id/courseWorkMaterials/material-provider-id",
            alternateLink: "https://classroom.google.com/c/safe-material",
          },
        ],
      },
    },
  );
  assert.deepEqual(details.fields.resources, [
    { title: "AP Biology", url: "https://classroom.google.com/c/safe-material" },
  ]);
  assert.equal(
    JSON.stringify(details).includes("courses/course-provider-id/courseWorkMaterials/material-provider-id"),
    false,
  );
}

{
  const { calls, details } = await loadDetails(
    "zoom",
    { id: 12345678901, uuid: "meeting-instance-uuid", topic: "Algebra" },
    {
      ZOOM_GET_A_MEETING: { topic: "Algebra", agenda: "Factoring review" },
      ZOOM_GET_PAST_MEETING_PARTICIPANTS: {
        participants: [{ name: "Maya Chen", user_email: "maya@example.edu" }],
      },
      ZOOM_GET_MEETING_RECORDINGS: {
        recording_files: [{ file_type: "TRANSCRIPT", recording_type: "audio_transcript" }],
      },
      ZOOM_GET_A_MEETING_SUMMARY: {
        summary_details: { overview: "Students reviewed quadratic factoring." },
      },
    },
  );
  assert.equal(calls.find((call) => call.tool === "ZOOM_GET_A_MEETING").args.meetingId, 12345678901);
  assert.equal(calls.find((call) => call.tool === "ZOOM_GET_MEETING_RECORDINGS").args.meetingId, "meeting-instance-uuid");
  assert.deepEqual(details.fields.roster, [{ name: "Maya Chen", email: "maya@example.edu" }]);
  assert.match(details.fields.notes.join("\n"), /quadratic factoring/i);
  assert.match(details.fields.notes.join("\n"), /transcript recording is available/i);
  assert.equal(JSON.stringify(details).includes("download"), false);
}

{
  const { calls, details } = await loadDetails(
    "googlecalendar",
    { id: "primary", summary: "Primary calendar" },
    {
      GOOGLECALENDAR_EVENTS_LIST: {
        items: [
          {
            summary: "Chemistry review",
            description: "Bring goggles.",
            htmlLink: "https://calendar.google.com/calendar/event?eid=safe",
            start: { dateTime: "2026-07-30T17:00:00Z" },
          },
        ],
      },
    },
  );
  assert.equal(calls[0].args.calendarId, "primary");
  assert.match(details.fields.notes.join("\n"), /Chemistry review/);
  assert.deepEqual(details.fields.resources, [
    { title: "Chemistry review", url: "https://calendar.google.com/calendar/event?eid=safe" },
  ]);
}

{
  const { calls, details } = await loadDetails(
    "googlemeet",
    { name: "conferenceRecords/conference-provider-id" },
    {
      GOOGLEMEET_GET_CONFERENCE_RECORD_BY_NAME: { name: "conferenceRecords/conference-provider-id" },
      GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID: {
        transcripts: [
          { name: "conferenceRecords/conference-provider-id/transcripts/transcript-provider-id" },
        ],
      },
      GOOGLEMEET_LIST_TRANSCRIPT_ENTRIES: (args) => {
        assert.equal(args.conference_record_id, "conference-provider-id");
        assert.equal(args.transcript_id, "transcript-provider-id");
        return {
          transcriptEntries: [
            { participant: "Maya", text: "I need help with geometric proofs." },
          ],
        };
      },
    },
  );
  assert.equal(calls[0].args.name, "conferenceRecords/conference-provider-id");
  assert.match(details.fields.transcript, /Maya: I need help with geometric proofs/);
  assert.equal(JSON.stringify(details).includes("transcript-provider-id"), false);
}

{
  const { calls, details } = await loadDetails(
    "googledrive",
    { id: "file-provider-id", name: "Unit worksheet" },
    {
      GOOGLEDRIVE_GET_FILE_METADATA: {
        name: "Unit worksheet",
        description: "Practice set",
        webViewLink: "https://drive.google.com/file/d/example/view",
      },
    },
  );
  assert.equal(calls[0].args.fileId, "file-provider-id");
  assert.match(details.fields.notes.join("\n"), /Practice set/);
  assert.deepEqual(details.fields.resources, [
    { title: "Unit worksheet", url: "https://drive.google.com/file/d/example/view" },
  ]);
}

{
  const { calls, details } = await loadDetails("googledocs", { title: "Already detailed" }, {});
  assert.deepEqual(calls, []);
  assert.deepEqual(details.fields, {});
}

{
  const { calls, details } = await loadDetails(
    "googlesheets",
    { spreadsheetId: "sheet-provider-id", properties: { title: "Period 4 roster" } },
    {
      GOOGLESHEETS_VALUES_GET: {
        values: [
          ["Name", "Email"],
          ["Aaliyah Carter", "aaliyah@example.edu"],
          ["Danny Reyes", "danny@example.edu"],
        ],
      },
    },
  );
  assert.equal(calls[0].args.spreadsheet_id, "sheet-provider-id");
  assert.equal(calls[0].args.range, "A1:Z200");
  assert.deepEqual(details.fields.roster, [
    { name: "Aaliyah Carter", email: "aaliyah@example.edu" },
    { name: "Danny Reyes", email: "danny@example.edu" },
  ]);
}

{
  const { calls, details } = await loadDetails(
    "googletasks",
    { id: "task-list-provider-id", title: "Teacher follow-ups" },
    {
      GOOGLETASKS_LIST_TASKS: {
        items: [{ title: "Check lab reports", notes: "Before Friday" }],
      },
    },
  );
  assert.equal(calls[0].args.tasklistId, "task-list-provider-id");
  assert.match(details.fields.notes.join("\n"), /Check lab reports/);
}

{
  const { calls, details } = await loadDetails(
    "googleforms",
    { formId: "form-provider-id", info: { title: "Exit ticket" } },
    {
      GOOGLEFORMS_LIST_RESPONSES: {
        responses: [
          { answers: { q1: { textAnswers: { answers: [{ value: "I need more help." }] } } } },
        ],
      },
    },
  );
  assert.equal(calls[0].args.form_id, "form-provider-id");
  assert.match(details.fields.notes.join("\n"), /I need more help/);
}

{
  const { calls, details } = await loadDetails(
    "canvas",
    { id: 42, name: "Physics" },
    {
      CANVAS_GET_ALL_ASSIGNMENTS: {
        assignments: [{ name: "Momentum worksheet", description: "Due next class" }],
      },
      CANVAS_LIST_ANNOUNCEMENTS: {
        announcements: [{ title: "Lab reminder", message: "Bring goggles" }],
      },
    },
  );
  assert.equal(calls[0].args.course_id, "42");
  assert.deepEqual(calls[1].args.context_codes, ["course_42"]);
  assert.match(details.fields.notes.join("\n"), /Momentum worksheet/);
  assert.match(details.fields.notes.join("\n"), /Lab reminder/);
}

{
  const { calls, details } = await loadDetails(
    "blackboard",
    { id: "course-provider-id", name: "World History" },
    {
      BLACKBOARD_GET_ANNOUNCEMENTS: {
        results: [
          { courseId: "course-provider-id", title: "Chapter 6", body: "Read before Monday." },
          { courseId: "another-course", title: "Private other course", body: "Do not import." },
        ],
      },
    },
  );
  assert.deepEqual(calls[0].args, { limit: 50 });
  assert.match(details.fields.notes.join("\n"), /Chapter 6/);
  assert.equal(details.fields.notes.join("\n").includes("Private other course"), false);
}

{
  const { calls, details } = await loadDetails(
    "blackboard",
    { name: "Unscoped course" },
    {},
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(details.fields, {});
}

{
  const { details } = await loadDetails(
    "blackboard",
    { id: "course-provider-id", name: "World History" },
    {
      BLACKBOARD_GET_ANNOUNCEMENTS: {
        results: [
          { title: "Announcement without course identity", body: "Must not cross course boundaries." },
        ],
      },
    },
  );
  assert.equal(details.fields.notes, undefined);
  assert.equal(details.warnings.some((warning) => warning.code === "provider_scope_limited"), true);
}

{
  const { calls, details } = await loadDetails(
    "outlook",
    { id: "message-provider-id", subject: "Class follow-up" },
    {
      OUTLOOK_QUERY_EMAILS: {
        value: [
          {
            id: "message-provider-id",
            subject: "Class follow-up",
            body: { content: "Bring the completed lab sheet." },
          },
        ],
      },
    },
  );
  assert.match(calls[0].args.filter, /^id eq '/);
  assert.match(details.fields.notes.join("\n"), /Bring the completed lab sheet/);
  assert.equal(JSON.stringify(details).includes("message-provider-id"), false);
}

{
  const teamId = "87b0560f-fc0d-4442-add8-b380ca926707";
  const { calls, details } = await loadDetails(
    "microsoft_teams",
    { id: teamId, displayName: "Period 5" },
    {
      MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS: {
        value: [{ id: "channel-provider-id", displayName: "General" }],
      },
      MICROSOFT_TEAMS_TEAMS_LIST_CHANNEL_MESSAGES: (args) => {
        assert.equal(args.team_id, teamId);
        assert.equal(args.channel_id, "channel-provider-id");
        return {
          value: [
            { from: { user: { displayName: "Ms. Rivera" } }, body: { content: "Review chapter 4." } },
          ],
        };
      },
    },
  );
  assert.equal(calls[0].args.team_id, teamId);
  assert.match(details.fields.notes.join("\n"), /Review chapter 4/);
  assert.equal(JSON.stringify(details).includes("channel-provider-id"), false);
}

{
  const { calls, details } = await loadDetails(
    "slack",
    { id: "C0123456789", name: "teachers" },
    {
      SLACK_FETCH_CONVERSATION_HISTORY: {
        messages: [{ user_name: "Lee", text: "Review chapter 4." }],
      },
    },
  );
  assert.equal(calls[0].args.channel, "C0123456789");
  assert.match(details.fields.notes.join("\n"), /Lee: Review chapter 4/);
}

{
  const { calls, details } = await loadDetails(
    "notion",
    { id: "11111111-2222-4333-8444-555555555555", title: "Unit plan" },
    {
      NOTION_GET_PAGE_MARKDOWN: {
        markdown: "Essential question: Why do cells divide?",
      },
    },
  );
  assert.equal(calls[0].args.page_id, "11111111-2222-4333-8444-555555555555");
  assert.equal(calls[0].args.include_transcript, true);
  assert.match(details.fields.notes.join("\n"), /Essential question/);
}

await assertRejectsStatus(
  () =>
    loadIntegrationRecordDetails(
      teacher,
      "slack",
      { id: "C0123456789", name: "teachers" },
      connectionBinding,
      {
        executeReadTool: detailExecutor(
          { SLACK_FETCH_CONVERSATION_HISTORY: { messages: [] } },
          [],
          "b".repeat(64),
        ),
      },
    ),
  409,
  /connection|refresh/i,
);

{
  const providerFailure = Object.assign(new Error("raw provider secret"), { statusCode: 502 });
  const { details } = await loadDetails(
    "slack",
    { id: "C0123456789", name: "teachers" },
    { SLACK_FETCH_CONVERSATION_HISTORY: providerFailure },
  );
  assert.equal(details.fields.notes, undefined);
  assert.equal(details.warnings.length, 1);
  assert.equal(JSON.stringify(details).includes("raw provider secret"), false);
}

assert.deepEqual(validateIntegrationRecordsPayload({ integrationId: "zoom", query: "algebra" }), {
  integrationId: "zoom",
  query: "algebra",
});
assert.deepEqual(
  validateIntegrationImportPreviewPayload({
    integrationId: "zoom",
    query: "",
    selectionKey: "clsi1.abc.def.ghi",
  }),
  {
    integrationId: "zoom",
    query: "",
    selectionKey: "clsi1.abc.def.ghi",
  },
);
assertThrowsStatus(
  () => validateIntegrationRecordsPayload({ integrationId: "zoom", arguments: { userId: "victim" } }),
  400,
  /unsupported field/i,
);
assertThrowsStatus(
  () =>
    validateIntegrationImportPreviewPayload({
      integrationId: "zoom",
      query: "",
      selectionKey: "clsi1.abc.def.ghi",
      providerId: "provider-secret",
    }),
  400,
  /unsupported field/i,
);

function apiResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

async function invokeHandler(handler, request) {
  const response = apiResponse();
  await handler(
    {
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      ...request,
    },
    response,
  );
  return {
    status: response.statusCode,
    payload: JSON.parse(response.body || "{}"),
    headers: response.headers,
  };
}

assert.equal((await invokeHandler(recordsHandler, { method: "POST" })).status, 401);
assert.equal((await invokeHandler(importPreviewHandler, { method: "POST" })).status, 401);
for (const handler of [recordsHandler, importPreviewHandler]) {
  const response = await invokeHandler(handler, { method: "GET" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.Allow, "POST");
}

console.log("Composio structured import checks passed.");
