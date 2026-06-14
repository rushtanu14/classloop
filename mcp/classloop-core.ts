import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createGeneratedSession, extractTranscriptSpeakers } from "../src/data.js";
import type { Session, SessionType, Student } from "../src/types.js";

export type RedactionMode = "strict" | "balanced" | "local";

export type ClassLoopWorkspace = {
  sessions: Session[];
  draft: Session | null;
  classGroups: unknown[];
  rosterTemplates: unknown[];
  auditLog: unknown[];
  updatedAt?: string;
  readOnly?: boolean;
  readError?: string;
};

export type CoreOptions = {
  mode?: RedactionMode;
  statePath?: string;
};

export const defaultClassLoopMcpStatePath = resolve(process.cwd(), ".classloop-data.json");

export const classLoopMcpResources = [
  "classloop://workspace/summary",
  "classloop://sessions",
  "classloop://sessions/{sessionId}",
  "classloop://sessions/{sessionId}/report",
  "classloop://students/{studentId}/followups",
  "classloop://launch/status",
] as const;

export const classLoopMcpTools = [
  "classloop_create_import_draft",
  "classloop_parse_transcript_preview",
  "classloop_prepare_classroom_post",
  "classloop_export_session_report",
  "classloop_add_teacher_note",
] as const;

export const classLoopMcpPrompts = [
  "review_session_before_publish",
  "find_student_followup_gaps",
  "summarize_alpha_feedback",
  "prepare_support_safe_bug_report",
  "launch_readiness_check",
] as const;

const sessionTypes: SessionType[] = [
  "Math review",
  "CS workshop",
  "General classroom",
  "Club meeting",
  "Study group",
];

const participationTypes = ["asked_question", "answered_question", "chat", "quiet", "absent"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function uniqueText(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function shortText(value: unknown, maxLength = 480) {
  const text = asString(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeMode(mode?: string): RedactionMode {
  return mode === "balanced" || mode === "local" || mode === "strict" ? mode : "strict";
}

export function redactionModeFromEnv(value = process.env.CLASSLOOP_MCP_REDACTION) {
  return normalizeMode(value);
}

function normalizeSessionType(value: unknown): SessionType {
  return sessionTypes.includes(value as SessionType) ? (value as SessionType) : "General classroom";
}

function normalizeWorkspace(raw: unknown): ClassLoopWorkspace {
  const source = isRecord(raw) ? raw : {};
  return {
    sessions: Array.isArray(source.sessions) ? (source.sessions as Session[]) : [],
    draft: isRecord(source.draft) ? (source.draft as Session) : null,
    classGroups: Array.isArray(source.classGroups) ? source.classGroups : [],
    rosterTemplates: Array.isArray(source.rosterTemplates) ? source.rosterTemplates : [],
    auditLog: Array.isArray(source.auditLog) ? source.auditLog : [],
    updatedAt: asString(source.updatedAt) || undefined,
    readOnly: source.readOnly === true,
    readError: asString(source.readError) || undefined,
  };
}

export function readClassLoopWorkspace(options: CoreOptions = {}): ClassLoopWorkspace {
  const statePath = options.statePath || process.env.CLASSLOOP_MCP_STATE_PATH || defaultClassLoopMcpStatePath;
  if (!existsSync(statePath)) {
    return {
      sessions: [],
      draft: null,
      classGroups: [],
      rosterTemplates: [],
      auditLog: [],
      readOnly: true,
      readError: `No readable ClassLoop workspace found at ${statePath}.`,
    };
  }

  try {
    const stored = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
    if (isRecord(stored) && stored.encrypted === true && stored.payload) {
      return {
        sessions: [],
        draft: null,
        classGroups: [],
        rosterTemplates: [],
        auditLog: [],
        readOnly: true,
        readError:
          "The local ClassLoop workspace is encrypted. Export a plain workspace JSON or set CLASSLOOP_MCP_STATE_PATH to a safe review snapshot to inspect it through MCP.",
      };
    }

    if (isRecord(stored) && stored.encrypted === false && isRecord(stored.payload)) {
      return normalizeWorkspace(stored.payload);
    }

    return normalizeWorkspace(stored);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workspace read error.";
    return {
      sessions: [],
      draft: null,
      classGroups: [],
      rosterTemplates: [],
      auditLog: [],
      readOnly: true,
      readError: `Unable to read the ClassLoop workspace: ${message}`,
    };
  }
}

function maskEmail(email: string, mode: RedactionMode) {
  if (!email) return "";
  if (mode === "local") return email;
  const [name, domain = "redacted.local"] = email.split("@");
  if (mode === "balanced") return `${name.slice(0, 1) || "u"}***@${domain}`;
  return "redacted@classloop.local";
}

function studentLabel(student: Student | undefined, index: number, mode: RedactionMode) {
  if (!student) return `Student ${index + 1}`;
  if (mode === "local") return student.name;
  if (mode === "balanced") return student.name.split(/\s+/)[0] || `Student ${index + 1}`;
  return `Student ${index + 1}`;
}

function studentKey(student: Student | undefined, index: number, mode: RedactionMode) {
  if (student && mode === "local") return student.id;
  return `student-${index + 1}`;
}

function redactStudent(student: Student, index: number, mode: RedactionMode) {
  return {
    id: studentKey(student, index, mode),
    label: studentLabel(student, index, mode),
    email: maskEmail(student.email, mode),
    linkedAccountEmail: maskEmail(student.linkedAccountEmail ?? "", mode) || undefined,
  };
}

function redactedStudentId(session: Session, studentId: string | undefined, mode: RedactionMode) {
  if (!studentId) return undefined;
  const index = session.students.findIndex((student) => student.id === studentId);
  if (index < 0) return mode === "local" ? studentId : undefined;
  return studentKey(session.students[index], index, mode);
}

function redactFreeText(session: Session, value: unknown, mode: RedactionMode, maxLength = 480) {
  let text = shortText(value, maxLength).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi, (email) => maskEmail(email, mode));
  if (mode === "local") return text;

  session.students.forEach((student, index) => {
    const label = studentLabel(student, index, mode);
    const names = uniqueText([
      student.name,
      ...(student.aliases ?? []),
      ...(mode === "strict" ? student.name.split(/\s+/).slice(0, 1) : []),
    ])
      .map((name) => name.trim())
      .filter((name) => name.length >= 2)
      .sort((left, right) => right.length - left.length);

    names.forEach((name) => {
      text = text.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), label);
    });
  });

  return text;
}

function countParticipationByType(session: Session) {
  return participationTypes.reduce<Record<string, number>>((counts, type) => {
    counts[type] = session.participationEvents.filter((event) => event.type === type).length;
    return counts;
  }, {});
}

function extractUrls(text: string) {
  return uniqueText(text.match(/https?:\/\/[^\s)]+/gi) ?? []);
}

function speakerSummary(transcript: string, mode: RedactionMode) {
  const speakers = extractTranscriptSpeakers(transcript)
    .map((line) => line.speaker.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return uniqueText(speakers).map((speaker, index) => ({
    label: mode === "local" ? speaker : `Speaker ${index + 1}`,
  }));
}

function redactedTranscriptSummary(session: Session, mode: RedactionMode) {
  return {
    included: false,
    reason: "Raw transcripts are redacted from MCP resources by default.",
    characterCount: session.transcript.length,
    speakers: speakerSummary(session.transcript, mode),
  };
}

function redactedSessionSummary(session: Session, mode: RedactionMode) {
  return {
    id: session.id,
    title: session.title,
    type: session.type,
    date: session.date,
    status: session.status,
    studentCount: session.students.length,
    actionItemCount: session.actionItems.length,
    resourceCount: session.resources.length,
    followUpCount: session.followUps.length,
    unmatchedParticipantCount: session.unmatchedParticipants?.length ?? 0,
    participation: countParticipationByType(session),
  };
}

export function redactSession(session: Session, options: CoreOptions = {}) {
  const mode = normalizeMode(options.mode);
  return {
    ...redactedSessionSummary(session, mode),
    recap: redactFreeText(session, session.recap, mode, 1200),
    essentialQuestions: session.essentialQuestions.map((question) => redactFreeText(session, question, mode, 200)),
    students: session.students.map((student, index) => redactStudent(student, index, mode)),
    transcript: redactedTranscriptSummary(session, mode),
    notes: {
      included: mode === "local",
      text: mode === "local" ? shortText(session.notes, 1200) : undefined,
      characterCount: session.notes.length,
    },
    resources: session.resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      type: resource.type,
      relatedTopic: resource.relatedTopic,
      url: resource.url,
    })),
    actionItems: session.actionItems.map((item) => ({
      id: item.id,
      title: redactFreeText(session, item.title, mode, 180),
      description: redactFreeText(session, item.description, mode, 300),
      dueDate: item.dueDate,
      status: item.status,
      source: item.source,
      ownerId: redactedStudentId(session, item.ownerId, mode),
    })),
    importWarnings: (session.importWarnings ?? []).map((warning) => ({
      id: warning.id,
      severity: warning.severity,
      title: warning.title,
      message: warning.message,
      reviewed: warning.reviewed === true,
    })),
  };
}

function findSession(workspace: ClassLoopWorkspace, sessionId: string) {
  return workspace.sessions.find((session) => session.id === sessionId) ?? (workspace.draft?.id === sessionId ? workspace.draft : null);
}

function allSessions(workspace: ClassLoopWorkspace) {
  return workspace.draft ? [workspace.draft, ...workspace.sessions.filter((session) => session.id !== workspace.draft?.id)] : workspace.sessions;
}

export function workspaceSummary(workspace: ClassLoopWorkspace, options: CoreOptions = {}) {
  const mode = normalizeMode(options.mode);
  const sessions = allSessions(workspace);
  return {
    statePath: options.statePath || process.env.CLASSLOOP_MCP_STATE_PATH || defaultClassLoopMcpStatePath,
    redactionMode: mode,
    readOnly: workspace.readOnly === true,
    readError: workspace.readError,
    updatedAt: workspace.updatedAt,
    sessionCount: sessions.length,
    publishedSessionCount: sessions.filter((session) => session.status === "published").length,
    draftSession: workspace.draft ? redactedSessionSummary(workspace.draft, mode) : null,
    classGroupCount: workspace.classGroups.length,
    rosterTemplateCount: workspace.rosterTemplates.length,
    auditEventCount: workspace.auditLog.length,
    resources: classLoopMcpResources,
    tools: classLoopMcpTools,
    prompts: classLoopMcpPrompts,
  };
}

export function sessionList(workspace: ClassLoopWorkspace, options: CoreOptions = {}) {
  const mode = normalizeMode(options.mode);
  return allSessions(workspace).map((session) => redactedSessionSummary(session, mode));
}

export function sessionDetail(workspace: ClassLoopWorkspace, sessionId: string, options: CoreOptions = {}) {
  const session = findSession(workspace, sessionId);
  if (!session) return { error: `No ClassLoop session found for ${sessionId}.` };
  return redactSession(session, options);
}

export function sessionReport(workspace: ClassLoopWorkspace, sessionId: string, options: CoreOptions = {}) {
  const mode = normalizeMode(options.mode);
  const session = findSession(workspace, sessionId);
  if (!session) return { error: `No ClassLoop session found for ${sessionId}.` };
  const studentById = new Map(session.students.map((student, index) => [student.id, { student, index }]));
  return {
    session: redactedSessionSummary(session, mode),
    recap: redactFreeText(session, session.recap, mode, 1600),
    essentialQuestions: session.essentialQuestions.map((question) => redactFreeText(session, question, mode, 220)),
    classWideTasks: session.actionItems
      .filter((item) => !item.ownerId)
      .map((item) => ({ title: redactFreeText(session, item.title, mode, 180), dueDate: item.dueDate, status: item.status })),
    resources: session.resources.map((resource) => ({
      title: resource.title,
      type: resource.type,
      relatedTopic: resource.relatedTopic,
      url: resource.url,
    })),
    studentFollowUps: session.followUps.map((followUp) => {
      const entry = studentById.get(followUp.studentId);
      return {
        studentId: studentKey(entry?.student, entry?.index ?? 0, mode),
        student: studentLabel(entry?.student, entry?.index ?? 0, mode),
        reminder: redactFreeText(session, followUp.reminder, mode, 260),
        catchUp: redactFreeText(session, followUp.catchUp, mode, 260),
        tasks: followUp.tasks.map((task) => redactFreeText(session, task, mode, 120)),
        dueDate: followUp.dueDate,
        status: followUp.status,
      };
    }),
    privacy: {
      transcriptIncluded: false,
      emailsRedacted: mode !== "local",
      directPublishAvailable: false,
    },
  };
}

export function studentFollowUps(workspace: ClassLoopWorkspace, studentId: string, options: CoreOptions = {}) {
  const mode = normalizeMode(options.mode);
  return allSessions(workspace)
    .flatMap((session) => {
      const studentEntries = session.students
        .map((student, index) => ({ student, index }))
        .filter((entry) => entry.student.id === studentId || studentKey(entry.student, entry.index, mode) === studentId);
      return studentEntries.flatMap(({ student, index }) =>
        session.followUps.filter((followUp) => followUp.studentId === student.id).map((followUp) => ({
          sessionId: session.id,
          sessionTitle: session.title,
          studentId: studentKey(student, index, mode),
          student: studentLabel(student, index, mode),
          reminder: redactFreeText(session, followUp.reminder, mode, 300),
          catchUp: redactFreeText(session, followUp.catchUp, mode, 300),
          tasks: followUp.tasks.map((task) => redactFreeText(session, task, mode, 120)),
          dueDate: followUp.dueDate,
          status: followUp.status,
        })),
      );
    });
}

export function launchStatus(workspace: ClassLoopWorkspace, options: CoreOptions = {}) {
  const sessions = allSessions(workspace);
  return {
    workspace: workspaceSummary(workspace, options),
    releaseLinksManifest: "public/classloop-downloads.json",
    publicRoutes: ["#/features", "#/screenshots", "#/docs", "#/privacy", "#/terms", "#/eula", "#/support", "#/download"],
    blockers: workspace.readError ? [workspace.readError] : [],
    recommendation: workspace.readError
      ? "Point CLASSLOOP_MCP_STATE_PATH at a safe exported workspace snapshot before asking MCP clients to review live classroom context."
      : sessions.length
        ? "Review the latest draft, publish audit, and public download manifest before launch checks."
        : "Create or import a session before running launch readiness prompts.",
  };
}

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function defaultClassroomPostTitle(session: Session) {
  return `${session.title} recap and next steps`;
}

function defaultClassroomPostBody(session: Session, mode: RedactionMode) {
  const classWideTasks = session.actionItems.filter((item) => !item.ownerId);
  const taskLines = classWideTasks.length
    ? classWideTasks.map((item) => `- ${redactFreeText(session, item.title, mode, 160)}${item.dueDate ? ` (due ${formatDate(item.dueDate)})` : ""}`)
    : ["- Review the recap and complete the next steps your teacher approved."];
  const resourceLines = session.resources.length
    ? session.resources.map((resource) => `- ${resource.title}: ${resource.url}`)
    : ["- No additional resources attached."];

  return [
    redactFreeText(session, session.recap, mode, 1200),
    "",
    "Class-wide tasks:",
    ...taskLines,
    "",
    "Resources:",
    ...resourceLines,
    "",
    "Personalized ClassLoop follow-ups stay in each student's ClassLoop dashboard.",
  ].join("\n");
}

function classroomPostDueDate(session: Session) {
  return (
    session.actionItems.find((item) => !item.ownerId && item.dueDate)?.dueDate ??
    session.actionItems.find((item) => item.dueDate)?.dueDate ??
    session.followUps.find((followUp) => followUp.dueDate)?.dueDate ??
    new Date().toISOString().slice(0, 10)
  );
}

export function prepareClassroomPost(
  workspace: ClassLoopWorkspace,
  input: {
    sessionId: string;
    postType?: "announcement" | "assignment" | "material";
    title?: string;
    body?: string;
    dueDate?: string;
  },
  options: CoreOptions = {},
) {
  const mode = normalizeMode(options.mode);
  const session = findSession(workspace, input.sessionId);
  if (!session) return { error: `No ClassLoop session found for ${input.sessionId}.` };
  const postType = input.postType ?? "announcement";
  return {
    mode: "preview_only",
    provider: "google_classroom",
    postType,
    title: input.title?.trim() || redactFreeText(session, defaultClassroomPostTitle(session), mode, 180),
    body: input.body?.trim() || defaultClassroomPostBody(session, mode),
    dueDate: postType === "assignment" ? input.dueDate || classroomPostDueDate(session) : undefined,
    classWideOnly: true,
    directPublishAvailable: false,
    confirmationRequired: true,
    warnings: [
      "Review the post for student-specific details before copying or sending it to an external classroom system.",
      "MCP tools never publish directly from ClassLoop in this preview scaffold.",
    ],
  };
}

export function exportSessionReport(workspace: ClassLoopWorkspace, input: { sessionId: string; format?: "json" | "markdown" }, options: CoreOptions = {}) {
  const report = sessionReport(workspace, input.sessionId, options);
  if ("error" in report || input.format !== "markdown") return report;
  const tasks = report.classWideTasks.map((task) => `- ${task.title}${task.dueDate ? ` (due ${task.dueDate})` : ""}`);
  const resources = report.resources.map((resource) => `- ${resource.title}: ${resource.url}`);
  return {
    format: "markdown",
    text: [
      `# ${report.session.title}`,
      "",
      `Status: ${report.session.status}`,
      `Students: ${report.session.studentCount}`,
      "",
      "## Recap",
      report.recap,
      "",
      "## Essential Questions",
      ...report.essentialQuestions.map((question) => `- ${question}`),
      "",
      "## Class-Wide Tasks",
      ...(tasks.length ? tasks : ["- No class-wide tasks found."]),
      "",
      "## Resources",
      ...(resources.length ? resources : ["- No resources attached."]),
      "",
      "Transcript: redacted by MCP.",
    ].join("\n"),
  };
}

export function createImportDraftPreview(
  input: {
    title?: string;
    template?: SessionType;
    transcript: string;
    notes?: string;
    roster?: string;
    resources?: string;
  },
  options: CoreOptions = {},
) {
  const session = createGeneratedSession({
    title: input.title?.trim() || "ClassLoop MCP import draft",
    template: normalizeSessionType(input.template),
    transcript: input.transcript,
    notes: input.notes ?? "",
    roster: input.roster ?? "",
    resources: input.resources ?? "",
  });
  return {
    mode: "preview_only",
    draft: redactSession(session, options),
    publishAvailable: false,
    confirmationRequired: true,
  };
}

export function parseTranscriptPreview(
  input: {
    title?: string;
    template?: SessionType;
    transcript: string;
    roster?: string;
    notes?: string;
    resources?: string;
  },
  options: CoreOptions = {},
) {
  const mode = normalizeMode(options.mode);
  const speakers = speakerSummary(input.transcript, mode);
  const urls = extractUrls([input.transcript, input.notes ?? "", input.resources ?? ""].join("\n"));
  const draftPreview = input.roster?.trim()
    ? createImportDraftPreview(
        {
          title: input.title,
          template: normalizeSessionType(input.template),
          transcript: input.transcript,
          roster: input.roster,
          notes: input.notes,
          resources: input.resources,
        },
        options,
      )
    : null;
  return {
    mode: "preview_only",
    transcript: {
      included: false,
      characterCount: input.transcript.length,
      speakerCount: speakers.length,
      speakers,
      urlCount: urls.length,
      urls,
    },
    generatedDraft: draftPreview?.draft ?? null,
    warnings: [
      "Raw transcript text is not echoed back from MCP previews.",
      ...(input.roster?.trim() ? [] : ["No roster was provided, so student matching is only a speaker preview."]),
    ],
  };
}

export function addTeacherNotePreview(workspace: ClassLoopWorkspace, input: { sessionId: string; note: string }, options: CoreOptions = {}) {
  const session = findSession(workspace, input.sessionId);
  if (!session) return { error: `No ClassLoop session found for ${input.sessionId}.` };
  return {
    mode: "preview_only",
    session: redactedSessionSummary(session, normalizeMode(options.mode)),
    notePreview: redactFreeText(session, input.note, normalizeMode(options.mode), 800),
    writePerformed: false,
    confirmationRequired: true,
    suggestedAuditMessage: `Teacher note prepared for ${session.title}. Review in ClassLoop before saving.`,
  };
}
