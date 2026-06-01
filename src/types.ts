export type AttendanceStatus = "present" | "absent" | "late";

export type SessionStatus = "draft" | "published";

export type SessionCaptureMode = "transcript" | "audio" | "in_person" | "online_meeting";

export type SessionType =
  | "Math review"
  | "CS workshop"
  | "General classroom"
  | "Club meeting"
  | "Study group";

export type ParticipationType =
  | "asked_question"
  | "answered_question"
  | "chat"
  | "quiet"
  | "absent";

export type TaskStatus = "todo" | "in_progress" | "submitted" | "reviewed" | "complete" | "overdue";

export type Student = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  guardian?: string;
  aliases?: string[];
  linkedAccountEmail?: string;
  inviteSentAt?: string;
};

export type ClassGroup = {
  id: string;
  ownerEmail: string;
  name: string;
  defaultSessionType: SessionType;
  students: Student[];
  createdAt: string;
  updatedAt: string;
};

export type RosterTemplate = {
  id: string;
  ownerEmail: string;
  name: string;
  sessionType: SessionType;
  students: Student[];
  createdAt: string;
  updatedAt: string;
};

export type StudentSubmissionStatus = "todo" | "working" | "submitted" | "reviewed";

export type StudentSubmission = {
  studentId: string;
  sessionId: string;
  status: StudentSubmissionStatus;
  note: string;
  attachmentUrl?: string;
  submittedAt?: string;
  reviewedAt?: string;
};

export type PersonalTaskStatus = "todo" | "in_progress" | "complete";

export type PersonalTask = {
  id: string;
  title: string;
  status: PersonalTaskStatus;
  dueDateText: string;
  source: string;
};

export type PersonalNextMeeting = {
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  description: string;
};

export type PersonalDocsSummary = {
  title: string;
  body: string;
};

export type PersonalEmailDraft = {
  subject: string;
  body: string;
  recipients: string[];
};

export type TranscriptSource =
  | "paste"
  | "file"
  | "zoom_cloud_transcript"
  | "live_transcription"
  | "audio_recording"
  | "screen_recording"
  | "whisper_transcription";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  text: string;
  startSeconds?: number;
  endSeconds?: number;
};

export type StructuredTranscript = {
  title: string;
  source: TranscriptSource;
  model?: string;
  language?: string;
  durationSeconds?: number;
  generatedAt: string;
  text: string;
  segments: TranscriptSegment[];
};

export type PersonalMeeting = {
  id: string;
  ownerEmail: string;
  title: string;
  date: string;
  minutes: string;
  context: string;
  recap: string;
  resources: Resource[];
  questions: string[];
  tasks: PersonalTask[];
  nextMeeting?: PersonalNextMeeting;
  docsSummary?: PersonalDocsSummary;
  emailDraft?: PersonalEmailDraft;
  structuredTranscript?: StructuredTranscript;
  createdAt: string;
  updatedAt: string;
};

export type PublishAuditEntry = {
  sessionId: string;
  studentId?: string;
  type: "class_recap" | "student_followup" | "resource" | "delivery" | "completion";
  message: string;
  createdAt: string;
};

export type Resource = {
  id: string;
  title: string;
  url: string;
  type: "video" | "worksheet" | "link" | "slides";
  relatedTopic: string;
};

export type ActionItem = {
  id: string;
  title: string;
  description: string;
  ownerId?: string;
  dueDate: string;
  status: TaskStatus;
  source: string;
};

export type ParticipationEvent = {
  id: string;
  studentId: string;
  type: ParticipationType;
  text: string;
  confidence: number;
  approved: boolean;
  sourceLine?: string;
  reviewRequired?: boolean;
};

export type ImportQualityWarning = {
  id: string;
  severity: "info" | "warning" | "blocking";
  title: string;
  message: string;
  source: string;
  reviewed?: boolean;
};

export type StudentFollowUp = {
  studentId: string;
  reminder: string;
  catchUp: string;
  tasks: string[];
  dueDate: string;
  status: TaskStatus;
  score: number;
};

export type SessionCapture = {
  mode: SessionCaptureMode;
  sourceLabel: string;
  capturedAt: string;
  durationSeconds?: number;
  transcriptSource: TranscriptSource;
};

export type SessionEmailDelivery = {
  status: "not_sent" | "sent";
  sentAt?: string;
  provider?: string;
  recipients: string[];
  skipped: string[];
  failed?: string[];
  lastError?: string;
};

export type DeliveryLog = {
  id: string;
  provider: "email";
  target: string;
  status: "sent" | "posted" | "failed" | "skipped";
  message: string;
  createdAt: string;
  recipientCount?: number;
};

export type UnmatchedParticipant = {
  name: string;
  lines: string[];
  suggestedStudentId?: string;
};

export type Session = {
  id: string;
  ownerEmail?: string;
  isDemo?: boolean;
  classGroupId?: string;
  classGroupName?: string;
  title: string;
  type: SessionType;
  date: string;
  status: SessionStatus;
  students: Student[];
  transcript: string;
  notes: string;
  capture?: SessionCapture;
  structuredTranscript?: StructuredTranscript;
  recap: string;
  essentialQuestions: string[];
  attendance: Record<string, AttendanceStatus>;
  resources: Resource[];
  actionItems: ActionItem[];
  participationEvents: ParticipationEvent[];
  followUps: StudentFollowUp[];
  unmatchedParticipants?: UnmatchedParticipant[];
  importWarnings?: ImportQualityWarning[];
  transcriptAliases?: Record<string, string>;
  emailDelivery?: SessionEmailDelivery;
  deliveryLogs?: DeliveryLog[];
  publishAudit?: PublishAuditEntry[];
  submissions?: StudentSubmission[];
};
