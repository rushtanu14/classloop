import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  LineChart,
  Link2,
  Link as LinkIcon,
  ListChecks,
  LogOut,
  Mail,
  MessageSquare,
  Mic2,
  Palette,
  PlayCircle,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Target,
  UploadCloud,
  Trash2,
  UserPlus,
  UserRound,
  UserRoundCheck,
  UserX,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { loadStripe, type StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createPersonalMeetingDraft,
  createGeneratedSession,
  extractTranscriptSpeakers,
  readTranscriptFileText,
  sampleNotes,
  sampleRoster,
  sampleTranscript,
} from "./data";
import { createStructuredTranscriptFromSegments, createStructuredTranscriptFromText, formatTranscriptTime } from "./transcript";
import {
  cloudRequest,
  createBillingPortalSession,
  createCloudAccount,
  createCheckoutSession,
  createEmbeddedCheckoutSession,
  getBackendStatus,
  getCloudEmailRedirectUrl,
  getCloudProfile,
  getCloudSession,
  getStripePricingTableConfig,
  getStripePublishableKey,
  isManualProBillingProfile,
  isPaidPlan,
  manualProBillingProfileForEmail,
  planCatalog,
  prepareBillingCloudAccount,
  signIntoCloud,
  signOutCloud,
  type BillingProfile,
  type CloudAuthResult,
  type PlanTier,
} from "./cloud";
import type {
  ActionItem,
  AttendanceStatus,
  ClassGroup,
  DeliveryLog,
  ImportQualityWarning,
  ParticipationEvent,
  ParticipationType,
  PersonalMeeting,
  PersonalTask,
  PersonalTaskStatus,
  PublishAuditEntry,
  Resource,
  RosterTemplate,
  Session,
  SessionCaptureMode,
  SessionType,
  StructuredTranscript,
  TranscriptSource,
  Student,
  StudentFollowUp,
  StudentSubmission,
  StudentSubmissionStatus,
  TaskStatus,
  UnmatchedParticipant,
} from "./types";

type RouteKey =
  | "dashboard"
  | "personal-dashboard"
  | "new-personal-meeting"
  | "personal-meetings"
  | "new-session"
  | "processing"
  | "review"
  | "publish-preview"
  | "report"
  | "student"
  | "student-session"
  | "classes"
  | "rosters"
  | "analytics"
  | "billing"
  | "checkout"
  | "tutorial"
  | "appearance"
  | "privacy";

type NavItem = {
  route: RouteKey;
  label: string;
  icon: typeof LayoutDashboard;
};

type AuthRole = "teacher" | "student" | "individual";

type AuthSession = {
  accountId: string;
  role: AuthRole;
  email: string;
  name: string;
  studentId?: string;
  demo?: boolean;
  multiDevicePending?: boolean;
};

type AuthResult = {
  ok: boolean;
  message?: string;
  code?: "email_confirmation_required";
  nextMode?: "signin";
  role?: AuthRole;
  email?: string;
  redirectUrl?: string;
};

type LocalAuthSecret = {
  accountId: string;
  role: AuthRole;
  email: string;
  password: string;
};

type CloudConfirmationPrompt = {
  email: string;
  redirectUrl: string;
  context: "account-create" | "checkout" | "cloud-login";
};

type AuditActor = Pick<AuthSession, "email" | "role"> &
  Partial<Pick<AuthSession, "accountId" | "name" | "studentId" | "demo" | "multiDevicePending">>;

type CloudEmailConfirmationOverlayProps = {
  prompt: CloudConfirmationPrompt;
  actionLabel: string;
  onClose: () => void;
  onAction: () => void;
  secondaryActionLabel?: string;
  secondaryActionHelper?: string;
  onSecondaryAction?: () => void | Promise<void>;
};

type PendingLocalAccount = {
  role: AuthRole;
  name: string;
  email: string;
  password: string;
};

function cloudConfirmationFromResult(
  result: CloudAuthResult,
  fallbackEmail: string,
  context: CloudConfirmationPrompt["context"],
): CloudConfirmationPrompt | null {
  if (result.code !== "email_confirmation_required") return null;
  return {
    email: result.email || normalizeEmail(fallbackEmail),
    redirectUrl: result.redirectUrl || getCloudEmailRedirectUrl(context === "checkout" ? "billing" : "dashboard"),
    context,
  };
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type LandingPageKey =
  | "home"
  | "features"
  | "screenshots"
  | "docs"
  | "privacy"
  | "terms"
  | "eula"
  | "support"
  | "download";
type DesktopInstallerId = "macos" | "windows" | "linux";

type ReleasePlatformManifest = {
  url?: string;
  x64Url?: string;
  arm64Url?: string;
  zipUrl?: string;
  x64ZipUrl?: string;
  arm64ZipUrl?: string;
  sourceUrl?: string;
};

type ReleaseDownloadManifest = {
  checksumsUrl?: string;
  macos?: ReleasePlatformManifest;
  windows?: ReleasePlatformManifest;
  linux?: ReleasePlatformManifest;
};

type TemplateLinkManifest = {
  classTemplateCopyUrl?: string;
  personalTemplateCopyUrl?: string;
};

type Account = {
  id: string;
  role: AuthRole;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  theme?: ThemeSettings;
  submittedProductFeedbackKeys?: string[];
  demo?: boolean;
};

type AccountSettingsInput = {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
};

type PasswordResetRecord = {
  code: string;
  expiresAt: number;
};

type SharedState = {
  accounts: Account[];
  sessions: Session[];
  personalMeetings: PersonalMeeting[];
  draft: Session | null;
  demoLoaded: boolean;
  classGroups: ClassGroup[];
  rosterTemplates: RosterTemplate[];
  privacySettings: PrivacySettings;
  auditLog: AuditLogEntry[];
  billingProfile: BillingProfile;
  updatedAt?: string;
};

type SyncStatus = "connecting" | "shared" | "local";

type NoticeSeverity = "info" | "warning" | "error";

type WorkspaceNotice = {
  severity: NoticeSeverity;
  title: string;
  message: string;
};

type BootPhase = "local" | "ready";

type BootStepStatus = "pending" | "active" | "complete" | "warning" | "error";

type BootStep = {
  label: string;
  detail: string;
  status: BootStepStatus;
};

type LocalReadResult<T> = {
  value: T;
  failed: boolean;
};

type LocalStateReadResult = {
  state: SharedState;
  failedKeys: string[];
};

type ReleaseManifestStatus = "loading" | "ready" | "unavailable" | "invalid" | "blocked";

type PrivacySettings = {
  retentionDays: number;
  recordingConsentRequired: boolean;
  allowStudentExport: boolean;
  auditLogEnabled: boolean;
  noTrainingOnStudentData: boolean;
};

type AuditLogEntry = {
  id: string;
  actorEmail: string;
  actorRole: AuthRole;
  action: string;
  detail: string;
  createdAt: string;
};

type ThemeKey = "abyssal" | "classroom" | "botanical" | "graphite";

type ThemeSettings = {
  key: ThemeKey;
  accent: string;
  imageUrl: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

type TourRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type IntegrationStatus = {
  email: {
    configured: boolean;
    provider: string;
    from?: string;
    replyTo?: string;
  };
};

type EmailDeliveryResult = {
  provider: string;
  sentAt: string;
  recipients: string[];
  skipped: string[];
  failed: string[];
};

type ProductFeedbackSubmitter = (session: Session, student: Student, rating: number, note: string) => Promise<boolean>;

type CelebrationMoment = {
  id: number;
  title: string;
  detail: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readManifestString = (value: unknown) => (typeof value === "string" ? value : undefined);

function normalizeReleasePlatformManifest(value: unknown): ReleasePlatformManifest {
  if (!isRecord(value)) return {};
  return {
    url: readManifestString(value.url),
    x64Url: readManifestString(value.x64Url),
    arm64Url: readManifestString(value.arm64Url),
    zipUrl: readManifestString(value.zipUrl),
    x64ZipUrl: readManifestString(value.x64ZipUrl),
    arm64ZipUrl: readManifestString(value.arm64ZipUrl),
    sourceUrl: readManifestString(value.sourceUrl),
  };
}

function normalizeReleaseDownloadManifest(value: unknown): ReleaseDownloadManifest {
  if (!isRecord(value)) return {};
  return {
    checksumsUrl: readManifestString(value.checksumsUrl),
    macos: normalizeReleasePlatformManifest(value.macos),
    windows: normalizeReleasePlatformManifest(value.windows),
    linux: normalizeReleasePlatformManifest(value.linux),
  };
}

function normalizeTemplateLinkManifest(value: unknown): TemplateLinkManifest {
  if (!isRecord(value)) return {};
  return {
    classTemplateCopyUrl: readManifestString(value.classTemplateCopyUrl),
    personalTemplateCopyUrl: readManifestString(value.personalTemplateCopyUrl),
  };
}

function releaseUrlIsVercelBlob(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function releaseManifestHasBlockedUrls(manifest: ReleaseDownloadManifest) {
  return [
    manifest.checksumsUrl,
    manifest.macos?.url,
    manifest.macos?.x64Url,
    manifest.macos?.arm64Url,
    manifest.macos?.zipUrl,
    manifest.macos?.x64ZipUrl,
    manifest.macos?.arm64ZipUrl,
    manifest.macos?.sourceUrl,
    manifest.windows?.url,
    manifest.windows?.x64Url,
    manifest.windows?.arm64Url,
    manifest.windows?.zipUrl,
    manifest.windows?.x64ZipUrl,
    manifest.windows?.arm64ZipUrl,
    manifest.linux?.url,
    manifest.linux?.x64Url,
    manifest.linux?.arm64Url,
    manifest.linux?.zipUrl,
    manifest.linux?.x64ZipUrl,
    manifest.linux?.arm64ZipUrl,
  ].some(releaseUrlIsVercelBlob);
}

function detectDesktopInstallerFromBrowser(): DesktopInstallerId | null {
  if (typeof window === "undefined") return null;
  const nav = window.navigator as Navigator & { userAgentData?: { platform?: string }; standalone?: boolean };
  const hints = [nav.userAgentData?.platform, nav.platform, nav.userAgent].filter(Boolean).join(" ").toLowerCase();
  const touchMac = /mac/.test(String(nav.platform || "").toLowerCase()) && (nav.maxTouchPoints ?? 0) > 1;
  if (!hints || touchMac || /iphone|ipad|ipod|android|mobile|tablet|cros|chrome os/.test(hints)) return null;
  if (/win/.test(hints)) return "windows";
  if (/mac/.test(hints)) return "macos";
  if (/linux|x11/.test(hints)) return "linux";
  return null;
}

function classLoopBuildMarker() {
  return __CLASSLOOP_VERSION__ ? `v${__CLASSLOOP_VERSION__}` : "";
}

function classLoopBuildDetails() {
  return "";
}

const navItems: NavItem[] = [
  { route: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { route: "new-session", label: "New session", icon: PlusCircle },
  { route: "classes", label: "Classes", icon: BookOpen },
  { route: "rosters", label: "Rosters", icon: Users },
  { route: "review", label: "Draft review", icon: Sparkles },
  { route: "report", label: "Session report", icon: ClipboardCheck },
  { route: "student", label: "Student view", icon: GraduationCap },
  { route: "analytics", label: "Analytics", icon: BarChart3 },
  { route: "billing", label: "Plan options", icon: RefreshCw },
  { route: "tutorial", label: "How it works", icon: BookOpen },
  { route: "appearance", label: "Appearance", icon: Palette },
  { route: "privacy", label: "Privacy", icon: ShieldCheck },
];

const individualNavItems: NavItem[] = [
  { route: "personal-dashboard", label: "Personal dashboard", icon: LayoutDashboard },
  { route: "new-personal-meeting", label: "New meeting", icon: PlusCircle },
  { route: "personal-meetings", label: "Meeting history", icon: ClipboardCheck },
  { route: "appearance", label: "Appearance", icon: Palette },
];

const studentNavItems: NavItem[] = [
  { route: "student", label: "My portal", icon: GraduationCap },
  { route: "tutorial", label: "How it works", icon: BookOpen },
  { route: "appearance", label: "Appearance", icon: Palette },
];

const teacherNavSections: Array<{ label: string; items: NavItem[] }> = [
  { label: "Classroom", items: navItems.filter((item) => ["dashboard", "new-session", "review", "report"].includes(item.route)) },
  { label: "Manage", items: navItems.filter((item) => ["classes", "rosters"].includes(item.route)) },
  { label: "Insights", items: navItems.filter((item) => ["student", "analytics"].includes(item.route)) },
  { label: "Settings", items: navItems.filter((item) => ["billing", "appearance", "privacy", "tutorial"].includes(item.route)) },
];

const studentNavSections: Array<{ label: string; items: NavItem[] }> = [
  { label: "Portal", items: studentNavItems.filter((item) => item.route === "student") },
  { label: "Settings", items: studentNavItems.filter((item) => item.route !== "student") },
];

const individualNavSections: Array<{ label: string; items: NavItem[] }> = [
  { label: "Personal meetings", items: individualNavItems.filter((item) => item.route !== "appearance") },
  { label: "Settings", items: individualNavItems.filter((item) => item.route === "appearance") },
];

const studentRoutes = new Set<RouteKey>(["student", "student-session", "tutorial", "appearance"]);
const individualRoutes = new Set<RouteKey>(["personal-dashboard", "new-personal-meeting", "personal-meetings", "appearance"]);
const demoTeacherEmail = "teacher@classloop.demo";
const demoStudentEmail = "maya@classloop.demo";
const teacherPasswordHash = "92d96446c5fa184300fb96631d4ca0b18e536cfab5c0da5eead1edb535190e84";
const studentPasswordHash = "fecc0c0136b0cc27f320c7bdf5ffb1f6b902f517595f243cfa07999ef9035fe7";
const demoAccounts: Account[] = [
  {
    id: "demo-teacher",
    role: "teacher",
    email: demoTeacherEmail,
    name: "Ms. Rivera",
    passwordHash: teacherPasswordHash,
    createdAt: "2026-01-01T00:00:00.000Z",
    demo: true,
  },
  {
    id: "demo-student-maya",
    role: "student",
    email: demoStudentEmail,
    name: "Maya Chen",
    passwordHash: studentPasswordHash,
    createdAt: "2026-01-01T00:00:00.000Z",
    demo: true,
  },
];

const templateOptions: SessionType[] = [
  "General classroom",
  "Math review",
  "CS workshop",
  "Club meeting",
  "Study group",
];

const templateDescriptions: Record<SessionType, string> = {
  "Math review": "Homework, misconceptions, problem sets, and targeted practice.",
  "CS workshop": "Debugging notes, code blockers, project tasks, and help requests.",
  "General classroom": "Recaps, attendance, resources, and daily student follow-ups.",
  "Club meeting": "Roles, decisions, owners, deadlines, and meeting catch-up.",
  "Study group": "Shared notes, peer questions, practice goals, and check-ins.",
};

const templateDetailFields: Record<SessionType, Array<{ id: string; label: string; placeholder: string }>> = {
  "Math review": [
    { id: "practiceProblems", label: "Practice problems", placeholder: "Problems 7-12, worksheet B, textbook p. 144" },
    { id: "focusSkills", label: "Skills to reinforce", placeholder: "Similar triangles, proportions, cross multiplication" },
    { id: "commonMistakes", label: "Common mistakes", placeholder: "Wrong corresponding sides, diagonal products mixed up" },
  ],
  "CS workshop": [
    { id: "projectLinks", label: "Project or repo", placeholder: "GitHub link, Replit, starter file, or branch name" },
    { id: "debugTargets", label: "Debug targets", placeholder: "Array indexing, event handlers, state updates" },
    { id: "deliverable", label: "Workshop deliverable", placeholder: "Submit fixed function, write reflection, push commit" },
  ],
  "General classroom": [],
  "Club meeting": [
    { id: "decisions", label: "Decisions made", placeholder: "Event theme, budget choice, outreach plan" },
    { id: "owners", label: "Owners", placeholder: "Who owns each next step" },
    { id: "nextCheckpoint", label: "Next checkpoint", placeholder: "Deadline, meeting date, milestone" },
  ],
  "Study group": [
    { id: "topics", label: "Topics", placeholder: "Exam units, readings, problem types" },
    { id: "peerQuestions", label: "Peer questions", placeholder: "Questions the group could not fully answer" },
    { id: "practiceGoals", label: "Practice goals", placeholder: "Timed practice, explain one solution, review flashcards" },
  ],
};

const loadingTips = [
  "Tip: paste the roster once, then save it as a class so future sessions preload faster.",
  "Tip: review the student preview before publishing so each learner sees the right follow-up.",
  "Tip: platform transcripts are still the most reliable source after online meetings.",
  "Tip: use aliases when a Zoom display name is different from a roster name.",
];

const localReadFailureNotice: WorkspaceNotice = {
  severity: "error",
  title: "Some browser data could not be read",
  message: "ClassLoop opened the recoverable workspace pieces. If something looks missing, use a backup or exported report before saving over it.",
};

const localWriteFailureNotice: WorkspaceNotice = {
  severity: "error",
  title: "Encrypted browser storage could not save changes",
  message: "Your current workspace is still open in memory. Export important work before closing this tab, then check browser storage permissions or available disk space.",
};

function workspaceBootSteps(phase: BootPhase, notice: WorkspaceNotice | null): BootStep[] {
  const localStatus: BootStepStatus =
    phase === "local" ? "active" : phase === "ready" ? (notice ? "warning" : "complete") : "pending";
  const readyStatus: BootStepStatus = phase === "ready" ? "complete" : "pending";

  return [
    {
      label: "Encrypted local workspace",
      detail: "Opening accounts, drafts, rosters, and settings saved on this device.",
      status: localStatus,
    },
    {
      label: "Cloud sync readiness",
      detail: "Cloud sync is available from Plan options when an account is connected.",
      status: phase === "ready" ? "complete" : "pending",
    },
    {
      label: "Teacher and student accounts",
      detail: "Preparing roles, sample accounts, and saved profile preferences.",
      status: readyStatus,
    },
    {
      label: "Sessions, rosters, follow-ups",
      detail: "Laying out the dashboard data before the app opens.",
      status: readyStatus,
    },
  ];
}

function authBootSteps(): BootStep[] {
  return [
    {
      label: "Verify credentials",
      detail: "Matching the selected teacher or student profile.",
      status: "complete",
    },
    {
      label: "Open workspace",
      detail: "Loading the right dashboard, latest sessions, and follow-ups.",
      status: "active",
    },
    {
      label: "Apply preferences",
      detail: "Restoring saved theme, role routes, and walkthrough state.",
      status: "pending",
    },
  ];
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const defaultTheme: ThemeSettings = {
  key: "classroom",
  accent: "#0f766e",
  imageUrl: "",
};

const defaultPrivacySettings: PrivacySettings = {
  retentionDays: 365,
  recordingConsentRequired: true,
  allowStudentExport: true,
  auditLogEnabled: true,
  noTrainingOnStudentData: true,
};

const defaultBillingProfile: BillingProfile = {
  tier: "free",
  status: "not_configured",
};

function billingProfileLabel(profile: BillingProfile) {
  if (isPaidPlan(profile) || isManualProBillingProfile(profile)) return "Pro · Active";
  if (profile.tier === "pro") {
    if (profile.status === "trialing") return "Pro · Trial active";
    if (profile.status === "past_due" || profile.status === "unpaid") return "Pro · Payment needs attention";
    if (profile.status === "incomplete") return "Pro · Payment pending";
    if (profile.status === "paused") return "Pro · Paused";
    if (profile.status === "canceled" || profile.status === "incomplete_expired") return "Free";
  }
  if (profile.status === "past_due" || profile.status === "unpaid" || profile.status === "incomplete") {
    return "Free · Payment needs attention";
  }
  if (profile.status === "not_configured") return "Free · not_configured";
  return "Free";
}

function normalizeBillingProfile(profile?: Partial<BillingProfile> | null, options: { trusted?: boolean } = {}): BillingProfile {
  const candidate: BillingProfile = { ...defaultBillingProfile, ...(profile ?? {}) };
  if (candidate.tier !== "pro") return candidate;
  if (!options.trusted) return defaultBillingProfile;
  if (isPaidPlan(candidate)) return candidate;
  if (!candidate.customerId) return defaultBillingProfile;
  return { ...candidate, tier: "free" };
}

function normalizeTrustedBillingProfile(profile?: Partial<BillingProfile> | null): BillingProfile {
  return normalizeBillingProfile(profile, { trusted: true });
}

const secureLocalKeys = {
  accounts: "classloop:secure:accounts:v1",
  sessions: "classloop:secure:sessions:v3",
  personalMeetings: "classloop:secure:personal-meetings:v1",
  draft: "classloop:secure:draft:v3",
  demoLoaded: "classloop:secure:demo-loaded:v1",
  classGroups: "classloop:secure:class-groups:v1",
  rosterTemplates: "classloop:secure:roster-templates:v1",
  privacySettings: "classloop:secure:privacy:v1",
  auditLog: "classloop:secure:audit:v1",
  billingProfile: "classloop:secure:billing:v1",
};

const legacyLocalKeys = {
  accounts: "classloop:accounts:v1",
  sessions: "classloop:sessions:v3",
  personalMeetings: "classloop:personal-meetings:v1",
  draft: "classloop:draft:v3",
  demoLoaded: "classloop:demo-loaded:v1",
  classGroups: "classloop:class-groups:v1",
  rosterTemplates: "classloop:roster-templates:v1",
  privacySettings: "classloop:privacy:v1",
  auditLog: "classloop:audit:v1",
  billingProfile: "classloop:billing:v1",
};

const localPreferenceKeys = ["classloop:selected-student", "classloop:local-storage-key:v1"];

const themePresets: Record<
  ThemeKey,
  {
    name: string;
    summary: string;
    accent: string;
    previewClass: string;
  }
> = {
  abyssal: {
    name: "Abyssal glass",
    summary: "Image-led, bioluminescent, high-contrast screens with cinematic depth.",
    accent: "#38bdf8",
    previewClass: "abyssal",
  },
  classroom: {
    name: "Classroom calm",
    summary: "Clean, warm, and easy to scan for daily school use.",
    accent: "#0f766e",
    previewClass: "classroom",
  },
  botanical: {
    name: "Botanical studio",
    summary: "Soft green visual backdrop with calm cards and a natural feel.",
    accent: "#16a34a",
    previewClass: "botanical",
  },
  graphite: {
    name: "Graphite focus",
    summary: "Dark, minimal workspace with bright accents and strong contrast.",
    accent: "#8b5cf6",
    previewClass: "graphite",
  },
};

const accentOptions = ["#0f766e", "#2563eb", "#38bdf8", "#8b5cf6", "#e11d48", "#f59e0b", "#16a34a"];

const routeLabels: Record<RouteKey, string> = {
  dashboard: "Teacher dashboard",
  "personal-dashboard": "Personal dashboard",
  "new-personal-meeting": "New personal meeting",
  "personal-meetings": "Personal meetings",
  "new-session": "Import session",
  processing: "Draft processing",
  review: "Draft review",
  "publish-preview": "Publish preview",
  report: "Session report",
  student: "Student dashboard",
  "student-session": "Student session detail",
  classes: "Class manager",
  rosters: "Roster manager",
  analytics: "Teacher analytics",
  billing: "Plan options",
  checkout: "Pro checkout",
  tutorial: "How it works",
  appearance: "Appearance",
  privacy: "Privacy controls",
};

function getRoute(): RouteKey {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const route = hash.split("?")[0] as RouteKey;
  return navItems.some((item) => item.route === route) ||
    individualNavItems.some((item) => item.route === route) ||
    route === "processing" ||
    route === "student-session" ||
    route === "publish-preview" ||
    route === "billing" ||
    route === "checkout" ||
    route === "privacy"
    ? route
    : "dashboard";
}

function getLandingPage(): LandingPageKey {
  const hash = window.location.hash.trim().replace(/^#\/?/, "");
  const route = hash.split("?")[0].replace(/^landing\/?/, "");
  if (
    route === "features" ||
    route === "screenshots" ||
    route === "docs" ||
    route === "privacy" ||
    route === "terms" ||
    route === "eula" ||
    route === "support" ||
    route === "download"
  ) {
    return route;
  }
  if (route === "mobile") return "download";
  return "home";
}

function isLandingHash() {
  const hash = window.location.hash.trim();
  const route = hash.replace(/^#\/?/, "").split("?")[0].replace(/^landing\/?/, "");
  return (
    !hash ||
    hash === "#" ||
    hash === "#/" ||
    hash === "#/home" ||
    hash === "#/landing" ||
    route === "home" ||
    route === "features" ||
    route === "docs" ||
    route === "screenshots" ||
    route === "mobile" ||
    route === "privacy" ||
    route === "terms" ||
    route === "eula" ||
    route === "support" ||
    route === "download" ||
    hash === "#features" ||
    hash === "#screenshots" ||
    hash === "#mobile" ||
    hash === "#privacy" ||
    hash === "#terms" ||
    hash === "#eula" ||
    hash === "#support" ||
    hash === "#download"
  );
}

function isDemoOnlyOverride() {
  return new URLSearchParams(window.location.search).get("demoOnly") === "1" || getParam("demoOnly") === "1";
}

function isLocalWorkspaceHost() {
  const hostname = window.location.hostname;
  return !hostname || hostname === "localhost" || hostname === "127.0.0.1";
}

function getParam(name: string): string | null {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const query = hash.split("?")[1] ?? "";
  return new URLSearchParams(query).get(name);
}

function navigate(route: RouteKey, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  window.location.hash = `/${route}${query}`;
}

async function hashSecret(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isDemoEmail(email: string) {
  const normalized = normalizeEmail(email);
  return normalized === normalizeEmail(demoTeacherEmail) || normalized === normalizeEmail(demoStudentEmail);
}

function studentAccessEmails(student: Student) {
  return uniqueText(
    [student.linkedAccountEmail, student.email].map((email) => normalizeEmail(email ?? "")).filter(Boolean),
  );
}

function studentMatchesEmail(student: Student, email: string) {
  const normalizedEmail = normalizeEmail(email);
  return studentAccessEmails(student).includes(normalizedEmail);
}

function getSpeechRecognitionConstructor() {
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

const captureModeLabels: Record<SessionCaptureMode, string> = {
  transcript: "Transcript import",
  audio: "Live audio notes",
  in_person: "In-person class capture",
  online_meeting: "Online meeting capture",
};

type ClassroomPostType = "announcement" | "assignment" | "material";

type ZoomCloudMeetingOption = {
  id: string;
  title: string;
  date: string;
  files: Array<{
    id: string;
    label: string;
    transcript: string;
  }>;
};


const zoomCloudMeetingOptions: ZoomCloudMeetingOption[] = [
  {
    id: "zoom-cs4all-demo",
    title: "CS4All Intro to Computational Thinking",
    date: "2026-04-28",
    files: [
      {
        id: "main-transcript",
        label: "Audio transcript VTT",
        transcript: `[00:00:44] Ms. Rivera: Great. Who can tell me what an algorithm is?
[00:00:57] Student (Priya Mehta): Is it like a set of steps to solve a problem?
[00:01:14] Student (Jalen Thompson): [Chat] TikTok algorithm lol
[00:10:31] Student (Keisha Brown): Step 1, pick up the bread bag and put two slices on the plate.
[00:11:48] Student (Priya Mehta): Break it into smaller parts?
[00:13:35] Ms. Rivera: Homework for Thursday: complete the algorithm design worksheet on Google Classroom.`,
      },
      {
        id: "chat-transcript",
        label: "Chat transcript",
        transcript: `[Chat] Priya Mehta: found this video -> https://www.youtube.com/watch?v=6hfOvs8pY1k
[Chat] Leo Fernandez: decomposition video -> https://www.youtube.com/watch?v=QXjU9qTsYCc`,
      },
    ],
  },
  {
    id: "zoom-geometry-demo",
    title: "Geometry Review: Similar Triangles",
    date: "2026-05-20",
    files: [
      {
        id: "main-transcript",
        label: "Audio transcript",
        transcript: sampleTranscript,
      },
    ],
  },
];

function appendCapturedText(current: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return current;
  return [current.trim(), clean].filter(Boolean).join("\n");
}

function isTextTranscriptFile(file: File) {
  return /\.(txt|vtt|srt)$/i.test(file.name) || /^text\//i.test(file.type);
}

function transcriptSourceForFile(file: File): TranscriptSource {
  return /^video\//i.test(file.type) || /\.(mp4|mov|webm)$/i.test(file.name) ? "screen_recording" : "whisper_transcription";
}

async function transcribeRecordingWithWhisper(file: Blob, options: { filename: string; source: TranscriptSource; title: string }) {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-ClassLoop-Filename": options.filename,
    },
    body: file,
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    throw new Error(
      payload.error ||
        "Recording transcription is not available right now. Paste or upload a transcript instead.",
    );
  }
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  return createStructuredTranscriptFromSegments(segments, {
    title: options.title,
    source: options.source,
    model: payload.model || "whisper-1",
    language: payload.language,
    durationSeconds: payload.durationSeconds,
  });
}

function liveCaptureSpeakerLabel(mode: SessionCaptureMode, segmentNumber: number) {
  if (mode === "online_meeting") return `Unknown meeting voice ${segmentNumber}`;
  return `Unknown in-person voice ${segmentNumber}`;
}

function localDayKey(dateInput?: string | Date) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function studentEmailRecipients(session: Session) {
  return session.students
    .map((student) => studentAccessEmails(student)[0] ?? "")
    .filter((email) => email && !email.endsWith("@classloop.local"));
}

function classroomPostDueDate(session: Session) {
  return (
    session.actionItems.find((item) => !item.ownerId && item.dueDate)?.dueDate ??
    session.actionItems.find((item) => item.dueDate)?.dueDate ??
    session.followUps.find((followUp) => followUp.dueDate)?.dueDate ??
    localDayKey()
  );
}

function defaultClassroomPostTitle(session: Session) {
  return `${session.title} recap and next steps`;
}

function defaultClassroomPostBody(session: Session) {
  const classWideTasks = session.actionItems.filter((item) => !item.ownerId);
  const taskLines = classWideTasks.length
    ? classWideTasks.map((item) => `- ${item.title}${item.dueDate ? ` (due ${formatDate(item.dueDate)})` : ""}`)
    : ["- Review the recap and complete the next steps your teacher approved."];
  const resourceLines = session.resources.length
    ? session.resources.map((resource) => `- ${resource.title}: ${resource.url}`)
    : ["- No additional resources attached."];

  return [
    session.recap,
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

function studentsWithoutDeliverableEmail(session: Session) {
  return session.students
    .filter((student) => {
      const email = normalizeEmail(student.linkedAccountEmail || student.email);
      return !email || email.endsWith("@classloop.local");
    })
    .map((student) => student.name);
}

function markSessionEmailsSent(session: Session, result: EmailDeliveryResult): Session {
  return {
    ...session,
    emailDelivery: {
      status: "sent",
      sentAt: result.sentAt,
      provider: "email",
      recipients: result.recipients,
      skipped: result.skipped,
      failed: result.failed,
    },
    deliveryLogs: [
      makeDeliveryLog({
        provider: "email",
        target: "Student recap email",
        status: result.failed.length ? "failed" : "sent",
        message: result.failed.length
          ? `Sent ${result.recipients.length}; failed ${result.failed.length}.`
          : `Sent recap emails to ${result.recipients.length} students.`,
        recipientCount: result.recipients.length,
        createdAt: result.sentAt,
      }),
      ...(session.deliveryLogs ?? []),
    ],
  };
}

function makeDeliveryLog({
  provider,
  target,
  status,
  message,
  recipientCount,
  createdAt = new Date().toISOString(),
}: {
  provider: DeliveryLog["provider"];
  target: string;
  status: DeliveryLog["status"];
  message: string;
  recipientCount?: number;
  createdAt?: string;
}): DeliveryLog {
  return {
    id: `delivery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    provider,
    target,
    status,
    message,
    recipientCount,
    createdAt,
  };
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data as T;
}

function productFeedbackKey(sessionId: string, studentId: string) {
  return `${sessionId}:${studentId}`;
}

async function sendProductFeedbackToCreator(payload: {
  rating: number;
  note: string;
  role: AuthRole;
  source: "student_followup_popup";
  transcript: string;
  metadata: Record<string, string | number | boolean>;
}) {
  const feedbackEndpoint = (import.meta.env.VITE_CLASSLOOP_PRODUCT_FEEDBACK_URL as string | undefined)?.trim() || "/api/feedback";
  const response = await fetch(feedbackEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Feedback request failed with status ${response.status}.`);
  }
}

function makeAccountId(role: AuthRole) {
  return `${role}-${crypto.randomUUID()}`;
}

function mergeAccounts(accounts: Account[] = []) {
  const merged = new Map<string, Account>();
  [...demoAccounts, ...accounts].forEach((account) => {
    const submittedProductFeedbackKeys = Array.isArray(account.submittedProductFeedbackKeys)
      ? uniqueText(account.submittedProductFeedbackKeys).slice(-500)
      : [];
    merged.set(`${account.role}:${normalizeEmail(account.email)}`, {
      ...account,
      email: normalizeEmail(account.email),
      submittedProductFeedbackKeys,
    });
  });
  return Array.from(merged.values());
}

function createDemoSession(): Session {
  const session = createGeneratedSession({
    title: "Geometry Review: Similar Triangles + Algebra",
    template: "Math review",
    transcript: sampleTranscript,
    notes: sampleNotes,
    roster: sampleRoster,
    resources: "https://example.com/similar-triangles-review",
  });
  return {
    ...session,
    id: "demo-geometry-review",
    ownerEmail: demoTeacherEmail,
    isDemo: true,
    date: "2026-04-27",
    status: "published",
    submissions: (session.submissions ?? []).map((submission) => ({
      ...submission,
      sessionId: "demo-geometry-review",
    })),
  };
}

function sessionOwnerEmail(session: Session) {
  return normalizeEmail(session.ownerEmail ?? demoTeacherEmail);
}

function teacherSessionsFor(sessions: Session[], email: string) {
  const owner = normalizeEmail(email);
  return sessions.filter((session) => sessionOwnerEmail(session) === owner);
}

function studentSessionsFor(sessions: Session[], email: string) {
  return sessions.filter(
    (session) =>
      session.status === "published" &&
      session.students.some((student) => studentMatchesEmail(student, email)),
  );
}

function formatDate(date: string) {
  const localDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : new Date(date);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(localDate);
}

function publishedRoster(sessions: Session[]) {
  return Array.from(
    new Map(
      sessions
        .filter((session) => session.status === "published")
        .flatMap((session) => session.students)
        .map((student) => [student.id, student]),
    ).values(),
  );
}

function findStudentByEmail(sessions: Session[], email: string) {
  return publishedRoster(sessions).find((student) => studentMatchesEmail(student, email));
}

function studentById(id: string, roster: Student[] = []) {
  return (
    roster.find((student) => student.id === id) ?? {
      id,
      name: id
        .split("-")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ") || "Unknown student",
      email: "",
      avatarColor: "#64748b",
    }
  );
}

const rosterAvatarColors = ["#f59e0b", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#14b8a6", "#6366f1", "#d946ef"];

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function uniqueText(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function makeRosterStudent(name: string, email = "", index = 0, aliases: string[] = []): Student {
  const cleanName = name.trim() || `Student ${index + 1}`;
  const id = `${slugify(cleanName, `student-${index + 1}`)}-${Date.now().toString(36)}`;
  return {
    id,
    name: cleanName,
    email: normalizeEmail(email),
    avatarColor: rosterAvatarColors[index % rosterAvatarColors.length],
    aliases: uniqueText(aliases),
  };
}

function formatRosterFromStudents(students: Student[]) {
  return students
    .map((student) => {
      const aliases = uniqueText(student.aliases ?? []).join(", ");
      return [student.name, student.email, aliases].filter(Boolean).join(", ");
    })
    .join("\n");
}

function blankFollowUpForStudent(student: Student, session: Session): StudentFollowUp {
  const dueDate = session.actionItems[0]?.dueDate ?? new Date().toISOString().slice(0, 10);
  return {
    studentId: student.id,
    reminder: `Review ${session.title} and complete the assigned follow-up.`,
    catchUp: "You were added to this session roster. Use the recap, resources, and tasks to stay current.",
    tasks: session.actionItems[0]?.title ? [session.actionItems[0].title] : ["Review the session recap"],
    dueDate,
    status: "todo",
    score: 60,
  };
}

function syncSessionRoster(session: Session, students: Student[]): Session {
  const normalizedStudents = students
    .filter((student) => student.name.trim() || student.email.trim())
    .map((student, index) => ({
      ...student,
      name: student.name.trim() || `Student ${index + 1}`,
      email: normalizeEmail(student.email),
      avatarColor: student.avatarColor || rosterAvatarColors[index % rosterAvatarColors.length],
      aliases: uniqueText(student.aliases ?? []),
    }));
  const studentIds = new Set(normalizedStudents.map((student) => student.id));
  const nextAttendance = normalizedStudents.reduce<Record<string, AttendanceStatus>>((acc, student) => {
    acc[student.id] = session.attendance[student.id] ?? "present";
    return acc;
  }, {});
  const nextFollowUps = normalizedStudents.map(
    (student) => session.followUps.find((followUp) => followUp.studentId === student.id) ?? blankFollowUpForStudent(student, session),
  );
  const nextSubmissions = normalizedStudents.map((student) => {
    const existing = (session.submissions ?? []).find((submission) => submission.studentId === student.id);
    return (
      existing ?? {
        studentId: student.id,
        sessionId: session.id,
        status: "todo" as const,
        note: "",
      }
    );
  });
  return {
    ...session,
    students: normalizedStudents,
    attendance: nextAttendance,
    followUps: nextFollowUps,
    submissions: nextSubmissions,
    actionItems: session.actionItems.filter((item) => !item.ownerId || studentIds.has(item.ownerId)),
    participationEvents: session.participationEvents.filter((event) => studentIds.has(event.studentId)),
  };
}

function patchFollowUp(session: Session, studentId: string, changes: Partial<StudentFollowUp>) {
  return {
    ...session,
    followUps: session.followUps.map((followUp) =>
      followUp.studentId === studentId ? { ...followUp, ...changes } : followUp,
    ),
  };
}

function participationTypeFromText(text: string): ParticipationType {
  if (text.includes("?")) return "asked_question";
  if (/(because|so|should|equals|answer|i think|we can|it is|therefore)/i.test(text)) return "answered_question";
  return "chat";
}

function participantEventsFor(session: Session, participantName: string, studentId: string) {
  const suffix = Date.now().toString(36);
  const existingTexts = new Set(session.participationEvents.map((event) => `${event.studentId}:${event.text}`));
  return extractTranscriptSpeakers(`${session.transcript}\n${session.notes}`)
    .filter((line) => line.speaker.trim().toLowerCase() === participantName.trim().toLowerCase())
    .slice(0, 3)
    .map((line, index): ParticipationEvent => {
      const type = participationTypeFromText(line.text);
      const text =
        type === "asked_question"
          ? `Asked: ${line.text}`
          : type === "answered_question"
            ? `Contributed: ${line.text}`
            : `Shared: ${line.text}`;
      return {
        id: `p-${studentId}-linked-${index}-${suffix}`,
        studentId,
        type,
        text,
        confidence: 0.84,
        approved: !existingTexts.has(`${studentId}:${text}`),
        sourceLine: line.line,
      };
    })
    .filter((event) => event.approved);
}

function resolveParticipant(session: Session, participant: UnmatchedParticipant, mode: "add" | "link", studentId?: string): Session {
  const students =
    mode === "add"
      ? [
          ...session.students,
          makeRosterStudent(participant.name, "", session.students.length, [participant.name]),
        ]
      : session.students.map((student) =>
          student.id === studentId
            ? { ...student, aliases: uniqueText([...(student.aliases ?? []), participant.name]) }
            : student,
        );
  const targetStudent = mode === "add" ? students[students.length - 1] : students.find((student) => student.id === studentId);
  if (!targetStudent) return session;
  const synced = syncSessionRoster(session, students);
  const nextEvents = participantEventsFor(synced, participant.name, targetStudent.id);
  const currentFollowUp = synced.followUps.find((followUp) => followUp.studentId === targetStudent.id);
  return {
    ...synced,
    participationEvents: [...synced.participationEvents, ...nextEvents],
    followUps: synced.followUps.map((followUp) =>
      followUp.studentId === targetStudent.id
        ? {
            ...followUp,
            catchUp:
              currentFollowUp?.catchUp && currentFollowUp.catchUp !== "You were added to this session roster. Use the recap, resources, and tasks to stay current."
                ? currentFollowUp.catchUp
                : "ClassLoop matched this transcript speaker to the roster and connected their participation to this dashboard.",
            score: Math.max(followUp.score, nextEvents.length ? 72 : followUp.score),
          }
        : followUp,
    ),
    unmatchedParticipants: (synced.unmatchedParticipants ?? []).filter((item) => item.name !== participant.name),
    transcriptAliases: {
      ...(synced.transcriptAliases ?? {}),
      [participant.name]: targetStudent.id,
    },
  };
}

function statusLabel(status: TaskStatus) {
  const labels: Record<TaskStatus, string> = {
    todo: "To do",
    in_progress: "In progress",
    submitted: "Submitted",
    reviewed: "Reviewed",
    complete: "Complete",
    overdue: "Overdue",
  };
  return labels[status];
}

function personalTaskStatusLabel(status: PersonalTaskStatus) {
  const labels: Record<PersonalTaskStatus, string> = {
    todo: "To do",
    in_progress: "In progress",
    complete: "Complete",
  };
  return labels[status];
}

function participationLabel(type: ParticipationEvent["type"]) {
  const labels: Record<ParticipationEvent["type"], string> = {
    asked_question: "Asked question",
    answered_question: "Answered question",
    chat: "Useful chat",
    quiet: "Quiet flag",
    absent: "Missed session",
  };
  return labels[type];
}

function attendanceLabel(status: AttendanceStatus) {
  const labels: Record<AttendanceStatus, string> = {
    present: "Present",
    absent: "Absent",
    late: "Late",
  };
  return labels[status];
}

function completionRate(sessions: Session[]) {
  const followUps = sessions.flatMap((session) => session.followUps);
  if (followUps.length === 0) return 0;
  return Math.round(
    (followUps.filter((followUp) => ["submitted", "reviewed", "complete"].includes(followUp.status)).length /
      followUps.length) *
      100,
  );
}

function attentionCount(sessions: Session[]) {
  const latest = sessions[0];
  if (!latest) return 0;
  const absent = Object.values(latest.attendance).filter((status) => status === "absent").length;
  const quiet = latest.participationEvents.filter((event) => event.type === "quiet" && event.approved).length;
  const overdue = latest.followUps.filter((followUp) => followUp.status === "overdue").length;
  return absent + quiet + overdue;
}

function classParticipationRate(session: Session) {
  const activeIds = new Set(
    session.participationEvents
      .filter((event) => event.approved && !["quiet", "absent"].includes(event.type))
      .map((event) => event.studentId),
  );
  const present = Object.entries(session.attendance).filter(([, status]) => status !== "absent").length;
  if (!present) return 0;
  return Math.round((activeIds.size / present) * 100);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function localStorageCryptoKey() {
  const keyName = "classloop:local-storage-key:v1";
  let raw = localStorage.getItem(keyName);
  if (!raw) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    raw = bytesToBase64(bytes);
    localStorage.setItem(keyName, raw);
  }
  return crypto.subtle.importKey("raw", base64ToBytes(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptLocalJson(value: unknown) {
  const key = await localStorageCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  return JSON.stringify({
    version: 1,
    encrypted: true,
    iv: bytesToBase64(iv),
    payload: bytesToBase64(encrypted),
  });
}

async function decryptLocalJson<T>(stored: string): Promise<T | null> {
  try {
    const parsed = JSON.parse(stored);
    if (!parsed?.encrypted) return parsed as T;
    const key = await localStorageCryptoKey();
    const iv = base64ToBytes(parsed.iv);
    const payload = base64ToBytes(parsed.payload);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, payload);
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  } catch {
    return null;
  }
}

async function readSecureLocalJson<T>(secureKey: string, legacyKey: string, fallback: T): Promise<LocalReadResult<T>> {
  let failed = false;
  const secureValue = localStorage.getItem(secureKey);
  if (secureValue) {
    const decrypted = await decryptLocalJson<T>(secureValue);
    if (decrypted !== null) return { value: decrypted, failed };
    failed = true;
  }

  const legacyValue = localStorage.getItem(legacyKey);
  if (!legacyValue) return { value: fallback, failed };
  try {
    const parsed = JSON.parse(legacyValue) as T;
    try {
      localStorage.setItem(secureKey, await encryptLocalJson(parsed));
      localStorage.removeItem(legacyKey);
    } catch {
      failed = true;
    }
    return { value: parsed, failed };
  } catch {
    return { value: fallback, failed: true };
  }
}

async function writeSecureLocalJson(key: string, value: unknown) {
  localStorage.setItem(key, await encryptLocalJson(value));
}

async function readLocalStateFallback(): Promise<LocalStateReadResult> {
  const [
    accounts,
    sessions,
    personalMeetings,
    draft,
    demoLoaded,
    classGroups,
    rosterTemplates,
    privacySettings,
    auditLog,
    billingProfile,
  ] = await Promise.all([
    readSecureLocalJson<Account[]>(secureLocalKeys.accounts, legacyLocalKeys.accounts, []),
    readSecureLocalJson<Session[]>(secureLocalKeys.sessions, legacyLocalKeys.sessions, []),
    readSecureLocalJson<PersonalMeeting[]>(secureLocalKeys.personalMeetings, legacyLocalKeys.personalMeetings, []),
    readSecureLocalJson<Session | null>(secureLocalKeys.draft, legacyLocalKeys.draft, null),
    readSecureLocalJson<boolean>(secureLocalKeys.demoLoaded, legacyLocalKeys.demoLoaded, false),
    readSecureLocalJson<ClassGroup[]>(secureLocalKeys.classGroups, legacyLocalKeys.classGroups, []),
    readSecureLocalJson<RosterTemplate[]>(secureLocalKeys.rosterTemplates, legacyLocalKeys.rosterTemplates, []),
    readSecureLocalJson<PrivacySettings>(secureLocalKeys.privacySettings, legacyLocalKeys.privacySettings, defaultPrivacySettings),
    readSecureLocalJson<AuditLogEntry[]>(secureLocalKeys.auditLog, legacyLocalKeys.auditLog, []),
    readSecureLocalJson<BillingProfile>(secureLocalKeys.billingProfile, legacyLocalKeys.billingProfile, defaultBillingProfile),
  ]);
  const results = [
    ["accounts", accounts],
    ["sessions", sessions],
    ["personalMeetings", personalMeetings],
    ["draft", draft],
    ["demoLoaded", demoLoaded],
    ["classGroups", classGroups],
    ["rosterTemplates", rosterTemplates],
    ["privacySettings", privacySettings],
    ["auditLog", auditLog],
    ["billingProfile", billingProfile],
  ] as const;

  return {
    state: normalizeSharedState({
      accounts: accounts.value,
      sessions: sessions.value,
      personalMeetings: personalMeetings.value,
      draft: draft.value,
      demoLoaded: demoLoaded.value,
      classGroups: classGroups.value,
      rosterTemplates: rosterTemplates.value,
      privacySettings: privacySettings.value,
      auditLog: auditLog.value,
      billingProfile: billingProfile.value,
    }),
    failedKeys: results.filter(([, result]) => result.failed).map(([key]) => key),
  };
}

function clearClassLoopLocalPersistence() {
  [...Object.values(secureLocalKeys), ...Object.values(legacyLocalKeys), ...localPreferenceKeys].forEach((key) => {
    localStorage.removeItem(key);
  });
}

function persistableSharedState(
  state: Pick<SharedState, "accounts" | "sessions" | "personalMeetings" | "draft" | "demoLoaded" | "classGroups" | "rosterTemplates" | "privacySettings" | "auditLog" | "billingProfile">,
) {
  const demoOwner = normalizeEmail(demoTeacherEmail);
  const isDemoOwnedSession = (session: Session | null) =>
    Boolean(session?.isDemo) || normalizeEmail(session?.ownerEmail ?? "") === demoOwner;

  return {
    accounts: state.accounts.filter((account) => !account.demo && !isDemoEmail(account.email)),
    sessions: state.sessions.filter((session) => !isDemoOwnedSession(session)),
    personalMeetings: state.personalMeetings.filter((meeting) => !isDemoEmail(meeting.ownerEmail)),
    draft: isDemoOwnedSession(state.draft) ? null : state.draft,
    demoLoaded: false,
    classGroups: state.classGroups.filter((group) => normalizeEmail(group.ownerEmail) !== demoOwner),
    rosterTemplates: state.rosterTemplates.filter((template) => normalizeEmail(template.ownerEmail) !== demoOwner),
    privacySettings: state.privacySettings,
    auditLog: state.auditLog.filter((entry) => !isDemoEmail(entry.actorEmail)),
    billingProfile: normalizeBillingProfile(state.billingProfile),
  };
}

function hasPersistableUserData(state: ReturnType<typeof persistableSharedState>) {
  const privacyChanged = JSON.stringify(state.privacySettings) !== JSON.stringify(defaultPrivacySettings);
  const billingChanged = JSON.stringify(state.billingProfile) !== JSON.stringify(defaultBillingProfile);
  return Boolean(
    state.accounts.length ||
      state.sessions.length ||
      state.personalMeetings.length ||
      state.draft ||
      state.classGroups.length ||
      state.rosterTemplates.length ||
      state.auditLog.length ||
      privacyChanged ||
      billingChanged,
  );
}

async function writeLocalStateFallback(
  state: Pick<SharedState, "accounts" | "sessions" | "personalMeetings" | "draft" | "demoLoaded" | "classGroups" | "rosterTemplates" | "privacySettings" | "auditLog" | "billingProfile">,
) {
  const persistable = persistableSharedState(state);
  if (!hasPersistableUserData(persistable)) {
    clearClassLoopLocalPersistence();
    return;
  }
  await Promise.all([
    writeSecureLocalJson(secureLocalKeys.accounts, persistable.accounts),
    writeSecureLocalJson(secureLocalKeys.sessions, persistable.sessions),
    writeSecureLocalJson(secureLocalKeys.personalMeetings, persistable.personalMeetings),
    writeSecureLocalJson(secureLocalKeys.draft, persistable.draft),
    writeSecureLocalJson(secureLocalKeys.demoLoaded, persistable.demoLoaded),
    writeSecureLocalJson(secureLocalKeys.classGroups, persistable.classGroups),
    writeSecureLocalJson(secureLocalKeys.rosterTemplates, persistable.rosterTemplates),
    writeSecureLocalJson(secureLocalKeys.privacySettings, persistable.privacySettings),
    writeSecureLocalJson(secureLocalKeys.auditLog, persistable.auditLog),
    writeSecureLocalJson(secureLocalKeys.billingProfile, persistable.billingProfile),
  ]);
}

function normalizeSharedState(data: Partial<SharedState>): SharedState {
  const normalized = persistableSharedState({
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    personalMeetings: Array.isArray(data.personalMeetings) ? data.personalMeetings : [],
    draft: data.draft ?? null,
    demoLoaded: Boolean(data.demoLoaded),
    classGroups: Array.isArray(data.classGroups) ? data.classGroups : [],
    rosterTemplates: Array.isArray(data.rosterTemplates) ? data.rosterTemplates : [],
    privacySettings: { ...defaultPrivacySettings, ...(data.privacySettings ?? {}) },
    auditLog: Array.isArray(data.auditLog) ? data.auditLog : [],
    billingProfile: normalizeBillingProfile(data.billingProfile),
  });

  return {
    ...normalized,
    accounts: mergeAccounts(normalized.accounts),
    updatedAt: data.updatedAt,
  };
}

function sharedStateJson(
  state: Pick<SharedState, "accounts" | "sessions" | "personalMeetings" | "draft" | "demoLoaded" | "classGroups" | "rosterTemplates" | "privacySettings" | "auditLog" | "billingProfile">,
) {
  return JSON.stringify({
    accounts: state.accounts,
    sessions: state.sessions,
    personalMeetings: state.personalMeetings,
    draft: state.draft,
    demoLoaded: state.demoLoaded,
    classGroups: state.classGroups,
    rosterTemplates: state.rosterTemplates,
    privacySettings: state.privacySettings,
    auditLog: state.auditLog,
    billingProfile: state.billingProfile,
  });
}

function safeBackgroundUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "linear-gradient(transparent, transparent)";
  try {
    const parsed = new URL(trimmed, window.location.origin);
    const isLocalHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (!["https:", "data:", "blob:"].includes(parsed.protocol) && !isLocalHttp) {
      return "linear-gradient(transparent, transparent)";
    }
  } catch {
    return "linear-gradient(transparent, transparent)";
  }
  const sanitized = trimmed.replace(/["\\\n\r]/g, "");
  return `url("${sanitized}")`;
}

function csvEscape(value: string) {
  const clean = value ?? "";
  return /[",\n]/.test(clean) ? `"${clean.replace(/"/g, '""')}"` : clean;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rosterStudentsFromCsv(text: string) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const header = rows[0].map((cell) => cell.toLowerCase().replace(/\s+/g, ""));
  const hasHeader = header.some((cell) => ["firstname", "lastname", "name", "studentname", "email", "emailaddress"].includes(cell));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const nameIndex = header.findIndex((cell) => cell === "name" || cell === "studentname" || cell === "student");
  const firstIndex = header.findIndex((cell) => cell === "firstname" || cell === "first");
  const lastIndex = header.findIndex((cell) => cell === "lastname" || cell === "last");
  const emailIndex = header.findIndex((cell) => cell === "email" || cell === "emailaddress");
  const aliasesIndex = header.findIndex((cell) => cell === "aliases" || cell === "zoomnames" || cell === "nickname");

  return dataRows
    .map((row, index) => {
      const email = normalizeEmail(emailIndex >= 0 ? row[emailIndex] ?? "" : row.find((cell) => /@/.test(cell)) ?? "");
      const name =
        nameIndex >= 0
          ? row[nameIndex] ?? ""
          : [firstIndex >= 0 ? row[firstIndex] : row[0], lastIndex >= 0 ? row[lastIndex] : row[1]]
              .filter(Boolean)
              .join(" ");
      const aliases = aliasesIndex >= 0 ? (row[aliasesIndex] ?? "").split(/[;,]/).map((item) => item.trim()).filter(Boolean) : [];
      return makeRosterStudent(name, email, index, aliases);
    })
    .filter((student) => student.name.trim() && student.email.includes("@"));
}

function rosterToCsv(students: Student[]) {
  return [
    ["Name", "Email", "Aliases"].map(csvEscape).join(","),
    ...students.map((student) =>
      [student.name, student.email, uniqueText(student.aliases ?? []).join("; ")].map(csvEscape).join(","),
    ),
  ].join("\n");
}

function downloadTextFile(filename: string, contents: string, type = "text/plain") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 0);
}

function googleCalendarTimestamp(value: string) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function personalCalendarUrl(meeting: PersonalMeeting) {
  if (!meeting.nextMeeting) return "";
  const { nextMeeting } = meeting;
  const start = new Date(`${nextMeeting.date}T${nextMeeting.time || "09:00"}:00`);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + nextMeeting.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: nextMeeting.title,
    details: nextMeeting.description,
    dates: `${googleCalendarTimestamp(start.toISOString())}/${googleCalendarTimestamp(end.toISOString())}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function personalMailtoUrl(meeting: PersonalMeeting) {
  if (!meeting.emailDraft) return "";
  const recipients = meeting.emailDraft.recipients.join(",");
  const subject = encodeURIComponent(meeting.emailDraft.subject);
  const body = encodeURIComponent(meeting.emailDraft.body);
  return `mailto:${recipients}?subject=${subject}&body=${body}`;
}

function setStudentSubmission(
  session: Session,
  studentId: string,
  status: StudentSubmissionStatus,
  note = "",
  attachmentUrl = "",
): Session {
  const now = new Date().toISOString();
  const currentSubmissions = session.submissions ?? [];
  const existing = currentSubmissions.find((submission) => submission.studentId === studentId);
  const nextSubmission: StudentSubmission = {
    studentId,
    sessionId: session.id,
    status,
    note: note || existing?.note || "",
    attachmentUrl: attachmentUrl || existing?.attachmentUrl,
    submittedAt: status === "submitted" ? now : existing?.submittedAt,
    reviewedAt: status === "reviewed" ? now : existing?.reviewedAt,
  };
  const nextStatus: TaskStatus = status === "working" ? "in_progress" : status === "todo" ? "todo" : status;
  return {
    ...session,
    submissions: existing
      ? currentSubmissions.map((submission) =>
          submission.studentId === studentId ? { ...submission, ...nextSubmission } : submission,
        )
      : [...currentSubmissions, nextSubmission],
    followUps: session.followUps.map((followUp) =>
      followUp.studentId === studentId
        ? {
            ...followUp,
            status: nextStatus,
            score: status === "reviewed" ? 100 : status === "submitted" ? Math.max(followUp.score, 90) : followUp.score,
          }
        : followUp,
    ),
  };
}

function makePublishAudit(session: Session): PublishAuditEntry[] {
  const createdAt = new Date().toISOString();
  const entries: PublishAuditEntry[] = [
    {
      sessionId: session.id,
      type: "class_recap",
      message: `Class recap, ${session.actionItems.length} action items, and ${session.resources.length} resources will be published.`,
      createdAt,
    },
  ];

  session.students.forEach((student) => {
    const diff = previewDiffForStudent(session, student);
    entries.push({
      sessionId: session.id,
      studentId: student.id,
      type: "student_followup",
      message: `${student.name}: ${diff.reasons[0]?.label ?? "Shared class baseline"}; ${diff.sharedTaskCount} shared tasks, ${diff.uniqueTaskCount} personalized tasks.`,
      createdAt,
    });
  });

  return entries;
}

function sessionFollowThroughCsv(session: Session) {
  const rows = [
    ["Student", "Email", "Attendance", "Status", "Readiness", "Due date", "Reminder"].map(csvEscape).join(","),
    ...session.followUps.map((followUp) => {
      const student = studentById(followUp.studentId, session.students);
      return [
        student.name,
        student.email,
        attendanceLabel(session.attendance[student.id] ?? "present"),
        statusLabel(followUp.status),
        String(followUp.score),
        followUp.dueDate,
        followUp.reminder,
      ]
        .map(csvEscape)
        .join(",");
    }),
  ];
  return rows.join("\n");
}

function App() {
  const [route, setRoute] = useState<RouteKey>(getRoute);
  const [accounts, setAccounts] = useState<Account[]>(demoAccounts);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [personalMeetings, setPersonalMeetings] = useState<PersonalMeeting[]>([]);
  const [draft, setDraft] = useState<Session | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>(() => localStorage.getItem("classloop:selected-student") ?? "maya");
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [theme, setTheme] = useState<ThemeSettings>(defaultTheme);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [rosterTemplates, setRosterTemplates] = useState<RosterTemplate[]>([]);
  const [rosterPromptSession, setRosterPromptSession] = useState<Session | null>(null);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(defaultPrivacySettings);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [billingProfile, setBillingProfile] = useState<BillingProfile>(defaultBillingProfile);
  const [sharedReady, setSharedReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const [landingMode, setLandingMode] = useState(isLandingHash);
  const [landingPage, setLandingPage] = useState<LandingPageKey>(getLandingPage);
  const [publicDemoOnly] = useState(() => isDemoOnlyOverride());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [bootPhase, setBootPhase] = useState<BootPhase>("local");
  const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice | null>(null);
  const [templateLinks, setTemplateLinks] = useState<TemplateLinkManifest>({});
  const [passwordResetCodes, setPasswordResetCodes] = useState<Record<string, PasswordResetRecord>>({});
  const [celebrationMoment, setCelebrationMoment] = useState<CelebrationMoment | null>(null);
  const demoSessionRef = useRef(false);
  const localAuthSecretRef = useRef<LocalAuthSecret | null>(null);
  const lastSharedJsonRef = useRef(
    sharedStateJson(persistableSharedState({
      accounts: demoAccounts,
      sessions: [],
      personalMeetings: [],
      draft: null,
      demoLoaded: false,
      classGroups: [],
      rosterTemplates: [],
      privacySettings: defaultPrivacySettings,
      auditLog: [],
      billingProfile: defaultBillingProfile,
    })),
  );

  useEffect(() => {
    const key = themePresets[theme.key] ? theme.key : defaultTheme.key;
    document.documentElement.dataset.theme = key;
    document.documentElement.style.setProperty("--green", theme.accent ?? defaultTheme.accent);
    document.documentElement.style.setProperty("--primary", theme.accent ?? defaultTheme.accent);
    document.documentElement.style.setProperty("--custom-backdrop", safeBackgroundUrl(theme.imageUrl ?? ""));
  }, [theme]);

  useEffect(() => {
    let active = true;
    fetch("/classloop-template-links.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : {}))
      .then((manifest) => {
        if (active) setTemplateLinks(normalizeTemplateLinkManifest(manifest));
      })
      .catch(() => {
        if (active) setTemplateLinks({});
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setBootPhase("local");
    setWorkspaceNotice(null);
    if (publicDemoOnly) {
      clearClassLoopLocalPersistence();
      setAccounts(demoAccounts);
      setSessions([]);
      setPersonalMeetings([]);
      setDraft(null);
      setDemoLoaded(false);
      setClassGroups([]);
      setRosterTemplates([]);
      setSelectedStudentId("maya");
      setPrivacySettings(defaultPrivacySettings);
      setAuditLog([]);
      setBillingProfile(defaultBillingProfile);
      lastSharedJsonRef.current = sharedStateJson(persistableSharedState({
        accounts: demoAccounts,
        sessions: [],
        personalMeetings: [],
        draft: null,
        demoLoaded: false,
        classGroups: [],
        rosterTemplates: [],
        privacySettings: defaultPrivacySettings,
        auditLog: [],
        billingProfile: defaultBillingProfile,
      }));
      setSyncStatus("local");
      setBootPhase("ready");
      setSharedReady(true);
      return () => {
        active = false;
      };
    }

    readLocalStateFallback()
      .then((localResult) => {
        if (!active) return;
        const localState = localResult.state;
        setAccounts(localState.accounts);
        setSessions(localState.sessions);
        setPersonalMeetings(localState.personalMeetings);
        setDraft(localState.draft);
        setDemoLoaded(localState.demoLoaded);
        setClassGroups(localState.classGroups);
        setRosterTemplates(localState.rosterTemplates);
        setPrivacySettings(localState.privacySettings);
        setAuditLog(localState.auditLog);
        setBillingProfile(defaultBillingProfile);
        lastSharedJsonRef.current = sharedStateJson(localState);
        setSyncStatus("local");
        setWorkspaceNotice(localResult.failedKeys.length ? localReadFailureNotice : null);
        setBootPhase("ready");
      })
      .catch(() => {
        if (!active) return;
        setAccounts(demoAccounts);
        setSessions([]);
        setPersonalMeetings([]);
        setDraft(null);
        setDemoLoaded(false);
        setClassGroups([]);
        setRosterTemplates([]);
        setPrivacySettings(defaultPrivacySettings);
        setAuditLog([]);
        setBillingProfile(defaultBillingProfile);
        lastSharedJsonRef.current = sharedStateJson(persistableSharedState({
          accounts: demoAccounts,
          sessions: [],
          personalMeetings: [],
          draft: null,
          demoLoaded: false,
          classGroups: [],
          rosterTemplates: [],
          privacySettings: defaultPrivacySettings,
          auditLog: [],
          billingProfile: defaultBillingProfile,
        }));
        setSyncStatus("local");
        setWorkspaceNotice(localReadFailureNotice);
        setBootPhase("ready");
      })
      .finally(() => {
        if (active) setSharedReady(true);
      });

    return () => {
      active = false;
    };
  }, [publicDemoOnly]);

  useEffect(() => {
    if (publicDemoOnly || auth?.demo) return;
    localStorage.setItem("classloop:selected-student", selectedStudentId);
  }, [auth?.demo, publicDemoOnly, selectedStudentId]);

  useEffect(() => {
    if (!sharedReady) return;
    if (publicDemoOnly || auth?.demo || demoSessionRef.current) return;
    const persistableState = persistableSharedState({
      accounts,
      sessions,
      personalMeetings,
      draft,
      demoLoaded,
      classGroups,
      rosterTemplates,
      privacySettings,
      auditLog,
      billingProfile,
    });
    const nextJson = sharedStateJson(persistableState);
    if (nextJson === lastSharedJsonRef.current) return;

    void writeLocalStateFallback(persistableState)
      .then(() => {
        lastSharedJsonRef.current = nextJson;
        setSyncStatus("local");
        setWorkspaceNotice((notice) => (notice === localWriteFailureNotice ? null : notice));
      })
      .catch(() => {
        setWorkspaceNotice(localWriteFailureNotice);
      });
  }, [accounts, auditLog, auth?.demo, billingProfile, classGroups, demoLoaded, draft, personalMeetings, privacySettings, publicDemoOnly, rosterTemplates, sessions, sharedReady]);

  useEffect(() => {
    const onHashChange = () => {
      setLandingMode(isLandingHash());
      setLandingPage(getLandingPage());
      setRoute(getRoute());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (auth?.role === "student" && !studentRoutes.has(route)) {
      navigate("student");
    }
    if (auth?.role === "individual" && !individualRoutes.has(route)) {
      navigate("personal-dashboard");
    }
  }, [auth, route]);

  useEffect(() => {
    const manualProProfile = manualProBillingProfileForEmail(auth?.email ?? "");
    if (!sharedReady || !auth || auth.demo) {
      if (!auth || auth?.demo) setBillingProfile(defaultBillingProfile);
      return;
    }
    if (auth.role !== "teacher") {
      setBillingProfile(defaultBillingProfile);
      return;
    }

    if (manualProProfile) {
      setBillingProfile(manualProProfile);
    }

    let active = true;
    getCloudSession()
      .then((session) => {
        if (!session) {
          if (active) setBillingProfile(manualProProfile ?? defaultBillingProfile);
          return null;
        }
        return getCloudProfile();
      })
      .then((profile) => {
        if (active && profile) {
          setBillingProfile(manualProProfile ?? normalizeTrustedBillingProfile(profile.billingProfile));
        }
      })
      .catch(() => {
        if (active) setBillingProfile(manualProProfile ?? defaultBillingProfile);
      });

    return () => {
      active = false;
    };
  }, [auth?.accountId, auth?.demo, auth?.email, auth?.role, sharedReady]);

  useEffect(() => {
    if (!auth || route !== "tutorial") return;
    setWalkthroughStepIndex(0);
    setWalkthroughOpen(true);
    navigate(auth.role === "teacher" ? "dashboard" : auth.role === "individual" ? "personal-dashboard" : "student");
  }, [auth, route]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [sessions],
  );

  const teacherSessions = useMemo(
    () => (auth?.role === "teacher" ? teacherSessionsFor(sortedSessions, auth.email) : []),
    [auth, sortedSessions],
  );
  const teacherRosterTemplates = useMemo(
    () =>
      auth?.role === "teacher"
        ? rosterTemplates.filter((template) => normalizeEmail(template.ownerEmail) === normalizeEmail(auth.email))
        : [],
    [auth, rosterTemplates],
  );
  const teacherClassGroups = useMemo(
    () =>
      auth?.role === "teacher"
        ? classGroups.filter((group) => normalizeEmail(group.ownerEmail) === normalizeEmail(auth.email))
        : [],
    [auth, classGroups],
  );
  const activeTheme = useMemo(
    () => ({
      ...defaultTheme,
      ...theme,
      key: themePresets[theme.key] ? theme.key : defaultTheme.key,
      imageUrl: theme.imageUrl ?? "",
    }),
    [theme],
  );

  const startWalkthrough = () => {
    setWalkthroughStepIndex(0);
    if (auth) navigate(auth.role === "teacher" ? "dashboard" : auth.role === "individual" ? "personal-dashboard" : "student");
    setWalkthroughOpen(false);
    window.setTimeout(() => setWalkthroughOpen(true), 0);
  };

  const appendAudit = (
    action: string,
    detail: string,
    actor: AuditActor | null = auth,
  ) => {
    if (!actor || !privacySettings.auditLogEnabled) return;
    if (actor.demo) return;
    setAuditLog((current) => [
      {
        id: `audit-${Date.now().toString(36)}-${current.length}`,
        actorEmail: actor.email,
        actorRole: actor.role,
        action,
        detail,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 250));
  };

  const currentState = (): SharedState => ({
    accounts,
    sessions,
    personalMeetings,
    draft,
    demoLoaded,
    classGroups,
    rosterTemplates,
    privacySettings,
    auditLog,
    billingProfile: defaultBillingProfile,
  });

  const applyCloudState = (state: Partial<SharedState>) => {
    const normalized = normalizeSharedState(state);
    setAccounts(normalized.accounts);
    setSessions(normalized.sessions);
    setPersonalMeetings(normalized.personalMeetings);
    setDraft(normalized.draft);
    setDemoLoaded(normalized.demoLoaded);
    setClassGroups(normalized.classGroups);
    setRosterTemplates(normalized.rosterTemplates);
    setPrivacySettings(normalized.privacySettings);
    setAuditLog(normalized.auditLog);
    setBillingProfile(defaultBillingProfile);
    lastSharedJsonRef.current = sharedStateJson(normalized);
  };

  const handleThemeChange: React.Dispatch<React.SetStateAction<ThemeSettings>> = (value) => {
    setTheme((current) => {
      const nextTheme = typeof value === "function" ? value(current) : value;
      if (auth && !auth.demo) {
        setAccounts((accountsCurrent) =>
          accountsCurrent.map((account) =>
            account.id === auth.accountId
              ? {
                  ...account,
                  theme: nextTheme,
                }
              : account,
          ),
        );
      }
      return nextTheme;
    });
  };

  const studentPortalSessions = useMemo(
    () => (auth?.role === "student" ? studentSessionsFor(sortedSessions, auth.email) : teacherSessions),
    [auth, sortedSessions, teacherSessions],
  );
  const individualMeetings = useMemo(
    () =>
      auth?.role === "individual"
        ? personalMeetings
            .filter((meeting) => normalizeEmail(meeting.ownerEmail) === normalizeEmail(auth.email))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        : [],
    [auth, personalMeetings],
  );
  const visibleDraft = auth?.role === "teacher" && draft && sessionOwnerEmail(draft) === normalizeEmail(auth.email) ? draft : null;
  const latestPublished = teacherSessions.find((session) => session.status === "published") ?? teacherSessions[0];
  const effectiveRoute =
    auth?.role === "student" && !studentRoutes.has(route)
      ? "student"
      : auth?.role === "individual" && !individualRoutes.has(route)
        ? "personal-dashboard"
        : route;
  const hasPaidAccess = isPaidPlan(billingProfile);
  const todayKey = localDayKey();
  const freeSessionsToday =
    teacherSessions.filter((session) => localDayKey(session.date) === todayKey).length +
    (visibleDraft && localDayKey(visibleDraft.date) === todayKey ? 1 : 0);
  const freeLimitReached = !hasPaidAccess && freeSessionsToday >= 1;
  const activeAccount = auth ? accounts.find((account) => account.id === auth.accountId) : undefined;
  const triggerCelebration = (title: string, detail: string) => {
    setCelebrationMoment({ id: Date.now(), title, detail });
  };

  const updatePersonalMeetingById = (meetingId: string, updater: (meeting: PersonalMeeting) => PersonalMeeting) => {
    setPersonalMeetings((current) =>
      current
        .map((meeting) =>
          meeting.id === meetingId
            ? {
                ...updater(meeting),
                updatedAt: new Date().toISOString(),
              }
            : meeting,
        )
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    );
  };

  const createPersonalMeeting = (title: string, minutes: string, structuredTranscript?: StructuredTranscript) => {
    if (!auth || auth.role !== "individual") return;
    const meeting = createPersonalMeetingDraft({
      ownerEmail: auth.email,
      title,
      minutes,
      structuredTranscript,
    });
    setPersonalMeetings((current) => [meeting, ...current]);
    appendAudit("create_personal_meeting", `Created personal meeting ${meeting.title}.`);
    triggerCelebration("Personal meeting ready", `${meeting.tasks.length} tasks were drafted for your follow-through.`);
    navigate("personal-meetings", { meeting: meeting.id });
  };

  const updatePersonalTask = (meetingId: string, taskId: string, changes: Partial<PersonalTask>) => {
    updatePersonalMeetingById(meetingId, (meeting) => ({
      ...meeting,
      tasks: meeting.tasks.map((task) => (task.id === taskId ? { ...task, ...changes } : task)),
    }));
  };

  const deletePersonalMeeting = (meetingId: string) => {
    const meeting = personalMeetings.find((item) => item.id === meetingId);
    if (!meeting) return;
    if (!window.confirm(`Delete "${meeting.title}"? This removes the personal recap and tasks from this workspace.`)) return;
    setPersonalMeetings((current) => current.filter((item) => item.id !== meetingId));
    appendAudit("delete_personal_meeting", `Deleted personal meeting ${meeting.title}.`);
  };

  const updateSession = (session: Session) => {
    setSessions((current) => {
      const existing = current.some((item) => item.id === session.id);
      const next = existing ? current.map((item) => (item.id === session.id ? session : item)) : [session, ...current];
      return [...next].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });
  };

  const updateSessionById = (sessionId: string, updater: (session: Session) => Session) => {
    setSessions((current) =>
      current
        .map((session) => (session.id === sessionId ? updater(session) : session))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    );
    setDraft((current) => (current?.id === sessionId ? updater(current) : current));
  };

  const saveRosterTemplateFromSession = (session: Session, name: string) => {
    if (!auth || auth.role !== "teacher" || !session.students.length) return;
    const now = new Date().toISOString();
    const template: RosterTemplate = {
      id: `roster-template-${Date.now().toString(36)}`,
      ownerEmail: auth.email,
      name: name.trim() || `${session.type} roster`,
      sessionType: session.type,
      students: session.students.map((student, index) => ({ ...student, avatarColor: student.avatarColor || makeRosterStudent(student.name, student.email, index).avatarColor })),
      createdAt: now,
      updatedAt: now,
    };
    setRosterTemplates((current) => [template, ...current]);
    setClassGroups((current) => {
      const existing = current.find(
        (group) =>
          normalizeEmail(group.ownerEmail) === normalizeEmail(auth.email) &&
          group.name.trim().toLowerCase() === template.name.trim().toLowerCase(),
      );
      if (existing) {
        return current.map((group) =>
          group.id === existing.id
            ? {
                ...group,
                defaultSessionType: template.sessionType,
                students: template.students,
                updatedAt: now,
              }
            : group,
        );
      }
      return [
        {
          id: `class-group-${Date.now().toString(36)}`,
          ownerEmail: auth.email,
          name: template.name,
          defaultSessionType: template.sessionType,
          students: template.students,
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ];
    });
    appendAudit("save_roster_template", `Saved ${template.name} for ${session.type}.`);
  };

  const updateRosterTemplate = (templateId: string, changes: Partial<RosterTemplate>) => {
    setRosterTemplates((current) =>
      current.map((template) =>
        template.id === templateId
          ? {
              ...template,
              ...changes,
              updatedAt: new Date().toISOString(),
            }
          : template,
      ),
    );
  };

  const deleteRosterTemplate = (templateId: string) => {
    setRosterTemplates((current) => current.filter((template) => template.id !== templateId));
  };

  const createClassGroupFromTemplate = (template: RosterTemplate) => {
    if (!auth || auth.role !== "teacher") return;
    const now = new Date().toISOString();
    const group: ClassGroup = {
      id: `class-group-${Date.now().toString(36)}`,
      ownerEmail: auth.email,
      name: template.name,
      description: "",
      defaultSessionType: template.sessionType,
      students: template.students,
      createdAt: now,
      updatedAt: now,
    };
    setClassGroups((current) => [group, ...current]);
    appendAudit("create_class_group", `Created class group ${group.name}.`);
  };

  const updateClassGroup = (groupId: string, changes: Partial<ClassGroup>) => {
    setClassGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              ...changes,
              updatedAt: new Date().toISOString(),
            }
          : group,
      ),
    );
  };

  const deleteClassGroup = (groupId: string) => {
    setClassGroups((current) => current.filter((group) => group.id !== groupId));
  };

  const resetDemoWorkspaceAfterUse = () => {
    setSessions((current) => current.filter((session) => sessionOwnerEmail(session) !== normalizeEmail(demoTeacherEmail)));
    setDraft((current) => (current && sessionOwnerEmail(current) === normalizeEmail(demoTeacherEmail) ? null : current));
    setClassGroups((current) => current.filter((group) => normalizeEmail(group.ownerEmail) !== normalizeEmail(demoTeacherEmail)));
    setRosterTemplates((current) => current.filter((template) => normalizeEmail(template.ownerEmail) !== normalizeEmail(demoTeacherEmail)));
    setRosterPromptSession(null);
    setDemoLoaded(false);
    if (publicDemoOnly) {
      setAccounts(demoAccounts);
      setPrivacySettings(defaultPrivacySettings);
      setAuditLog([]);
      setBillingProfile(defaultBillingProfile);
    }
  };

  const ensureDemoSession = () => {
    const demoSession = createDemoSession();
    setSessions((current) =>
      [
        demoSession,
        ...current.filter(
          (session) => session.id !== demoSession.id && sessionOwnerEmail(session) !== normalizeEmail(demoTeacherEmail),
        ),
      ],
    );
    setDraft((current) => (current && sessionOwnerEmail(current) === normalizeEmail(demoTeacherEmail) ? null : current));
    setClassGroups((current) => current.filter((group) => normalizeEmail(group.ownerEmail) !== normalizeEmail(demoTeacherEmail)));
    setRosterTemplates((current) => current.filter((template) => normalizeEmail(template.ownerEmail) !== normalizeEmail(demoTeacherEmail)));
    setDemoLoaded(true);
    return demoSession;
  };

  const publishDraft = (sessionOverride?: Session) => {
    if (!visibleDraft || !auth) return;
    const source = sessionOverride ?? visibleDraft;
    if (unresolvedBlockingImportWarnings(source).length) {
      setDraft(source);
      navigate("review", { session: source.id });
      return;
    }
    const published = {
      ...source,
      ownerEmail: auth.email,
      status: "published" as const,
      submissions:
        source.submissions ??
        source.students.map((student) => ({
          studentId: student.id,
          sessionId: source.id,
          status: "todo" as const,
          note: "",
        })),
      publishAudit: makePublishAudit(source),
    };
    updateSession(published);
    setDraft(published);
    appendAudit("publish_session", `Published ${published.title}.`);
    triggerCelebration("Published to students", "Student follow-ups are live in their dashboards.");
    if (
      published.students.length > 0 &&
      !teacherRosterTemplates.some((template) => template.sessionType === published.type)
    ) {
      setRosterPromptSession(published);
    }
    navigate("report", { session: published.id });
  };

  const markFollowUpComplete = (sessionId: string, studentId: string, note = "", attachmentUrl = "") => {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId
          ? {
              ...setStudentSubmission(session, studentId, "submitted", note || "Marked complete from the student portal.", attachmentUrl),
              actionItems: session.actionItems.map((item) =>
                item.ownerId === studentId ? { ...item, status: "submitted" } : item,
              ),
            }
          : session,
      ),
    );
  };

  const submitProductFeedback: ProductFeedbackSubmitter = async (session, student, rating, note) => {
    if (!auth || auth.role !== "student") return false;
    const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
    const trimmedNote = note.trim().slice(0, 600);
    const feedbackKey = productFeedbackKey(session.id, student.id);
    const followUp = session.followUps.find((item) => item.studentId === student.id);
    try {
      await sendProductFeedbackToCreator({
        rating: safeRating,
        note: trimmedNote,
        role: "student",
        source: "student_followup_popup",
        transcript: session.transcript,
        metadata: {
          sessionType: session.type,
          sessionStatus: session.status,
          followUpStatus: followUp?.status ?? "unknown",
          taskCount: followUp?.tasks.length ?? 0,
          resourceCount: session.resources.length,
          transcriptCharacters: session.transcript.length,
          completedFollowUp: true,
        },
      });
      setAccounts((current) =>
        current.map((account) => {
          if (account.id !== auth.accountId) return account;
          const keys = uniqueText([...(account.submittedProductFeedbackKeys ?? []), feedbackKey]).slice(-500);
          return { ...account, submittedProductFeedbackKeys: keys };
        }),
      );
      return true;
    } catch {
      return false;
    }
  };

  const signInAccount = async (account: Account): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(account.email);
    setAuthLoading(true);
    try {
      await wait(420);
      if (publicDemoOnly && !account.demo) {
        return { ok: false, message: "The web demo uses the sample accounts only. Download the app to create your own account." };
      }

      if (account.demo) demoSessionRef.current = true;
      const demoSession = account.demo ? ensureDemoSession() : undefined;

      if (account.role === "teacher") {
        setTheme(account.theme ?? defaultTheme);
        setAuth({
          accountId: account.id,
          role: "teacher",
          email: normalizedEmail,
          name: account.name,
          demo: account.demo,
        });
        appendAudit("login", "Teacher signed in.", {
          accountId: account.id,
          role: "teacher",
          email: normalizedEmail,
          name: account.name,
          demo: account.demo,
        });
        navigate("dashboard");
        if (account.demo) startWalkthrough();
        return { ok: true };
      }

      if (account.role === "individual") {
        setTheme(account.theme ?? defaultTheme);
        setAuth({
          accountId: account.id,
          role: "individual",
          email: normalizedEmail,
          name: account.name,
          demo: account.demo,
        });
        appendAudit("login", "Individual signed in.", {
          accountId: account.id,
          role: "individual",
          email: normalizedEmail,
          name: account.name,
          demo: account.demo,
        });
        navigate("personal-dashboard");
        return { ok: true };
      }

      const availableSessions = demoSession ? [demoSession, ...sortedSessions] : sortedSessions;
      const student = findStudentByEmail(studentSessionsFor(availableSessions, normalizedEmail), normalizedEmail);

      if (student) setSelectedStudentId(student.id);
      setTheme(account.theme ?? defaultTheme);
      setAuth({
        accountId: account.id,
        role: "student",
        email: normalizedEmail,
        name: student?.name ?? account.name,
        studentId: student?.id,
        demo: account.demo,
      });
      appendAudit("login", "Student signed in.", {
        accountId: account.id,
        role: "student",
        email: normalizedEmail,
        name: student?.name ?? account.name,
        studentId: student?.id,
        demo: account.demo,
      });
      navigate("student");
      if (account.demo) startWalkthrough();
      return { ok: true };
    } finally {
      setAuthLoading(false);
    }
  };

  const roleFromCloudSession = (session: NonNullable<CloudAuthResult["session"]>, fallbackRole: AuthRole): AuthRole => {
    const rawRole = (session.user.user_metadata as Record<string, unknown> | undefined)?.role;
    return rawRole === "teacher" || rawRole === "student" || rawRole === "individual" ? rawRole : fallbackRole;
  };

  const nameFromCloudSession = (session: NonNullable<CloudAuthResult["session"]>, fallbackEmail: string) => {
    const metadata = session.user.user_metadata as Record<string, unknown> | undefined;
    const metadataName = typeof metadata?.name === "string" ? metadata.name.trim() : "";
    if (metadataName) return metadataName;
    const displayName = typeof metadata?.display_name === "string" ? metadata.display_name.trim() : "";
    if (displayName) return displayName;
    return fallbackEmail.split("@")[0] || "ClassLoop user";
  };

  const finishLocalAccountCreation = async (
    role: AuthRole,
    name: string,
    email: string,
    password: string,
    options?: { startWalkthrough?: boolean; multiDevicePending?: boolean },
  ) => {
    const startWalkthroughAfterCreate = options?.startWalkthrough ?? role !== "individual";
    const account: Account = {
      id: makeAccountId(role),
      role,
      email,
      name,
      passwordHash: await hashSecret(password),
      createdAt: new Date().toISOString(),
      theme: defaultTheme,
    };
    setAccounts((current) => mergeAccounts([...current, account]));
    localAuthSecretRef.current = {
      accountId: account.id,
      role,
      email,
      password,
    };
    setTheme(defaultTheme);
    setAuth({ accountId: account.id, role, email, name, multiDevicePending: options?.multiDevicePending });
    navigate(role === "teacher" ? "dashboard" : role === "individual" ? "personal-dashboard" : "student");
    if (startWalkthroughAfterCreate) startWalkthrough();
    return { ok: true };
  };

  const signInCloudBackedAccount = async (
    requestedRole: AuthRole,
    email: string,
    password: string,
    session: NonNullable<CloudAuthResult["session"]>,
  ): Promise<AuthResult> => {
    const existingAccount = accounts.find((item) => normalizeEmail(item.email) === email);
    const role = existingAccount?.role ?? roleFromCloudSession(session, requestedRole);
    const name = existingAccount?.name ?? nameFromCloudSession(session, email);
    const passwordHash = await hashSecret(password);
    const account: Account = existingAccount
      ? { ...existingAccount, role, name, passwordHash }
      : {
          id: makeAccountId(role),
          role,
          email,
          name,
          passwordHash,
          createdAt: new Date().toISOString(),
          theme: defaultTheme,
        };
    setAccounts((current) =>
      mergeAccounts([
        ...current.filter((item) => item.id !== account.id && normalizeEmail(item.email) !== email),
        account,
      ]),
    );
    localAuthSecretRef.current = {
      accountId: account.id,
      role: account.role,
      email,
      password,
    };
    appendAudit("cloud_connect", `Signed in with cloud account for ${email}.`, {
      accountId: account.id,
      role: account.role,
      email,
      name: account.name,
    });
    return signInAccount(account);
  };

  const handleLogin = async (role: AuthRole, email: string, password: string): Promise<AuthResult> => {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await hashSecret(password);
    const account = accounts.find(
      (item) => item.role === role && normalizeEmail(item.email) === normalizedEmail,
    );

    if (!account || account.passwordHash !== passwordHash) {
      const existingAnyRole = accounts.find((item) => normalizeEmail(item.email) === normalizedEmail);
      if (!existingAnyRole?.demo && getBackendStatus().supabaseConfigured) {
        const cloudResult = await signIntoCloud(normalizedEmail, password);
        if (cloudResult.code === "email_confirmation_required") {
          return {
            ok: false,
            code: "email_confirmation_required",
            message: cloudResult.message,
            nextMode: "signin",
            role,
            email: normalizedEmail,
            redirectUrl: cloudResult.redirectUrl,
          };
        }
        if (cloudResult.ok && cloudResult.session) {
          return signInCloudBackedAccount(role, normalizedEmail, password, cloudResult.session);
        }
      }
      return { ok: false, message: "Email or password is incorrect." };
    }

    if (!account.demo) {
      localAuthSecretRef.current = {
        accountId: account.id,
        role: account.role,
        email: normalizedEmail,
        password,
      };
    }
    return signInAccount(account);
  };

  const handleCreateAccount = async (role: AuthRole, name: string, email: string, password: string): Promise<AuthResult> => {
    if (publicDemoOnly) {
      return { ok: false, message: "This demo is sample-only. Open the full ClassLoop app to create your own account." };
    }

    const normalizedEmail = normalizeEmail(email);
    const trimmedName = name.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { ok: false, message: "Enter a valid email address." };
    }
    const existingAccount = accounts.find((account) => normalizeEmail(account.email) === normalizedEmail);
    if (existingAccount) {
      if (existingAccount.passwordHash === (await hashSecret(password))) {
        if (!existingAccount.demo) {
          localAuthSecretRef.current = {
            accountId: existingAccount.id,
            role: existingAccount.role,
            email: normalizedEmail,
            password,
          };
        }
        return signInAccount(existingAccount);
      }
      return {
        ok: false,
        message: "That email already has a ClassLoop account. Sign in instead or reset the password.",
        nextMode: "signin",
        role: existingAccount.role,
        email: normalizedEmail,
      };
    }
    if (!trimmedName) return { ok: false, message: "Enter a name for the account." };
    if (password.length < 8) return { ok: false, message: "Use at least 8 characters for the password." };

    if (manualProBillingProfileForEmail(normalizedEmail)) {
      return finishLocalAccountCreation(role, trimmedName, normalizedEmail, password);
    }

    await wait(420);
    if (getBackendStatus().supabaseConfigured) {
        const cloudResult = await createCloudAccount(normalizedEmail, password, {
          role,
          name: trimmedName,
          redirectRoute: "dashboard",
        });
        if (cloudResult.code === "email_confirmation_required") {
          if (manualProBillingProfileForEmail(normalizedEmail)) {
            return finishLocalAccountCreation(role, trimmedName, normalizedEmail, password);
          }
          return {
            ok: false,
            code: "email_confirmation_required",
            message: cloudResult.message,
            nextMode: "signin",
            role,
            email: normalizedEmail,
            redirectUrl: cloudResult.redirectUrl,
          };
        }
        if (!cloudResult.ok) {
          if (/already|registered|exists/i.test(cloudResult.message)) {
            const signInResult = await signIntoCloud(normalizedEmail, password);
            if (signInResult.code === "email_confirmation_required") {
              return {
                ok: false,
                code: "email_confirmation_required",
                message: signInResult.message,
                nextMode: "signin",
                role,
                email: normalizedEmail,
                redirectUrl: signInResult.redirectUrl,
              };
            }
            if (signInResult.ok && signInResult.session) {
              return signInCloudBackedAccount(role, normalizedEmail, password, signInResult.session);
            }
            return {
              ok: false,
              message: "That email already has a ClassLoop cloud account. Sign in instead or reset the password.",
              nextMode: "signin",
              role,
              email: normalizedEmail,
            };
          }
          if (isLocalWorkspaceHost()) {
            return finishLocalAccountCreation(role, trimmedName, normalizedEmail, password);
          }
          return { ok: false, message: cloudResult.message };
        }
    }
    return finishLocalAccountCreation(role, trimmedName, normalizedEmail, password, {
      startWalkthrough: false,
      multiDevicePending: true,
    });
  };

  const handleCreateLocalAccount = async (role: AuthRole, name: string, email: string, password: string): Promise<AuthResult> => {
    if (publicDemoOnly) {
      return { ok: false, message: "This demo is sample-only. Open the full ClassLoop app to create your own account." };
    }

    const normalizedEmail = normalizeEmail(email);
    const trimmedName = name.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { ok: false, message: "Enter a valid email address." };
    }
    if (!trimmedName) return { ok: false, message: "Enter a name for the account." };
    if (password.length < 8) return { ok: false, message: "Use at least 8 characters for the password." };

    const existingAccount = accounts.find((account) => normalizeEmail(account.email) === normalizedEmail);
    if (existingAccount) {
      if (existingAccount.passwordHash === (await hashSecret(password))) {
        if (!existingAccount.demo) {
          localAuthSecretRef.current = {
            accountId: existingAccount.id,
            role: existingAccount.role,
            email: normalizedEmail,
            password,
          };
        }
        return signInAccount(existingAccount);
      }
      return {
        ok: false,
        message: "That email already has a ClassLoop account. Sign in instead or reset the password.",
        nextMode: "signin",
        role: existingAccount.role,
        email: normalizedEmail,
      };
    }

    appendAudit("cloud_connect", `Continued locally while cloud email confirmation is pending for ${normalizedEmail}.`, {
      role,
      email: normalizedEmail,
      name: trimmedName,
      multiDevicePending: true,
    });
    return finishLocalAccountCreation(role, trimmedName, normalizedEmail, password, {
      startWalkthrough: false,
      multiDevicePending: true,
    });
  };

  const handleUpdateAccount = async (settings: AccountSettingsInput) => {
    if (!auth) return { ok: false, message: "Sign in again before changing account settings." };
    const account = accounts.find((item) => item.id === auth.accountId);
    if (!account) return { ok: false, message: "This account could not be found." };

    const nextName = settings.name.trim();
    const nextEmail = normalizeEmail(settings.email);
    if (!nextName) return { ok: false, message: "Enter a name for the account." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return { ok: false, message: "Enter a valid email address." };
    }
    if (
      accounts.some(
        (item) =>
          item.id !== account.id &&
          item.role === account.role &&
          normalizeEmail(item.email) === nextEmail,
      )
    ) {
      return { ok: false, message: "Another account already uses that email." };
    }
    if (auth.demo && (nextName !== account.name || nextEmail !== normalizeEmail(account.email) || settings.newPassword)) {
      return { ok: false, message: "Sample account settings reset after the demo. Download the app to save your own profile." };
    }

    let passwordHash = account.passwordHash;
    if (settings.newPassword) {
      if (settings.newPassword.length < 8) {
        return { ok: false, message: "Use at least 8 characters for the new password." };
      }
      const currentHash = await hashSecret(settings.currentPassword);
      if (currentHash !== account.passwordHash) {
        return { ok: false, message: "Current password is incorrect." };
      }
      passwordHash = await hashSecret(settings.newPassword);
    }

    const nextAccount = { ...account, name: nextName, email: nextEmail, passwordHash };
    setAccounts((current) => current.map((item) => (item.id === account.id ? nextAccount : item)));
    if (localAuthSecretRef.current?.accountId === account.id) {
      localAuthSecretRef.current = {
        accountId: account.id,
        role: account.role,
        email: nextEmail,
        password: settings.newPassword || localAuthSecretRef.current.password,
      };
    }
    setAuth((current) =>
      current
        ? {
            ...current,
            name: nextName,
            email: nextEmail,
          }
        : current,
    );
    return { ok: true, message: "Settings saved." };
  };

  const handleRequestPasswordReset = async (role: AuthRole, email: string) => {
    const normalizedEmail = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { ok: false, message: "Enter the email for the account you want to reset." };
    }

    const account = accounts.find((item) => item.role === role && normalizeEmail(item.email) === normalizedEmail);
    if (!account) {
      return { ok: true, message: "If an account exists for that email, a reset code can be sent." };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `${role}:${normalizedEmail}`;
    setPasswordResetCodes((current) => ({
      ...current,
      [key]: {
        code,
        expiresAt: Date.now() + 15 * 60 * 1000,
      },
    }));
    return {
      ok: true,
      message: "Reset code ready.",
      code,
      email: normalizedEmail,
      name: account.name,
    };
  };

  const handleCompletePasswordReset = async (
    role: AuthRole,
    email: string,
    code: string,
    newPassword: string,
  ) => {
    const normalizedEmail = normalizeEmail(email);
    const key = `${role}:${normalizedEmail}`;
    const resetRecord = passwordResetCodes[key];
    const account = accounts.find((item) => item.role === role && normalizeEmail(item.email) === normalizedEmail);

    if (!account || !resetRecord || resetRecord.expiresAt < Date.now() || resetRecord.code !== code.trim()) {
      return { ok: false, message: "Reset code is incorrect or expired." };
    }
    if (newPassword.length < 8) return { ok: false, message: "Use at least 8 characters for the new password." };
    if (account.demo) return { ok: false, message: "Sample account passwords stay fixed. Create your own account to change it." };

    const passwordHash = await hashSecret(newPassword);
    setAccounts((current) =>
      current.map((item) =>
        item.id === account.id
          ? {
              ...item,
              passwordHash,
            }
          : item,
      ),
    );
    setPasswordResetCodes((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    return { ok: true, message: "Password reset. You can sign in now." };
  };

  const logout = () => {
    const wasDemo = Boolean(auth?.demo);
    appendAudit("logout", "Signed out.");
    if (wasDemo) resetDemoWorkspaceAfterUse();
    demoSessionRef.current = false;
    localAuthSecretRef.current = null;
    setAuth(null);
    setTheme(defaultTheme);
    navigate("dashboard");
  };

  if (landingMode && !auth) {
    return (
      <LandingPage
        page={landingPage}
        onNavigate={(page) => {
          setLandingPage(page);
          window.location.hash = page === "home" ? "/home" : `/${page}`;
        }}
        onOpenApp={() => {
          setLandingMode(false);
          navigate("dashboard");
        }}
      />
    );
  }

  if (!sharedReady || authLoading) {
    return (
      <AppLoader
        message={authLoading ? "Opening your workspace" : "Loading ClassLoop"}
        steps={authLoading ? authBootSteps() : workspaceBootSteps(bootPhase, workspaceNotice)}
        notice={workspaceNotice}
      />
    );
  }

  if (!auth) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onCreateAccount={handleCreateAccount}
        onCreateLocalAccount={handleCreateLocalAccount}
        onRequestPasswordReset={handleRequestPasswordReset}
        onCompletePasswordReset={handleCompletePasswordReset}
        demoOnly={publicDemoOnly}
        workspaceNotice={workspaceNotice}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        route={effectiveRoute}
        auth={auth}
        onLogout={logout}
        showDemoCard={Boolean(auth.demo && demoLoaded)}
      />
      <main className="main-area">
        {auth.demo && <DemoAccountBanner />}
        <Topbar
          route={effectiveRoute}
          latestSession={latestPublished}
          auth={auth}
          syncStatus={syncStatus}
          onUpdateAccount={handleUpdateAccount}
          onStartWalkthrough={startWalkthrough}
        />
        {workspaceNotice && <WorkspaceRecoveryNotice notice={workspaceNotice} />}
        {effectiveRoute === "dashboard" && <TeacherDashboard sessions={teacherSessions} draft={visibleDraft} billingProfile={billingProfile} />}
        {effectiveRoute === "personal-dashboard" && auth.role === "individual" && (
          <PersonalDashboard meetings={individualMeetings} />
        )}
        {effectiveRoute === "new-personal-meeting" && auth.role === "individual" && (
          <NewPersonalMeeting
            onCreate={createPersonalMeeting}
            personalTemplateCopyUrl={templateLinks.personalTemplateCopyUrl}
          />
        )}
        {effectiveRoute === "personal-meetings" && auth.role === "individual" && (
          <PersonalMeetingsPage
            meetings={individualMeetings}
            onUpdateTask={updatePersonalTask}
            onDeleteMeeting={deletePersonalMeeting}
          />
        )}
        {effectiveRoute === "classes" && auth.role === "teacher" && (
          <ClassGroupsPage
            groups={teacherClassGroups}
            rosterTemplates={teacherRosterTemplates}
            sessions={teacherSessions}
            ownerEmail={auth.email}
            onCreateFromTemplate={createClassGroupFromTemplate}
            onCreateTemplateFromGroup={(group) => {
              const now = new Date().toISOString();
              setRosterTemplates((current) => [
                {
                  id: `roster-template-${Date.now().toString(36)}`,
                  ownerEmail: auth.email,
                  name: `${group.name} roster`,
                  sessionType: group.defaultSessionType,
                  students: group.students,
                  createdAt: now,
                  updatedAt: now,
                },
                ...current,
              ]);
              appendAudit("create_roster_template", `Saved ${group.name} as a reusable roster.`);
            }}
            onCreateBlank={(group) => {
              setClassGroups((current) => [group, ...current]);
              appendAudit("create_class_group", `Created class group ${group.name}.`);
            }}
            onUpdate={updateClassGroup}
            onDelete={deleteClassGroup}
          />
        )}
        {effectiveRoute === "rosters" && auth.role === "teacher" && (
          <RosterTemplatesPage
            templates={teacherRosterTemplates}
            classGroups={teacherClassGroups}
            ownerEmail={auth.email}
            onCreate={(template) => {
              setRosterTemplates((current) => [template, ...current]);
              appendAudit("create_roster_template", `Created ${template.name}.`);
            }}
            onUpdate={updateRosterTemplate}
            onDelete={deleteRosterTemplate}
            onCreateClassGroup={createClassGroupFromTemplate}
            onUpdateClassGroup={updateClassGroup}
          />
        )}
        {effectiveRoute === "new-session" && (
          <ImportSession
            ownerEmail={auth.email}
            setDraft={setDraft}
            onDraftCreated={(session) =>
              triggerCelebration("New session draft created", `${session.title} is ready for teacher review.`)
            }
            onUseDemo={() => setDemoLoaded(true)}
            recordingConsentRequired={privacySettings.recordingConsentRequired}
            rosterTemplates={teacherRosterTemplates}
            classGroups={teacherClassGroups}
            canCreateSession={!freeLimitReached}
            canUseLiveCapture={hasPaidAccess}
            dailySessionsUsed={freeSessionsToday}
            planName={billingProfile.tier === "free" ? "Free" : "Pro"}
            classTemplateCopyUrl={templateLinks.classTemplateCopyUrl}
          />
        )}
        {effectiveRoute === "processing" && <Processing draft={visibleDraft} />}
        {effectiveRoute === "review" && (
          <ReviewDraft
            draft={visibleDraft}
            setDraft={setDraft}
            studentAccountEmails={accounts
              .filter((account) => account.role === "student")
              .map((account) => normalizeEmail(account.email))}
          />
        )}
        {effectiveRoute === "publish-preview" && (
          <PublishPreview
            draft={visibleDraft}
            selectedStudentId={selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            setDraft={setDraft}
            publishDraft={publishDraft}
          />
        )}
        {effectiveRoute === "report" && (
          <SessionReport
            sessions={teacherSessions}
            fallback={latestPublished}
            editSession={(session) => {
              setDraft({ ...session, ownerEmail: auth.email, status: "draft" });
              navigate("review");
            }}
            deleteSession={(session) => {
              if (!window.confirm(`Delete "${session.title}"? This removes the session report and student follow-ups from this workspace.`)) {
                return;
              }
              setSessions((current) => current.filter((item) => item.id !== session.id));
              setDraft((current) => (current?.id === session.id ? null : current));
              appendAudit("delete_session", `Deleted session ${session.title}.`);
              navigate("dashboard");
            }}
          />
        )}
        {effectiveRoute === "student" && (
          <StudentDashboard
            sessions={studentPortalSessions}
            selectedStudentId={auth.role === "student" ? auth.studentId ?? selectedStudentId : selectedStudentId}
            setSelectedStudentId={setSelectedStudentId}
            markFollowUpComplete={markFollowUpComplete}
            auth={auth}
            updateSession={auth.role === "teacher" ? updateSessionById : undefined}
            submitProductFeedback={auth.role === "student" ? submitProductFeedback : undefined}
            submittedProductFeedbackKeys={activeAccount?.submittedProductFeedbackKeys ?? []}
          />
        )}
        {effectiveRoute === "student-session" && (
          <StudentSessionDetail
            sessions={studentPortalSessions}
            selectedStudentId={auth.role === "student" ? auth.studentId ?? selectedStudentId : selectedStudentId}
            markFollowUpComplete={markFollowUpComplete}
            auth={auth}
            updateSession={auth.role === "teacher" ? updateSessionById : undefined}
            submitProductFeedback={auth.role === "student" ? submitProductFeedback : undefined}
            submittedProductFeedbackKeys={activeAccount?.submittedProductFeedbackKeys ?? []}
          />
        )}
        {effectiveRoute === "analytics" && <TeacherAnalytics sessions={teacherSessions} />}
        {effectiveRoute === "billing" && auth.role === "teacher" && (
          <SyncBillingPage
            auth={auth}
            billingProfile={billingProfile}
            setBillingProfile={setBillingProfile}
            currentState={currentState}
            applyCloudState={applyCloudState}
            appendAudit={appendAudit}
            sessionCount={freeSessionsToday}
            localAuthSecret={localAuthSecretRef.current}
          />
        )}
        {effectiveRoute === "checkout" && auth.role === "teacher" && (
          <EmbeddedCheckoutPage
            auth={auth}
            billingProfile={billingProfile}
            setBillingProfile={setBillingProfile}
            localAuthSecret={localAuthSecretRef.current}
            appendAudit={appendAudit}
          />
        )}
        {effectiveRoute === "tutorial" &&
          (auth.role === "teacher" ? (
            <TeacherDashboard sessions={teacherSessions} draft={visibleDraft} billingProfile={billingProfile} />
          ) : auth.role === "individual" ? (
            <PersonalDashboard meetings={individualMeetings} />
          ) : (
            <StudentDashboard
              sessions={studentPortalSessions}
              selectedStudentId={auth.studentId ?? selectedStudentId}
              setSelectedStudentId={setSelectedStudentId}
              markFollowUpComplete={markFollowUpComplete}
              auth={auth}
              submitProductFeedback={submitProductFeedback}
              submittedProductFeedbackKeys={activeAccount?.submittedProductFeedbackKeys ?? []}
            />
          ))}
        {effectiveRoute === "appearance" && <DesignSystemPage theme={activeTheme} setTheme={handleThemeChange} />}
        {effectiveRoute === "privacy" && auth.role === "teacher" && (
          <PrivacyControlsPage
            auth={auth}
            sessions={teacherSessions}
            accounts={accounts}
            privacySettings={privacySettings}
            setPrivacySettings={setPrivacySettings}
            auditLog={auditLog}
            appendAudit={appendAudit}
            clearClassData={() => {
              const teacherSessionIds = new Set(teacherSessions.map((session) => session.id));
              setSessions((current) => current.filter((session) => !teacherSessionIds.has(session.id)));
              setDraft(null);
              setDemoLoaded(false);
            }}
          />
        )}
      </main>
      {rosterPromptSession && auth.role === "teacher" && (
        <SaveRosterTemplatePrompt
          session={rosterPromptSession}
          onSave={(name) => {
            saveRosterTemplateFromSession(rosterPromptSession, name);
            setRosterPromptSession(null);
          }}
          onSkip={() => setRosterPromptSession(null)}
        />
      )}
      {walkthroughOpen && (
        <GuidedWalkthroughOverlay
          auth={auth}
          stepIndex={walkthroughStepIndex}
          setStepIndex={setWalkthroughStepIndex}
          onClose={() => {
            setWalkthroughOpen(false);
            navigate(auth.role === "teacher" ? "dashboard" : "student");
          }}
        />
      )}
      {celebrationMoment && (
        <CelebrationMomentToast
          moment={celebrationMoment}
          onDone={() => setCelebrationMoment(null)}
        />
      )}
    </div>
  );
}

function CelebrationMomentToast({
  moment,
  onDone,
}: {
  moment: CelebrationMoment;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(timer);
  }, [moment.id, onDone]);

  return createPortal(
    <section className="celebration-toast" role="status" aria-live="polite">
      <span className="confetti-burst" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, index) => (
          <span key={index} className="confetti-piece" />
        ))}
      </span>
      <Sparkles size={20} />
      <span className="celebration-copy">
        <strong>{moment.title}</strong>
        <small>{moment.detail}</small>
      </span>
    </section>,
    document.body,
  );
}

function LandingPage({
  page,
  onNavigate,
  onOpenApp,
}: {
  page: LandingPageKey;
  onNavigate: (page: LandingPageKey) => void;
  onOpenApp: () => void;
}) {
  const [downloadMessage, setDownloadMessage] = useState("");
  const [mobileMessage, setMobileMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandaloneMobile, setIsStandaloneMobile] = useState(false);
  const [showDesktopInstallerChoices, setShowDesktopInstallerChoices] = useState(false);
  const [detectedInstallerId] = useState<DesktopInstallerId | null>(() => detectDesktopInstallerFromBrowser());
  const [releaseDownloads, setReleaseDownloads] = useState<ReleaseDownloadManifest>({});
  const [releaseManifestStatus, setReleaseManifestStatus] = useState<ReleaseManifestStatus>("loading");
  const cleanUrl = (value: string | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const cleanExternalReleaseUrl = (value: string | undefined) => {
    const url = cleanUrl(value);
    return releaseUrlIsVercelBlob(url) ? undefined : url;
  };

  const supportEmail = cleanUrl(import.meta.env.VITE_CLASSLOOP_SUPPORT_EMAIL as string | undefined) || "rushilcpm02@gmail.com";
  const checksumUrl = cleanExternalReleaseUrl(releaseDownloads.checksumsUrl);

  type DesktopDownloadOption = {
    id: DesktopInstallerId;
    label: string;
    helper: string;
    badge?: string;
    url?: string;
    kind?: "installer" | "source";
  };

  const macArm64Url = cleanExternalReleaseUrl(releaseDownloads.macos?.arm64Url);
  const macUrl = cleanExternalReleaseUrl(releaseDownloads.macos?.url);
  const macArm64ZipUrl = cleanExternalReleaseUrl(releaseDownloads.macos?.arm64ZipUrl);
  const macZipUrl = cleanExternalReleaseUrl(releaseDownloads.macos?.zipUrl);
  const macSwiftSourceUrl = cleanExternalReleaseUrl(releaseDownloads.macos?.sourceUrl);
  const macOptions: DesktopDownloadOption[] = [];
  if (macArm64Url) {
    macOptions.push({
      id: "macos",
      label: "macOS Swift app (Apple silicon DMG)",
      helper: "Native Swift macOS app for M-series Macs",
      badge: "Recommended default",
      url: macArm64Url,
    });
  }
  if (macArm64ZipUrl) {
    macOptions.push({
      id: "macos",
      label: "macOS Swift app (Apple silicon ZIP)",
      helper: "Native Swift macOS app archive",
      url: macArm64ZipUrl,
    });
  }
  if (!macArm64ZipUrl && macZipUrl) {
    macOptions.push({
      id: "macos",
      label: "macOS ZIP",
      helper: "Apple silicon archive when available",
      url: macZipUrl,
    });
  }
  if (!macOptions.length) {
    macOptions.push({
      id: "macos",
      label: "macOS",
      helper: "Apple silicon Macs",
      url: macUrl,
    });
  }
  if (macSwiftSourceUrl) {
    macOptions.push({
      id: "macos",
      label: "macOS Swift source",
      helper: "Native Swift macOS source; build locally with npm run package:mac.",
      badge: "Preview source",
      url: macSwiftSourceUrl,
      kind: "source",
    });
  }

  const windowsX64Url = cleanExternalReleaseUrl(releaseDownloads.windows?.x64Url);
  const windowsArm64Url = cleanExternalReleaseUrl(releaseDownloads.windows?.arm64Url);
  const windowsUrl = cleanExternalReleaseUrl(releaseDownloads.windows?.url);
  const windowsX64ZipUrl = cleanExternalReleaseUrl(releaseDownloads.windows?.x64ZipUrl);
  const windowsArm64ZipUrl = cleanExternalReleaseUrl(releaseDownloads.windows?.arm64ZipUrl);
  const windowsZipUrl = cleanExternalReleaseUrl(releaseDownloads.windows?.zipUrl);
  const windowsOptions: DesktopDownloadOption[] = [];
  if (windowsX64Url) {
    windowsOptions.push({
      id: "windows",
      label: "Windows (x64 EXE)",
      helper: "Windows 10+ installer",
      url: windowsX64Url,
    });
  }
  if (windowsArm64Url) {
    windowsOptions.push({
      id: "windows",
      label: "Windows (arm64)",
      helper: "Windows on ARM installer",
      url: windowsArm64Url,
    });
  }
  if (windowsX64ZipUrl) {
    windowsOptions.push({
      id: "windows",
      label: "Windows (x64 ZIP)",
      helper: "Windows 10+ archive",
      url: windowsX64ZipUrl,
    });
  }
  if (windowsArm64ZipUrl) {
    windowsOptions.push({
      id: "windows",
      label: "Windows (arm64 ZIP)",
      helper: "Windows on ARM archive",
      url: windowsArm64ZipUrl,
    });
  }
  if (!windowsX64ZipUrl && !windowsArm64ZipUrl && windowsZipUrl) {
    windowsOptions.push({
      id: "windows",
      label: "Windows ZIP",
      helper: "Portable archive when available",
      url: windowsZipUrl,
    });
  }
  if (!windowsOptions.length) {
    windowsOptions.push({
      id: "windows",
      label: "Windows",
      helper: "Windows 10 or newer",
      url: windowsUrl,
    });
  }

  const linuxX64Url = cleanExternalReleaseUrl(releaseDownloads.linux?.x64Url);
  const linuxArm64Url = cleanExternalReleaseUrl(releaseDownloads.linux?.arm64Url);
  const linuxUrl = cleanExternalReleaseUrl(releaseDownloads.linux?.url);
  const linuxOptions: DesktopDownloadOption[] = [];
  if (linuxX64Url) {
    linuxOptions.push({
      id: "linux",
      label: "Linux (x64 AppImage)",
      helper: "AppImage for amd64/x86_64",
      url: linuxX64Url,
    });
  }
  if (linuxArm64Url) {
    linuxOptions.push({
      id: "linux",
      label: "Linux (arm64 AppImage)",
      helper: "AppImage for arm64",
      url: linuxArm64Url,
    });
  }
  if (!linuxOptions.length) {
    linuxOptions.push({
      id: "linux",
      label: "Linux",
      helper: "AppImage or Debian package",
      url: linuxUrl,
    });
  }

  const downloadOptions: DesktopDownloadOption[] = [...macOptions, ...windowsOptions, ...linuxOptions];
  const availableDownloads = downloadOptions.filter((option) => option.url);
  const detectedDownload = downloadOptions.find((option) => option.id === detectedInstallerId) ?? null;
  const fallbackDownload = detectedDownload ?? downloadOptions[0];
  const downloadButtonLabel = (option: (typeof downloadOptions)[number]) =>
    option.url
      ? option.kind === "source"
        ? `Open ${option.label}`
        : `Download ${option.label}`
      : `${option.label} packaging pending`;
  const releaseManifestMessage: string | null =
    releaseManifestStatus === "unavailable"
      ? "Desktop installer manifest is unavailable, so installers stay Packaging pending until the tiny download manifest can be fetched."
      : releaseManifestStatus === "invalid"
        ? "Desktop installer manifest could not be read, so installers stay Packaging pending instead of showing uncertain links."
        : releaseManifestStatus === "blocked"
          ? "Installer links pointing at Vercel Blob are ignored to keep project storage from filling up."
          : null;
  const detectedInstallerCopy = detectedDownload
    ? detectedDownload.id === "macos" && macArm64Url
      ? "ClassLoop detected macOS. The Swift Apple silicon DMG is the default Mac app for M-series Macs."
      : `ClassLoop detected ${detectedDownload.label} from browser hints. Use the detected installer or reveal the full desktop list.`
    : "This device looks best for the web/PWA path. You can still open desktop installers when downloading ClassLoop for another computer.";
  const publicNav: Array<{ page: LandingPageKey; label: string }> = [
    { page: "home", label: "Home" },
    { page: "features", label: "Features" },
    { page: "screenshots", label: "Screenshots" },
    { page: "docs", label: "Docs" },
    { page: "privacy", label: "Privacy" },
    { page: "support", label: "Support" },
    { page: "download", label: "Download" },
  ];

  const goToPage = (nextPage: LandingPageKey) => {
    onNavigate(nextPage);
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const handleDownload = (option = fallbackDownload) => {
    if (option.url) {
      window.location.href = option.url;
      return;
    }
    setDownloadMessage(
      `${option.label} packaging pending: the desktop installer has not been uploaded yet. You can try the hosted web demo now.`,
    );
  };

  const handleMobileInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      setMobileMessage(
        choice.outcome === "accepted"
          ? "ClassLoop is ready to open from your phone home screen."
          : "You can still add ClassLoop from your browser share menu or install menu.",
      );
      return;
    }
    setMobileMessage(
      isStandaloneMobile
        ? "ClassLoop is already running like an app on this device."
      : "On iPhone, tap Share then Add to Home Screen. On Android, open the browser menu and choose Install app.",
    );
  };

  useEffect(() => {
    let cancelled = false;
    setReleaseManifestStatus("loading");
    fetch("/classloop-downloads.json", { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setReleaseManifestStatus("unavailable");
          return {};
        }
        try {
          const manifest = normalizeReleaseDownloadManifest(await response.json());
          if (!cancelled) setReleaseManifestStatus(releaseManifestHasBlockedUrls(manifest) ? "blocked" : "ready");
          return manifest;
        } catch {
          if (!cancelled) setReleaseManifestStatus("invalid");
          return {};
        }
      })
      .then((manifest) => {
        if (!cancelled) setReleaseDownloads(manifest);
      })
      .catch(() => {
        if (!cancelled) {
          setReleaseDownloads({});
          setReleaseManifestStatus("unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    const updateDisplayMode = () => {
      setIsStandaloneMobile(
        displayModeQuery.matches ||
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    };
    const beforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMobileMessage("ClassLoop can be added to this device for faster access.");
    };
    const installed = () => {
      setInstallPrompt(null);
      setMobileMessage("ClassLoop was added to this device.");
      updateDisplayMode();
    };
    updateDisplayMode();
    window.addEventListener("beforeinstallprompt", beforeInstallPrompt);
    window.addEventListener("appinstalled", installed);
    displayModeQuery.addEventListener("change", updateDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallPrompt);
      window.removeEventListener("appinstalled", installed);
      displayModeQuery.removeEventListener("change", updateDisplayMode);
    };
  }, []);

  return (
    <main className={`landing-page landing-page-${page}`}>
      <nav className="landing-nav" aria-label="ClassLoop public navigation">
        <div className="landing-brand-block">
          <button className="landing-brand" type="button" onClick={() => goToPage("home")}>
            <span className="brand-mark">
              <BrainCircuit size={24} />
            </span>
            <span>ClassLoop</span>
          </button>
          {classLoopBuildMarker() && (
            <span className="landing-build-marker" title={classLoopBuildDetails()}>
              {classLoopBuildMarker()}
            </span>
          )}
        </div>
        <div className="landing-links">
          {publicNav.slice(1).map((item) => (
            <button
              key={item.page}
              className={`landing-nav-link${page === item.page ? " active" : ""}`}
              type="button"
              onClick={() => goToPage(item.page)}
              aria-current={page === item.page ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
          <button className="landing-link-button" type="button" onClick={onOpenApp}>
            Open demo
          </button>
        </div>
      </nav>

      <div className="landing-route-frame">
        {page === "home" && (
          <>
            <section className="landing-hero">
              <div className="landing-hero-copy">
                <div className="landing-icon" aria-hidden="true">
                  <Sparkles size={38} />
                </div>
                <h1>ClassLoop</h1>
                <p>
                  Save time after class by turning a pasted Zoom transcript into teacher-reviewed recaps, shared
                  resources, and class tasks without rebuilding the classroom context by hand.
                </p>
                <div className="landing-proof-row" aria-label="ClassLoop product highlights">
                  <span>Zoom transcript first</span>
                  <span>Teacher-approved drafts</span>
                  <span>Classwide Classroom posts</span>
                </div>
                <div className="landing-actions landing-actions-hero">
                  <button className="landing-primary" type="button" onClick={onOpenApp}>
                    <PlayCircle size={20} />
                    Open web demo
                  </button>
                  <button className="landing-secondary" type="button" onClick={handleMobileInstall}>
                    <Smartphone size={20} />
                    Add to phone
                  </button>
                  <button className="landing-secondary quiet" type="button" onClick={() => goToPage("screenshots")}>
                    <Eye size={20} />
                    View screenshots
                  </button>
                </div>
              </div>
              <button className="landing-screenshot-preview" type="button" onClick={() => goToPage("screenshots")}>
                <span className="landing-screenshot-label">Actual ClassLoop workflow preview</span>
                <img
                  src="/screenshots/classloop-import-review.svg"
                  alt="ClassLoop teacher import and review screen showing transcript, roster matching, and student follow-up cards"
                />
              </button>
            </section>

            <section className="landing-home-paths" aria-label="ClassLoop website sections">
              <article>
                <strong>See the app</strong>
                <p>Open a screenshot gallery for the teacher import flow, student dashboard, and private analytics.</p>
                <button className="landing-secondary" type="button" onClick={() => goToPage("screenshots")}>View screenshots</button>
              </article>
              <article>
                <strong>Understand the product</strong>
                <p>Use separate pages for features, docs, privacy, support, and downloads instead of one crowded page.</p>
                <button className="landing-secondary" type="button" onClick={() => goToPage("features")}>Explore features</button>
              </article>
              <article>
                <strong>Trust the boundary</strong>
                <p>See how sample demos, local desktop storage, and teacher review keep the public site honest.</p>
                <button className="landing-secondary" type="button" onClick={() => goToPage("privacy")}>Review privacy</button>
              </article>
            </section>
          </>
        )}

        {page === "features" && (
          <>
            <header className="landing-page-header">
              <h1>Features for classroom continuity.</h1>
              <p>
                ClassLoop is built around the teacher workflow after class: gather the messy record, clean it up,
                publish specific follow-through, and see what needs attention next.
              </p>
            </header>
            <section className="landing-feature-matrix" aria-label="ClassLoop feature matrix">
              {([
                ["Transcript intelligence", "Speaker cleanup, roster matching, unmatched participants, participation confidence, and teacher review states.", MessageSquare],
                ["Reusable rosters", "Saved class groups and roster templates reduce repeated setup across sessions.", Users],
                ["Draft review", "Editable recaps, essential questions, student-specific tasks, resources, and publish audit details.", ClipboardCheck],
                ["Student portal", "Personalized recap, assignments, resources, due dates, and completion check-ins.", GraduationCap],
                ["Analytics", "Quiet students, overdue work, attendance status, and class-level follow-through trends.", LineChart],
                ["Classroom posting scope", "When Google Classroom is connected, post the reviewed class recap, resources, and class-wide tasks only.", Send],
              ] as Array<[string, string, typeof MessageSquare]>).map(([title, body, Icon]) => (
                <article key={title}>
                  <Icon size={24} />
                  <h2>{title}</h2>
                  <p>{body}</p>
                </article>
              ))}
            </section>
            <section className="landing-workflow-list" aria-label="ClassLoop workflow">
              {[
                ["Import", "Paste transcript, roster, notes, and links."],
                ["Normalize", "ClassLoop extracts speakers, resources, tasks, and likely student matches."],
                ["Review", "Teacher edits before anything reaches students."],
                ["Publish", "Student dashboards update with only the relevant follow-up."],
              ].map(([title, body], index) => (
                <article key={title}>
                  <strong>{index + 1}</strong>
                  <div>
                    <h2>{title}</h2>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}

        {page === "screenshots" && (
          <>
            <header className="landing-page-header compact">
              <h1>Screenshots: how ClassLoop works.</h1>
              <p>
                Three focused views show the core product story: teachers import class records, students receive
                clear next steps, and teachers use private analytics to decide who needs support.
              </p>
            </header>
            <section className="landing-screenshot-gallery" aria-label="ClassLoop screenshots">
              {[
                {
                  title: "Teacher import and review",
                  meta: "Teacher workflow",
                  body: "ClassLoop turns a transcript, roster, notes, and links into a reviewable draft. The teacher edits the recap, confirms tasks, and publishes only when it is ready.",
                  src: "/screenshots/classloop-import-review.svg",
                  alt: "ClassLoop teacher import and review screen with transcript inputs, roster matching, and follow-up cards",
                },
                {
                  title: "Student follow-up dashboard",
                  meta: "Student workspace",
                  body: "Students see the recap, tasks, resources, due dates, and completion check-ins that apply to them—without the full teacher workspace.",
                  src: "/screenshots/classloop-student-dashboard.svg",
                  alt: "ClassLoop student dashboard with recap, assigned next steps, resources, and check-in progress",
                },
                {
                  title: "Private teacher analytics",
                  meta: "Support signals",
                  body: "Teachers can review participation, quiet students, overdue work, and resource engagement as support signals, not public rankings.",
                  src: "/screenshots/classloop-analytics.svg",
                  alt: "ClassLoop teacher analytics screen showing participation, quiet students, overdue tasks, and resource signals",
                },
              ].map((shot) => (
                <article key={shot.title} className="landing-screenshot-card">
                  <img src={shot.src} alt={shot.alt} />
                  <div>
                    <span className="landing-card-kicker">{shot.meta}</span>
                    <h2>{shot.title}</h2>
                    <p>{shot.body}</p>
                  </div>
                </article>
              ))}
            </section>
            <section className="landing-workflow-strip" aria-label="ClassLoop workflow summary">
              {[
                ["Import", "Paste or upload transcript, roster, notes, and resources."],
                ["Review", "Approve speaker matching, recap, action items, and resources."],
                ["Publish", "Send student-specific follow-ups and completion check-ins."],
                ["Support", "Use private analytics to decide who needs attention next."],
              ].map(([title, body], index) => (
                <article key={title}>
                  <strong>{index + 1}</strong>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </article>
              ))}
            </section>
          </>
        )}

        {page === "docs" && (
          <>
            <header className="landing-page-header">
              <h1>ClassLoop docs.</h1>
              <p>
                Practical setup notes for teachers and pilots. Start with reliable classroom inputs,
                then use cloud sync and Pro features when they are available for your account.
              </p>
            </header>
            <section className="landing-docs-layout" aria-label="ClassLoop documentation">
              <aside className="landing-docs-index" aria-label="Documentation index">
                {[
                  "Quick start",
                  "Import formats",
                  "Publishing",
                  "Business model",
                  "Launch gates",
                  "Mobile access",
                  "Free install",
                  "Release setup",
                ].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </aside>
              <div className="landing-doc-stack">
                <article className="landing-doc-section">
                  <h2>Quick start</h2>
                  <p>Open the sample demo to explore with safe data, or create your own ClassLoop account in the app. The desktop app keeps an encrypted local copy on this device.</p>
                  <code>Sample demo - review draft - publish approved follow-ups</code>
                </article>
                <article className="landing-doc-section">
                  <h2>Import formats</h2>
                  <p>ClassLoop accepts Zoom-style transcript lines, pasted rosters, CSV rows, compressed numbered rosters, notes, and resource URLs.</p>
                  <code>Student (Aaliyah Carter): Wait do we write it in a doc?</code>
                </article>
                <article className="landing-doc-section">
                  <h2>Publishing model</h2>
                  <p>Teachers review generated drafts first. Students only see the recap, tasks, resources, due dates, and status intended for them.</p>
                </article>
                <article className="landing-doc-section">
                  <h2>Business model</h2>
                  <p>
                    ClassLoop follows a predictable teacher subscription path: Free proves the classroom workflow, Pro
                    unlocks weekly-use depth, and school/team pilots come later with admin and privacy controls.
                  </p>
                  <ul className="landing-doc-list">
                    <li><strong>Free:</strong> one generated session per day, transcript import, roster tools, student preview, local encrypted storage, and multi-device cloud sync.</li>
                    <li><strong>Teacher Pro:</strong> $3.99/month for unlimited sessions, live in-person/online capture, analytics, delivery proof, and exports.</li>
                    <li><strong>School/team later:</strong> per-teacher seats with SSO, retention controls, audit/export, admin policy, and reviewed student-data agreements.</li>
                  </ul>
                  <p>No per-minute transcript pricing. Long classes and messy transcripts should not punish teachers.</p>
                  <code>Free trust -&gt; Teacher Pro habit -&gt; School pilot governance</code>
                </article>
                <article className="landing-doc-section">
                  <h2>Launch gates</h2>
                  <p>
                    Demo routes use sample accounts only. Real public accounts should open only after privacy,
                    support, installer, payment, and teacher rehearsal checks are complete.
                  </p>
                  <code>Sample data stays separate from real classroom work.</code>
                </article>
                <article className="landing-doc-section">
                  <h2>Mobile access</h2>
                  <p>The hosted shell includes a manifest and service worker, so students can add ClassLoop to a phone home screen from the browser menu.</p>
                </article>
                <article className="landing-doc-section">
                  <h2>Free desktop install</h2>
                  <p>ClassLoop desktop installers include platform notes and checksums so teachers can verify the download before opening the app.</p>
                  <code>Verify checksum - open app - start with sample data</code>
                </article>
                <article className="landing-doc-section">
                  <h2>Release setup</h2>
                  <p>Download buttons appear only for installers that are ready. If a platform is still being packaged, ClassLoop says that plainly.</p>
                  <code>Installers appear when verified.</code>
                </article>
              </div>
            </section>
          </>
        )}

        {page === "privacy" && (
          <>
            <header className="landing-page-header">
              <h1>ClassLoop Privacy Policy.</h1>
              <p>
                ClassLoop handles classroom records, so privacy starts with teacher review, local-first encrypted storage,
                demo-only sample workspaces, and cloud sync only when it is intentionally enabled.
              </p>
            </header>
            <section className="landing-feature-band" aria-label="ClassLoop privacy principles">
              <article>
                <ShieldCheck size={24} />
                <h2>Local desktop data</h2>
                <p>Desktop state is encrypted locally without OS password prompts and stays in the user's app data directory, not inside the app bundle.</p>
              </article>
              <article>
                <KeyRound size={24} />
                <h2>No training on student records</h2>
                <p>ClassLoop's default posture is no training on student data unless a school-authorized workflow explicitly permits it.</p>
              </article>
              <article>
                <SlidersHorizontal size={24} />
                <h2>Retention and exports</h2>
                <p>Teachers can tune retention days, consent requirements, audit logging, and student export access.</p>
              </article>
              <article>
                <MessageSquare size={24} />
                <h2>Creator product feedback</h2>
                <p>Optional student usefulness ratings go to ClassLoop support for product improvement, not to teacher analytics.</p>
              </article>
            </section>
            <section className="landing-policy-panel">
              <h2>What ClassLoop processes</h2>
              <p>
                ClassLoop may process account profiles, transcripts, notes, rosters, aliases, resource links, generated
                recaps, action items, participation events, completion states, audit history, billing metadata, support
                messages, installer reports, and optional product feedback.
              </p>
              <p>
                Cloud sync uses account sign-in and workspace authorization. Billing uses a payment processor.
                Support and installer feedback should include only the information needed to resolve the issue.
              </p>
            </section>
            <section className="landing-policy-panel">
              <h2>Hosted demo boundary and school readiness</h2>
              <p>
                Demo-only routes use sample accounts only. Durable saved workspaces can sync through ClassLoop
                cloud accounts when retention, deletion, support, and school data terms are in place.
              </p>
              <p>
                Retention is teacher-controlled in the app. For hosted pilots, classroom workspace data should
                be deleted on request, demo-only data remains sample-only, and product feedback is retained only while it is
                useful for support, security, billing, or required records.
              </p>
              <p>
                ClassLoop should not invite children to create unsupervised public accounts. Real student data should use
                teacher- or school-authorized setup that accounts for COPPA, FERPA, PPRA, district policy, and parent or
                guardian requirements.
              </p>
              <button className="landing-secondary" type="button" onClick={onOpenApp}>
                Open sample demo
              </button>
              <div className="landing-actions compact">
                <button className="landing-secondary" type="button" onClick={() => goToPage("terms")}>
                  Terms
                </button>
                <button className="landing-secondary" type="button" onClick={() => goToPage("eula")}>
                  EULA
                </button>
                <button className="landing-secondary" type="button" onClick={() => goToPage("support")}>
                  Support
                </button>
              </div>
            </section>
          </>
        )}

        {page === "terms" && (
          <>
            <header className="landing-page-header">
              <h1>ClassLoop Terms of Use.</h1>
              <p>
                These founder-authored terms cover the ClassLoop demo, desktop downloads, support, billing paths, and
                future cloud sync. They are not legal advice and should be reviewed before durable public signups
                use real student data.
              </p>
            </header>
            <section className="landing-legal-grid" aria-label="ClassLoop Terms of Use">
              {[
                ["Service scope", "ClassLoop turns teacher-provided transcripts, notes, rosters, resource links, and completion check-ins into reviewable classroom follow-up workflows. It is not an official gradebook, student information system, emergency service, or substitute for school judgment."],
                ["Sample hosted demo", "The public hosted site is for sample ClassLoop accounts and demonstration data. Do not paste real student records into the hosted demo unless a separate pilot agreement is in place."],
                ["Authorized users", "Teachers, tutors, school staff, and authorized pilots may use ClassLoop. Students may use student-facing views only when a teacher or school has approved and published follow-ups to them."],
                ["Teacher review responsibility", "ClassLoop generates drafts. A teacher or authorized school staff member must review, edit, and approve generated recaps, matches, tasks, resources, and follow-ups before sharing them with students."],
                ["Acceptable use", "Do not use ClassLoop to harass, shame, rank publicly, surveil, discriminate, collect unnecessary sensitive data, bypass school policy, or make automated high-stakes decisions about students."],
                ["Content and permissions", "Only upload records you are allowed to process for classroom follow-up. You keep ownership of your classroom content and give ClassLoop limited permission to operate the app, save workspace state, provide support, and protect the service."],
                ["Accounts and billing", "Free desktop use remains useful without paid services. Pro billing is handled by a payment processor, and plan changes apply after payment confirmation."],
                ["Support and feedback", "Installer reports, pilot feedback, and optional student usefulness ratings may be sent to ClassLoop support for product improvement. Avoid sending unnecessary student data in support notes."],
                ["Changes and suspension", "ClassLoop may update these terms or suspend hosted access for abuse, security risk, payment failure, legal compliance, or operational risk. Material changes should be reflected before broad school or district-managed hosted signups open."],
              ].map(([title, body]) => (
                <article key={title}>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </article>
              ))}
            </section>
            <section className="landing-policy-panel">
              <h2>Contact</h2>
              <p>Questions about these terms or classroom data handling can be sent to {supportEmail}.</p>
              <div className="landing-actions compact">
                <button className="landing-secondary" type="button" onClick={() => goToPage("privacy")}>
                  Privacy
                </button>
                <button className="landing-secondary" type="button" onClick={() => goToPage("eula")}>
                  Desktop EULA
                </button>
              </div>
            </section>
          </>
        )}

        {page === "eula" && (
          <>
            <header className="landing-page-header">
              <h1>ClassLoop Desktop EULA.</h1>
              <p>
                This desktop license covers downloaded ClassLoop installers for macOS, Windows, and Linux. It is written
                for early launch use and should be reviewed before broad school distribution.
              </p>
            </header>
            <section className="landing-legal-grid" aria-label="ClassLoop desktop EULA">
              {[
                ["License", "ClassLoop grants a limited, revocable, non-exclusive, non-transferable license to install and use the desktop app for classroom follow-up, review, pilot, and personal teaching workflows."],
                ["Restrictions", "Do not redistribute modified installers as official ClassLoop builds, remove legal notices, violate student privacy, bypass school policy, or reverse engineer the app except where law allows."],
                ["Local storage", "The desktop app stores account and classroom workspace data on the local device. Local data is encrypted where the app supports it, and deleting app data or using in-app deletion tools removes that local workspace."],
                ["Backups", "Users are responsible for backups before deleting workspaces, replacing devices, or reinstalling the app. Backup/restore flows should preserve encrypted desktop data where supported."],
                ["Unsigned builds", "Free builds may be unsigned or ad-hoc signed. Verify SHA256 checksums and only install files from the official ClassLoop download page or GitHub Release."],
                ["Updates", "Desktop updates are manual install-over-replace until an automatic updater is intentionally added. User data is stored outside the app bundle so normal replacement should not erase the workspace."],
                ["No warranty", "ClassLoop is provided as-is for early use and pilots. You are responsible for checking generated follow-ups before relying on them in a classroom setting."],
                ["Termination", "Stop using ClassLoop and delete local app data if you no longer accept the license, your school policy does not allow the workflow, or you are no longer authorized to process imported records."],
              ].map(([title, body]) => (
                <article key={title}>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </article>
              ))}
            </section>
            <section className="landing-policy-panel">
              <h2>Installer help</h2>
              <p>
                If an installer fails on a clean machine, send the platform, filename, OS version, and the exact error.
                Do not include real student records in installer support notes.
              </p>
              <div className="landing-actions compact">
                <button className="landing-secondary" type="button" onClick={() => goToPage("support")}>
                  Get support
                </button>
                <button className="landing-secondary" type="button" onClick={() => goToPage("download")}>
                  Downloads
                </button>
              </div>
            </section>
          </>
        )}

        {page === "support" && (
          <>
            <header className="landing-page-header">
              <h1>ClassLoop support.</h1>
              <p>
                Send installer failures, checkout problems, import bugs, and privacy/deletion requests directly to
                ClassLoop support. Keep real student data out of support notes unless a specific pilot agreement or
                support flow says otherwise.
              </p>
            </header>
            <section className="landing-support-layout" aria-label="ClassLoop support options">
              <article className="landing-policy-panel">
                <Mail size={24} />
                <h2>Support contact</h2>
                <p>{supportEmail}</p>
                <button
                  className="landing-secondary"
                  type="button"
                  onClick={() => {
                    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent("ClassLoop support request")}`;
                  }}
                >
                  Email support
                </button>
              </article>
              <article className="landing-policy-panel">
                <Trash2 size={24} />
                <h2>Retention and deletion</h2>
                <p>
                  Desktop users can export and delete local workspace data in the app. Hosted pilot users can request
                  deletion by email; support feedback is retained only as long as needed for support, safety, billing,
                  or required records.
                </p>
              </article>
              <article className="landing-policy-panel">
                <ShieldCheck size={24} />
                <h2>School data and child safety</h2>
                <p>
                  Do not send raw transcripts or full rosters in normal support. For real student data, use teacher- or
                  school-authorized workflows and confirm COPPA, FERPA, PPRA, district, and parent or guardian requirements.
                </p>
              </article>
            </section>
            <InstallerFeedbackForm supportEmail={supportEmail} defaultPlatform={detectedInstallerId ?? "web/mobile"} />
          </>
        )}

        {page === "download" && (
          <>
            <header className="landing-page-header">
              <h1>Download ClassLoop.</h1>
              <p>
                Start with the hosted PWA for the sample workflow, add it to a phone, then move real daily classroom
                work to the Swift macOS app, desktop app, or a reviewed cloud pilot.
              </p>
            </header>
            <section className="landing-mobile-band" aria-label="ClassLoop on mobile">
              <div className="landing-mobile-card">
                <Smartphone size={26} />
                <h2>Use the PWA for fast after-class cleanup.</h2>
                <p>
                  The hosted web shell is installable on modern mobile browsers, so teachers can check the sample
                  recap flow from a phone without downloading the desktop app first.
                </p>
                <button className="landing-primary" type="button" onClick={handleMobileInstall}>
                  <Smartphone size={18} />
                  Add to phone
                </button>
              </div>
              <div className="mobile-step-grid">
                <article className="mobile-step">
                  <strong>1</strong>
                  <span>Open the hosted ClassLoop link after class.</span>
                </article>
                <article className="mobile-step">
                  <strong>2</strong>
                  <span>Choose Add to Home Screen or Install app from the browser menu.</span>
                </article>
                <article className="mobile-step">
                  <strong>3</strong>
                  <span>Use sample data in the PWA; keep real rosters in desktop or an approved cloud pilot.</span>
                </article>
              </div>
            </section>

            <section className="landing-pwa-checklist" aria-label="Hosted PWA launch checklist">
              {([
                ["Zoom transcript first", "The launch flow starts from pasted or uploaded Zoom transcripts so teachers always have a reliable fallback.", FileText],
                ["Teacher review stays central", "ClassLoop drafts the recap, resources, and class-wide tasks; the teacher approves before anything is shared.", ClipboardCheck],
                ["Classroom posts stay classwide", "Google Classroom posting should send the recap, resources, and class tasks only. Personalized student follow-ups stay inside ClassLoop.", Send],
              ] as Array<[string, string, typeof FileText]>).map(([title, body, Icon]) => (
                <article key={title}>
                  <Icon size={22} />
                  <div>
                    <h2>{title}</h2>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </section>

            <section className="landing-download-band">
              <div>
                <h2>Desktop installers</h2>
                <p>{detectedInstallerCopy}</p>
                {releaseManifestMessage && (
                  <p className="landing-message warning" role="status" aria-live="polite">
                    {releaseManifestMessage}
                  </p>
                )}
              </div>
              <div className="landing-detected-download">
                {detectedDownload ? (
                  <>
                    <button className="landing-primary" type="button" onClick={() => handleDownload(detectedDownload)}>
                      <Download size={18} />
                      {downloadButtonLabel(detectedDownload)}
                    </button>
                    <button
                      className="landing-secondary installer-choice-toggle"
                      type="button"
                      onClick={() => setShowDesktopInstallerChoices((current) => !current)}
                      aria-expanded={showDesktopInstallerChoices}
                    >
                      Not your system?
                    </button>
                  </>
                ) : (
                  <div className="landing-installer-fallback">
                    <strong>Use the web app on this device.</strong>
                    <span>Add ClassLoop to a phone or open the sample workspace now. Desktop installers stay one click away.</span>
                    <div className="landing-actions compact">
                      <button className="landing-primary" type="button" onClick={handleMobileInstall}>
                        <Smartphone size={18} />
                        Add to phone
                      </button>
                      <button
                        className="landing-secondary installer-choice-toggle"
                        type="button"
                        onClick={() => setShowDesktopInstallerChoices((current) => !current)}
                        aria-expanded={showDesktopInstallerChoices}
                      >
                        View desktop installers
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {showDesktopInstallerChoices && (
                <div className="landing-platform-list" aria-label="Desktop download options">
                  {downloadOptions.map((option) => (
                    <button key={`${option.id}-${option.label}`} type="button" onClick={() => handleDownload(option)}>
                      <Download size={16} />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.url ? (option.kind === "source" ? "Source ready" : "Download ready") : "Packaging pending"}</small>
                        <em>{option.badge ? `${option.badge} - ${option.helper}` : option.helper}</em>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="landing-policy-panel">
              <h2>Free desktop install notes</h2>
              <p>ClassLoop's free macOS build is the Swift app and may be unsigned or ad-hoc signed. Verify the checksum, then use the normal OS trust prompt only when the file came from the official ClassLoop download page.</p>
              <div className="mobile-step-grid">
                <article className="mobile-step">
                  <strong>1</strong>
                  <span>Download the installer for your platform and the SHA256 checksum file.</span>
                </article>
                <article className="mobile-step">
                  <strong>2</strong>
                  <span>On macOS, right-click the app or installer and choose Open, or use Privacy & Security, then Open Anyway.</span>
                </article>
                <article className="mobile-step">
                  <strong>3</strong>
                  <span>On Windows or Linux, expect unsigned-app warnings until paid code signing is added.</span>
                </article>
              </div>
              {checksumUrl && (
                <div className="landing-actions compact">
                  <button className="landing-secondary" type="button" onClick={() => { window.location.href = checksumUrl; }}>
                    Download checksums
                  </button>
                </div>
              )}
            </section>
            <section className="landing-policy-panel">
              <h2>Safe demo path</h2>
              <p>Demo data is sample-only and resettable. Real teacher or student accounts use ClassLoop account sign-in when cloud accounts are enabled.</p>
              <div className="landing-actions compact">
                <button className="landing-secondary" type="button" onClick={onOpenApp}>
                  Open web demo
                </button>
                <button
                  className="landing-secondary"
                  type="button"
                  onClick={() => setShowDesktopInstallerChoices(true)}
                >
                  View desktop installers
                </button>
              </div>
              {(downloadMessage || mobileMessage) && (
                <p className="landing-message" role="status" aria-live="polite">
                  {downloadMessage || mobileMessage}
                </p>
              )}
            </section>
            <InstallerFeedbackForm supportEmail={supportEmail} defaultPlatform={detectedInstallerId ?? "web/mobile"} />
          </>
        )}
      </div>
    </main>
  );
}

function InstallerFeedbackForm({
  supportEmail,
  defaultPlatform,
}: {
  supportEmail: string;
  defaultPlatform: string;
}) {
  const [platform, setPlatform] = useState(defaultPlatform);
  const [issueType, setIssueType] = useState("installer_failed");
  const [contactEmail, setContactEmail] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const submitDisabled = status === "submitting" || !details.trim();

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!details.trim()) return;
    setStatus("submitting");
    setMessage("");
    const note = [
      `Platform: ${platform}`,
      `Issue: ${issueType}`,
      contactEmail.trim() ? `Contact: ${contactEmail.trim()}` : "",
      "",
      details.trim().slice(0, 1200),
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: issueType === "checksum_mismatch" ? 1 : 2,
          note,
          role: "teacher",
          source: "download_install_feedback",
          transcript: "",
          metadata: {
            platform,
            issueType,
            contactEmail: contactEmail.trim().slice(0, 180),
            page: "download",
            build: classLoopBuildMarker(),
            userAgent: window.navigator.userAgent.slice(0, 200),
          },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Unable to send installer feedback.");
      }
      setStatus(result.notified === false ? "saved" : "sent");
      setMessage(
        result.notified === false
          ? `Report saved. Email ${supportEmail} for urgent installer problems.`
          : "Thanks, installer report sent to ClassLoop support.",
      );
      setDetails("");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? `${error.message} Email ${supportEmail} if this keeps happening.`
          : `Unable to send installer feedback. Email ${supportEmail} if this keeps happening.`,
      );
    }
  };

  return (
    <section className="landing-feedback-panel" aria-label="ClassLoop installer feedback">
      <div>
        <span className="landing-card-kicker">Installer feedback</span>
        <h2>Tell me what failed on your machine.</h2>
        <p>
          Reports go to ClassLoop support for clean-machine installer issues, blocked downloads, checksum mismatches,
          checkout problems, and confusing first-run behavior.
        </p>
      </div>
      <form className="landing-feedback-form" onSubmit={submitFeedback}>
        <label>
          Platform
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="macos">macOS</option>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
            <option value="web/mobile">Web or mobile</option>
            <option value="unknown">Not sure</option>
          </select>
        </label>
        <label>
          Problem
          <select value={issueType} onChange={(event) => setIssueType(event.target.value)}>
            <option value="installer_failed">Installer failed</option>
            <option value="os_blocked">OS blocked the app</option>
            <option value="checksum_mismatch">Checksum mismatch</option>
            <option value="app_wont_open">App will not open</option>
            <option value="checkout_problem">Checkout problem</option>
            <option value="sync_problem">Cloud sync problem</option>
            <option value="other">Something else</option>
          </select>
        </label>
        <label>
          Email for follow-up
          <input
            type="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <label className="feedback-details-field">
          What happened?
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Include the filename, OS version, and exact error. Please do not paste real student data."
            maxLength={1200}
            required
          />
        </label>
        <div className="landing-actions compact">
          <button className="landing-primary" type="submit" disabled={submitDisabled}>
            <Send size={18} />
            {status === "submitting" ? "Sending..." : "Send report"}
          </button>
          <button
            className="landing-secondary"
            type="button"
            onClick={() => {
              window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent("ClassLoop installer issue")}`;
            }}
          >
            <Mail size={18} />
            Email instead
          </button>
        </div>
        {message && (
          <p className={`landing-message${status === "error" ? " warning" : ""}`} role="status" aria-live="polite">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}

function LoginPage({
  onLogin,
  onCreateAccount,
  onCreateLocalAccount,
  onRequestPasswordReset,
  onCompletePasswordReset,
  demoOnly,
  workspaceNotice,
}: {
  onLogin: (role: AuthRole, email: string, password: string) => Promise<AuthResult>;
  onCreateAccount: (
    role: AuthRole,
    name: string,
    email: string,
    password: string,
  ) => Promise<AuthResult>;
  onCreateLocalAccount: (
    role: AuthRole,
    name: string,
    email: string,
    password: string,
  ) => Promise<AuthResult>;
  onRequestPasswordReset: (
    role: AuthRole,
    email: string,
  ) => Promise<{ ok: boolean; message?: string; code?: string; email?: string; name?: string }>;
  onCompletePasswordReset: (
    role: AuthRole,
    email: string,
    code: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  demoOnly: boolean;
  workspaceNotice?: WorkspaceNotice | null;
}) {
  const [authScreen, setAuthScreen] = useState<"entry" | "form">(demoOnly ? "form" : "entry");
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [role, setRole] = useState<AuthRole | null>("teacher");
  const [accountPath, setAccountPath] = useState<"individual" | "class" | null>("class");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(demoOnly ? demoTeacherEmail : "");
  const [password, setPassword] = useState(demoOnly ? "classloop-teacher" : "");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<"request" | "confirm">("request");
  const [resetCode, setResetCode] = useState("");
  const [issuedResetCode, setIssuedResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cloudConfirmation, setCloudConfirmation] = useState<CloudConfirmationPrompt | null>(null);
  const [pendingLocalAccount, setPendingLocalAccount] = useState<PendingLocalAccount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const classRole = role === "student" ? "student" : "teacher";
  const demoEmail = classRole === "teacher" ? demoTeacherEmail : demoStudentEmail;
  const demoPassword = classRole === "teacher" ? "classloop-teacher" : "classloop-student";
  const hasChosenAccount = role !== null;
  const selectedAccountLabel =
    role === "individual" ? "Individual" : role === "teacher" ? "Teacher" : role === "student" ? "Student" : "Account";
  const alternateMode = mode === "signin" ? "create" : "signin";
  const alternateModeLabel = mode === "signin" ? "Create account" : "Sign in";
  const alternateModePrompt = mode === "signin" ? "New to ClassLoop?" : "Already have an account?";

  useEffect(() => {
    if (!demoOnly || mode !== "signin") return;
    setEmail(demoEmail);
    setPassword(demoPassword);
  }, [demoEmail, demoOnly, demoPassword, mode]);

  const chooseRole = (nextRole: AuthRole) => {
    setRole(nextRole);
    setAccountPath(nextRole === "individual" ? "individual" : "class");
    setError("");
    setNotice("");
    setCloudConfirmation(null);
    setPendingLocalAccount(null);
    setResetMessage("");
  };

  const chooseAccountPath = (nextPath: "individual" | "class") => {
    setAccountPath(nextPath);
    setRole(nextPath === "individual" ? "individual" : "teacher");
    setError("");
    setNotice("");
    setCloudConfirmation(null);
    setPendingLocalAccount(null);
    setResetMessage("");
  };

  const chooseMode = (nextMode: "signin" | "create") => {
    if (demoOnly && nextMode === "create") {
      setError("Download the app to create your own account and save data. The web demo uses sample accounts only.");
      return;
    }
    setAuthScreen("form");
    setMode(nextMode);
    setRole("teacher");
    setAccountPath("class");
    setError("");
    setNotice("");
    setCloudConfirmation(null);
    setPendingLocalAccount(null);
    setPassword(demoOnly ? "classloop-teacher" : "");
    setConfirmPassword("");
    setShowPassword(false);
    setResetOpen(false);
    setEmail(demoOnly ? demoTeacherEmail : "");
    setName("");
  };

  const fillDemo = (nextRole: "teacher" | "student" = classRole) => {
    setAuthScreen("form");
    setMode("signin");
    setAccountPath("class");
    setRole(nextRole);
    setEmail(nextRole === "teacher" ? demoTeacherEmail : demoStudentEmail);
    setPassword(nextRole === "teacher" ? "classloop-teacher" : "classloop-student");
    setShowPassword(false);
    setError("");
    setNotice("");
    setCloudConfirmation(null);
    setPendingLocalAccount(null);
  };

  const closeCloudConfirmation = () => {
    setCloudConfirmation(null);
    setPendingLocalAccount(null);
  };

  const backToSignInFromCloudConfirmation = () => {
    setCloudConfirmation(null);
    setPendingLocalAccount(null);
    setAuthScreen("form");
    setMode("signin");
    setName("");
    setConfirmPassword("");
  };

  const closeResetModal = () => {
    setResetOpen(false);
    setResetStep("request");
    setResetCode("");
    setIssuedResetCode("");
    setResetPassword("");
    setResetConfirmPassword("");
    setResetMessage("");
    setShowPassword(false);
  };

  const requestReset = async () => {
    setResetMessage("");
    if (!role) {
      setResetMessage("Choose an account type before requesting a reset code.");
      return;
    }
    const result = await onRequestPasswordReset(role, email);
    setResetMessage(result.message ?? "Reset request received.");
    if (result.ok && result.code && result.email) {
      setResetStep("confirm");
      setIssuedResetCode(result.code);
      setEmail(result.email);
    }
  };

  const openResetEmailDraft = () => {
    if (!issuedResetCode || !email) return;
    const subject = encodeURIComponent("ClassLoop password reset code");
    const body = encodeURIComponent(
      `Your ClassLoop password reset code is ${issuedResetCode}.\n\nThis code expires in 15 minutes.\n`,
    );
    window.open(`mailto:${normalizeEmail(email)}?subject=${subject}&body=${body}`);
  };

  const copyResetCode = async () => {
    if (!issuedResetCode) return;
    try {
      await navigator.clipboard.writeText(issuedResetCode);
      setResetMessage("Reset code copied.");
    } catch {
      setResetMessage("Copy failed. Select the code and copy it manually.");
    }
  };

  const completeReset = async () => {
    setResetMessage("");
    if (!role) {
      setResetMessage("Choose an account type before resetting your password.");
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setResetMessage("New passwords do not match.");
      return;
    }
    const result = await onCompletePasswordReset(role, email, resetCode, resetPassword);
    setResetMessage(result.message ?? "Password reset.");
    if (result.ok) {
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
      closeResetModal();
      setNotice(result.message ?? "Password reset. You can sign in now.");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setNotice("");
    setPendingLocalAccount(null);
    if (!role) {
      setError("Choose Individual, Teacher, or Student before continuing.");
      setIsSubmitting(false);
      return;
    }
    if (mode === "create" && password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }
    try {
      const result =
        mode === "signin"
          ? await onLogin(role, email, password)
          : await onCreateAccount(role, name, email, password);
      if (result.nextMode === "signin") {
        setMode("signin");
        setName("");
        setConfirmPassword("");
        setResetOpen(false);
        if (result.email) setEmail(result.email);
        if (result.role) {
          setRole(result.role);
          setAccountPath(result.role === "individual" ? "individual" : "class");
        }
      }
      if (result.code === "email_confirmation_required") {
        if (mode === "create") {
          setPendingLocalAccount({
            role,
            name: name.trim(),
            email: result.email || normalizeEmail(email),
            password,
          });
        }
        setCloudConfirmation({
          email: result.email || normalizeEmail(email),
          redirectUrl: result.redirectUrl || getCloudEmailRedirectUrl("dashboard"),
          context: mode === "create" ? "account-create" : "cloud-login",
        });
        setNotice(result.message ?? "Confirm your email, then sign in to ClassLoop.");
        return;
      }
      if (!result.ok) {
        if (result.nextMode === "signin") {
          setNotice(result.message ?? "That email already has a ClassLoop account. Sign in instead.");
        } else {
          setError(result.message ?? "Unable to sign in.");
        }
      }
    } catch {
      setError("Unable to verify credentials in this browser.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const continueOnThisDevice = async () => {
    if (!pendingLocalAccount) {
      setCloudConfirmation(null);
      setError("Start account creation again if you want to continue without confirming email.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      const result = await onCreateLocalAccount(
        pendingLocalAccount.role,
        pendingLocalAccount.name,
        pendingLocalAccount.email,
        pendingLocalAccount.password,
      );
      if (result.ok) {
        setCloudConfirmation(null);
        setPendingLocalAccount(null);
        return;
      }
      if (result.nextMode === "signin") {
        setMode("signin");
        setName("");
        setConfirmPassword("");
        if (result.email) setEmail(result.email);
        if (result.role) {
          setRole(result.role);
          setAccountPath(result.role === "individual" ? "individual" : "class");
        }
        setNotice(result.message ?? "That email already has a ClassLoop account. Sign in instead.");
      } else {
        setError(result.message ?? "Unable to continue on this device.");
      }
    } catch {
      setError("Unable to continue on this device.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startDemo = async (nextRole: AuthRole) => {
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      const result = await onLogin(
        nextRole,
        nextRole === "teacher" ? demoTeacherEmail : demoStudentEmail,
        nextRole === "teacher" ? "classloop-teacher" : "classloop-student",
      );
      if (!result.ok) setError(result.message ?? "Unable to open the demo.");
    } catch {
      setError("Unable to open the demo in this browser.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (demoOnly) {
    return (
      <main className="login-page demo-choice-page">
        <section className="login-panel demo-choice-panel">
          <div className="login-brand">
            <span className="brand-mark">
              <BrainCircuit size={26} />
            </span>
            <div>
              <strong>ClassLoop</strong>
              <small>Web demo workspace</small>
            </div>
          </div>
          {workspaceNotice && <WorkspaceRecoveryNotice notice={workspaceNotice} />}
          <div className="login-copy demo-choice-copy">
            <span className="eyebrow">Choose a demo</span>
            <h1>Try ClassLoop as a teacher or student.</h1>
            <p>
              Pick a side to explore. This web demo resets sample work, so download the desktop app when
              you are ready to create your own account and save data.
            </p>
          </div>
          <div className="demo-choice-grid" aria-label="Choose demo side">
            <button type="button" className="demo-choice-card" onClick={() => startDemo("teacher")} disabled={isSubmitting}>
              <span>
                <UserRound size={24} />
              </span>
              <strong>{isSubmitting ? "Opening..." : "Demo teacher side"}</strong>
              <p>Review class records, publish follow-ups, and see completion insights with sample data.</p>
            </button>
            <button type="button" className="demo-choice-card" onClick={() => startDemo("student")} disabled={isSubmitting}>
              <span>
                <GraduationCap size={24} />
              </span>
              <strong>{isSubmitting ? "Opening..." : "Demo student side"}</strong>
              <p>See how a student receives recaps, tasks, resources, and progress check-ins.</p>
            </button>
          </div>
          {error && <p className="login-error">{error}</p>}
          <div className="demo-download-card">
            <div>
              <strong>Want your own saved workspace?</strong>
              <span>Create real accounts and keep data in the downloaded app.</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => { window.location.href = "/#/download"; }}>
              <Download size={17} />
              Download app
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (authScreen === "entry") {
    return (
      <main className="login-page auth-entry-page">
        <section className="auth-entry-panel" aria-labelledby="auth-entry-title">
          <div className="auth-entry-mark" aria-hidden="true">
            <BrainCircuit size={54} />
          </div>
          <div className="auth-entry-copy">
            <span className="eyebrow">Personal and classroom continuity</span>
            <h1 id="auth-entry-title">ClassLoop</h1>
            {classLoopBuildMarker() && (
              <small className="login-build-marker" title={classLoopBuildDetails()}>
                {classLoopBuildMarker()}
              </small>
            )}
          </div>
          <div className="auth-entry-actions" aria-label="Choose how to enter ClassLoop">
            <button type="button" className="primary-button" onClick={() => chooseMode("create")}>
              <UserPlus size={18} />
              Create account
            </button>
            <button type="button" className="ghost-button" onClick={() => chooseMode("signin")}>
              <KeyRound size={18} />
              Log in
            </button>
          </div>
          {workspaceNotice && <WorkspaceRecoveryNotice notice={workspaceNotice} />}
        </section>
        {cloudConfirmation && (
          <CloudEmailConfirmationOverlay
            prompt={cloudConfirmation}
            actionLabel="Back to sign in"
            onClose={closeCloudConfirmation}
            onAction={backToSignInFromCloudConfirmation}
            secondaryActionLabel={pendingLocalAccount ? (isSubmitting ? "Continuing..." : "Continue on this device") : undefined}
            secondaryActionHelper="You can use ClassLoop locally now. Multi-device sync stays unavailable until this email is confirmed."
            onSecondaryAction={continueOnThisDevice}
          />
        )}
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-header">
          <div className="login-brand">
            <span className="brand-mark">
              <BrainCircuit size={26} />
            </span>
            <div>
              <strong>ClassLoop</strong>
              <small>Personal and classroom continuity</small>
              {classLoopBuildMarker() && (
                <small className="login-build-marker" title={classLoopBuildDetails()}>
                  {classLoopBuildMarker()}
                </small>
              )}
            </div>
          </div>
          <button
            type="button"
            className="auth-mode-link"
            aria-label={`${alternateModePrompt} ${alternateModeLabel}`}
            onClick={() => chooseMode(alternateMode)}
          >
            <span>{alternateModePrompt}</span>
            {alternateModeLabel}
          </button>
        </div>
        {workspaceNotice && <WorkspaceRecoveryNotice notice={workspaceNotice} />}
        <div className="login-copy">
          <span className="eyebrow">{mode === "signin" ? "Welcome back" : "Welcome to ClassLoop"}</span>
          <h1>{mode === "signin" ? "Sign in to ClassLoop." : "Create your ClassLoop account."}</h1>
          <p>
            {mode === "signin"
              ? "Choose your account type first, then use the email and password for that workspace."
              : "Start with personal meetings for your own follow-through, or class workflows for teacher-reviewed student updates."}
          </p>
        </div>
        <form className="login-form" onSubmit={submit}>
          {demoOnly && (
            <p className="demo-login-note">
              Web demo mode uses sample credentials only. Your changes will reset and will not be saved.
            </p>
          )}
          {!demoOnly && (
            <div className="role-tabs account-path-tabs" role="tablist" aria-label="Choose workspace type">
              <button
                type="button"
                role="tab"
                aria-selected={accountPath === "individual"}
                className={accountPath === "individual" ? "active" : ""}
                onClick={() => chooseAccountPath("individual")}
              >
                <UserRound size={17} />
                Individual
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={accountPath === "class"}
                className={accountPath === "class" ? "active" : ""}
                onClick={() => chooseAccountPath("class")}
              >
                <BookOpen size={17} />
                Class
              </button>
            </div>
          )}
          {accountPath === "class" && (
            <div className="role-tabs" role="tablist" aria-label="Choose class role">
              <button
                type="button"
                role="tab"
                aria-selected={role === "teacher"}
                className={role === "teacher" ? "active" : ""}
                onClick={() => chooseRole("teacher")}
              >
                <UserRound size={17} />
                Teacher
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={role === "student"}
                className={role === "student" ? "active" : ""}
                onClick={() => chooseRole("student")}
              >
                <GraduationCap size={17} />
                Student
              </button>
            </div>
          )}
          {accountPath === "individual" && (
            <p className="demo-login-note">
              Individual accounts are free and focused on your own pasted meeting minutes, recap, and tasks.
            </p>
          )}
          {hasChosenAccount && (
            <>
              {mode === "create" && (
                <label className="field compact">
                  <span>Name</span>
                  <div className="input-with-icon">
                    <UserRound size={17} />
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
                  </div>
                </label>
              )}
              <label className="field compact">
                <span>Email</span>
                <div className="input-with-icon">
                  <Mail size={17} />
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
                </div>
              </label>
              <label className="field compact">
                <span>Password</span>
                <div className="input-with-icon password-control">
                  <KeyRound size={17} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter password"
                  />
                  <button type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {mode === "signin" && !demoOnly && (
                <button
                  type="button"
                  className="text-button forgot-password-link"
                  onClick={() => {
                    setResetOpen(true);
                    setResetStep("request");
                    setResetMessage("");
                  }}
                >
                  Forgot password?
                </button>
              )}
              {mode === "create" && (
                <label className="field compact">
                  <span>Confirm password</span>
                  <div className="input-with-icon password-control">
                    <KeyRound size={17} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((show) => !show)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
              )}
            </>
          )}
          {error && <p className="login-error">{error}</p>}
          {notice && <p className="login-success">{notice}</p>}
          {hasChosenAccount && (
            <button className="primary-button full" type="submit" disabled={isSubmitting}>
              <KeyRound size={17} />
              {isSubmitting ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          )}
        </form>
        {cloudConfirmation && (
          <CloudEmailConfirmationOverlay
            prompt={cloudConfirmation}
            actionLabel="Back to sign in"
            onClose={closeCloudConfirmation}
            onAction={backToSignInFromCloudConfirmation}
            secondaryActionLabel={pendingLocalAccount ? (isSubmitting ? "Continuing..." : "Continue on this device") : undefined}
            secondaryActionHelper="You can use ClassLoop locally now. Multi-device sync stays unavailable until this email is confirmed."
            onSecondaryAction={continueOnThisDevice}
          />
        )}
        {mode === "create" && (
          <div className="login-help sample-account-panel">
            <strong>Want to look around first?</strong>
            <span>Sample accounts open with demo classroom data and do not replace your real account.</span>
            <div className="sample-account-actions">
              <button type="button" className="text-button sample-account-button" onClick={() => fillDemo("teacher")}>
                Use sample teacher account
                <ChevronRight size={16} />
              </button>
              <button type="button" className="text-button sample-account-button" onClick={() => fillDemo("student")}>
                Use sample student account
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </section>
      {mode === "signin" && resetOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Reset password">
          <section className="password-reset-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Account recovery</span>
                <h2>Reset password</h2>
                <p>Choose the account, get a short reset code, then set a new password.</p>
              </div>
              <button type="button" className="text-button" onClick={closeResetModal}>
                Close
              </button>
            </div>
            <div className="reset-account-row">
              <span>{selectedAccountLabel} account</span>
              <strong>{email || "Enter email on the sign-in form"}</strong>
            </div>
            {resetStep === "request" ? (
              <button type="button" className="primary-button full" onClick={requestReset}>
                <KeyRound size={17} />
                Get reset code
              </button>
            ) : (
              <div className="reset-confirm-grid">
                {issuedResetCode && (
                  <div className="reset-code-card">
                    <span>Reset code</span>
                    <button type="button" onClick={copyResetCode}>{issuedResetCode}</button>
                  </div>
                )}
                <button type="button" className="ghost-button full" onClick={openResetEmailDraft}>
                  <Mail size={17} />
                  Open email draft
                </button>
                <label className="field compact">
                  <span>Code</span>
                  <input value={resetCode} onChange={(event) => setResetCode(event.target.value)} placeholder="6-digit code" />
                </label>
                <label className="field compact">
                  <span>New password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    placeholder="New password"
                  />
                </label>
                <label className="field compact">
                  <span>Confirm new password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={resetConfirmPassword}
                    onChange={(event) => setResetConfirmPassword(event.target.value)}
                    placeholder="Confirm new password"
                  />
                </label>
                <button type="button" className="primary-button full" onClick={completeReset}>
                  <KeyRound size={17} />
                  Reset password
                </button>
              </div>
            )}
            {resetMessage && (
              <p className={/incorrect|expired|match|enter|failed/i.test(resetMessage) ? "settings-message" : "settings-message success"}>
                {resetMessage}
              </p>
            )}
          </section>
        </div>
      )}
      <section className="login-side">
        <div className="security-card">
          <span>
            <ShieldCheck size={22} />
          </span>
          <strong>Private by default</strong>
          <p>Class notes, participation signals, and follow-ups stay in your workspace until you publish them.</p>
        </div>
        <div className="security-card">
          <span>
            <LockIcon />
          </span>
          <strong>Student-specific sharing</strong>
          <p>Students only receive the recap, resources, and tasks connected to their own roster account.</p>
        </div>
      </section>
    </main>
  );
}

function LockIcon() {
  return <KeyRound size={22} />;
}

function WorkspaceRecoveryNotice({ notice }: { notice: WorkspaceNotice }) {
  const Icon = notice.severity === "error" ? CircleAlert : notice.severity === "warning" ? AlertTriangle : CheckCircle2;
  return (
    <section
      className={`workspace-recovery-notice ${notice.severity}`}
      role={notice.severity === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon size={18} />
      <div>
        <strong>{notice.title}</strong>
        <span>{notice.message}</span>
      </div>
    </section>
  );
}

function AppLoader({
  message,
  steps,
  notice,
}: {
  message: string;
  steps: BootStep[];
  notice?: WorkspaceNotice | null;
}) {
  const tip = loadingTips[Math.floor(Date.now() / 1000) % loadingTips.length];
  const currentStep =
    steps.find((step) => ["error", "warning", "active"].includes(step.status)) ??
    steps.find((step) => step.status === "pending") ??
    steps[steps.length - 1];
  return (
    <main className="app-loader" aria-busy="true" aria-live="polite">
      <section className="loader-card" role="status" aria-label="ClassLoop loading">
        <span className="loader-ring" aria-hidden="true">
          <BrainCircuit size={30} />
        </span>
        <span className="eyebrow">ClassLoop</span>
        <h1>{message}</h1>
        <p className="loader-status">
          <strong>{currentStep?.label ?? "Preparing workspace"}</strong>
          <span>{currentStep?.detail ?? "Getting the app ready."}</span>
        </p>
        {notice && <WorkspaceRecoveryNotice notice={notice} />}
        <div className="loader-track" aria-hidden="true">
          <i />
        </div>
        <p className="loader-tip">{tip}</p>
      </section>
    </main>
  );
}

function MeetingCaptureHelpModal({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="meeting-capture-title">
      <section className="password-reset-modal capture-help-modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Online meeting capture</span>
            <h2 id="meeting-capture-title">Share the meeting tab or window with audio.</h2>
            <p>
              Your browser will ask what to capture. Choose the tab or window where Zoom, Meet, or Teams is running, enable audio sharing if it appears, then keep ClassLoop open.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close meeting capture help">
            <CircleAlert size={18} />
          </button>
        </div>
        <ol className="tutorial-steps">
          <li>
            <strong>Click Start capture</strong>
            <span>ClassLoop will request screen or tab audio if your browser supports it.</span>
          </li>
          <li>
            <strong>Pick the meeting source</strong>
            <span>Select the meeting tab/window and turn on shared audio when prompted.</span>
          </li>
          <li>
            <strong>Paste the platform transcript after class</strong>
            <span>Live capture is useful for notes, but the meeting transcript is still the most reliable source.</span>
          </li>
        </ol>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            Not now
          </button>
          <button className="primary-button" type="button" onClick={onStart}>
            <PlayCircle size={17} />
            Start capture
          </button>
        </div>
      </section>
    </div>
  );
}

function GuidedWalkthroughOverlay({
  auth,
  stepIndex,
  setStepIndex,
  onClose,
}: {
  auth: AuthSession;
  stepIndex: number;
  setStepIndex: (value: number | ((current: number) => number)) => void;
  onClose: () => void;
}) {
  const homeRoute = auth.role === "teacher" ? "dashboard" : auth.role === "individual" ? "personal-dashboard" : "student";
  const steps =
    auth.role === "teacher"
      ? [
          {
            title: "Start on the dashboard",
            detail: "This is your daily home base. Click New session when you have a transcript, notes, or recording.",
            route: "dashboard" as RouteKey,
            position: "top-left",
            target: '[data-tour="dashboard-overview"]',
          },
          {
            title: "Create the session",
            detail: "Pick a template, preload a class roster, then choose transcript, in-person capture, or online meeting capture.",
            route: "new-session" as RouteKey,
            position: "top-right",
            target: '[data-tour="new-session-button"]',
          },
          {
            title: "Review before publishing",
            detail: "Check speaker matches, edit the recap, and preview what each student will see.",
            route: "review" as RouteKey,
            position: "center",
            target: '[data-tour="nav-review"]',
          },
          {
            title: "Track follow-through",
            detail: "After publishing, analytics and reports show completion, quiet flags, and support needs.",
            route: "analytics" as RouteKey,
            position: "bottom-right",
            target: '[data-tour="nav-analytics"]',
          },
        ]
      : [
          {
            title: "Open your portal",
            detail: "Your dashboard shows the latest recap, assigned tasks, and resources from your teacher.",
            route: "student" as RouteKey,
            position: "top-left",
            target: '[data-tour="nav-student"], .student-hero',
          },
          {
            title: "Check the session detail",
            detail: "Open a class to see what changed, what is due, and which resources to use.",
            route: "student-session" as RouteKey,
            position: "center",
            target: ".today-card",
          },
          {
            title: "Mark progress",
            detail: "Update your task status so your teacher can see what still needs support.",
            route: "student" as RouteKey,
            position: "bottom-right",
            target: ".today-card .primary-button",
          },
        ];
  const activeStep = steps[stepIndex] ?? steps[0];
  const isLast = stepIndex >= steps.length - 1;
  const [highlightStyle, setHighlightStyle] = useState<TourRect | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const [areaVisitStarted, setAreaVisitStarted] = useState(false);
  const popoverRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setAreaVisitStarted(false);
  }, [stepIndex]);

  useLayoutEffect(() => {
    let frameId = 0;
    const measureTarget = () => {
      const target = document.querySelector<HTMLElement>(activeStep.target);
      if (!target) {
        setHighlightStyle(null);
        setPopoverStyle(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const padding = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportInset = 18;
      const highlightLeft = Math.max(12, rect.left - padding);
      const highlightTop = Math.max(12, rect.top - padding);
      const highlightRight = Math.min(viewportWidth - 12, rect.right + padding);
      const highlightBottom = Math.min(viewportHeight - 12, rect.bottom + padding);
      const highlight: TourRect = {
        left: highlightLeft,
        top: highlightTop,
        width: Math.max(0, highlightRight - highlightLeft),
        height: Math.max(0, highlightBottom - highlightTop),
      };
      if (viewportWidth <= 920) {
        setHighlightStyle(highlight);
        setPopoverStyle(null);
        return;
      }
      const popoverWidth = Math.min(430, viewportWidth - viewportInset * 2);
      const measuredPopoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 280;
      const popoverHeight = Math.min(Math.max(220, measuredPopoverHeight), viewportHeight - viewportInset * 2);
      const gap = 18;
      const maxPopoverLeft = Math.max(viewportInset, viewportWidth - popoverWidth - viewportInset);
      const maxPopoverTop = Math.max(viewportInset, viewportHeight - popoverHeight - viewportInset);
      const clampLeft = (value: number) => Math.min(Math.max(viewportInset, value), maxPopoverLeft);
      const clampTop = (value: number) => Math.min(Math.max(viewportInset, value), maxPopoverTop);
      const overlapsHighlight = (candidate: { left: number; top: number }) => {
        const candidateRight = candidate.left + popoverWidth;
        const candidateBottom = candidate.top + popoverHeight;
        return !(
          candidateRight + gap <= highlight.left ||
          candidate.left >= highlight.left + highlight.width + gap ||
          candidateBottom + gap <= highlight.top ||
          candidate.top >= highlight.top + highlight.height + gap
        );
      };
      const overlapArea = (candidate: { left: number; top: number }) => {
        const right = candidate.left + popoverWidth;
        const bottom = candidate.top + popoverHeight;
        const overlapWidth = Math.max(
          0,
          Math.min(right, highlight.left + highlight.width) - Math.max(candidate.left, highlight.left),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(bottom, highlight.top + highlight.height) - Math.max(candidate.top, highlight.top),
        );
        return overlapWidth * overlapHeight;
      };
      const candidates = [
        { left: highlight.left + highlight.width + gap, top: highlight.top },
        { left: highlight.left - popoverWidth - gap, top: highlight.top },
        { left: highlight.left, top: highlight.top + highlight.height + gap },
        { left: highlight.left + highlight.width - popoverWidth, top: highlight.top + highlight.height + gap },
        { left: highlight.left, top: highlight.top - popoverHeight - gap },
        { left: highlight.left + highlight.width - popoverWidth, top: highlight.top - popoverHeight - gap },
        { left: viewportInset, top: viewportInset },
        { left: viewportWidth - popoverWidth - viewportInset, top: viewportInset },
        { left: viewportInset, top: viewportHeight - popoverHeight - viewportInset },
        { left: viewportWidth - popoverWidth - viewportInset, top: viewportHeight - popoverHeight - viewportInset },
      ];
      const positionedCandidates = candidates.map((candidate) => ({
        left: clampLeft(candidate.left),
        top: clampTop(candidate.top),
      }));
      const popoverPosition =
        positionedCandidates.find((candidate) => !overlapsHighlight(candidate)) ??
        positionedCandidates.sort((a, b) => overlapArea(a) - overlapArea(b))[0] ?? {
          left: viewportInset,
          top: viewportInset,
        };

      setHighlightStyle(highlight);
      setPopoverStyle({ left: popoverPosition.left, top: popoverPosition.top, width: popoverWidth });
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measureTarget);
    };

    measureTarget();
    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [activeStep.target, areaVisitStarted, stepIndex]);

  const backdropPieces = highlightStyle
    ? [
        { left: 0, top: 0, width: "100vw", height: highlightStyle.top },
        { left: 0, top: highlightStyle.top, width: highlightStyle.left, height: highlightStyle.height },
        {
          left: highlightStyle.left + highlightStyle.width,
          top: highlightStyle.top,
          width: `calc(100vw - ${highlightStyle.left + highlightStyle.width}px)`,
          height: highlightStyle.height,
        },
        {
          left: 0,
          top: highlightStyle.top + highlightStyle.height,
          width: "100vw",
          height: `calc(100vh - ${highlightStyle.top + highlightStyle.height}px)`,
        },
      ]
    : [];
  const cornerSize = 24;
  const cornerPieces = highlightStyle
    ? [
        {
          className: "top-left",
          style: { left: highlightStyle.left, top: highlightStyle.top, width: cornerSize, height: cornerSize },
        },
        {
          className: "top-right",
          style: {
            left: highlightStyle.left + highlightStyle.width - cornerSize,
            top: highlightStyle.top,
            width: cornerSize,
            height: cornerSize,
          },
        },
        {
          className: "bottom-left",
          style: {
            left: highlightStyle.left,
            top: highlightStyle.top + highlightStyle.height - cornerSize,
            width: cornerSize,
            height: cornerSize,
          },
        },
        {
          className: "bottom-right",
          style: {
            left: highlightStyle.left + highlightStyle.width - cornerSize,
            top: highlightStyle.top + highlightStyle.height - cornerSize,
            width: cornerSize,
            height: cornerSize,
          },
        },
      ]
    : [];

  return (
    <div className="guided-tour" role="dialog" aria-modal="true" aria-label="ClassLoop guided walkthrough">
      {highlightStyle ? (
        <>
          {backdropPieces.map((piece, index) => (
            <div key={index} className="tour-backdrop-piece" style={piece} aria-hidden="true" />
          ))}
          {cornerPieces.map((piece) => (
            <div
              key={piece.className}
              className={`tour-corner-mask ${piece.className}`}
              style={piece.style}
              aria-hidden="true"
            />
          ))}
        </>
      ) : (
        <div className="tour-backdrop-full" aria-hidden="true" />
      )}
      <div
        className={`tour-highlight ${highlightStyle ? "anchored" : activeStep.position}`}
        style={(highlightStyle as CSSProperties | null) ?? undefined}
        aria-hidden="true"
      />
      <section
        ref={popoverRef}
        className={`tour-popover ${popoverStyle ? "anchored" : activeStep.position}`}
        style={popoverStyle ?? undefined}
      >
        <span className="eyebrow">Step {stepIndex + 1} of {steps.length}</span>
        <h2>{activeStep.title}</h2>
        <p>{activeStep.detail}</p>
        <div className="walkthrough-progress-bar" aria-label={`Walkthrough progress ${Math.round(((stepIndex + 1) / steps.length) * 100)}%`}>
          <i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="tour-actions">
          <button className="ghost-button" type="button" onClick={onClose}>
            Skip
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              if (areaVisitStarted) {
                navigate(homeRoute);
                setAreaVisitStarted(false);
                return;
              }
              navigate(activeStep.route);
              setAreaVisitStarted(true);
            }}
          >
            {areaVisitStarted ? "Return home" : "Go to this area"}
            <ChevronRight size={16} />
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => (isLast ? onClose() : setStepIndex((current) => Math.min(steps.length - 1, current + 1)))}
          >
            {isLast ? "Finish" : "Next"}
            <ChevronRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function Sidebar({
  route,
  auth,
  onLogout,
  showDemoCard,
}: {
  route: RouteKey;
  auth: AuthSession;
  onLogout: () => void;
  showDemoCard: boolean;
}) {
  const visibleNavSections =
    auth.role === "teacher" ? teacherNavSections : auth.role === "individual" ? individualNavSections : studentNavSections;
  const homeRoute: RouteKey = auth.role === "teacher" ? "dashboard" : auth.role === "individual" ? "personal-dashboard" : "student";
  return (
    <aside className="sidebar">
      <button
        className="brand"
        onClick={() => navigate(homeRoute)}
        aria-label="Go to dashboard"
      >
        <span className="brand-mark">
          <BrainCircuit size={24} />
        </span>
        <span>
          <strong>ClassLoop</strong>
          <small>{auth.role === "individual" ? "Personal meetings" : "Classroom continuity"}</small>
        </span>
      </button>
      <nav className="nav-list" aria-label="Primary">
        {visibleNavSections.map((section) => (
          <div className="nav-section" key={section.label}>
            <span className="nav-section-label">{section.label}</span>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = route === item.route;
              return (
                <button
                  key={item.route}
                  className={active ? "nav-item active" : "nav-item"}
                  data-tour={`nav-${item.route}`}
                  onClick={() => navigate(item.route)}
                >
                  <Icon size={19} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {showDemoCard && (
        <section className="sidebar-panel">
          <div className="mini-visual" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>Demo scenario</p>
          <strong>Geometry review</strong>
          <small>Transcript to student follow-ups in one flow.</small>
        </section>
      )}
      <button className="logout-button" onClick={onLogout}>
        <LogOut size={17} />
        Sign out
      </button>
    </aside>
  );
}

function DemoAccountBanner() {
  return (
    <div className="demo-account-banner" role="status">
      <div>
        <strong>You are on a demo account.</strong>
        <span>Please download the app to create your own account, save data, and keep your classroom workspace.</span>
      </div>
    </div>
  );
}

function Topbar({
  route,
  latestSession,
  auth,
  syncStatus,
  onUpdateAccount,
  onStartWalkthrough,
}: {
  route: RouteKey;
  latestSession?: Session;
  auth: AuthSession;
  syncStatus: SyncStatus;
  onUpdateAccount: (settings: AccountSettingsInput) => Promise<{ ok: boolean; message?: string }>;
  onStartWalkthrough: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <header
      className="topbar"
      data-tour={auth.role === "teacher" && route === "dashboard" ? "dashboard-overview" : undefined}
    >
      <div>
        <span className="eyebrow">{routeLabels[route]}</span>
        <h1>
          {auth.role === "student"
            ? "My ClassLoop"
            : auth.role === "individual"
              ? route === "personal-dashboard"
                ? "Personal meetings"
                : routeLabels[route]
            : route === "dashboard"
              ? "Today in ClassLoop"
              : routeLabels[route]}
        </h1>
      </div>
      <div className="topbar-actions">
        <div className="profile-control">
          <button className="account-pill" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
            {auth.role === "student" ? <GraduationCap size={16} /> : <UserRound size={16} />}
            {auth.name}
          </button>
          {profileOpen && (
            <ProfileMenu auth={auth} syncStatus={syncStatus} onUpdateAccount={onUpdateAccount} onClose={() => setProfileOpen(false)} />
          )}
        </div>
        {auth.role === "teacher" && (
          <>
            <button
              className="icon-button tutorial-button"
              type="button"
              onClick={onStartWalkthrough}
              aria-label="Open interactive walkthrough"
              title="Open interactive walkthrough"
            >
              <Lightbulb size={18} />
            </button>
            <button
              className="primary-button"
              data-tour="new-session-button"
              onClick={() => navigate("new-session")}
              aria-label={latestSession ? `Create a new session after ${latestSession.title}` : "Create a new session"}
            >
              <PlusCircle size={18} />
              New session
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function ProfileMenu({
  auth,
  syncStatus,
  onUpdateAccount,
  onClose,
}: {
  auth: AuthSession;
  syncStatus: SyncStatus;
  onUpdateAccount: (settings: AccountSettingsInput) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState(auth.name);
  const [email, setEmail] = useState(auth.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (newPassword && newPassword !== confirmPassword) {
      setMessage("New passwords do not match.");
      return;
    }
    setSaving(true);
    const result = await onUpdateAccount({ name, email, currentPassword, newPassword });
    setSaving(false);
    setMessage(result.message ?? (result.ok ? "Settings saved." : "Unable to save settings."));
    if (result.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <form className="profile-menu" onSubmit={saveSettings}>
      <div className="profile-menu-header">
        <div>
          <strong>Profile settings</strong>
          <small>{syncStatus === "shared" ? "Saved on this device" : "Saved in this browser"}</small>
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          Done
        </button>
      </div>
      <label className="field compact">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field compact">
        <span>Email</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field compact">
        <span>Current password</span>
        <div className="input-with-icon password-control">
          <KeyRound size={17} />
          <input
            type={showPassword ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Required to change password"
          />
          <button type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <label className="field compact">
        <span>New password</span>
        <input
          type={showPassword ? "text" : "password"}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Leave blank to keep current"
        />
      </label>
      <label className="field compact">
        <span>Confirm new password</span>
        <input
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Confirm new password"
        />
      </label>
      {message && <p className={message.includes("saved") ? "settings-message success" : "settings-message"}>{message}</p>}
      <div className="profile-actions">
        <button type="button" className="ghost-button" onClick={() => navigate("appearance")}>
          <Palette size={17} />
          Appearance
        </button>
        <button className="primary-button" type="submit" disabled={saving}>
          <Save size={17} />
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}

function TeacherDashboard({
  sessions,
  draft,
  billingProfile,
}: {
  sessions: Session[];
  draft: Session | null;
  billingProfile: BillingProfile;
}) {
  const latest = sessions[0];
  const published = sessions.filter((session) => session.status === "published");
  const hasSessions = sessions.length > 0;
  const latestRoster = latest?.students ?? [];
  const overdue = latest?.followUps.filter((followUp) => followUp.status === "overdue") ?? [];
  const absentStudents = latest ? Object.entries(latest.attendance).filter(([, status]) => status === "absent") : [];
  const quietStudents = latest?.participationEvents.filter((event) => event.approved && event.type === "quiet") ?? [];
  const hasAttention = absentStudents.length > 0 || quietStudents.length > 0 || overdue.length > 0;
  const currentPlanTier: PlanTier = isPaidPlan(billingProfile) ? "pro" : "free";
  const reviewDraft = draft?.status === "draft" ? draft : null;
  const draftNeedsReview = Boolean(reviewDraft);
  const draftBlockingWarnings = reviewDraft ? unresolvedBlockingImportWarnings(reviewDraft).length : 0;
  const submittedCheckIns = latest?.submissions?.filter((submission) => submission.status === "submitted").length ?? 0;
  const sessionsToday =
    sessions.filter((session) => localDayKey(session.date) === localDayKey()).length +
    (reviewDraft && localDayKey(reviewDraft.date) === localDayKey() ? 1 : 0);
  const freeLimitReached = currentPlanTier === "free" && sessionsToday >= 1;
  const supportSignalCount = absentStudents.length + quietStudents.length;
  const publishedCompletionRate = completionRate(published);
  const assistantBrief = buildTeacherAssistantBrief({
    hasSessions,
    latestTitle: latest?.title,
    reviewDraftTitle: reviewDraft?.title,
    draftBlockingWarnings,
    submittedCheckIns,
    overdueCount: overdue.length,
    supportSignalCount,
    freeLimitReached,
    publishedCount: published.length,
    completionRate: publishedCompletionRate,
  });
  const assistantActions: TeacherAssistantAction[] = [];
  const assistantDrafts = buildTeacherAssistantDrafts({
    latest,
    reviewDraft,
    overdue,
    absentStudents,
    quietStudents,
  });
  const [draftCopyMessage, setDraftCopyMessage] = useState("");

  const copyAssistantDraft = async (assistantDraft: TeacherAssistantDraft) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(assistantDraft.body);
      setDraftCopyMessage(`${assistantDraft.title} copied.`);
      window.setTimeout(() => setDraftCopyMessage(""), 2200);
    } catch {
      setDraftCopyMessage("Copy was blocked. Select the draft text and copy it manually.");
    }
  };

  if (reviewDraft) {
    assistantActions.push({
      id: "review-draft",
      icon: draftBlockingWarnings > 0 ? CircleAlert : Sparkles,
      title: draftBlockingWarnings > 0 ? "Review import warnings before publishing" : "Finish the current class draft",
      detail:
        draftBlockingWarnings > 0
          ? `${draftBlockingWarnings} import ${draftBlockingWarnings === 1 ? "warning needs" : "warnings need"} a teacher decision before students see it.`
          : `${reviewDraft.title} is ready for recap, due-date, and student follow-up review.`,
      action: "Review draft",
      onAction: () => navigate("review"),
      tone: draftBlockingWarnings > 0 ? "warning" : "primary",
    });
  }

  if (!hasSessions && !draftNeedsReview) {
    assistantActions.push({
      id: "first-session",
      icon: Wand2,
      title: "Create the first class follow-up",
      detail: "Paste a transcript or notes so every student gets a reviewed recap, tasks, and resources.",
      action: "Start",
      onAction: () => navigate("new-session"),
      tone: "primary",
    });
  }

  if (submittedCheckIns > 0 && latest) {
    assistantActions.push({
      id: "review-submissions",
      icon: CheckCircle2,
      title: `Review ${submittedCheckIns} submitted ${submittedCheckIns === 1 ? "check-in" : "check-ins"}`,
      detail: `${latest.title} has student work ready for teacher feedback.`,
      action: "Open",
      onAction: () => navigate("student-session", { session: latest.id }),
      tone: "primary",
    });
  }

  if (overdue.length > 0 && latest) {
    assistantActions.push({
      id: "overdue-followups",
      icon: Clock3,
      title: `Review ${overdue.length} overdue ${overdue.length === 1 ? "follow-up" : "follow-ups"}`,
      detail: `${latest.title} has reminders that may need a quick teacher nudge.`,
      action: "Open",
      onAction: () => navigate("student-session", { session: latest.id }),
      tone: "warning",
    });
  }

  if (supportSignalCount > 0 && latest) {
    assistantActions.push({
      id: "support-signals",
      icon: AlertTriangle,
      title: `Check ${supportSignalCount} support ${supportSignalCount === 1 ? "signal" : "signals"}`,
      detail: "Quiet and absent signals are grouped for a fast teacher touchpoint before the next class.",
      action: "Analytics",
      onAction: () => navigate("analytics"),
      tone: "warning",
    });
  }

  if (freeLimitReached && assistantActions.length < 3) {
    assistantActions.push({
      id: "free-limit",
      icon: ShieldCheck,
      title: "Today's free session is used",
      detail: "Keep reviewing today's class now; Pro unlocks unlimited daily processing when you are ready.",
      action: "View plan",
      onAction: () => navigate("billing"),
      tone: "calm",
    });
  }

  if (hasSessions && !freeLimitReached && assistantActions.length < 3) {
    assistantActions.push({
      id: "next-session",
      icon: PlusCircle,
      title: "Capture the next class record",
      detail: "Start a fresh transcript or notes pass with your saved classroom context close by.",
      action: "New session",
      onAction: () => navigate("new-session"),
      tone: "calm",
    });
  }

  if (published.length > 0 && assistantActions.length < 3) {
    assistantActions.push({
      id: "trend-review",
      icon: LineChart,
      title: "Scan the follow-through trend",
      detail: "Use completion and participation patterns to plan the next support pass.",
      action: "Analytics",
      onAction: () => navigate("analytics"),
      tone: "calm",
    });
  }

  const visibleAssistantActions = assistantActions.slice(0, 3);

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="eyebrow">Live class follow-up loop</span>
          <h2>Turn class records into reviewed recaps, tasks, and check-ins.</h2>
          <p>
            Review what happened, who needs support, and what should happen next before students see it.
          </p>
          <div className="hero-actions" data-tour="dashboard-hero">
            <button className="primary-button large" onClick={() => navigate("new-session")}>
              <Wand2 size={19} />
              Create a session
            </button>
            {draftNeedsReview && (
              <button className="ghost-button large" onClick={() => navigate("review")}>
                <Sparkles size={18} />
                Continue draft
              </button>
            )}
          </div>
        </div>
        {hasSessions && <TranscriptTransformVisual />}
      </section>

      {hasSessions && (
        <section className="metric-grid">
          <MetricCard
            icon={ClipboardCheck}
            label="Published sessions"
            value={published.length.toString()}
            detail="This month"
            accent="green"
          />
          <MetricCard
            icon={Target}
            label="Follow-through"
            value={`${publishedCompletionRate}%`}
            detail="Completed student check-ins"
            accent="blue"
          />
          <MetricCard
            icon={CircleAlert}
            label="Needs attention"
            value={attentionCount(sessions).toString()}
            detail="Quiet, absent, or overdue"
            accent="amber"
          />
          <MetricCard
            icon={MessageSquare}
            label="Participation"
            value={latest ? `${classParticipationRate(latest)}%` : "0%"}
            detail="Present students with signals"
            accent="rose"
          />
        </section>
      )}

      <Panel title="Assistant next steps" icon={BrainCircuit}>
        <section className={`assistant-brief ${assistantBrief.tone}`} aria-label="Teacher assistant brief">
          <div className="assistant-brief-main">
            <span className="eyebrow">Teacher assistant brief</span>
            <strong>{assistantBrief.title}</strong>
            <p>{assistantBrief.detail}</p>
          </div>
          <div className="assistant-brief-facts">
            {assistantBrief.facts.map((fact) => (
              <div className="assistant-brief-fact" key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
                <small>{fact.detail}</small>
              </div>
            ))}
          </div>
        </section>
        <div className="assistant-action-list">
          {visibleAssistantActions.map((action) => (
            <AssistantActionItem key={action.id} action={action} />
          ))}
        </div>
      </Panel>

      <Panel title="Assistant drafts" icon={ClipboardCheck}>
        <section className="assistant-draft-list" aria-label="Copy-ready assistant drafts">
          {assistantDrafts.map((assistantDraft) => (
            <AssistantDraftCard
              key={assistantDraft.id}
              assistantDraft={assistantDraft}
              onCopy={() => void copyAssistantDraft(assistantDraft)}
            />
          ))}
        </section>
        {draftCopyMessage && (
          <p className="settings-message success" role="status">
            {draftCopyMessage}
          </p>
        )}
      </Panel>

      <section className="content-grid two-columns">
        <Panel title="Recent sessions" icon={CalendarDays} action="View report" onAction={() => navigate("report")}>
          {hasSessions ? (
            <div className="session-list">
              {sessions.slice(0, 4).map((session) => (
                <button
                  key={session.id}
                  className="session-row"
                  onClick={() => navigate("report", { session: session.id })}
                >
                  <span className="session-icon">
                    <BookOpen size={18} />
                  </span>
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {formatDate(session.date)} · {session.type}
                    </small>
                  </span>
                  <StatusPill status={session.status === "published" ? "complete" : "in_progress"} />
                </button>
              ))}
            </div>
          ) : (
            <InlineEmpty
              icon={BookOpen}
              title="No sessions yet"
              detail="Create a session or load the geometry sample to populate this dashboard."
              action="New session"
              onAction={() => navigate("new-session")}
            />
          )}
        </Panel>

        <Panel title="Attention queue" icon={AlertTriangle} action="Open analytics" onAction={() => navigate("analytics")}>
          {hasSessions ? (
            <div className="attention-list">
              {hasAttention ? (
                <>
                  {absentStudents.map(([studentId]) => (
                    <AttentionItem
                      key={studentId}
                      icon={UserX}
                      title={`${studentById(studentId, latestRoster).name} missed the latest session`}
                      detail="Catch-up recap and review video assigned."
                    />
                  ))}
                  {quietStudents.map((event) => (
                    <AttentionItem
                      key={event.id}
                      icon={Mic2}
                      title={`${studentById(event.studentId, latestRoster).name} was quiet`}
                      detail="Confidence check-in and practice pair recommended."
                    />
                  ))}
                  {overdue.slice(0, 2).map((followUp) => (
                    <AttentionItem
                      key={`${followUp.studentId}-${followUp.dueDate}`}
                      icon={Clock3}
                      title={`${studentById(followUp.studentId, latestRoster).name} has an overdue check-in`}
                      detail={followUp.reminder}
                    />
                  ))}
                </>
              ) : (
                <SupportSnapshotChart session={latest} />
              )}
            </div>
          ) : (
            <InlineEmpty
              icon={AlertTriangle}
              title="No student signals yet"
              detail="Attendance, quiet flags, and overdue follow-ups appear after a session is published."
            />
          )}
        </Panel>
      </section>

      <section className="content-grid two-columns">
        <Panel title="Completion trend" icon={LineChart}>
          {hasSessions ? (
            <TrendChart sessions={published} />
          ) : (
            <InlineEmpty
              icon={LineChart}
              title="No trend data yet"
              detail="Completion trends start once students receive follow-ups."
            />
          )}
        </Panel>
        <Panel title="Current plan" icon={ShieldCheck} action="View options" onAction={() => navigate("billing")}>
          <div className="plan-stack">
            {planCatalog.map((plan) => (
              <PlanRow
                key={plan.tier}
                tier={plan.name}
                detail={plan.detail}
                price={plan.price}
                current={currentPlanTier === plan.tier}
              />
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

type TeacherAssistantAction = {
  id: string;
  icon: typeof LayoutDashboard;
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  tone: "primary" | "warning" | "calm";
};

type TeacherAssistantDraft = {
  id: string;
  icon: typeof LayoutDashboard;
  title: string;
  label: string;
  body: string;
  tone: "primary" | "warning" | "calm";
};

type TeacherAssistantBrief = {
  title: string;
  detail: string;
  tone: "primary" | "warning" | "calm";
  facts: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
};

function buildTeacherAssistantBrief({
  hasSessions,
  latestTitle,
  reviewDraftTitle,
  draftBlockingWarnings,
  submittedCheckIns,
  overdueCount,
  supportSignalCount,
  freeLimitReached,
  publishedCount,
  completionRate,
}: {
  hasSessions: boolean;
  latestTitle?: string;
  reviewDraftTitle?: string;
  draftBlockingWarnings: number;
  submittedCheckIns: number;
  overdueCount: number;
  supportSignalCount: number;
  freeLimitReached: boolean;
  publishedCount: number;
  completionRate: number;
}): TeacherAssistantBrief {
  const openSupportCount = overdueCount + supportSignalCount;
  const facts = [
    {
      label: "Drafts",
      value: reviewDraftTitle ? "1" : "0",
      detail: reviewDraftTitle ? "Needs review" : "None waiting",
    },
    {
      label: "Check-ins",
      value: submittedCheckIns.toString(),
      detail: submittedCheckIns ? "Ready to review" : "No submissions",
    },
    {
      label: "Support",
      value: openSupportCount.toString(),
      detail: openSupportCount ? "Needs a touchpoint" : "No urgent flags",
    },
    {
      label: "Completion",
      value: `${completionRate}%`,
      detail: publishedCount ? "Across published sessions" : "Starts after publish",
    },
  ];

  if (reviewDraftTitle && draftBlockingWarnings > 0) {
    return {
      title: "Publish is paused until warnings are reviewed.",
      detail: `${reviewDraftTitle} has ${draftBlockingWarnings} unresolved ${draftBlockingWarnings === 1 ? "warning" : "warnings"}, so the safest next move is a quick teacher decision before any student view changes.`,
      tone: "warning",
      facts,
    };
  }

  if (reviewDraftTitle) {
    return {
      title: "A class draft is ready for teacher review.",
      detail: `${reviewDraftTitle} already has the recap, tasks, resources, and student follow-ups drafted. Review the student preview before publishing.`,
      tone: "primary",
      facts,
    };
  }

  if (submittedCheckIns > 0) {
    return {
      title: "Students are waiting on feedback.",
      detail: `${submittedCheckIns} submitted ${submittedCheckIns === 1 ? "check-in is" : "check-ins are"} ready. Reviewing them now closes the loop while the class is still fresh.`,
      tone: "primary",
      facts,
    };
  }

  if (openSupportCount > 0 && latestTitle) {
    return {
      title: "Run a quick support pass before the next class.",
      detail: `${latestTitle} has ${openSupportCount} quiet, absent, or overdue ${openSupportCount === 1 ? "signal" : "signals"} grouped for a fast follow-up pass.`,
      tone: "warning",
      facts,
    };
  }

  if (!hasSessions) {
    return {
      title: "Start by giving ClassLoop one messy class record.",
      detail: "Paste a transcript, notes, roster, and links. ClassLoop will turn them into a teacher-reviewed follow-up loop instead of a blank dashboard.",
      tone: "primary",
      facts,
    };
  }

  if (freeLimitReached) {
    return {
      title: "Today's free generation is used, but review work can continue.",
      detail: "You can still edit, publish, check student views, and scan support signals. Pro is only needed when repeated daily generation becomes the workflow.",
      tone: "calm",
      facts,
    };
  }

  return {
    title: "Today's class loop is clear.",
    detail: "No draft, submitted check-in, or urgent support signal is waiting. Capture the next class record when the next session ends.",
    tone: "calm",
    facts,
  };
}

function compactDraftSentence(value: string | undefined, fallback: string) {
  const cleaned = (value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  const sentence = cleaned.match(/^(.{24,220}?[.!?])(?:\s|$)/)?.[1];
  return (sentence || cleaned.slice(0, 220)).trim();
}

function dueTextForDraft(dueDate: string | undefined) {
  if (!dueDate?.trim()) return "next class";
  return /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? formatDate(dueDate) : dueDate;
}

function studentFirstName(student: Student) {
  return student.name.split(/\s+/).filter(Boolean)[0] || student.name;
}

function buildTeacherAssistantDrafts({
  latest,
  reviewDraft,
  overdue,
  absentStudents,
  quietStudents,
}: {
  latest?: Session;
  reviewDraft: Session | null;
  overdue: StudentFollowUp[];
  absentStudents: Array<[string, AttendanceStatus]>;
  quietStudents: ParticipationEvent[];
}): TeacherAssistantDraft[] {
  const drafts: TeacherAssistantDraft[] = [];

  if (reviewDraft) {
    const warningCount = unresolvedBlockingImportWarnings(reviewDraft).length;
    const actionSummary =
      reviewDraft.actionItems
        .slice(0, 2)
        .map((item) => item.title)
        .join(", ") || "student tasks";
    drafts.push({
      id: "draft-review-brief",
      icon: ClipboardCheck,
      title: "Draft review brief",
      label: "Teacher checklist",
      tone: warningCount > 0 ? "warning" : "primary",
      body: `Review ${reviewDraft.title} before publishing.\n\nCheck: ${compactDraftSentence(reviewDraft.recap, "the generated recap")}\nConfirm: ${actionSummary}\nStudent safety: ${warningCount > 0 ? `${warningCount} warning(s) need a teacher decision first.` : "preview student follow-ups before publishing."}`,
    });
  }

  if (latest) {
    const recapLine = compactDraftSentence(latest.recap, "we reviewed the main class ideas and next steps.");
    const nextQuestion = latest.essentialQuestions[0] || latest.actionItems[0]?.title || "the part that felt hardest last time";
    const nextTask =
      latest.actionItems[0]?.title ||
      latest.followUps.find((followUp) => followUp.tasks.length > 0)?.tasks[0] ||
      "the follow-up task";
    const supportCount = overdue.length + absentStudents.length + quietStudents.length;

    drafts.push({
      id: "next-class-opener",
      icon: CalendarDays,
      title: "Next-class opener",
      label: "Say first",
      tone: supportCount > 0 ? "warning" : "calm",
      body: `Opening for the next class:\n\nLast time in ${latest.title}, ${recapLine}\nStart today by checking: ${nextQuestion}.\nThen give everyone 3 minutes to find ${nextTask} and mark what they need help with.`,
    });

    const overdueFollowUp = overdue[0];
    const absentStudentId = absentStudents[0]?.[0];
    const quietEvent = quietStudents[0];
    const targetStudent = overdueFollowUp
      ? studentById(overdueFollowUp.studentId, latest.students)
      : absentStudentId
        ? studentById(absentStudentId, latest.students)
        : quietEvent
          ? studentById(quietEvent.studentId, latest.students)
          : null;

    if (targetStudent && (overdueFollowUp || absentStudentId || quietEvent)) {
      const touchpointReason = overdueFollowUp
        ? `${overdueFollowUp.reminder} Due: ${dueTextForDraft(overdueFollowUp.dueDate)}.`
        : absentStudentId
          ? `You were marked absent for ${latest.title}. Start with the recap and resources, then reply with the part you want me to review.`
          : `I noticed you were quiet during ${latest.title}. Try one quick check-in: what part feels clear, and what part should we revisit?`;
      drafts.push({
        id: "student-touchpoint",
        icon: MessageSquare,
        title: "Student touchpoint",
        label: targetStudent.name,
        tone: overdueFollowUp || absentStudentId ? "warning" : "calm",
        body: `Hi ${studentFirstName(targetStudent)},\n\n${touchpointReason}\n\nI am checking in before the next class so you have a clear next step. Send me one question or mark the task when you are done.`,
      });
    }

    const resourceSummary = latest.resources[0]
      ? `Resource to mention: ${latest.resources[0].title} (${latest.resources[0].url}).`
      : "Resource to mention: use the session resources already attached in ClassLoop.";
    drafts.push({
      id: "class-followup-post",
      icon: Mail,
      title: "Class follow-up post",
      label: "Class-wide",
      tone: "primary",
      body: `Class follow-up for ${latest.title}:\n\n${recapLine}\n\nNext step: ${nextTask}.\n${resourceSummary}\n\nPlease check your ClassLoop follow-up and mark anything that needs teacher help.`,
    });
  }

  if (drafts.length === 0) {
    drafts.push({
      id: "first-session-prompt",
      icon: Wand2,
      title: "First-session prompt",
      label: "Start here",
      tone: "primary",
      body: "Paste one transcript, roster, notes, and resource link. ClassLoop will draft the recap, tasks, student follow-ups, and support signals for teacher review.",
    });
  }

  return drafts.slice(0, 3);
}

function PersonalDashboard({ meetings }: { meetings: PersonalMeeting[] }) {
  const openTasks = meetings.flatMap((meeting) => meeting.tasks).filter((task) => task.status !== "complete");
  const completedTasks = meetings.flatMap((meeting) => meeting.tasks).filter((task) => task.status === "complete");
  const latest = meetings[0];
  const hasMeetings = meetings.length > 0;

  return (
    <div className="page-stack personal-page">
      <section className="dashboard-hero personal-hero">
        <div className="hero-copy">
          <span className="eyebrow">Personal meetings</span>
          <h2>Paste meeting minutes and turn them into your own recap and tasks.</h2>
          <p>
            Individual accounts stay free and focused: one paste box, one recap, and follow-through tasks only for you.
          </p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={() => navigate("new-personal-meeting")}>
              <PlusCircle size={19} />
              New personal meeting
            </button>
            {hasMeetings && (
              <button className="ghost-button large" onClick={() => navigate("personal-meetings")}>
                <ClipboardCheck size={18} />
                View meeting history
              </button>
            )}
          </div>
        </div>
        {hasMeetings && (
          <div className="personal-hero-panel">
            <span className="eyebrow">Latest recap</span>
            <strong>{latest.title}</strong>
            <p>{latest.recap}</p>
          </div>
        )}
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={FileText}
          label="Meetings"
          value={meetings.length.toString()}
          detail="Personal records"
          accent="green"
        />
        <MetricCard
          icon={ListChecks}
          label="Open tasks"
          value={openTasks.length.toString()}
          detail="Still active"
          accent="amber"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Completed"
          value={completedTasks.length.toString()}
          detail="Closed loops"
          accent="blue"
        />
        <MetricCard
          icon={CalendarDays}
          label="Next due"
          value={openTasks.find((task) => task.dueDateText.trim())?.dueDateText || "None"}
          detail="From pasted minutes"
          accent="rose"
        />
      </section>

      <Panel title="Recent personal meetings" icon={CalendarDays} action="Open history" onAction={() => navigate("personal-meetings")}>
        {hasMeetings ? (
          <div className="session-list">
            {meetings.slice(0, 5).map((meeting) => (
              <button
                key={meeting.id}
                className="session-row"
                onClick={() => navigate("personal-meetings", { meeting: meeting.id })}
              >
                <span className="session-icon">
                  <FileText size={18} />
                </span>
                <span>
                  <strong>{meeting.title}</strong>
                  <small>
                    {formatDate(meeting.date)} · {meeting.tasks.filter((task) => task.status !== "complete").length} open tasks
                  </small>
                </span>
                <span className="status-pill in_progress">Personal</span>
              </button>
            ))}
          </div>
        ) : (
          <InlineEmpty
            icon={FileText}
            title="No personal meetings yet"
            detail="Paste meeting minutes to generate a recap, questions, resources, and tasks for yourself."
            action="New personal meeting"
            onAction={() => navigate("new-personal-meeting")}
          />
        )}
      </Panel>
    </div>
  );
}

function NewPersonalMeeting({
  onCreate,
  personalTemplateCopyUrl,
}: {
  onCreate: (title: string, minutes: string, structuredTranscript?: StructuredTranscript) => void;
  personalTemplateCopyUrl?: string;
}) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState("");
  const [structuredTranscript, setStructuredTranscript] = useState<StructuredTranscript | undefined>();
  const [uploadedRecordingName, setUploadedRecordingName] = useState("");
  const [whisperStatus, setWhisperStatus] = useState("");
  const personalMinutePlaceholder = [
    "Meeting title:",
    "Date:",
    "Context:",
    "",
    "Resources:",
    "- ",
    "",
    "Questions:",
    "- ",
    "",
    "Due dates:",
    "- ",
    "",
    "Minutes:",
    "- Paste notes, decisions, action items, and follow-ups here.",
  ].join("\n");

  const generate = () => {
    if (minutes.trim().length < 20) {
      setError("Paste the meeting minutes before generating your personal recap.");
      return;
    }
    setError("");
    onCreate(
      title,
      minutes,
      structuredTranscript ??
        createStructuredTranscriptFromText(minutes, {
          title: `${title || "Personal meeting"} transcript`,
          source: "paste",
        }),
    );
  };

  const handlePersonalRecordingFile = async (file?: File) => {
    if (!file) return;
    setUploadedRecordingName(file.name);
    setError("");
    if (isTextTranscriptFile(file)) {
      const text = await readTranscriptFileText(file);
      setMinutes(text);
      setStructuredTranscript(
        createStructuredTranscriptFromText(text, {
          title: `${title || file.name} transcript`,
          source: "file",
        }),
      );
      setWhisperStatus(`Loaded ${file.name}.`);
      return;
    }

    try {
      setWhisperStatus(`Transcribing ${file.name}...`);
      const nextTranscript = await transcribeRecordingWithWhisper(file, {
        filename: file.name,
        source: transcriptSourceForFile(file),
        title: `${title || file.name} transcript`,
      });
      setMinutes(nextTranscript.text);
      setStructuredTranscript(nextTranscript);
      setWhisperStatus("Transcript ready. Review speaker labels before generating.");
    } catch (error) {
      setWhisperStatus(error instanceof Error ? error.message : "Recording transcription failed.");
    }
  };

  return (
    <div className="page-stack personal-page">
      <section className="import-layout personal-import-layout">
        <div className="import-main">
          <div className="section-heading">
            <span className="eyebrow">Personal meeting</span>
            <h2>Paste minutes and generate your follow-through.</h2>
            <p>Use one meeting record with title, date, context, resources, questions, and due dates.</p>
          </div>

          <div className="form-grid">
            <label className="field wide">
              <span>Meeting title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Product sync, client check-in, team standup" />
            </label>
            <label className="upload-zone wide">
              <UploadCloud size={24} />
              <strong>{uploadedRecordingName || "Upload meeting audio, screen recording, or transcript"}</strong>
              <small>Audio and video can be transcribed when recording transcription is available.</small>
              <input
                type="file"
                accept=".txt,.vtt,.srt,audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.mov"
                onChange={(event) => handlePersonalRecordingFile(event.target.files?.[0])}
              />
            </label>
            <label className="field paste-field large-paste wide">
              <span>Paste meeting minutes</span>
              <textarea
                value={minutes}
                onChange={(event) => {
                  setMinutes(event.target.value);
                  setStructuredTranscript(undefined);
                }}
                placeholder={personalMinutePlaceholder}
              />
            </label>
            {whisperStatus && <p className="capture-message wide">{whisperStatus}</p>}
          </div>
        </div>

        <aside className="import-summary">
          <div className="summary-card">
            <span className="summary-icon">
              <Sparkles size={22} />
            </span>
            <h3>Personal draft will include</h3>
            <ul>
              <li>Meeting recap</li>
              <li>Your tasks</li>
              <li>Status controls</li>
              <li>Due date text boxes</li>
              <li>Questions and resources</li>
            </ul>
            <button className="primary-button full" type="button" onClick={generate}>
              <Wand2 size={18} />
              Generate draft
            </button>
            <TemplateLinkCard
              title="Google Docs personal template"
              detail="Make a copy, fill in meeting title, date, context, resources, questions, due dates, then paste it here."
              url={personalTemplateCopyUrl}
            />
            {error && <p className="settings-message">{error}</p>}
          </div>
        </aside>
      </section>
    </div>
  );
}

function PersonalMeetingsPage({
  meetings,
  onUpdateTask,
  onDeleteMeeting,
}: {
  meetings: PersonalMeeting[];
  onUpdateTask: (meetingId: string, taskId: string, changes: Partial<PersonalTask>) => void;
  onDeleteMeeting: (meetingId: string) => void;
}) {
  const selectedMeetingId = getParam("meeting") ?? meetings[0]?.id ?? "";
  const selectedMeeting = meetings.find((meeting) => meeting.id === selectedMeetingId) ?? meetings[0];

  if (!selectedMeeting) {
    return (
      <EmptyState
        icon={FileText}
        title="No personal meetings yet"
        detail="Generate a personal meeting from pasted minutes to see recaps and tasks here."
        action="New personal meeting"
        onAction={() => navigate("new-personal-meeting")}
      />
    );
  }

  return (
    <div className="page-stack personal-page">
      <section className="review-banner personal-review-banner">
        <div>
          <span className="eyebrow">Personal meeting review</span>
          <h2>{selectedMeeting.title}</h2>
          <p>
            {formatDate(selectedMeeting.date)} · {selectedMeeting.tasks.filter((task) => task.status !== "complete").length} open tasks
          </p>
        </div>
        <div className="review-actions">
          <button className="ghost-button" type="button" onClick={() => onDeleteMeeting(selectedMeeting.id)}>
            <Trash2 size={17} />
            Delete
          </button>
          <button className="primary-button" type="button" onClick={() => navigate("new-personal-meeting")}>
            <PlusCircle size={17} />
            New meeting
          </button>
        </div>
      </section>

      <section className="content-grid align-start">
        <Panel title="Meeting history" icon={CalendarDays}>
          <div className="session-list">
            {meetings.map((meeting) => (
              <button
                key={meeting.id}
                className={meeting.id === selectedMeeting.id ? "session-row active" : "session-row"}
                onClick={() => navigate("personal-meetings", { meeting: meeting.id })}
              >
                <span className="session-icon">
                  <FileText size={18} />
                </span>
                <span>
                  <strong>{meeting.title}</strong>
                  <small>
                    {formatDate(meeting.date)} · {meeting.tasks.length} tasks
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="page-stack">
          <Panel title="Recap" icon={FileText}>
            <div className="personal-recap">
              <p>{selectedMeeting.recap}</p>
              {selectedMeeting.context && (
                <div>
                  <strong>Context</strong>
                  <span>{selectedMeeting.context}</span>
                </div>
              )}
            </div>
          </Panel>

          <StructuredTranscriptPanel
            transcript={selectedMeeting.structuredTranscript}
            emptyDetail="Paste minutes or upload a recording to keep a cleaned, speaker-labeled transcript with this meeting."
          />

          <PersonalFollowThroughPanel meeting={selectedMeeting} />

          <Panel title="Tasks" icon={ListChecks}>
            <div className="personal-task-list">
              {selectedMeeting.tasks.map((task) => (
                <article key={task.id} className="personal-task-row">
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.source}</small>
                  </div>
                  <label className="field compact">
                    <span>Status</span>
                    <select
                      value={task.status}
                      onChange={(event) =>
                        onUpdateTask(selectedMeeting.id, task.id, {
                          status: event.target.value as PersonalTaskStatus,
                        })
                      }
                      aria-label={`Status for ${task.title}`}
                    >
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="complete">Complete</option>
                    </select>
                  </label>
                  <label className="field compact">
                    <span>Due date</span>
                    <input
                      value={task.dueDateText}
                      onChange={(event) => onUpdateTask(selectedMeeting.id, task.id, { dueDateText: event.target.value })}
                      placeholder="Friday, 5/29, next week"
                      aria-label={`Due date for ${task.title}`}
                    />
                  </label>
                  <span className={`status-pill ${task.status}`}>{personalTaskStatusLabel(task.status)}</span>
                </article>
              ))}
            </div>
          </Panel>

          <section className="content-grid two-columns">
            <Panel title="Questions" icon={Lightbulb}>
              {selectedMeeting.questions.length ? (
                <div className="bullet-stack">
                  {selectedMeeting.questions.map((question) => (
                    <span key={question}>{question}</span>
                  ))}
                </div>
              ) : (
                <InlineEmpty icon={Lightbulb} title="No questions found" detail="Questions from pasted minutes appear here." />
              )}
            </Panel>
            <Panel title="Resources" icon={LinkIcon}>
              {selectedMeeting.resources.length ? (
                <div className="bullet-stack">
                  {selectedMeeting.resources.map((resource) => (
                    <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer">
                      {resource.title}
                    </a>
                  ))}
                </div>
              ) : (
                <InlineEmpty icon={LinkIcon} title="No resources found" detail="Links from the resources section appear here." />
              )}
            </Panel>
          </section>
        </div>
      </section>
    </div>
  );
}

function StructuredTranscriptPanel({
  transcript,
  emptyDetail,
}: {
  transcript?: StructuredTranscript;
  emptyDetail: string;
}) {
  const segments = transcript?.segments ?? [];
  return (
    <Panel title="Transcript" icon={MessageSquare}>
      {transcript && segments.length ? (
        <div className="structured-transcript">
          <div className="structured-transcript-header">
            <div>
              <strong>{transcript.title}</strong>
              <small>
                {[transcript.model, transcript.language, transcript.durationSeconds ? `${Math.round(transcript.durationSeconds)}s` : ""]
                  .filter(Boolean)
                  .join(" · ") || transcript.source.replace(/_/g, " ")}
              </small>
            </div>
            <span className="status-pill in_progress">{segments.length} segments</span>
          </div>
          <div className="structured-transcript-list">
            {segments.map((segment, index) => {
              const timeLabel = formatTranscriptTime(segment.startSeconds) || `#${index + 1}`;
              return (
                <article key={segment.id} className="transcript-segment-row">
                  <div className="transcript-segment-meta">
                    <span className="transcript-time">{timeLabel}</span>
                    <strong className="transcript-speaker">{segment.speaker}</strong>
                  </div>
                  <p>{segment.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <InlineEmpty icon={MessageSquare} title="No transcript saved" detail={emptyDetail} />
      )}
    </Panel>
  );
}

function PersonalFollowThroughPanel({ meeting }: { meeting: PersonalMeeting }) {
  const [emailPermissionGranted, setEmailPermissionGranted] = useState(false);
  const [message, setMessage] = useState("");
  const calendarUrl = personalCalendarUrl(meeting);
  const mailtoUrl = personalMailtoUrl(meeting);
  const docsSummary = meeting.docsSummary;

  const copyDocsSummary = async () => {
    if (!docsSummary) return;
    try {
      await navigator.clipboard.writeText(docsSummary.body);
      setMessage("Docs summary copied. Open Google Docs and paste it into the new Drive document.");
    } catch {
      setMessage("Copy failed. Download the summary and upload it to Drive.");
    }
  };

  const openEmailDraft = () => {
    if (!emailPermissionGranted) {
      setMessage("Approve the email draft before opening your mail app.");
      return;
    }
    if (!mailtoUrl) {
      setMessage("No email draft is available for this meeting.");
      return;
    }
    window.location.href = mailtoUrl;
  };

  return (
    <Panel title="Follow-through automations" icon={Sparkles}>
      <div className="personal-automation-grid">
        <article className="personal-automation-card">
          <div>
            <CalendarDays size={18} />
            <strong>Next Google Calendar meeting</strong>
            <small>
              {meeting.nextMeeting
                ? `${meeting.nextMeeting.title} · ${meeting.nextMeeting.date} at ${meeting.nextMeeting.time}`
                : "No next meeting suggestion yet."}
            </small>
          </div>
          <button className="ghost-button" type="button" disabled={!calendarUrl} onClick={() => window.open(calendarUrl, "_blank", "noopener,noreferrer")}>
            <CalendarDays size={17} />
            Add to Calendar
          </button>
        </article>

        <article className="personal-automation-card">
          <div>
            <FileText size={18} />
            <strong>Google Drive Docs summary</strong>
            <small>{docsSummary ? docsSummary.title : "No Docs summary generated yet."}</small>
          </div>
          <div className="inline-button-row">
            <button className="ghost-button" type="button" disabled={!docsSummary} onClick={copyDocsSummary}>
              <ClipboardCheck size={17} />
              Copy summary
            </button>
            <button className="ghost-button" type="button" disabled={!docsSummary} onClick={() => window.open("https://docs.new", "_blank", "noopener,noreferrer")}>
              <ArrowUpRight size={17} />
              Open Docs
            </button>
            <button
              className="ghost-button"
              type="button"
              disabled={!docsSummary}
              onClick={() =>
                docsSummary &&
                downloadTextFile(`${slugify(docsSummary.title, "meeting-summary")}.md`, docsSummary.body, "text/markdown")
              }
            >
              <Download size={17} />
              Download
            </button>
          </div>
        </article>

        <article className="personal-automation-card">
          <div>
            <Mail size={18} />
            <strong>Email follow-up draft</strong>
            <small>
              {meeting.emailDraft?.recipients.length
                ? `${meeting.emailDraft.recipients.length} recipient${meeting.emailDraft.recipients.length === 1 ? "" : "s"} detected`
                : "No recipients detected. You can add recipients in the mail draft."}
            </small>
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={emailPermissionGranted}
              onChange={(event) => setEmailPermissionGranted(event.target.checked)}
            />
            <span>
              <strong>I reviewed and approve opening this email draft</strong>
              <small>ClassLoop will never send this individual email without this permission step.</small>
            </span>
          </label>
          <button className="primary-button" type="button" onClick={openEmailDraft} disabled={!emailPermissionGranted || !meeting.emailDraft}>
            <Send size={17} />
            Open email draft
          </button>
        </article>
      </div>
      {message && <p className="settings-message">{message}</p>}
    </Panel>
  );
}

function TranscriptTransformVisual() {
  return (
    <div className="transform-visual" aria-label="Transcript transformed into dashboard cards">
      <div className="visual-window">
        <div className="visual-line short" />
        <div className="visual-line" />
        <div className="visual-line mid" />
        <div className="visual-line tiny" />
      </div>
      <div className="visual-arrow">
        <Sparkles size={21} />
      </div>
      <div className="visual-cards">
        <span>Recap</span>
        <span>Tasks</span>
        <span>Signals</span>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
  detail: string;
  accent: "green" | "blue" | "amber" | "rose";
}) {
  return (
    <article className={`metric-card ${accent}`}>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
  action,
  onAction,
}: {
  title: string;
  icon: typeof LayoutDashboard;
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <Icon size={18} />
          <h3>{title}</h3>
        </div>
        {action && (
          <button className="text-button" onClick={onAction}>
            {action}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function TemplateLinkCard({
  title,
  detail,
  url,
}: {
  title: string;
  detail: string;
  url?: string;
}) {
  const connected = Boolean(url?.trim());
  return (
    <section className="template-link-card" aria-label={title}>
      <div>
        <strong>{title}</strong>
        <small>
          {connected
            ? detail
            : "Template link is not connected yet. Add the Google Docs copy URL in public/classloop-template-links.json."}
        </small>
      </div>
      {connected ? (
        <a className="ghost-button" href={url} target="_blank" rel="noreferrer">
          <FileText size={17} />
          Make a copy
        </a>
      ) : (
        <span className="status-pill todo">Not connected</span>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={`status-pill ${status}`}>{statusLabel(status)}</span>;
}

function AttentionItem({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
}) {
  return (
    <div className="attention-item">
      <span>
        <Icon size={17} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function AssistantActionItem({ action }: { action: TeacherAssistantAction }) {
  const Icon = action.icon;
  return (
    <article className={`assistant-action ${action.tone}`}>
      <span>
        <Icon size={17} />
      </span>
      <div>
        <strong>{action.title}</strong>
        <small>{action.detail}</small>
      </div>
      <button className="text-button" type="button" onClick={action.onAction}>
        {action.action}
        <ChevronRight size={16} />
      </button>
    </article>
  );
}

function AssistantDraftCard({
  assistantDraft,
  onCopy,
}: {
  assistantDraft: TeacherAssistantDraft;
  onCopy: () => void;
}) {
  const Icon = assistantDraft.icon;
  return (
    <article className={`assistant-draft ${assistantDraft.tone}`}>
      <span>
        <Icon size={17} />
      </span>
      <div className="assistant-draft-content">
        <div className="assistant-draft-header">
          <div>
            <small>{assistantDraft.label}</small>
            <strong>{assistantDraft.title}</strong>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={onCopy}
            aria-label={`Copy ${assistantDraft.title}`}
          >
            Copy
            <ClipboardCheck size={15} />
          </button>
        </div>
        <p className="assistant-draft-body">{assistantDraft.body}</p>
      </div>
    </article>
  );
}

function PlanRow({
  tier,
  detail,
  price,
  current,
}: {
  tier: string;
  detail: string;
  price?: string;
  current?: boolean;
}) {
  return (
    <div className={current ? "plan-row current" : "plan-row"}>
      <strong>
        {tier}
        {price && <span>{price}</span>}
      </strong>
      <span>{detail}</span>
      {current && <small>Current plan</small>}
    </div>
  );
}

const stripePricingTableScriptId = "classloop-stripe-pricing-table";
const stripePricingTableScriptSrc = "https://js.stripe.com/v3/pricing-table.js";

function StripePricingTableEmbed({ customerEmail, clientReferenceId }: { customerEmail: string; clientReferenceId: string }) {
  const { pricingTableId, publishableKey } = getStripePricingTableConfig();
  const configured = Boolean(pricingTableId && publishableKey);

  useEffect(() => {
    if (!pricingTableId || !publishableKey) return;
    if (document.getElementById(stripePricingTableScriptId)) return;
    const script = document.createElement("script");
    script.id = stripePricingTableScriptId;
    script.async = true;
    script.src = stripePricingTableScriptSrc;
    document.head.appendChild(script);
  }, [pricingTableId, publishableKey]);

  if (!configured) {
    return (
      <div className="stripe-pricing-table-shell placeholder" role="status">
        <div className="integration-card">
          <span>
            <strong>Online payment is not available right now.</strong>
            <small>Use Upgrade to Pro again later or contact ClassLoop support if this keeps happening.</small>
          </span>
        </div>
      </div>
    );
  }

  const pricingTableAttributes: Record<string, string> = {
    "pricing-table-id": pricingTableId,
    "publishable-key": publishableKey,
    "customer-email": customerEmail,
  };
  const safeClientReferenceId = clientReferenceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
  if (safeClientReferenceId) pricingTableAttributes["client-reference-id"] = safeClientReferenceId;

  return (
    <div className="stripe-pricing-table-shell" role="region" aria-label="Payment plans">
      {createElement("stripe-pricing-table", pricingTableAttributes)}
    </div>
  );
}

function CloudEmailConfirmationOverlay({
  prompt,
  actionLabel,
  onClose,
  onAction,
  secondaryActionLabel,
  secondaryActionHelper,
  onSecondaryAction,
}: CloudEmailConfirmationOverlayProps) {
  const isAccountCreation = prompt.context === "account-create";

  return (
    <div className="modal-backdrop cloud-confirmation-backdrop" role="dialog" aria-modal="true" aria-labelledby="cloud-confirmation-title">
      <section className="cloud-confirmation-modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Cloud account confirmation</span>
            <h2 id="cloud-confirmation-title">
              {isAccountCreation ? "Check your email to finish your account." : "Check your email to link your cloud account."}
            </h2>
            <p>
              {isAccountCreation
                ? `ClassLoop created an account for ${prompt.email}. Confirm the address before multi-device sign-in works.`
                : `ClassLoop sent a confirmation email to ${prompt.email}. Confirm the address to finish linking this account.`}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close email confirmation instructions">
            <X size={18} />
          </button>
        </div>

        <ol className="cloud-confirmation-steps">
          <li>
            <span>
              <Mail size={18} aria-hidden="true" />
            </span>
            <div>
              <strong>Open the inbox for {prompt.email}</strong>
              <small>Look for a ClassLoop confirmation email. Check Updates, Promotions, Spam, and school-filtered mail if it is not in the main inbox.</small>
            </div>
          </li>
          <li>
            <span>
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <div>
              <strong>Click the confirmation button in that email</strong>
              <small>
                {isAccountCreation
                  ? "The email verifies your address so multi-device sign-in works with the same ClassLoop account. The same ClassLoop account can sign in on desktop, browser, and phone."
                  : "The email verifies your address so ClassLoop can safely link this login to your cloud account."}
              </small>
            </div>
          </li>
          <li>
            <span>
              <RefreshCw size={18} aria-hidden="true" />
            </span>
            <div>
              <strong>Return to ClassLoop and continue</strong>
              <small>After confirming your email, return here and use the same email and password to continue.</small>
            </div>
          </li>
        </ol>

        <p className="cloud-confirmation-note">
          If the email opens the wrong page, return to ClassLoop and request a fresh confirmation email.
        </p>
        <p className="cloud-confirmation-note">
          <strong>Expected return link:</strong> {prompt.redirectUrl}
        </p>

        {secondaryActionLabel && (
          <p className="cloud-confirmation-note">
            Need to keep working now? Continue on this device stores the account locally. Multi-device cloud sync will stay unavailable until you confirm the email and sign in again.
          </p>
        )}

        <div className="button-row">
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
          {secondaryActionLabel && onSecondaryAction && (
            <button type="button" className="ghost-button" onClick={onSecondaryAction} title={secondaryActionHelper}>
              <Smartphone size={17} />
              {secondaryActionLabel}
            </button>
          )}
          <button type="button" className="primary-button" onClick={onAction}>
            <RefreshCw size={17} />
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

let embeddedCheckoutSessionCache:
  | {
      userId: string;
      startedAt: number;
      promise: Promise<string>;
    }
  | null = null;

function embeddedCheckoutClientSecretFor(userId: string) {
  const now = Date.now();
  if (embeddedCheckoutSessionCache?.userId === userId && now - embeddedCheckoutSessionCache.startedAt < 10_000) {
    return embeddedCheckoutSessionCache.promise;
  }

  const promise = createEmbeddedCheckoutSession("pro")
    .then((session) => {
      if (!session.clientSecret) throw new Error("Payment form could not be prepared.");
      return session.clientSecret;
    })
    .catch((error) => {
      if (embeddedCheckoutSessionCache?.promise === promise) embeddedCheckoutSessionCache = null;
      throw error;
    });
  embeddedCheckoutSessionCache = { userId, startedAt: now, promise };
  return promise;
}

function EmbeddedCheckoutPage({
  auth,
  billingProfile,
  setBillingProfile,
  localAuthSecret,
  appendAudit,
}: {
  auth: AuthSession;
  billingProfile: BillingProfile;
  setBillingProfile: (profile: BillingProfile) => void;
  localAuthSecret: LocalAuthSecret | null;
  appendAudit: (action: string, detail: string, actor?: AuthSession | null) => void;
}) {
  const backendStatus = getBackendStatus();
  const publishableKey = getStripePublishableKey();
  const billingReturnStatus = getParam("billing");
  const checkoutContainerRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("Preparing secure checkout...");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "verifying" | "success">("loading");
  const [connectedEmail, setConnectedEmail] = useState("");
  const [cloudConfirmation, setCloudConfirmation] = useState<CloudConfirmationPrompt | null>(null);
  const isDemoAccount = Boolean(auth.demo);
  const hasPro = isPaidPlan(billingProfile);

  const showEmailConfirmation = useCallback((result: CloudAuthResult, fallbackEmail: string) => {
    const prompt = cloudConfirmationFromResult(result, fallbackEmail, "checkout");
    if (!prompt) return false;
    setCloudConfirmation(prompt);
    setStatus("loading");
    setMessage("Confirm your email before checkout continues.");
    return true;
  }, []);

  const ensureCheckoutCloudSession = useCallback(async () => {
    const existingSession = await getCloudSession();
    if (existingSession) {
      const email = existingSession.user.email ?? "";
      setConnectedEmail(email);
      return existingSession;
    }

    const normalizedAuthEmail = normalizeEmail(auth.email);
    const secretMatchesCurrentAccount =
      localAuthSecret?.accountId === auth.accountId &&
      localAuthSecret.role === auth.role &&
      normalizeEmail(localAuthSecret.email) === normalizedAuthEmail;

    if (!secretMatchesCurrentAccount || !localAuthSecret?.password) {
      throw new Error("Sign in again, then Upgrade to Pro will continue with this account.");
    }

    setStatus("loading");
    setMessage("Preparing your ClassLoop account for payment...");
    let result = await signIntoCloud(normalizedAuthEmail, localAuthSecret.password);
    if (showEmailConfirmation(result, normalizedAuthEmail)) return null;
    if (!result.ok) {
      await prepareBillingCloudAccount(normalizedAuthEmail, localAuthSecret.password, "teacher", auth.name);
      result = await signIntoCloud(normalizedAuthEmail, localAuthSecret.password);
      if (showEmailConfirmation(result, normalizedAuthEmail)) return null;
    }
    if (!result.ok || !result.session) {
      throw new Error(
        result.message ||
          "Unable to prepare payment for this account. Sign in again, then retry Upgrade to Pro.",
      );
    }

    const email = result.session.user.email ?? normalizedAuthEmail;
    setConnectedEmail(email);
    appendAudit("cloud_connect", `Prepared payment account for ${email}.`, auth);
    return result.session;
  }, [appendAudit, auth, localAuthSecret, showEmailConfirmation]);

  useEffect(() => {
    getCloudSession().then((session) => setConnectedEmail(session?.user.email ?? ""));
  }, []);

  useEffect(() => {
    if (billingReturnStatus !== "success" || isDemoAccount) return;
    let active = true;
    let retryTimer: number | null = null;

    const verifyPaidProfile = async (attempt = 1) => {
      if (!active) return;
      setStatus("verifying");
      setMessage("Payment complete. Checking your plan before Pro turns on...");
      try {
        const profile = await getCloudProfile();
        const verifiedProfile = normalizeTrustedBillingProfile(profile.billingProfile);
        if (!active) return;
        setBillingProfile(verifiedProfile);
        if (isPaidPlan(verifiedProfile)) {
          setStatus("success");
          setMessage("Payment confirmed. Pro is active.");
          return;
        }
        if (attempt < 5) {
          setMessage("Payment was submitted. Waiting for confirmation before Pro turns on...");
          retryTimer = window.setTimeout(() => void verifyPaidProfile(attempt + 1), 1500);
          return;
        }
        setStatus("error");
        setMessage("Payment is still pending. ClassLoop will stay Free until payment is confirmed.");
      } catch (error) {
        if (!active) return;
        if (attempt < 5) {
          retryTimer = window.setTimeout(() => void verifyPaidProfile(attempt + 1), 1500);
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to verify the payment yet.");
      }
    };

    void verifyPaidProfile();
    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [billingReturnStatus, isDemoAccount, setBillingProfile]);

  useEffect(() => {
    if (billingReturnStatus === "success" || hasPro) return;
    let active = true;
    let checkout: StripeEmbeddedCheckout | null = null;

    const mountCheckout = async () => {
      try {
        if (isDemoAccount) {
          setStatus("error");
          setMessage("Demo account upgrades are disabled. Create your own account to upgrade.");
          return;
        }
        if (!backendStatus.supabaseConfigured) {
          setStatus("error");
          setMessage("Online upgrades are unavailable right now. Try again later or contact ClassLoop support.");
          return;
        }
        const session = await ensureCheckoutCloudSession();
        if (!session) return;
        setConnectedEmail(session.user.email ?? "");
        if (!backendStatus.stripeEmbeddedConfigured || !publishableKey) {
          setStatus("error");
          setMessage("The payment form is unavailable right now. Try again later or contact ClassLoop support.");
          return;
        }
        setStatus("loading");
        setMessage("Loading the secure payment form...");
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error("Payment form could not load. Check your connection and try again.");
        const clientSecret = await embeddedCheckoutClientSecretFor(session.user.id);
        if (!active || !checkoutContainerRef.current) return;
        checkout = await stripe.createEmbeddedCheckoutPage({ clientSecret });
        if (!active) {
          checkout?.destroy();
          return;
        }
        checkout?.mount(checkoutContainerRef.current);
        setStatus("ready");
        setMessage("Complete Stripe Checkout here. Pro turns on after payment is confirmed.");
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to load the payment form.");
      }
    };

    void mountCheckout();
    return () => {
      active = false;
      checkout?.destroy();
    };
  }, [
    backendStatus.stripeEmbeddedConfigured,
    backendStatus.supabaseConfigured,
    billingReturnStatus,
    ensureCheckoutCloudSession,
    hasPro,
    isDemoAccount,
    publishableKey,
  ]);

  const openHostedCheckout = async () => {
    try {
      if (isDemoAccount) {
        setMessage("Demo account upgrades are disabled.");
        return;
      }
      if (!backendStatus.supabaseConfigured) {
        setMessage("Online upgrades are unavailable right now. Try again later or contact ClassLoop support.");
        return;
      }
      const session = await ensureCheckoutCloudSession();
      if (!session) return;
      setMessage("Opening the secure payment page...");
      const checkout = await createCheckoutSession("pro");
      if (!checkout.url || new URL(checkout.url).hostname !== "checkout.stripe.com") {
        throw new Error("Payment page did not open correctly. Try again later.");
      }
      window.location.href = checkout.url;
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Online payment is not available right now.");
    }
  };

  if (hasPro) {
    const manualPro = isManualProBillingProfile(billingProfile);
    return (
      <div className="page-stack">
        <section className="review-banner">
          <div>
            <span className="eyebrow">Pro checkout</span>
            <h2>Pro is already active.</h2>
            <p>
              {manualPro
                ? "This ClassLoop owner account already has Pro enabled."
                : "This account has an active Pro subscription. Manage billing from Plan options."}
            </p>
          </div>
        </section>
        <Panel title="Subscription verified" icon={ShieldCheck}>
          <div className="settings-stack">
            <p className="settings-message success">
              {manualPro ? "Pro is active for this account." : "Payment confirmed. Pro is active."}
            </p>
            <button className="primary-button" type="button" onClick={() => navigate("billing")}>
              Back to Plan options
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-stack checkout-page">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Pro checkout</span>
          <h2>Upgrade inside ClassLoop.</h2>
          <p>
            Pay securely inside ClassLoop. Pro turns on only after payment is confirmed.
          </p>
        </div>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Secure payment" icon={ShieldCheck}>
          <div className="settings-stack">
            <div className={`integration-card ${status === "ready" || status === "success" ? "active" : ""}`}>
              <span>
                <strong>
                  {status === "ready"
                    ? "Checkout ready"
                    : status === "verifying"
                      ? "Verifying payment"
                      : status === "error"
                        ? "Checkout needs attention"
                        : "Loading checkout"}
                </strong>
                <small>{message}</small>
              </span>
            </div>
            {connectedEmail && <p className="settings-message success">Cloud account: {connectedEmail}</p>}
            <div
              ref={checkoutContainerRef}
              className={status === "error" || status === "success" || status === "verifying" ? "stripe-checkout-shell inactive" : "stripe-checkout-shell"}
              aria-label="Secure payment form"
            />
          </div>
        </Panel>

        <Panel title="Checkout controls" icon={Settings2}>
          <div className="settings-stack">
            <div className="integration-card">
              <span>
                <strong>Plan protection</strong>
                <small>ClassLoop stays Free until payment is confirmed for this account.</small>
              </span>
            </div>
            <button className="primary-button" type="button" onClick={() => navigate("billing")}>
              Back to Plan options
            </button>
            <button className="ghost-button" type="button" onClick={openHostedCheckout} disabled={isDemoAccount || !backendStatus.supabaseConfigured}>
              Open Stripe Checkout instead
            </button>
          </div>
        </Panel>
      </section>

      {cloudConfirmation && (
        <CloudEmailConfirmationOverlay
          prompt={cloudConfirmation}
          actionLabel="Back to Plan options"
          onClose={() => setCloudConfirmation(null)}
          onAction={() => {
            setCloudConfirmation(null);
            navigate("billing");
          }}
        />
      )}
    </div>
  );
}

function SyncBillingPage({
  auth,
  billingProfile,
  setBillingProfile,
  currentState,
  applyCloudState,
  appendAudit,
  sessionCount,
  localAuthSecret,
}: {
  auth: AuthSession;
  billingProfile: BillingProfile;
  setBillingProfile: (profile: BillingProfile) => void;
  currentState: () => SharedState;
  applyCloudState: (state: Partial<SharedState>) => void;
  appendAudit: (action: string, detail: string, actor?: AuthSession | null) => void;
  sessionCount: number;
  localAuthSecret: LocalAuthSecret | null;
}) {
  const backendStatus = getBackendStatus();
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [message, setMessage] = useState("");
  const [connectedEmail, setConnectedEmail] = useState("");
  const [cloudConfirmation, setCloudConfirmation] = useState<CloudConfirmationPrompt | null>(null);
  const isDemoAccount = Boolean(auth.demo);
  const billingReturnStatus = getParam("billing");
  const demoBillingMessage =
    "Demo account upgrades are disabled. Create your own ClassLoop account to upgrade.";

  useEffect(() => {
    getCloudSession().then((session) => setConnectedEmail(session?.user.email ?? ""));
  }, []);

  useEffect(() => {
    if (isDemoAccount) return;
    if (billingReturnStatus === "canceled") {
      setMessage("Checkout was canceled. Your plan was not changed.");
      return;
    }
    if (billingReturnStatus !== "success") return;

    let active = true;
    let retryTimer: number | null = null;

    const verifyPaidProfile = async (attempt = 1) => {
      if (!active) return;
      setMessage("Payment complete. Checking your plan before Pro turns on...");
      try {
        const profile = await getCloudProfile();
        const verifiedProfile = normalizeTrustedBillingProfile(profile.billingProfile);
        if (!active) return;
        setBillingProfile(verifiedProfile);
        if (isPaidPlan(verifiedProfile)) {
          setMessage("Payment confirmed. Pro is active.");
          return;
        }
        if (attempt < 5) {
          setMessage("Payment was submitted. Waiting for confirmation before Pro turns on...");
          retryTimer = window.setTimeout(() => void verifyPaidProfile(attempt + 1), 1500);
          return;
        }
        setMessage(
          "Payment is still pending. ClassLoop will stay Free until payment is confirmed. Click Refresh plan if Pro is still pending after your receipt arrives.",
        );
      } catch (error) {
        if (!active) return;
        if (attempt < 5) {
          retryTimer = window.setTimeout(() => void verifyPaidProfile(attempt + 1), 1500);
          return;
        }
        setMessage(error instanceof Error ? error.message : "Unable to verify the payment yet. Sign in and click Refresh plan.");
      }
    };

    void verifyPaidProfile();
    return () => {
      active = false;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [billingReturnStatus, isDemoAccount, setBillingProfile]);

  const refreshProfile = async () => {
    try {
      const profile = await getCloudProfile();
      setBillingProfile(normalizeTrustedBillingProfile(profile.billingProfile));
      setMessage("Plan refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to refresh account plan.");
    }
  };

  const showEmailConfirmation = (result: CloudAuthResult, fallbackEmail: string, context: CloudConfirmationPrompt["context"]) => {
    const prompt = cloudConfirmationFromResult(result, fallbackEmail, context);
    if (!prompt) return false;
    setCloudConfirmation(prompt);
    setMessage("");
    return true;
  };

  const connectCloud = async () => {
    const result = await signIntoCloud(cloudEmail, cloudPassword);
    if (showEmailConfirmation(result, cloudEmail, "cloud-login")) return;
    setMessage(result.message);
    setConnectedEmail(result.session?.user.email ?? "");
    if (result.ok) {
      appendAudit("cloud_connect", `Connected cloud sync for ${cloudEmail}.`);
      await refreshProfile();
    }
  };

  const ensureCheckoutCloudSession = async () => {
    const existingSession = await getCloudSession();
    if (existingSession) {
      const email = existingSession.user.email ?? "";
      setConnectedEmail(email);
      return true;
    }

    const normalizedAuthEmail = normalizeEmail(auth.email);
    const secretMatchesCurrentAccount =
      localAuthSecret?.accountId === auth.accountId &&
      localAuthSecret.role === auth.role &&
      normalizeEmail(localAuthSecret.email) === normalizedAuthEmail;

    if (!secretMatchesCurrentAccount || !localAuthSecret?.password) {
      setMessage("Sign in again, then Upgrade to Pro will continue with this account.");
      return false;
    }

    setMessage("Preparing your ClassLoop account for payment...");
    const signInResult = await signIntoCloud(normalizedAuthEmail, localAuthSecret.password);
    if (showEmailConfirmation(signInResult, normalizedAuthEmail, "checkout")) return false;
    let result = signInResult;
    if (!result.ok) {
      await prepareBillingCloudAccount(normalizedAuthEmail, localAuthSecret.password, "teacher", auth.name);
      result = await signIntoCloud(normalizedAuthEmail, localAuthSecret.password);
      if (showEmailConfirmation(result, normalizedAuthEmail, "checkout")) return false;
    }
    if (!result.ok || !result.session) {
      setMessage(
        result.message ||
          "Unable to prepare payment for this account. Sign in again, then retry Upgrade to Pro.",
      );
      return false;
    }

    const email = result.session.user.email ?? normalizedAuthEmail;
    setConnectedEmail(email);
    appendAudit("cloud_connect", `Prepared payment account for ${email}.`);
    return true;
  };

  const uploadCloud = async () => {
    try {
      await cloudRequest("/api/cloud-state", { method: "PUT", body: JSON.stringify(currentState()) });
      setMessage("Uploaded this workspace to cloud sync.");
      appendAudit("cloud_upload", "Uploaded workspace to cloud sync.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud upload failed.");
    }
  };

  const downloadCloud = async () => {
    try {
      const state = await cloudRequest<Partial<SharedState> | null>("/api/cloud-state");
      if (!state) {
        setMessage("No cloud workspace has been saved yet.");
        return;
      }
      applyCloudState(state);
      setMessage("Downloaded the cloud workspace to this device.");
      appendAudit("cloud_download", "Downloaded workspace from cloud sync.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud download failed.");
    }
  };

  const startCheckout = async (tier: Exclude<PlanTier, "free">) => {
    try {
      if (isDemoAccount) {
        setMessage(demoBillingMessage);
        return;
      }
      if (!backendStatus.supabaseConfigured) {
        setMessage("Online upgrades are unavailable right now. Try again later or contact ClassLoop support.");
        return;
      }
      const checkoutReady = await ensureCheckoutCloudSession();
      if (!checkoutReady) {
        return;
      }
      setMessage("Opening the Pro checkout page. Pro turns on after payment is confirmed.");
      navigate("checkout", { tier });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Online payment is not available right now.");
    }
  };

  const openBillingPortal = async () => {
    try {
      if (isManualProBillingProfile(billingProfile)) {
        setMessage("Billing management is not available for this account.");
        return;
      }
      if (!backendStatus.supabaseConfigured || !connectedEmail) {
        setMessage("Billing management appears after Pro is active on this account.");
        return;
      }
      const portal = await createBillingPortalSession();
      window.location.href = portal.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Billing management is not available right now.");
    }
  };

  const downgradeToFree = () => {
    if (isDemoAccount) {
      setMessage(demoBillingMessage);
      return;
    }
    setMessage("Use Manage billing to cancel or change your subscription. ClassLoop updates the plan after payment changes are confirmed.");
  };

  const disconnect = async () => {
    await signOutCloud();
    setConnectedEmail("");
    setMessage("Cloud sync disconnected on this device.");
  };

  const cloudProSteps = [
    {
      icon: KeyRound,
      title: "Create a cloud account",
      detail: "New ClassLoop accounts are cloud-backed by default. If ClassLoop asks for confirmation, click the email link before signing in elsewhere.",
    },
    {
      icon: RefreshCw,
      title: "Use any device",
      detail: "Free accounts can upload this workspace to cloud sync, then download it on desktop, browser, or phone.",
    },
    {
      icon: Sparkles,
      title: "Upgrade only for Pro features",
      detail: "Pro is for unlimited daily generation, advanced reports, and the two live class capture modes.",
    },
    {
      icon: Mic2,
      title: "Capture live classes",
      detail: "Pro unlocks in-person class capture and online meeting capture; transcript upload remains the reliable Free path.",
    },
  ];

  return (
    <div className="page-stack">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Plan options</span>
          <h2>Save time on every class follow-up.</h2>
          <p>
            Free includes transcript import, student follow-ups, and multi-device cloud sync. Pro is for teachers who want unlimited sessions,
            in-person capture, online meeting capture, analytics, and exports without the one-session-per-day cap.
          </p>
        </div>
      </section>

      <Panel title="Cloud sync + Pro walkthrough" icon={Sparkles}>
        <div className="pro-step-carousel" aria-label="Cloud and Pro setup steps">
          {cloudProSteps.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <article className="pro-step-card" key={step.title}>
                <span className="pro-step-number">Step {index + 1}</span>
                <span className="pro-step-icon">
                  <StepIcon size={20} aria-hidden="true" />
                </span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </article>
            );
          })}
        </div>
      </Panel>

      <section className="content-grid two-columns align-start">
        <Panel title="Cloud workspace" icon={RefreshCw}>
            <div className="settings-stack">
              <div className="integration-card">
                <strong>{backendStatus.supabaseConfigured ? "Cloud account ready" : "Cloud sync unavailable"}</strong>
                <small>
                  {backendStatus.supabaseConfigured
                    ? "Use the same ClassLoop account on desktop, browser, and phone. Free accounts can sync workspaces too."
                    : "Cloud sync is not available in this build. You can keep working on this device."}
                </small>
              </div>
              <div className="integration-card soft-note">
                <strong>Cloud sync is separate from Pro</strong>
                <small>
                  Free accounts can upload and download a workspace across devices. Pro only changes session limits, reports, and classroom capture tools.
                </small>
              </div>
              <label className="field compact">
                <span>Cloud email</span>
                <input value={cloudEmail} onChange={(event) => setCloudEmail(event.target.value)} placeholder="you@school.org" />
              </label>
              <label className="field compact">
                <span>Cloud password</span>
                <input type="password" value={cloudPassword} onChange={(event) => setCloudPassword(event.target.value)} />
              </label>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={connectCloud}>
                  Sign in
                </button>
              </div>
              {connectedEmail && <p className="settings-message success">Connected as {connectedEmail}</p>}
              <div className="settings-options-list">
                <details className="settings-options-panel">
                  <summary>
                    <span>
                      <strong>Cloud workspace</strong>
                      <small>Upload this device or pull the latest cloud copy.</small>
                    </span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <div className="settings-option-actions">
                    <button className="settings-option-button" type="button" onClick={uploadCloud} disabled={!connectedEmail}>
                      <UploadCloud size={18} aria-hidden="true" />
                      <span>
                        <strong>Upload this device</strong>
                        <small>Replace the cloud workspace with this device.</small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                    <button className="settings-option-button" type="button" onClick={downloadCloud} disabled={!connectedEmail}>
                      <Download size={18} aria-hidden="true" />
                      <span>
                        <strong>Download cloud copy</strong>
                        <small>Bring the cloud workspace onto this device.</small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                    <button className="settings-option-button" type="button" onClick={disconnect} disabled={!connectedEmail}>
                      <LogOut size={18} aria-hidden="true" />
                      <span>
                        <strong>Disconnect cloud login</strong>
                        <small>Sign out of cloud sync on this device only.</small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </details>
                <details className="settings-options-panel">
                  <summary>
                    <span>
                      <strong>Billing options</strong>
                      <small>Manage receipts, cards, cancellation, and plan changes.</small>
                    </span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <div className="settings-option-actions">
                    <button className="settings-option-button" type="button" onClick={refreshProfile} disabled={!connectedEmail}>
                      <RefreshCw size={18} aria-hidden="true" />
                      <span>
                        <strong>Refresh plan</strong>
                        <small>Check whether a recent payment has been confirmed.</small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                    <button className="settings-option-button" type="button" onClick={openBillingPortal}>
                      <Settings2 size={18} aria-hidden="true" />
                      <span>
                        <strong>Manage billing</strong>
                        <small>Open billing management for invoices, cards, cancellation, and plan changes.</small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                </details>
              </div>
              {message && <p className="settings-message">{message}</p>}
            </div>
          </Panel>

        <Panel title="Plan options" icon={ShieldCheck}>
          {isDemoAccount ? (
            <div className="integration-card" role="status">
              <span>
                <strong>Demo account</strong>
                <small>{demoBillingMessage}</small>
              </span>
            </div>
          ) : (
            <div className="settings-stack">
              <button className="primary-button full" type="button" onClick={() => void startCheckout("pro")}>
                <ShieldCheck size={17} />
                Upgrade to Pro with Stripe
              </button>
              <StripePricingTableEmbed customerEmail={auth.email} clientReferenceId={auth.accountId} />
            </div>
          )}
          <div className="integration-card plan-card">
            <span>
              <strong>Current account</strong>
              <small>
                {billingProfileLabel(billingProfile)}
              </small>
            </span>
          </div>
        </Panel>
      </section>

      <Panel title="What Pro unlocks after payment" icon={Sparkles}>
        <div className="settings-stack">
          <div className="integration-card active">
            <strong>Unlimited generated sessions</strong>
            <small>
              Create more than one class follow-up per day and keep reusable rosters, published student dashboards, and teacher reports moving without the Free daily cap.
            </small>
          </div>
          <div className="integration-card">
            <strong>Live capture modes</strong>
            <small>
              Use in-person class capture or online meeting capture when Pro is active. Transcript upload remains available on Free.
            </small>
          </div>
          <div className="integration-card">
            <strong>Private analytics and report exports</strong>
            <small>
              Private analytics, JSON/CSV/print report exports, and trend views are the paid review layer for repeated classroom use.
            </small>
          </div>
        </div>
      </Panel>

      {cloudConfirmation && (
        <CloudEmailConfirmationOverlay
          prompt={cloudConfirmation}
          actionLabel={cloudConfirmation.context === "cloud-login" ? "Try cloud sign-in again" : "Try upgrade again"}
          onClose={() => setCloudConfirmation(null)}
          onAction={() => {
            const context = cloudConfirmation.context;
            setCloudConfirmation(null);
            if (context === "cloud-login") {
              void connectCloud();
              return;
            }
            void startCheckout("pro");
          }}
        />
      )}
    </div>
  );
}

function TrendChart({ sessions }: { sessions: Session[] }) {
  const ordered = [...sessions].reverse();
  return (
    <div className="trend-chart">
      {ordered.map((session) => {
        const rate = completionRate([session]);
        return (
          <div key={session.id} className="trend-bar">
            <span style={{ height: `${Math.max(rate, 8)}%` }} />
            <small>{rate}%</small>
          </div>
        );
      })}
    </div>
  );
}

function SupportSnapshotChart({ session }: { session?: Session }) {
  if (!session) return null;
  const completed = completionRate([session]);
  const participation = classParticipationRate(session);
  const averageReadiness = session.followUps.length
    ? Math.round(session.followUps.reduce((sum, followUp) => sum + followUp.score, 0) / session.followUps.length)
    : 0;
  const rows = [
    { label: "Participation", value: participation },
    { label: "Completion", value: completed },
    { label: "Readiness", value: averageReadiness },
  ];

  return (
    <div className="support-snapshot">
      <div>
        <strong>No urgent follow-ups</strong>
        <small>Latest session snapshot</small>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="snapshot-row">
          <span>{row.label}</span>
          <div>
            <i style={{ width: `${Math.max(row.value, 4)}%` }} />
          </div>
          <small>{row.value}%</small>
        </div>
      ))}
    </div>
  );
}

function ImportSession({
  ownerEmail,
  setDraft,
  onDraftCreated,
  onUseDemo,
  recordingConsentRequired,
  rosterTemplates,
  classGroups,
  canCreateSession,
  canUseLiveCapture,
  dailySessionsUsed,
  planName,
  classTemplateCopyUrl,
}: {
  ownerEmail: string;
  setDraft: (session: Session) => void;
  onDraftCreated: (session: Session) => void;
  onUseDemo: () => void;
  recordingConsentRequired: boolean;
  rosterTemplates: RosterTemplate[];
  classGroups: ClassGroup[];
  canCreateSession: boolean;
  canUseLiveCapture: boolean;
  dailySessionsUsed: number;
  planName: string;
  classTemplateCopyUrl?: string;
}) {
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<SessionType>("General classroom");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [roster, setRoster] = useState("");
  const [resources, setResources] = useState("");
  const [fileName, setFileName] = useState("");
  const [templateDetails, setTemplateDetails] = useState<Record<string, string>>({});
  const [zoomSearch, setZoomSearch] = useState("");
  const [selectedZoomMeetingId, setSelectedZoomMeetingId] = useState(zoomCloudMeetingOptions[0]?.id ?? "");
  const [selectedZoomTranscriptFileId, setSelectedZoomTranscriptFileId] = useState(zoomCloudMeetingOptions[0]?.files[0]?.id ?? "");
  const [zoomCloudImported, setZoomCloudImported] = useState(false);
  const [zoomMessage, setZoomMessage] = useState("");
  const [captureMode, setCaptureMode] = useState<SessionCaptureMode>("transcript");
  const [captureStatus, setCaptureStatus] = useState<"idle" | "recording" | "stopped">("idle");
  const [captureMessage, setCaptureMessage] = useState("");
  const [planMessage, setPlanMessage] = useState("");
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState("");
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioLabel, setRecordedAudioLabel] = useState("");
  const [structuredTranscript, setStructuredTranscript] = useState<StructuredTranscript | undefined>();
  const [whisperStatus, setWhisperStatus] = useState("");
  const [showMeetingHelp, setShowMeetingHelp] = useState(false);
  const [transcriptionAvailable, setTranscriptionAvailable] = useState(true);
  const [recordingConsent, setRecordingConsent] = useState(!recordingConsentRequired);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const captureTimerRef = useRef<number | null>(null);
  const captureStartedAtRef = useRef<number | null>(null);
  const liveSegmentCountRef = useRef(0);
  const activeTemplateFields = templateDetailFields[template];
  const filteredZoomMeetings = useMemo(() => {
    const query = zoomSearch.trim().toLowerCase();
    if (!query) return zoomCloudMeetingOptions;
    return zoomCloudMeetingOptions.filter((meeting) =>
      [meeting.title, meeting.date].some((value) => value.toLowerCase().includes(query)),
    );
  }, [zoomSearch]);
  const selectedZoomMeeting =
    zoomCloudMeetingOptions.find((meeting) => meeting.id === selectedZoomMeetingId) ?? filteredZoomMeetings[0] ?? zoomCloudMeetingOptions[0];
  const selectedZoomTranscriptFile =
    selectedZoomMeeting?.files.find((file) => file.id === selectedZoomTranscriptFileId) ?? selectedZoomMeeting?.files[0];
  const matchingRosterTemplates = useMemo(
    () => rosterTemplates.filter((templateItem) => templateItem.sessionType === template),
    [rosterTemplates, template],
  );
  const [loadedRosterTemplateId, setLoadedRosterTemplateId] = useState("");
  const matchingClassGroups = useMemo(
    () => classGroups.filter((group) => group.defaultSessionType === template || !template),
    [classGroups, template],
  );
  const [loadedClassGroupId, setLoadedClassGroupId] = useState("");
  const transcriptSpeakerCount = useMemo(
    () => (transcript.trim() ? extractTranscriptSpeakers(transcript).length : 0),
    [transcript],
  );
  const transcriptFormatWarning =
    transcript.trim().length > 80 && transcriptSpeakerCount === 0
      ? "No speaker labels were detected. ClassLoop can still draft from the roster, notes, and transcript text, but review matching before publishing."
      : "";
  const hasSessionContext = Boolean(transcript.trim() || notes.trim() || Object.values(templateDetails).some((value) => value.trim()));
  const importPreflightWarnings = [
    !hasSessionContext ? "Add transcript text, meeting notes, or template details before generating a draft." : "",
    !roster.trim()
      ? "No roster is loaded yet. ClassLoop can estimate speaker names, but you will still need to confirm the roster and add student emails before publishing."
      : "",
  ].filter(Boolean);
  const malformedResourceLineCount = useMemo(
    () =>
      resources
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/https?:\/\/[^\s)]+/i.test(line)).length,
    [resources],
  );
  const resourceFormatWarning = malformedResourceLineCount
    ? String(malformedResourceLineCount) +
      " resource " +
      (malformedResourceLineCount === 1 ? "line needs" : "lines need") +
      " http:// or https://. ClassLoop will ignore malformed links until corrected."
    : "";

  useEffect(() => {
    if (!selectedZoomMeeting) return;
    setSelectedZoomTranscriptFileId(selectedZoomMeeting.files[0]?.id ?? "");
  }, [selectedZoomMeetingId]);

  useEffect(() => {
    const matchingTemplate = rosterTemplates.find((templateItem) => templateItem.sessionType === template);
    if (!matchingTemplate) {
      setLoadedRosterTemplateId("");
      return;
    }
    if (!roster.trim()) {
      setRoster(formatRosterFromStudents(matchingTemplate.students));
      setLoadedRosterTemplateId(matchingTemplate.id);
    }
  }, [rosterTemplates, template]);

  const stopCapture = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (captureTimerRef.current) window.clearInterval(captureTimerRef.current);
    captureTimerRef.current = null;

    const duration = captureStartedAtRef.current
      ? Math.max(1, Math.round((Date.now() - captureStartedAtRef.current) / 1000))
      : recordedSeconds;
    captureStartedAtRef.current = null;
    setRecordedSeconds(duration);
    setCaptureStatus("stopped");
    setCaptureMessage(
      `${captureModeLabels[captureMode]} stopped${transcriptionAvailable ? "." : ". Add notes if the browser did not create a live transcript."}`,
    );
  };

  const startSpeechRecognition = (mode: SessionCaptureMode) => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) {
      setTranscriptionAvailable(false);
      setCaptureMessage("Capture is active, but live transcription is not available in this browser. Paste a platform transcript or add notes before generating.");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalText = "";
      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal && result[0]?.transcript) {
          finalText = appendCapturedText(finalText, result[0].transcript);
        }
      }
      if (finalText) {
        liveSegmentCountRef.current += 1;
        const speakerLabel =
          mode === "transcript"
            ? captureModeLabels[mode]
            : liveCaptureSpeakerLabel(mode, liveSegmentCountRef.current);
        setTranscript((current) => appendCapturedText(current, `${speakerLabel}: ${finalText}`));
      }
    };
    recognition.onerror = () => {
      setTranscriptionAvailable(false);
      setCaptureMessage("Capture is active, but transcription paused. Add short notes or paste the meeting transcript before generating.");
    };
    recognition.onend = null;
    recognition.start();
    speechRecognitionRef.current = recognition;
    setTranscriptionAvailable(true);
  };

  const startCapture = async (mode: SessionCaptureMode) => {
    if ((mode === "in_person" || mode === "audio" || mode === "online_meeting") && !canUseLiveCapture) {
      setPlanMessage("Live in-person and online meeting capture are Pro features. Upgrade to Pro to unlock them.");
      return;
    }
    if (recordingConsentRequired && !recordingConsent) {
      setCaptureMessage("Confirm recording/capture permission before starting.");
      return;
    }
    if (captureStatus === "recording") stopCapture();
    setCaptureMode(mode);
    setCaptureMessage("");
    setStructuredTranscript(undefined);
    liveSegmentCountRef.current = 0;

    try {
      if (!navigator.mediaDevices) {
        throw new Error("Media devices are unavailable in this browser.");
      }
      let stream: MediaStream;
      let startedMessage = "";

      if (mode === "online_meeting" && navigator.mediaDevices.getDisplayMedia) {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const hasAudio = stream.getAudioTracks().length > 0;
        startedMessage = hasAudio
          ? "Online meeting capture is running. Share a tab or window with audio when your browser asks, and keep ClassLoop open."
          : "Online meeting capture is running, but no meeting audio track was shared. Use platform captions/transcript if live text does not appear.";
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        startedMessage =
          mode === "online_meeting"
            ? "This browser cannot capture meeting tab audio directly, so ClassLoop is using the microphone as best-effort notes."
            : "In-person class capture is running. Place the device where discussion is clear and keep ClassLoop open.";
      }

      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl("");
        setRecordedAudioBlob(null);
        setRecordedAudioLabel("");
      }
      recordedChunksRef.current = [];
      if (typeof MediaRecorder !== "undefined") {
        const audioTracks = stream.getAudioTracks();
        const recorderStream = audioTracks.length ? new MediaStream(audioTracks) : stream;
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
        const recorder = new MediaRecorder(recorderStream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          if (!recordedChunksRef.current.length) return;
          const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const nextUrl = URL.createObjectURL(blob);
          setRecordedAudioBlob(blob);
          setRecordedAudioUrl(nextUrl);
          setRecordedAudioLabel(`${captureModeLabels[mode]} · ${Math.max(1, recordedSeconds || 1)}s`);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      }

      mediaStreamRef.current = stream;
      captureStartedAtRef.current = Date.now();
      setRecordedSeconds(0);
      setCaptureStatus("recording");
      setCaptureMessage(startedMessage);

      captureTimerRef.current = window.setInterval(() => {
        if (captureStartedAtRef.current) {
          setRecordedSeconds(Math.max(1, Math.round((Date.now() - captureStartedAtRef.current) / 1000)));
        }
      }, 1000);

      startSpeechRecognition(mode);
    } catch {
      setCaptureStatus("idle");
      setCaptureMessage("Capture permission was not granted, or this browser cannot capture that source. You can still paste or upload the transcript.");
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      speechRecognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (captureTimerRef.current) window.clearInterval(captureTimerRef.current);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  const loadSample = () => {
    setTitle("Geometry Review: Similar Triangles + Algebra");
    setTemplate("Math review");
    setCaptureMode("transcript");
    setZoomCloudImported(false);
    setTranscript(sampleTranscript);
    setStructuredTranscript(
      createStructuredTranscriptFromText(sampleTranscript, {
        title: "Geometry Review transcript",
        source: "paste",
      }),
    );
    setNotes(sampleNotes);
    setRoster(sampleRoster);
    setResources("https://example.com/similar-triangles-review");
    setTemplateDetails({
      practiceProblems: "Problems 7-12 on the similar triangles worksheet",
      focusSkills: "AA similarity, corresponding sides, proportions, and missing side lengths",
      commonMistakes: "Cross-multiplication order and matching the wrong sides",
    });
    onUseDemo();
  };

  const importZoomCloudTranscript = () => {
    if (!selectedZoomMeeting || !selectedZoomTranscriptFile) return;
    setCaptureMode("transcript");
    setZoomCloudImported(true);
    setTranscript(selectedZoomTranscriptFile.transcript);
    setStructuredTranscript(
      createStructuredTranscriptFromText(selectedZoomTranscriptFile.transcript, {
        title: `${selectedZoomMeeting.title} transcript`,
        source: "zoom_cloud_transcript",
      }),
    );
    setFileName(`Zoom cloud: ${selectedZoomTranscriptFile.label}`);
    if (!title.trim()) setTitle(selectedZoomMeeting.title);
    setNotes((current) =>
      appendCapturedText(
        current,
        `Zoom cloud meeting: ${selectedZoomMeeting.title} (${formatDate(selectedZoomMeeting.date)}). Raw Zoom transcript should be deleted after recap generation; structured recap, tasks, resources, participation, and follow-ups remain.`,
      ),
    );
    setZoomMessage(`Imported ${selectedZoomTranscriptFile.label} from ${selectedZoomMeeting.title}.`);
  };

  const handleTranscriptFile = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    setCaptureMode("transcript");
    setZoomCloudImported(false);
    if (isTextTranscriptFile(file)) {
      const text = await readTranscriptFileText(file);
      setStructuredTranscript(createStructuredTranscriptFromText(text, { title: `${title || file.name} transcript`, source: "file" }));
      setCaptureMessage(`Loaded ${file.name}.`);
      setWhisperStatus("");
      setTranscript(text);
      return;
    }

    try {
      setWhisperStatus(`Transcribing ${file.name}...`);
      const nextTranscript = await transcribeRecordingWithWhisper(file, {
        filename: file.name,
        source: transcriptSourceForFile(file),
        title: `${title || file.name} transcript`,
      });
      setStructuredTranscript(nextTranscript);
      setTranscript(nextTranscript.text);
      setWhisperStatus("Transcript ready. Review speakers before generating.");
      setCaptureMessage(`Transcribed ${file.name}.`);
    } catch (error) {
      setWhisperStatus(error instanceof Error ? error.message : "Recording transcription failed.");
    }
  };

  const transcribeRecordedCapture = async () => {
    if (!recordedAudioBlob) return;
    try {
      setWhisperStatus("Transcribing captured audio...");
      const nextTranscript = await transcribeRecordingWithWhisper(recordedAudioBlob, {
        filename: `${captureMode}-${Date.now().toString(36)}.webm`,
        source: "whisper_transcription",
        title: `${title || captureModeLabels[captureMode]} transcript`,
      });
      setStructuredTranscript(nextTranscript);
      setTranscript((current) => appendCapturedText(current, nextTranscript.text));
      setWhisperStatus("Transcript added. Review unknown speakers before publishing.");
    } catch (error) {
      setWhisperStatus(error instanceof Error ? error.message : "Recording transcription failed.");
    }
  };

  const generateDraft = () => {
    if (!hasSessionContext) {
      setPlanMessage("Add transcript text, meeting notes, or template details before generating a draft.");
      return;
    }
    if (!canCreateSession) {
      setPlanMessage(
        `${planName} lets you generate 1 session per day. You have used ${Math.min(
          dailySessionsUsed,
          1,
        )}/1 today. Upgrade to Pro for unlimited sessions, or come back after midnight.`,
      );
      return;
    }
    setPlanMessage("");
    const detailNotes = activeTemplateFields
      .map((field) => {
        const value = templateDetails[field.id]?.trim();
        return value ? `${field.label}: ${value}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const captureNotes =
      captureMode === "transcript"
        ? ""
        : [
            `Capture method: ${captureModeLabels[captureMode]}.`,
            recordedSeconds ? `Captured duration: ${recordedSeconds} seconds.` : "",
            recordingConsent ? "Audio capture consent was confirmed before capture." : "",
            captureMode === "in_person" || captureMode === "audio"
              ? "Student voice identification is teacher-assisted. Live segments are labeled as unknown voices until you link them to roster students."
              : "",
            captureMode === "online_meeting"
              ? "Online meeting capture used browser tab/window audio when available. Platform transcripts remain the most reliable source when live text is incomplete."
              : "",
            transcriptionAvailable ? "Live transcript was added when available." : "No live transcript was available; teacher notes should guide the draft.",
          ]
            .filter(Boolean)
            .join("\n");
    const transcriptSource =
      structuredTranscript?.source === "whisper_transcription" || structuredTranscript?.source === "screen_recording"
        ? structuredTranscript.source
        : captureMode !== "transcript"
        ? transcript.trim()
          ? "live_transcription"
          : "audio_recording"
        : zoomCloudImported
          ? "zoom_cloud_transcript"
        : fileName
          ? "file"
          : "paste";
    const session = createGeneratedSession({
      title,
      template,
      transcript,
      notes: [notes, detailNotes, captureNotes].filter(Boolean).join("\n\n"),
      roster,
      resources,
      captureMode,
      captureSourceLabel: captureModeLabels[captureMode],
      captureDurationSeconds: recordedSeconds || undefined,
      transcriptSource,
      structuredTranscript:
        structuredTranscript ??
        createStructuredTranscriptFromText(transcript, {
          title: `${title || "Class session"} transcript`,
          source: transcriptSource,
          durationSeconds: recordedSeconds || undefined,
        }),
    });
    const privacyAdjustedSession =
      zoomCloudImported && session.capture?.transcriptSource === "zoom_cloud_transcript"
        ? {
            ...session,
            transcript: "",
            notes: appendCapturedText(session.notes, "Raw Zoom cloud transcript auto-deleted after draft generation."),
          }
        : session;
    const selectedGroup = classGroups.find((group) => group.id === loadedClassGroupId);
    setDraft({
      ...privacyAdjustedSession,
      ownerEmail,
      classGroupId: selectedGroup?.id,
      classGroupName: selectedGroup?.name,
    });
    onDraftCreated(privacyAdjustedSession);
    navigate("processing", { session: privacyAdjustedSession.id });
  };

  const updateTemplateDetail = (id: string, value: string) => {
    setTemplateDetails((current) => ({ ...current, [id]: value }));
  };

  const useSavedRoster = (templateId: string) => {
    setLoadedRosterTemplateId(templateId);
    setLoadedClassGroupId("");
    const selectedTemplate = rosterTemplates.find((templateItem) => templateItem.id === templateId);
    if (selectedTemplate) {
      setRoster(formatRosterFromStudents(selectedTemplate.students));
    }
  };

  const useClassGroup = (groupId: string) => {
    setLoadedClassGroupId(groupId);
    setLoadedRosterTemplateId("");
    const selectedGroup = classGroups.find((group) => group.id === groupId);
    if (selectedGroup) {
      setTemplate(selectedGroup.defaultSessionType);
      setRoster(formatRosterFromStudents(selectedGroup.students));
    }
  };

  const chooseTemplate = (option: SessionType) => {
    setTemplate(option);
    setTemplateDetails({});
    const savedRoster = rosterTemplates.find((templateItem) => templateItem.sessionType === option);
    if (savedRoster) {
      setRoster(formatRosterFromStudents(savedRoster.students));
      setLoadedRosterTemplateId(savedRoster.id);
      setLoadedClassGroupId("");
    } else {
      setLoadedRosterTemplateId("");
    }
  };

  return (
    <div className="page-stack">
      <section className="import-layout">
        <div className="import-main">
          <div className="section-heading">
            <span className="eyebrow">New class record</span>
            <h2>Import a transcript, notes, or both.</h2>
            <p>ClassLoop will draft your review page, then wait for your approval before students see anything.</p>
          </div>

          <div className="form-grid">
            <label className="field wide">
              <span>Session title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="field wide">
              <span>Session template</span>
              <select value={template} onChange={(event) => chooseTemplate(event.target.value as SessionType)}>
                {templateOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <small className="field-helper">{templateDescriptions[template]}</small>
            </label>
            <p className="field-helper wide">
              Drafts use a pasted roster, a saved class roster, or a saved roster template. Import and manage external
              class data from the Classes or Rosters pages.
            </p>
            {(matchingRosterTemplates.length > 0 || matchingClassGroups.length > 0) && (
              <div className="saved-roster-row wide">
                {matchingClassGroups.length > 0 && (
                  <label className="field compact">
                    <span>Preload class roster</span>
                    <select value={loadedClassGroupId} onChange={(event) => useClassGroup(event.target.value)}>
                      <option value="">Choose a saved class</option>
                      {matchingClassGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} · {group.students.length} students
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {matchingRosterTemplates.length > 0 && (
                  <label className="field compact">
                    <span>Preload saved roster</span>
                    <select value={loadedRosterTemplateId} onChange={(event) => useSavedRoster(event.target.value)}>
                      <option value="">Choose a saved roster</option>
                      {matchingRosterTemplates.map((templateItem) => (
                        <option key={templateItem.id} value={templateItem.id}>
                          {templateItem.name} · {templateItem.students.length} students
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {activeTemplateFields.length > 0 && (
              <div className="template-detail-card wide">
                <div>
                  <strong>{template} details</strong>
                  <small>These optional fields shape the draft without adding extra review work later.</small>
                </div>
                <div className="template-detail-grid">
                  {activeTemplateFields.map((field) => (
                    <label key={field.id} className="field compact">
                      <span>{field.label}</span>
                      <textarea
                        value={templateDetails[field.id] ?? ""}
                        onChange={(event) => updateTemplateDetail(field.id, event.target.value)}
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="capture-panel wide">
              <div>
                <span className="eyebrow">Capture source</span>
                <h3>Use a transcript, in-person capture, or meeting audio.</h3>
                <p>
                  Transcript paste/upload stays the most reliable path. Live capture is best-effort, consent-first, and keeps speaker matching in your hands.
                </p>
              </div>
              <div className="capture-mode-grid">
                <button
                  type="button"
                  className={captureMode === "transcript" ? "capture-mode-card active" : "capture-mode-card"}
                  onClick={() => setCaptureMode("transcript")}
                >
                  <UploadCloud size={18} />
                  <strong>Transcript</strong>
                  <small>Upload or paste Zoom, Meet, text, VTT, or notes.</small>
                </button>
                <button
                  type="button"
                  className={[
                    "capture-mode-card",
                    captureMode === "in_person" || captureMode === "audio" ? "active" : "",
                    canUseLiveCapture ? "" : "locked",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (!canUseLiveCapture) {
                      setPlanMessage("In-person live capture is available with Pro.");
                      return;
                    }
                    setCaptureMode("in_person");
                  }}
                >
                  <Mic2 size={18} />
                  <strong>In-person class</strong>
                  <small>Use the device microphone for live notes during classroom discussion.</small>
                  {!canUseLiveCapture && <small className="pro-lock-note">Pro only</small>}
                </button>
                <button
                  type="button"
                  className={[
                    "capture-mode-card",
                    captureMode === "online_meeting" ? "active" : "",
                    canUseLiveCapture ? "" : "locked",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (!canUseLiveCapture) {
                      setPlanMessage("Online meeting capture is available with Pro.");
                      return;
                    }
                    setCaptureMode("online_meeting");
                    setShowMeetingHelp(true);
                  }}
                >
                  <PlayCircle size={18} />
                  <strong>Online meeting</strong>
                  <small>Capture a tab or window with audio when the browser supports it.</small>
                  {!canUseLiveCapture && <small className="pro-lock-note">Pro only</small>}
                </button>
              </div>
              {captureMode !== "transcript" && (
                <div className="capture-controls">
                  <div>
                    <strong>
                      {captureStatus === "recording"
                          ? "Recording now"
                          : captureModeLabels[captureMode]}
                    </strong>
                    <small>
                      {captureStatus === "recording"
                        ? `${recordedSeconds}s captured`
                        : captureMode === "online_meeting"
                          ? "Start capture when the call begins. If live text is incomplete, paste the platform transcript afterward."
                          : "Start capture before discussion, then stop before generating the draft."}
                    </small>
                  </div>
                  {recordingConsentRequired && (
                    <label className="capture-consent">
                      <input
                        type="checkbox"
                        checked={recordingConsent}
                        onChange={(event) => setRecordingConsent(event.target.checked)}
                      />
                      <span>I have permission to capture audio notes for this class session.</span>
                    </label>
                  )}
                  <div className="capture-buttons">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => startCapture(captureMode)}
                      disabled={captureStatus === "recording" || (recordingConsentRequired && !recordingConsent)}
                    >
                      <Mic2 size={17} />
                      Start capture
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={stopCapture}
                      disabled={captureStatus !== "recording"}
                    >
                      <CheckCircle2 size={17} />
                      Stop
                    </button>
                  </div>
                </div>
              )}
              {recordedAudioUrl && (
                <div className="recording-review">
                  <div>
                    <strong>Recording ready</strong>
                    <small>{recordedAudioLabel || `${captureModeLabels[captureMode]} captured`}</small>
                  </div>
                  <audio controls src={recordedAudioUrl} />
                  <button className="ghost-button" type="button" onClick={transcribeRecordedCapture} disabled={!recordedAudioBlob}>
                    <Sparkles size={17} />
                    Transcribe recording
                  </button>
                </div>
              )}
              {captureMode !== "transcript" && (
                <div className="capture-guidance">
                  <CheckCircle2 size={17} />
                  <div>
                    <strong>No voiceprints are created.</strong>
                    <small>
                      ClassLoop labels live speech as unknown voice segments. After the draft is created, link each segment to a roster student,
                      add a new student, or leave it unassigned.
                    </small>
                  </div>
                </div>
              )}
              {captureMessage && <p className="capture-message">{captureMessage}</p>}
              {whisperStatus && <p className="capture-message">{whisperStatus}</p>}
            </div>
            {captureMode === "transcript" && (
              <>
                <div className="capture-panel wide" aria-label="Zoom cloud transcript import">
                  <div>
                    <span className="eyebrow">Zoom cloud import</span>
                    <h3>Import transcript-ready Zoom meetings.</h3>
                    <p>
                      Show recent meetings with transcript files, search by date or title, then choose the transcript
                      file when Zoom has more than one.
                    </p>
                  </div>
                  <div className="saved-roster-row">
                    <label className="field compact">
                      <span>Search date or title</span>
                      <input value={zoomSearch} onChange={(event) => setZoomSearch(event.target.value)} placeholder="CS4All or 2026-04-28" />
                    </label>
                    <label className="field compact">
                      <span>Transcript-ready meeting</span>
                      <select value={selectedZoomMeeting?.id ?? ""} onChange={(event) => setSelectedZoomMeetingId(event.target.value)}>
                        {filteredZoomMeetings.map((meeting) => (
                          <option key={meeting.id} value={meeting.id}>
                            {meeting.title} · {formatDate(meeting.date)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field compact">
                      <span>Transcript file</span>
                      <select
                        value={selectedZoomTranscriptFile?.id ?? ""}
                        onChange={(event) => setSelectedZoomTranscriptFileId(event.target.value)}
                      >
                        {(selectedZoomMeeting?.files ?? []).map((file) => (
                          <option key={file.id} value={file.id}>
                            {file.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="capture-guidance">
                    <ShieldCheck size={17} />
                    <div>
                      <strong>Raw transcript retention</strong>
                      <small>
                        Zoom cloud transcript text is used to generate the recap, then removed from the saved session.
                        Structured recap, tasks, resources, participation, and follow-ups remain.
                      </small>
                    </div>
                  </div>
                  <button className="ghost-button" type="button" onClick={importZoomCloudTranscript}>
                    <Download size={17} />
                    Import selected Zoom transcript
                  </button>
                  {zoomMessage && <p className="settings-message success">{zoomMessage}</p>}
                </div>
                <label className="upload-zone wide">
                  <UploadCloud size={24} />
                  <strong>{fileName || "Upload transcript, audio, or screen recording"}</strong>
                  <small>Text files load directly. Audio and video recordings are transcribed when the service is available.</small>
                  <input
                    type="file"
                    accept=".txt,.vtt,.srt,audio/*,video/*,.mp3,.mp4,.m4a,.wav,.webm,.mov"
                    onChange={(event) => handleTranscriptFile(event.target.files?.[0])}
                  />
                </label>
                <label className="field paste-field large-paste wide">
                  <span>Paste transcript text</span>
                  <textarea
                    value={transcript}
                    onChange={(event) => {
                      setTranscript(event.target.value);
                      setStructuredTranscript(undefined);
                    }}
                    placeholder="Paste the raw transcript here..."
                  />
                </label>
              </>
            )}
          </div>
        </div>

        <aside className="import-summary">
          <div className="summary-card">
            <span className="summary-icon">
              <Sparkles size={22} />
            </span>
            <h3>Draft will include</h3>
            <ul>
              <li>Clean teacher recap</li>
              <li>Homework and due dates</li>
              <li>Personal student reminders</li>
              <li>Attendance and quiet flags</li>
              <li>Student dashboard updates</li>
            </ul>
            <button className="text-button sample-link" onClick={loadSample}>
              <PlayCircle size={18} />
              Use geometry sample
            </button>
            {transcriptFormatWarning && (
              <p className="settings-message" role="status">
                {transcriptFormatWarning}
              </p>
            )}
            {resourceFormatWarning && (
              <p className="settings-message" role="status">
                {resourceFormatWarning}
              </p>
            )}
            {importPreflightWarnings.map((warning) => (
              <p key={warning} className="settings-message" role="status">
                {warning}
              </p>
            ))}
            <button className="primary-button full" onClick={generateDraft} disabled={!canCreateSession || !hasSessionContext}>
              <Wand2 size={18} />
              Generate draft
            </button>
            <TemplateLinkCard
              title="Google Docs class template"
              detail="Make a copy, fill in class context, roster notes, resources, questions, and due dates, then paste or upload the meeting record here."
              url={classTemplateCopyUrl}
            />
            {!canCreateSession && !planMessage && (
              <p className="settings-message">
                Free accounts can generate 1 session per day. This unlocks again after midnight, or you can upgrade to Pro.
              </p>
            )}
            {(planMessage || !canCreateSession) && (
              <>
                {planMessage && <p className="settings-message">{planMessage}</p>}
                <button className="ghost-button full" type="button" onClick={() => navigate("billing")}>
                  View plan options
                </button>
              </>
            )}
          </div>
          <div className="summary-input-card">
            <div className="summary-fields">
              <label className="field compact">
                <span>Meeting notes</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Quick reminders, homework notes, absences"
                />
              </label>
              <label className="field compact">
                <span>Roster</span>
                <textarea
                  value={roster}
                  onChange={(event) => setRoster(event.target.value)}
                  placeholder="Name, email per line"
                />
              </label>
              <label className="field compact">
                <span>Resources</span>
                <textarea
                  value={resources}
                  onChange={(event) => setResources(event.target.value)}
                  placeholder="Paste links or resources"
                />
              </label>
            </div>
          </div>
        </aside>
      </section>
      {showMeetingHelp && (
        <MeetingCaptureHelpModal
          onClose={() => setShowMeetingHelp(false)}
          onStart={() => {
            setShowMeetingHelp(false);
            void startCapture("online_meeting");
          }}
        />
      )}
    </div>
  );
}

const processingSteps = [
  "Reading transcript and notes",
  "Finding participation signals",
  "Drafting student follow-ups",
  "Preparing teacher review",
];

function Processing({ draft }: { draft: Session | null }) {
  const [step, setStep] = useState(0);
  const steps = processingSteps;

  useEffect(() => {
    setStep(0);
    const timers = steps.map((_, index) => window.setTimeout(() => setStep(index), index * 520));
    return () => timers.forEach(window.clearTimeout);
  }, [draft?.id, steps]);

  useEffect(() => {
    if (step < steps.length - 1) return undefined;
    const finish = window.setTimeout(() => navigate("review"), 650);
    return () => window.clearTimeout(finish);
  }, [step, steps.length]);

  return (
    <div className="processing-page">
      <div className="processing-core">
        <span className="processing-orbit">
          <Sparkles size={34} />
        </span>
        <span className="eyebrow">Draft in progress</span>
        <h2>{draft?.title ?? "Preparing draft"}</h2>
        <p>ClassLoop is turning the messy record into a teacher-editable follow-up loop.</p>
        <div className="processing-steps">
          {steps.map((item, index) => (
            <div key={item} className={index <= step ? "processing-step active" : "processing-step"}>
              <CheckCircle2 size={17} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewDraft({
  draft,
  setDraft,
  studentAccountEmails,
}: {
  draft: Session | null;
  setDraft: (session: Session | null) => void;
  studentAccountEmails: string[];
}) {
  const [saveMessage, setSaveMessage] = useState("");
  const [activeReviewTab, setActiveReviewTab] = useState<"roster" | "recap" | "transcript" | "followup">("roster");

  if (!draft) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No draft yet"
        detail="Import the sample geometry transcript to generate your review page."
        action="Create new session"
        onAction={() => navigate("new-session")}
      />
    );
  }

  const update = (changes: Partial<Session>) => setDraft({ ...draft, ...changes });

  const updateAction = (id: string, changes: Partial<ActionItem>) => {
    update({ actionItems: draft.actionItems.map((item) => (item.id === id ? { ...item, ...changes } : item)) });
  };

  const updateResource = (id: string, changes: Partial<Resource>) => {
    update({ resources: draft.resources.map((resource) => (resource.id === id ? { ...resource, ...changes } : resource)) });
  };

  const updateFollowUp = (studentId: string, changes: Partial<StudentFollowUp>) => {
    update({
      followUps: draft.followUps.map((followUp) =>
        followUp.studentId === studentId ? { ...followUp, ...changes } : followUp,
      ),
    });
  };

  const updateParticipation = (id: string, changes: Partial<ParticipationEvent>) => {
    update({
      participationEvents: draft.participationEvents.map((event) => (event.id === id ? { ...event, ...changes } : event)),
    });
  };

  const updateRoster = (students: Student[]) => setDraft(syncSessionRoster(draft, students));

  const updateAttendance = (studentId: string, status: AttendanceStatus) => {
    update({ attendance: { ...draft.attendance, [studentId]: status } });
  };

  const reviewImportWarning = (warningId: string) => {
    setDraft(markImportWarningReviewed(draft, warningId));
  };

  const resolveUnmatchedParticipant = (participant: UnmatchedParticipant, mode: "add" | "link", studentId?: string) => {
    setDraft(resolveParticipant(draft, participant, mode, studentId));
  };

  const saveDraft = () => {
    setDraft({ ...draft });
    setSaveMessage("Draft saved.");
    window.setTimeout(() => setSaveMessage(""), 1800);
  };

  return (
    <div className="page-stack review-page">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Teacher control center</span>
          <h2>Edit the draft before publishing.</h2>
          <p>
            Student dashboards stay private until you approve the recap, assignments, resources, and participation
            labels.
          </p>
        </div>
        <div className="review-actions">
          <button className="ghost-button" onClick={saveDraft}>
            <Save size={17} />
            {saveMessage || "Save draft"}
          </button>
          <button className="primary-button" onClick={() => navigate("publish-preview")}>
            <Send size={17} />
            Preview and publish
          </button>
        </div>
      </section>

      <Panel title="Teacher review" icon={FileText}>
        <div className="review-tabs" role="tablist" aria-label="Review sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeReviewTab === "roster"}
            className={activeReviewTab === "roster" ? "ghost-button active" : "ghost-button"}
            onClick={() => setActiveReviewTab("roster")}
          >
            Roster & matching
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeReviewTab === "recap"}
            className={activeReviewTab === "recap" ? "ghost-button active" : "ghost-button"}
            onClick={() => setActiveReviewTab("recap")}
          >
            Class recap
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeReviewTab === "transcript"}
            className={activeReviewTab === "transcript" ? "ghost-button active" : "ghost-button"}
            onClick={() => setActiveReviewTab("transcript")}
          >
            Transcript
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeReviewTab === "followup"}
            className={activeReviewTab === "followup" ? "ghost-button active" : "ghost-button"}
            onClick={() => setActiveReviewTab("followup")}
          >
            Follow-up
          </button>
        </div>
      </Panel>

      <ImportQualityPanel warnings={draft.importWarnings ?? []} onReview={reviewImportWarning} />

      {activeReviewTab === "roster" && (
        <section className="content-grid align-start">
          <ParticipantResolutionPanel
            participants={draft.unmatchedParticipants ?? []}
            students={draft.students}
            onResolve={resolveUnmatchedParticipant}
          />
          <RosterManager
            students={draft.students}
            attendance={draft.attendance}
            studentAccountEmails={studentAccountEmails}
            sessionTitle={draft.title}
            onStudentsChange={updateRoster}
            onAttendanceChange={updateAttendance}
          />
        </section>
      )}

      {activeReviewTab === "recap" && (
        <section className="content-grid align-start">
          <Panel title="Class recap" icon={FileText}>
            <label className="field compact">
              <span>Approved recap</span>
              <textarea value={draft.recap} onChange={(event) => update({ recap: event.target.value })} />
            </label>
            <div className="question-list">
              {draft.essentialQuestions.map((question, index) => (
                <label key={question} className="field compact">
                  <span>Essential question {index + 1}</span>
                  <input
                    value={question}
                    onChange={(event) => {
                      const next = [...draft.essentialQuestions];
                      next[index] = event.target.value;
                      update({ essentialQuestions: next });
                    }}
                  />
                </label>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {activeReviewTab === "transcript" && (
        <section className="content-grid align-start">
          <StructuredTranscriptPanel
            transcript={draft.structuredTranscript}
            emptyDetail="Paste a transcript or transcribe a recording to keep a cleaned, speaker-labeled meeting transcript."
          />
        </section>
      )}

      {activeReviewTab === "followup" && (
        <section className="content-grid align-start">
          <Panel title="Action items" icon={ListChecks}>
            <div className="editable-stack">
              {draft.actionItems.map((item) => (
                <div key={item.id} className="editable-item">
                  <input value={item.title} onChange={(event) => updateAction(item.id, { title: event.target.value })} />
                  <textarea
                    value={item.description}
                    onChange={(event) => updateAction(item.id, { description: event.target.value })}
                  />
                  <div className="inline-fields">
                    <input
                      type="date"
                      value={item.dueDate}
                      onChange={(event) => updateAction(item.id, { dueDate: event.target.value })}
                    />
                    <select
                      value={item.status}
                      onChange={(event) => updateAction(item.id, { status: event.target.value as TaskStatus })}
                    >
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="complete">Complete</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </div>
                  <small>{item.source}</small>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Resources" icon={LinkIcon}>
            <div className="editable-stack">
              {draft.resources.map((resource) => (
                <div key={resource.id} className="editable-item">
                  <input
                    value={resource.title}
                    onChange={(event) => updateResource(resource.id, { title: event.target.value })}
                  />
                  <input value={resource.url} onChange={(event) => updateResource(resource.id, { url: event.target.value })} />
                  <input
                    value={resource.relatedTopic}
                    onChange={(event) => updateResource(resource.id, { relatedTopic: event.target.value })}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Student-specific follow-ups" icon={Users}>
            <div className="followup-grid">
              {draft.followUps.map((followUp) => {
                const student = studentById(followUp.studentId, draft.students);
                return (
                  <article key={followUp.studentId} className="followup-card">
                    <div className="student-line">
                      <Avatar student={student} />
                      <div>
                        <strong>{student.name}</strong>
                        <small>{attendanceLabel(draft.attendance[student.id] ?? "present")}</small>
                      </div>
                      <StatusPill status={followUp.status} />
                    </div>
                    <label className="field compact">
                      <span>Personal reminder</span>
                      <textarea
                        value={followUp.reminder}
                        onChange={(event) => updateFollowUp(followUp.studentId, { reminder: event.target.value })}
                      />
                    </label>
                    <label className="field compact">
                      <span>Catch-up note</span>
                      <textarea
                        value={followUp.catchUp}
                        onChange={(event) => updateFollowUp(followUp.studentId, { catchUp: event.target.value })}
                      />
                    </label>
                    <div className="inline-fields">
                      <input
                        type="date"
                        value={followUp.dueDate}
                        onChange={(event) => updateFollowUp(followUp.studentId, { dueDate: event.target.value })}
                      />
                      <select
                        value={followUp.status}
                        onChange={(event) => updateFollowUp(followUp.studentId, { status: event.target.value as TaskStatus })}
                      >
                        <option value="todo">To do</option>
                        <option value="in_progress">In progress</option>
                        <option value="submitted">Submitted</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="complete">Complete</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>

          <Panel title="Participation signals" icon={SlidersHorizontal}>
            <div className="signal-list">
              {draft.participationEvents.map((event) => (
                <div key={event.id} className="signal-row">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={event.approved}
                      onChange={(inputEvent) => updateParticipation(event.id, { approved: inputEvent.target.checked })}
                    />
                    <span />
                  </label>
                  <div>
                    <strong>
                      {studentById(event.studentId, draft.students).name} · {participationLabel(event.type)}
                    </strong>
                    <input value={event.text} onChange={(inputEvent) => updateParticipation(event.id, { text: inputEvent.target.value })} />
                    <small>
                      {Math.round(event.confidence * 100)}% confidence
                      {event.reviewRequired ? " · review required" : ""}
                    </small>
                    {event.sourceLine && <small>Source: {event.sourceLine}</small>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
}

function RosterManager({
  students,
  attendance,
  studentAccountEmails,
  sessionTitle,
  onStudentsChange,
  onAttendanceChange,
  showAttendance = true,
  wrapPanel = true,
  showCsvActions = true,
}: {
  students: Student[];
  attendance: Record<string, AttendanceStatus>;
  studentAccountEmails: string[];
  sessionTitle: string;
  onStudentsChange: (students: Student[]) => void;
  onAttendanceChange: (studentId: string, status: AttendanceStatus) => void;
  showAttendance?: boolean;
  wrapPanel?: boolean;
  showCsvActions?: boolean;
}) {
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [rosterSearch, setRosterSearch] = useState("");
  const visibleStudents = useMemo(() => {
    const query = rosterSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [student.name, student.email, ...(student.aliases ?? [])].some((value) => value.toLowerCase().includes(query)),
    );
  }, [rosterSearch, students]);
  const hiddenStudentCount = students.length - visibleStudents.length;
  const updateStudent = (studentId: string, changes: Partial<Student>) => {
    onStudentsChange(students.map((student) => (student.id === studentId ? { ...student, ...changes } : student)));
  };
  const addStudent = () => onStudentsChange([...students, makeRosterStudent("", "", students.length)]);
  const removeStudent = (studentId: string) => onStudentsChange(students.filter((student) => student.id !== studentId));
  const linkAccount = (student: Student) => {
    updateStudent(student.id, { linkedAccountEmail: normalizeEmail(student.email) });
  };
  const sendInvite = (student: Student) => {
    const email = normalizeEmail(student.email);
    if (!email) return;
    const subject = encodeURIComponent(`ClassLoop follow-up for ${sessionTitle}`);
    const body = encodeURIComponent(
      `Hi ${student.name},\n\nYour teacher prepared a ClassLoop follow-up for ${sessionTitle}.\n\nYou can create or sign in to your ClassLoop student account with this email address to see your recap, resources, and tasks.\n\nThanks!`,
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    updateStudent(student.id, { inviteSentAt: new Date().toISOString() });
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    const importedStudents = rosterStudentsFromCsv(await file.text());
    if (importedStudents.length) onStudentsChange(importedStudents);
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const content = (
    <div className="roster-manager">
      {showCsvActions && (
        <div className="roster-template-actions">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => importCsv(event.target.files?.[0])}
            hidden
          />
          <button className="ghost-button" type="button" onClick={() => csvInputRef.current?.click()}>
            <UploadCloud size={17} />
            Import CSV
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => downloadTextFile(`${slugify(sessionTitle, "classloop-roster")}.csv`, rosterToCsv(students), "text/csv")}
          >
            <ArrowUpRight size={17} />
            Export CSV
          </button>
        </div>
      )}
      <div className="roster-manager-toolbar">
        <label className="field compact roster-search-field">
          <span>Find student</span>
          <input
            value={rosterSearch}
            onChange={(event) => setRosterSearch(event.target.value)}
            placeholder="Search name, email, or Zoom alias"
          />
        </label>
        <div className="roster-count" aria-live="polite">
          <strong>{visibleStudents.length}</strong>
          <span>
            shown of {students.length}
            {hiddenStudentCount > 0 ? ` · ${hiddenStudentCount} hidden` : ""}
          </span>
        </div>
      </div>
      <div className="roster-editor-list">
        {visibleStudents.map((student) => {
          const index = Math.max(0, students.findIndex((item) => item.id === student.id));
          return (
          <article key={student.id} className={showAttendance ? "roster-row" : "roster-row without-attendance"}>
            <Avatar student={student} />
            <label className="field compact roster-name-field">
              <span>Name</span>
              <input value={student.name} onChange={(event) => updateStudent(student.id, { name: event.target.value })} />
            </label>
            <label className="field compact roster-email-field">
              <span>Email</span>
              <input value={student.email} onChange={(event) => updateStudent(student.id, { email: event.target.value })} />
            </label>
            {showAttendance && (
              <label className="field compact roster-attendance-field">
                <span>Attendance</span>
                <select
                  value={attendance[student.id] ?? "present"}
                  onChange={(event) => onAttendanceChange(student.id, event.target.value as AttendanceStatus)}
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
              </label>
            )}
            <label className="field compact roster-aliases-field">
              <span>Zoom names</span>
              <input
                value={(student.aliases ?? []).join(", ")}
                onChange={(event) =>
                  updateStudent(student.id, {
                    aliases: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={index === 0 ? "Maya C, Maya iPad" : "Optional aliases"}
              />
            </label>
            <div className="student-access-cell">
              <span>Student access</span>
              <small>
                {student.linkedAccountEmail
                  ? `Linked to ${student.linkedAccountEmail}`
                  : studentAccountEmails.includes(normalizeEmail(student.email))
                    ? "Matching account found"
                    : student.inviteSentAt
                      ? "Email invite prepared"
                      : "No account linked"}
              </small>
              <div>
                <button className="text-button" type="button" onClick={() => linkAccount(student)} disabled={!student.email}>
                  <Link2 size={16} />
                  Link
                </button>
                <button className="text-button" type="button" onClick={() => sendInvite(student)} disabled={!student.email}>
                  <Mail size={16} />
                  Email
                </button>
              </div>
            </div>
            <button className="icon-button danger roster-remove-button" type="button" onClick={() => removeStudent(student.id)} aria-label={`Remove ${student.name}`}>
              <Trash2 size={17} />
            </button>
          </article>
          );
        })}
      </div>
      {!visibleStudents.length && students.length > 0 && (
        <div className="inline-empty compact-empty">
          <span>
            <Search size={18} />
          </span>
          <div>
            <strong>No roster matches</strong>
            <p>Clear the search or try a student email, first name, last name, or Zoom alias.</p>
          </div>
        </div>
      )}
      <button className="ghost-button full" type="button" onClick={addStudent}>
        <UserPlus size={17} />
        Add student
      </button>
    </div>
  );

  if (!wrapPanel) return content;
  return (
    <Panel title="Roster manager" icon={Users}>
      {content}
    </Panel>
  );
}

function ClassGroupsPage({
  groups,
  rosterTemplates,
  sessions,
  ownerEmail,
  onCreateFromTemplate,
  onCreateTemplateFromGroup,
  onCreateBlank,
  onUpdate,
  onDelete,
}: {
  groups: ClassGroup[];
  rosterTemplates: RosterTemplate[];
  sessions: Session[];
  ownerEmail: string;
  onCreateFromTemplate: (template: RosterTemplate) => void;
  onCreateTemplateFromGroup: (group: ClassGroup) => void;
  onCreateBlank: (group: ClassGroup) => void;
  onUpdate: (groupId: string, changes: Partial<ClassGroup>) => void;
  onDelete: (groupId: string) => void;
}) {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.id ?? "");
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const groupSessions = activeGroup
    ? sessions.filter((session) => session.classGroupId === activeGroup.id || session.classGroupName === activeGroup.name)
    : [];

  useEffect(() => {
    if (groups.length && !groups.some((group) => group.id === activeGroupId)) setActiveGroupId(groups[0].id);
    if (!groups.length && activeGroupId) setActiveGroupId("");
  }, [activeGroupId, groups]);

  const createBlankClass = () => {
    const now = new Date().toISOString();
    const group: ClassGroup = {
      id: `class-group-${Date.now().toString(36)}`,
      ownerEmail,
      name: "New class",
      description: "",
      defaultSessionType: "General classroom",
      students: [],
      createdAt: now,
      updatedAt: now,
    };
    onCreateBlank(group);
    setActiveGroupId(group.id);
  };

  if (!groups.length) {
    return (
      <div className="page-stack class-group-page">
        <section className="review-banner">
          <div>
            <span className="eyebrow">Class manager</span>
            <h2>Keep each class roster ready for the next session.</h2>
            <p>Create a class manually or turn an existing saved roster into a reusable class group.</p>
          </div>
          <button className="primary-button" type="button" onClick={createBlankClass}>
            <UserPlus size={17} />
            Create class
          </button>
        </section>
        <section className={rosterTemplates.length > 0 ? "content-grid two-columns align-start" : "class-empty-center"}>
          <EmptyState
            icon={BookOpen}
            title="No classes yet"
            detail="Create a class here, then manage its roster from the Rosters tab."
            action="Create class"
            onAction={createBlankClass}
          />
          {rosterTemplates.length > 0 && (
            <Panel title="Start from a saved roster" icon={Users}>
              <div className="roster-template-list">
                {rosterTemplates.map((template) => (
                  <button key={template.id} className="roster-template-card" type="button" onClick={() => onCreateFromTemplate(template)}>
                    <strong>{template.name}</strong>
                    <span>{template.sessionType}</span>
                    <small>{template.students.length} students</small>
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack class-group-page">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Class manager</span>
          <h2>Reusable classes and course rosters.</h2>
          <p>Use this page for class details and linked sessions. Edit student rosters from the Rosters tab.</p>
        </div>
        <button className="primary-button" type="button" onClick={createBlankClass}>
          <UserPlus size={17} />
          New class
        </button>
      </section>

      <section className="content-grid roster-template-layout align-start">
        <Panel title="Classes" icon={BookOpen}>
          <div className="roster-template-list">
            {groups.map((group) => (
              <button
                key={group.id}
                className={group.id === activeGroup.id ? "roster-template-card selected" : "roster-template-card"}
                type="button"
                onClick={() => setActiveGroupId(group.id)}
              >
                <strong>{group.name}</strong>
                <span>{group.defaultSessionType}</span>
                <small>{group.students.length} students</small>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Class details" icon={Settings2}>
          <div className="roster-template-settings">
            <label className="field compact">
              <span>Class name</span>
              <input value={activeGroup.name} onChange={(event) => onUpdate(activeGroup.id, { name: event.target.value })} />
            </label>
            <label className="field compact">
              <span>Default template</span>
              <select
                value={activeGroup.defaultSessionType}
                onChange={(event) => onUpdate(activeGroup.id, { defaultSessionType: event.target.value as SessionType })}
              >
                {templateOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="field compact class-description-field">
              <span>Description</span>
              <textarea
                value={activeGroup.description ?? ""}
                onChange={(event) => onUpdate(activeGroup.id, { description: event.target.value })}
                placeholder="Period, subject, room, norms, support notes, or context for this class"
              />
            </label>
            <div className="class-history-card">
              <strong>{activeGroup.students.length}</strong>
              <span>students in roster</span>
            </div>
            <div className="class-history-card">
              <strong>{groupSessions.length}</strong>
              <span>published sessions linked to this class</span>
            </div>
            <div className="roster-template-actions">
              <button className="ghost-button danger" type="button" onClick={() => onDelete(activeGroup.id)}>
                <Trash2 size={17} />
                Delete class
              </button>
              <button className="ghost-button" type="button" onClick={() => onCreateTemplateFromGroup(activeGroup)}>
                <Save size={17} />
                Add roster template
              </button>
              <button className="text-button" type="button" onClick={() => navigate("rosters")}>
                Manage roster
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="class-session-list">
            {groupSessions.length ? (
              groupSessions.slice(0, 8).map((session) => (
                <button
                  key={session.id}
                  className="class-session-row"
                  type="button"
                  onClick={() => navigate("report", { session: session.id })}
                >
                  <span>
                    <strong>{session.title}</strong>
                    <small>{formatDate(session.date)} · {session.followUps.length} follow-ups</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <div className="inline-empty compact-empty">
                <span>
                  <BookOpen size={18} />
                </span>
                <div>
                  <strong>No linked sessions yet</strong>
                  <p>Create a session from this saved class to build class history here.</p>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function RosterTemplatesPage({
  templates,
  classGroups,
  ownerEmail,
  onCreate,
  onUpdate,
  onDelete,
  onCreateClassGroup,
  onUpdateClassGroup,
}: {
  templates: RosterTemplate[];
  classGroups: ClassGroup[];
  ownerEmail: string;
  onCreate: (template: RosterTemplate) => void;
  onUpdate: (templateId: string, changes: Partial<RosterTemplate>) => void;
  onDelete: (templateId: string) => void;
  onCreateClassGroup: (template: RosterTemplate) => void;
  onUpdateClassGroup: (groupId: string, changes: Partial<ClassGroup>) => void;
}) {
  const [activeTemplateId, setActiveTemplateId] = useState(templates[0]?.id ?? "");
  const [activeClassGroupId, setActiveClassGroupId] = useState(classGroups[0]?.id ?? "");
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const activeTemplate = templates.find((template) => template.id === activeTemplateId) ?? templates[0];
  const activeClassGroup = classGroups.find((group) => group.id === activeClassGroupId) ?? classGroups[0];
  const activeAttendance =
    activeTemplate?.students.reduce<Record<string, AttendanceStatus>>((acc, student) => {
      acc[student.id] = "present";
      return acc;
    }, {}) ?? {};
  const activeClassAttendance =
    activeClassGroup?.students.reduce<Record<string, AttendanceStatus>>((acc, student) => {
      acc[student.id] = "present";
      return acc;
    }, {}) ?? {};

  useEffect(() => {
    if (templates.length && !templates.some((template) => template.id === activeTemplateId)) {
      setActiveTemplateId(templates[0].id);
    }
    if (!templates.length && activeTemplateId) {
      setActiveTemplateId("");
    }
  }, [activeTemplateId, templates]);

  useEffect(() => {
    if (classGroups.length && !classGroups.some((group) => group.id === activeClassGroupId)) {
      setActiveClassGroupId(classGroups[0].id);
    }
    if (!classGroups.length && activeClassGroupId) {
      setActiveClassGroupId("");
    }
  }, [activeClassGroupId, classGroups]);

  const createTemplate = () => {
    const now = new Date().toISOString();
    const template: RosterTemplate = {
      id: `roster-template-${Date.now().toString(36)}`,
      ownerEmail,
      name: "New roster",
      sessionType: "General classroom",
      students: [],
      createdAt: now,
      updatedAt: now,
    };
    onCreate(template);
    setActiveTemplateId(template.id);
  };

  const importCsvIntoActiveTemplate = async (file?: File) => {
    if (!file || !activeTemplate) return;
    const students = rosterStudentsFromCsv(await file.text());
    if (students.length) {
      onUpdate(activeTemplate.id, { students });
    }
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  if (!templates.length && !classGroups.length) {
    return (
      <div className="page-stack roster-template-page">
        <section className="review-banner">
          <div>
            <span className="eyebrow">Roster manager</span>
            <h2>Save rosters once, reuse them later.</h2>
            <p>Create a saved roster here, or create a class first and manage the class roster from this tab.</p>
          </div>
          <button className="primary-button" type="button" onClick={createTemplate}>
            <UserPlus size={17} />
            Create roster
          </button>
        </section>
        <EmptyState
          icon={Users}
          title="No saved rosters yet"
          detail="Publish your first session or create a roster here to reuse students across future lessons."
          action="Create roster"
          onAction={createTemplate}
        />
      </div>
    );
  }

  return (
    <div className="page-stack roster-template-page">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Roster manager</span>
          <h2>Class and saved rosters.</h2>
          <p>Select a class roster at the top for day-to-day editing. Saved roster templates stay reusable for new sessions.</p>
        </div>
        <button className="primary-button" type="button" onClick={createTemplate}>
          <UserPlus size={17} />
          New saved roster
        </button>
      </section>

      {activeClassGroup && (
        <Panel title="Class roster" icon={BookOpen}>
          <div className="roster-class-selector">
            <label className="field compact">
              <span>Class</span>
              <select value={activeClassGroup.id} onChange={(event) => setActiveClassGroupId(event.target.value)}>
                {classGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.students.length} students
                  </option>
                ))}
              </select>
            </label>
            <div className="class-history-card">
              <strong>{activeClassGroup.students.length}</strong>
              <span>students in this class roster</span>
            </div>
            <button className="text-button" type="button" onClick={() => navigate("classes")}>
              Edit class details
              <ChevronRight size={16} />
            </button>
          </div>
          <RosterManager
            students={activeClassGroup.students}
            attendance={activeClassAttendance}
            studentAccountEmails={[]}
            sessionTitle={activeClassGroup.name}
            onStudentsChange={(students) => onUpdateClassGroup(activeClassGroup.id, { students })}
            onAttendanceChange={() => undefined}
            showAttendance={false}
            wrapPanel={false}
          />
        </Panel>
      )}

      {!templates.length && (
        <EmptyState
          icon={Users}
          title="No saved roster templates yet"
          detail="Your class roster is editable above. Add a saved roster template only when you want a reusable roster that is not tied to one class."
          action="Create saved roster"
          onAction={createTemplate}
        />
      )}

      {templates.length > 0 && (
      <section className="content-grid roster-template-layout align-start">
        <Panel title="Saved rosters" icon={Users}>
          <div className="roster-template-list">
            {templates.map((template) => (
              <button
                key={template.id}
                className={template.id === activeTemplate.id ? "roster-template-card selected" : "roster-template-card"}
                type="button"
                onClick={() => setActiveTemplateId(template.id)}
              >
                <strong>{template.name}</strong>
                <span>{template.sessionType}</span>
                <small>{template.students.length} students</small>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Roster details" icon={Settings2}>
          <div className="roster-template-settings">
            <label className="field compact">
              <span>Roster name</span>
              <input
                value={activeTemplate.name}
                onChange={(event) => onUpdate(activeTemplate.id, { name: event.target.value })}
              />
            </label>
            <label className="field compact">
              <span>Session type</span>
              <select
                value={activeTemplate.sessionType}
                onChange={(event) => onUpdate(activeTemplate.id, { sessionType: event.target.value as SessionType })}
              >
                {templateOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button className="ghost-button danger" type="button" onClick={() => onDelete(activeTemplate.id)}>
              <Trash2 size={17} />
              Delete roster
            </button>
            <div className="roster-template-actions">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => importCsvIntoActiveTemplate(event.target.files?.[0])}
                hidden
              />
              <button className="ghost-button" type="button" onClick={() => csvInputRef.current?.click()}>
                <UploadCloud size={17} />
                Import CSV
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `${slugify(activeTemplate.name, "classloop-roster")}.csv`,
                    rosterToCsv(activeTemplate.students),
                    "text/csv",
                  )
                }
              >
                <ArrowUpRight size={17} />
                Export CSV
              </button>
              <button className="text-button" type="button" onClick={() => onCreateClassGroup(activeTemplate)}>
                Save as class
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <RosterManager
            students={activeTemplate.students}
            attendance={activeAttendance}
            studentAccountEmails={[]}
            sessionTitle={activeTemplate.name}
            onStudentsChange={(students) => onUpdate(activeTemplate.id, { students })}
            onAttendanceChange={() => undefined}
            showAttendance={false}
            wrapPanel={false}
            showCsvActions={false}
          />
        </Panel>
      </section>
      )}
    </div>
  );
}

function SaveRosterTemplatePrompt({
  session,
  onSave,
  onSkip,
}: {
  session: Session;
  onSave: (name: string) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState(`${session.type} roster`);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="save-roster-title">
      <form
        className="password-reset-modal roster-template-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name);
        }}
      >
        <div className="modal-header">
          <div>
            <h2 id="save-roster-title">Save this roster?</h2>
            <p>Reuse these {session.students.length} students the next time you create a {session.type.toLowerCase()} session.</p>
          </div>
        </div>
        <label className="field compact">
          <span>Roster name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Period 4 Geometry"
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onSkip}>
            Not now
          </button>
          <button className="primary-button" type="submit">
            <Save size={17} />
            Save roster
          </button>
        </div>
      </form>
    </div>
  );
}

function previewDiffForStudent(session: Session, student: Student) {
  const followUp = session.followUps.find((item) => item.studentId === student.id);
  const personalEvents = session.participationEvents.filter((event) => event.studentId === student.id && event.approved);
  const personalActions = session.actionItems.filter((item) => item.ownerId === student.id);
  const classActions = session.actionItems.filter((item) => !item.ownerId);
  const attendance = session.attendance[student.id] ?? "present";
  const reasons: Array<{ label: string; detail: string }> = [];

  if (attendance === "absent") {
    reasons.push({
      label: "Missed session",
      detail: "The preview emphasizes catch-up notes because this student was marked absent.",
    });
  } else if (attendance === "late") {
    reasons.push({
      label: "Arrived late",
      detail: "The preview keeps the class recap prominent in case they missed the opening context.",
    });
  }

  personalEvents.slice(0, 3).forEach((event) => {
    reasons.push({
      label: participationLabel(event.type),
      detail: event.text,
    });
  });

  personalActions.forEach((item) => {
    reasons.push({
      label: "Individual action item",
      detail: item.title,
    });
  });

  if (followUp?.reminder) {
    reasons.push({
      label: "Personal reminder",
      detail: followUp.reminder,
    });
  }

  const uniqueTaskCount = Math.max(0, (followUp?.tasks.length ?? 0) - classActions.length);

  if (!reasons.length) {
    reasons.push({
      label: "Shared class baseline",
      detail: "No individual attendance or participation differences were detected, so this student gets the shared recap, tasks, and resources.",
    });
  }

  return {
    followUp,
    personalEvents,
    reasons,
    sharedTaskCount: classActions.length,
    uniqueTaskCount,
  };
}

function ParticipantResolutionPanel({
  participants,
  students,
  onResolve,
}: {
  participants: UnmatchedParticipant[];
  students: Student[];
  onResolve: (participant: UnmatchedParticipant, mode: "add" | "link", studentId?: string) => void;
}) {
  const [selectedLinks, setSelectedLinks] = useState<Record<string, string>>({});

  if (!participants.length) {
    return (
      <Panel title="Transcript speaker matching" icon={Link2}>
        <div className="inline-empty compact-empty">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <strong>All transcript speakers match the roster</strong>
            <p>When a Zoom display name does not match a student, ClassLoop will pause here before using it.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Resolve transcript speakers" icon={Link2}>
      <div className="participant-stack">
        {participants.map((participant) => {
          const selectedStudentId =
            selectedLinks[participant.name] ?? participant.suggestedStudentId ?? students[0]?.id ?? "";
          return (
            <article key={participant.name} className="participant-card">
              <div>
                <span className="eyebrow">Zoom name found</span>
                <h4>{participant.name}</h4>
                <p>
                  Add to roster creates one new student for this speaker only. Link name attaches this Zoom display name to
                  an existing roster student for future sessions.
                </p>
                {participant.lines[0] && <small>{participant.lines[0]}</small>}
              </div>
              <div className="participant-actions">
                <button className="ghost-button" type="button" onClick={() => onResolve(participant, "add")}>
                  <UserPlus size={17} />
                  Add to roster
                </button>
                <div className="link-student-control">
                  <select
                    value={selectedStudentId}
                    onChange={(event) =>
                      setSelectedLinks((current) => ({ ...current, [participant.name]: event.target.value }))
                    }
                  >
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => onResolve(participant, "link", selectedStudentId)}
                    disabled={!selectedStudentId}
                  >
                    <Link2 size={17} />
                    Link name
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function unresolvedBlockingImportWarnings(session: Session) {
  return (session.importWarnings ?? []).filter((warning) => warning.severity === "blocking" && !warning.reviewed);
}

function markImportWarningReviewed(session: Session, warningId: string) {
  return {
    ...session,
    importWarnings: (session.importWarnings ?? []).map((warning) =>
      warning.id === warningId ? { ...warning, reviewed: true } : warning,
    ),
  };
}

function ImportQualityPanel({
  warnings,
  onReview,
}: {
  warnings: ImportQualityWarning[];
  onReview?: (warningId: string) => void;
}) {
  if (!warnings.length) return null;
  const blockingCount = warnings.filter((warning) => warning.severity === "blocking" && !warning.reviewed).length;
  return (
    <Panel title="Import quality review" icon={AlertTriangle}>
      <div className="import-warning-list">
        {blockingCount > 0 && (
          <div className="inline-empty compact-empty import-warning-summary">
            <span>
              <CircleAlert size={20} />
            </span>
            <div>
              <strong>Publish is paused until these warnings are reviewed</strong>
              <p>Use source lines, roster matching, and participation toggles before making student dashboards visible.</p>
            </div>
          </div>
        )}
        {warnings.map((warning) => (
          <article key={warning.id} className={`import-warning-card ${warning.severity}`}>
            <div>
              <span className="eyebrow">{warning.severity === "blocking" ? "Review required" : warning.severity}</span>
              <strong>{warning.title}</strong>
              <p>{warning.message}</p>
              <small>{warning.source}</small>
            </div>
            {onReview && warning.severity === "blocking" && (
              <button className={warning.reviewed ? "ghost-button" : "primary-button"} type="button" onClick={() => onReview(warning.id)}>
                <CheckCircle2 size={17} />
                {warning.reviewed ? "Reviewed" : "Mark reviewed"}
              </button>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function PublishPreview({
  draft,
  selectedStudentId,
  setSelectedStudentId,
  setDraft,
  publishDraft,
}: {
  draft: Session | null;
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  setDraft: (session: Session | null) => void;
  publishDraft: (sessionOverride?: Session) => void;
}) {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [integrationMessage, setIntegrationMessage] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [selectedEmailRecipients, setSelectedEmailRecipients] = useState<string[]>([]);
  const [magicLinksEnabled, setMagicLinksEnabled] = useState(false);
  const [classroomPostType, setClassroomPostType] = useState<ClassroomPostType>("announcement");
  const [classroomPostTitle, setClassroomPostTitle] = useState("");
  const [classroomPostBody, setClassroomPostBody] = useState("");
  const [classroomPostDueDateValue, setClassroomPostDueDateValue] = useState("");
  const [classroomPostMessage, setClassroomPostMessage] = useState("");
  const loadIntegrationStatus = async () => {
    try {
      const status = await apiJson<IntegrationStatus>("/api/integrations/status");
      setIntegrationStatus(status);
      setIntegrationMessage("");
    } catch (error) {
      setIntegrationMessage(error instanceof Error ? error.message : "Unable to load integration status.");
    }
  };

  useEffect(() => {
    loadIntegrationStatus();
  }, []);

  useEffect(() => {
    if (!draft) return;
    setSelectedEmailRecipients(studentEmailRecipients(draft));
    setClassroomPostType("announcement");
    setClassroomPostTitle(defaultClassroomPostTitle(draft));
    setClassroomPostBody(defaultClassroomPostBody(draft));
    setClassroomPostDueDateValue(classroomPostDueDate(draft));
    setClassroomPostMessage("");
  }, [draft?.id]);

  if (!draft) {
    return (
      <EmptyState
        icon={Eye}
        title="No draft to preview"
        detail="Generate a draft first, then preview exactly what students will receive."
        action="Back to review"
        onAction={() => navigate("review")}
      />
    );
  }

  const activeStudentId = draft.students.some((student) => student.id === selectedStudentId)
    ? selectedStudentId
    : draft.students[0]?.id ?? selectedStudentId;
  const student = studentById(activeStudentId, draft.students);
  const followUp = draft.followUps.find((item) => item.studentId === activeStudentId);
  const selectedPreviewDiff = previewDiffForStudent(draft, student);
  const delivery = draft.emailDelivery ?? { status: "not_sent" as const, recipients: [], skipped: [] };
  const emailSent = delivery.status === "sent";
  const isPublished = draft.status === "published";
  const emailRecipientOptions = draft.students
    .map((studentItem) => ({
      student: studentItem,
      email: studentAccessEmails(studentItem)[0] ?? "",
    }))
    .filter((option) => option.email && !option.email.endsWith("@classloop.local"));
  const recipientCount = selectedEmailRecipients.length;
  const currentPublishAudit = draft.publishAudit ?? makePublishAudit(draft);
  const blockingImportWarnings = unresolvedBlockingImportWarnings(draft);
  const updatePreviewSession = (sessionId: string, updater: (session: Session) => Session) => {
    if (sessionId === draft.id) setDraft(updater(draft));
  };
  const updateDraft = (updater: (session: Session) => Session) => setDraft(updater(draft));
  const toggleEmailRecipient = (email: string, enabled: boolean) => {
    setSelectedEmailRecipients((current) =>
      enabled ? uniqueText([...current, email]) : current.filter((recipient) => recipient !== email),
    );
  };
  const previewClassroomPost = () => {
    setClassroomPostMessage(
      `Edited ${classroomPostType} is ready. Classroom posting is not connected yet, so copy this draft into your classroom tool.`,
    );
  };
  const sendStudentEmails = async () => {
    if (emailSent || recipientCount === 0 || isSendingEmail) return;
    if (!isPublished) {
      setDeliveryMessage("Publish the session before sending recap emails.");
      return;
    }
    setIsSendingEmail(true);
    setDeliveryMessage("");
    try {
      const result = await apiJson<EmailDeliveryResult>("/api/email/send-recaps", {
        method: "POST",
        body: JSON.stringify({
          sessionId: draft.id,
          ownerEmail: draft.ownerEmail,
          recipients: selectedEmailRecipients,
          includeAccessInstructions: magicLinksEnabled,
        }),
      });
      updateDraft((current) => markSessionEmailsSent(current, result));
      setDeliveryMessage(`Sent recap emails to ${result.recipients.length} students.`);
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "Unable to send recap emails.");
    } finally {
      setIsSendingEmail(false);
    }
  };
  return (
    <div className="page-stack publish-preview-page">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Publish preview</span>
          <h2>Review the student view before anything goes live.</h2>
          <p>
            Pick a student, scan the recap, tasks, resources, and check-in state, then publish when the student-facing
            version looks right.
          </p>
        </div>
        <div className="review-actions publish-actions">
          <button className="ghost-button" onClick={() => navigate("review")}>
            <Settings2 size={17} />
            Edit session
          </button>
          <button className="ghost-button" onClick={() => navigate("dashboard")}>
            <Save size={17} />
            Save and close
          </button>
          <button className="primary-button" onClick={() => publishDraft()} disabled={blockingImportWarnings.length > 0}>
            <Send size={17} />
            {blockingImportWarnings.length ? "Review warnings first" : "Publish to students"}
          </button>
        </div>
      </section>

      <ImportQualityPanel warnings={draft.importWarnings ?? []} onReview={(warningId) => updateDraft((current) => markImportWarningReviewed(current, warningId))} />

      <section className="content-grid two-columns align-start">
        <Panel title="One-click student delivery" icon={Mail}>
          <div className="delivery-card">
            <div>
              <strong>{emailSent ? "Recaps sent" : "Send recap and action items"}</strong>
              <p>
                {emailSent
                  ? `Sent to ${delivery.recipients.length} students${delivery.sentAt ? ` on ${formatDate(delivery.sentAt)}` : ""}.`
                  : isPublished
                    ? `${recipientCount} students have deliverable roster or linked account emails.`
                    : "Publish the session first, then send the approved recap and action items."}
              </p>
              {!emailSent && integrationStatus?.email?.configured && (
                <small>
                  Sender: {integrationStatus.email.from}
                  {integrationStatus.email.replyTo ? ` · replies go to ${integrationStatus.email.replyTo}` : ""}
                </small>
              )}
              {!emailSent && integrationStatus && !integrationStatus.email?.configured && (
                <small>
                  Email delivery is not available right now. Export or print the recap instead.
                </small>
              )}
              {!emailSent && (
                <div className="integration-checkbox-list" aria-label="Email recap recipients">
                  {emailRecipientOptions.map(({ student: recipientStudent, email }) => (
                    <label key={recipientStudent.id} className="switch-row">
                      <input
                        type="checkbox"
                        checked={selectedEmailRecipients.includes(email)}
                        onChange={(event) => toggleEmailRecipient(email, event.target.checked)}
                      />
                      <span>
                        <strong>{recipientStudent.name}</strong>
                        <small>{email}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {!emailSent && (
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={magicLinksEnabled}
                    onChange={(event) => setMagicLinksEnabled(event.target.checked)}
                  />
                  <span>
                    <strong>Include student sign-in instructions</strong>
                    <small>
                      Recap emails can include the roster email, student sign-in path, and ClassLoop access instructions when email delivery is available.
                    </small>
                  </span>
                </label>
              )}
              {magicLinksEnabled && (
                <div className="magic-link-preview-list" aria-label="Student access instruction preview">
                  <strong>Access instructions will be added for {recipientCount} recipients.</strong>
                  <small>
                    {integrationStatus?.email?.configured
                      ? "Recap email delivery is available. ClassLoop will include student access instructions when the account supports them."
                      : "Email delivery is not available right now, so this is a preview."}
                  </small>
                </div>
              )}
              {delivery.skipped.length > 0 && <small>Skipped: {delivery.skipped.join(", ")}</small>}
              {delivery.failed?.length ? <small>Failed: {delivery.failed.join("; ")}</small> : null}
              {studentsWithoutDeliverableEmail(draft).length > 0 && (
                <small>No deliverable email: {studentsWithoutDeliverableEmail(draft).join(", ")}</small>
              )}
              {deliveryMessage && <small>{deliveryMessage}</small>}
              {integrationMessage && <small>{integrationMessage}</small>}
            </div>
            <button
              className="primary-button full"
              type="button"
              onClick={sendStudentEmails}
              disabled={!isPublished || emailSent || recipientCount === 0 || isSendingEmail}
            >
              {emailSent ? <CheckCircle2 size={17} /> : <Send size={17} />}
              {emailSent ? "Emails sent" : isSendingEmail ? "Sending..." : "Send recap emails"}
            </button>
          </div>
        </Panel>
        <Panel title="Google Classroom post" icon={GraduationCap}>
          <div className="delivery-card">
            <div>
              <strong>Teacher-approved class-wide post</strong>
              <p>
                Edit the exact Classroom content before posting. This stays class-wide: recap, resources, and shared
                tasks only.
              </p>
            </div>
            <div className="saved-roster-row">
              <label className="field compact">
                <span>Post type</span>
                <select value={classroomPostType} onChange={(event) => setClassroomPostType(event.target.value as ClassroomPostType)}>
                  <option value="announcement">Announcement</option>
                  <option value="assignment">Assignment</option>
                  <option value="material">Material</option>
                </select>
              </label>
              {classroomPostType === "assignment" && (
                <label className="field compact">
                  <span>Assignment due date</span>
                  <input
                    type="date"
                    value={classroomPostDueDateValue}
                    onChange={(event) => setClassroomPostDueDateValue(event.target.value)}
                  />
                </label>
              )}
            </div>
            <label className="field compact">
              <span>Classroom title</span>
              <input value={classroomPostTitle} onChange={(event) => setClassroomPostTitle(event.target.value)} />
            </label>
            <label className="field compact">
              <span>Classroom body</span>
              <textarea value={classroomPostBody} onChange={(event) => setClassroomPostBody(event.target.value)} />
            </label>
            <div className="capture-guidance">
              <ShieldCheck size={17} />
              <div>
                <strong>Integration status</strong>
                <small>
                  Classroom posting is not connected yet. Review the draft here, then copy it into your classroom tool.
                </small>
              </div>
            </div>
            <button className="ghost-button full" type="button" onClick={previewClassroomPost}>
              <Send size={17} />
              Prepare Classroom post
            </button>
            {classroomPostMessage && <small>{classroomPostMessage}</small>}
          </div>
        </Panel>
      </section>

      {(draft.deliveryLogs ?? []).length > 0 && (
        <Panel title="Delivery log" icon={ClipboardCheck}>
          <div className="delivery-log-list">
            {(draft.deliveryLogs ?? []).map((log) => (
              <div key={log.id} className="delivery-log-row">
                <span>{log.provider.replace("_", " ")}</span>
                <strong>{log.target}</strong>
                <small>
                  {log.message} · {formatDate(log.createdAt)}
                </small>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Publish audit" icon={ClipboardCheck}>
        <div className="publish-audit-list">
          {currentPublishAudit.slice(0, 8).map((entry, index) => {
            const auditStudent = entry.studentId ? studentById(entry.studentId, draft.students) : null;
            return (
              <div key={`${entry.type}-${entry.studentId ?? "class"}-${index}`} className="publish-audit-row">
                <span>{auditStudent ? auditStudent.name : "Class-wide"}</span>
                <strong>{entry.type.replace(/_/g, " ")}</strong>
                <small>{entry.message}</small>
              </div>
            );
          })}
        </div>
      </Panel>

      <section className="content-grid two-columns align-start">
        <Panel title="Choose student preview" icon={GraduationCap}>
          <div className="student-picker preview-picker">
            {draft.students.map((item) => (
              <button
                key={item.id}
                className={item.id === activeStudentId ? "student-picker-item active" : "student-picker-item"}
                onClick={() => setSelectedStudentId(item.id)}
              >
                <Avatar student={item} />
                <span>{item.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </Panel>
        <StudentVisibleEditor session={draft} studentId={activeStudentId} updateSession={updatePreviewSession} />
        <div className="wide">
          <Panel title="Per-student preview differences" icon={SlidersHorizontal}>
            <div className="preview-diff-list">
              {draft.students.map((item) => {
                const diff = previewDiffForStudent(draft, item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === activeStudentId ? "preview-diff-row active" : "preview-diff-row"}
                    onClick={() => setSelectedStudentId(item.id)}
                  >
                    <Avatar student={item} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>
                        {diff.personalEvents.length} signals · {diff.uniqueTaskCount} personalized tasks · {diff.sharedTaskCount} shared tasks
                      </small>
                    </span>
                    <em>{diff.reasons[0]?.label}</em>
                  </button>
                );
              })}
            </div>
          </Panel>
        </div>
      </section>

      <section className="student-preview-frame" aria-label={`Preview for ${student.name}`}>
        <div className="student-preview-top">
          <div>
            <span className="eyebrow">Student portal preview</span>
            <h3>{student.name}'s dashboard</h3>
            <p>{student.email}</p>
          </div>
          <StatusPill status={followUp?.status ?? "todo"} />
        </div>
        {followUp && (
          <div className="student-preview-card">
            <span className="eyebrow">Latest class</span>
            <h4>{draft.title}</h4>
            <p>{followUp.catchUp}</p>
            <div className="tag-row">
              <span>Due {formatDate(followUp.dueDate)}</span>
              <span>{followUp.tasks.length} tasks</span>
              <span>{draft.resources.length} resources</span>
            </div>
          </div>
        )}
        <div className="student-preview-columns">
          <div>
            <strong>Class-wide recap</strong>
            <p>{draft.recap}</p>
          </div>
          <div>
            <strong>Personal next steps</strong>
            {followUp?.reminder && <p>{followUp.reminder}</p>}
            <ul>
              {(followUp?.tasks ?? []).map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Why this is assigned</strong>
            {selectedPreviewDiff.reasons.length ? (
              <ul>
                {selectedPreviewDiff.reasons.slice(0, 4).map((reason) => (
                  <li key={`${reason.label}-${reason.detail}`}>
                    <b>{reason.label}:</b> {reason.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p>This student receives the shared recap and any class-wide work for the session.</p>
            )}
          </div>
          <div>
            <strong>Resources</strong>
            <ul>
              {draft.resources.map((resource) => (
                <li key={resource.id}>{resource.title}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function SessionReport({
  sessions,
  fallback,
  editSession,
  deleteSession,
}: {
  sessions: Session[];
  fallback?: Session;
  editSession: (session: Session) => void;
  deleteSession: (session: Session) => void;
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const sessionId = getParam("session");
  const session = sessions.find((item) => item.id === sessionId) ?? fallback;

  if (!session) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No sessions yet"
        detail="Create a session to see the teacher report."
        action="Create new session"
        onAction={() => navigate("new-session")}
      />
    );
  }

  const activeSignals = session.participationEvents.filter((event) => event.approved);
  const absent = Object.entries(session.attendance).filter(([, status]) => status === "absent");
  const quiet = activeSignals.filter((event) => event.type === "quiet");

  return (
    <div className="page-stack">
      <section className="report-hero">
        <div>
          <span className="eyebrow">{formatDate(session.date)}</span>
          <h2>{session.title}</h2>
          <p>{session.recap}</p>
        </div>
        <div className="report-actions">
          <button className="ghost-button" onClick={() => editSession(session)}>
            <Settings2 size={17} />
            Edit session
          </button>
          <div className="report-export">
            <button
              className="ghost-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((current) => !current)}
            >
              <ArrowUpRight size={17} />
              Export
              <ChevronDown size={16} />
            </button>
            {exportMenuOpen && (
              <div className="report-export-menu" role="menu" aria-label="Export options">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportMenuOpen(false);
                    downloadTextFile(
                      `${slugify(session.title, "classloop-session")}.json`,
                      JSON.stringify(session, null, 2),
                      "application/json",
                    );
                  }}
                >
                  <ArrowUpRight size={16} />
                  Download JSON
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportMenuOpen(false);
                    downloadTextFile(
                      `${slugify(session.title, "classloop-follow-through")}.csv`,
                      sessionFollowThroughCsv(session),
                      "text/csv",
                    );
                  }}
                >
                  <FileText size={16} />
                  Download CSV
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setExportMenuOpen(false);
                    window.print();
                  }}
                >
                  <ClipboardCheck size={16} />
                  Print report
                </button>
              </div>
            )}
          </div>
          <button className="ghost-button danger" type="button" onClick={() => deleteSession(session)}>
            <Trash2 size={17} />
            Delete session
          </button>
          <button className="primary-button" onClick={() => navigate("student")}>
            <GraduationCap size={17} />
            View student dashboard
          </button>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          icon={UserRoundCheck}
          label="Present"
          value={`${session.students.length - absent.length}/${session.students.length}`}
          detail="Roster attendance"
          accent="green"
        />
        <MetricCard
          icon={MessageSquare}
          label="Signals"
          value={activeSignals.length.toString()}
          detail="Approved participation events"
          accent="blue"
        />
        <MetricCard icon={UserX} label="Absent" value={absent.length.toString()} detail="Catch-up assigned" accent="amber" />
        <MetricCard icon={Mic2} label="Quiet flags" value={quiet.length.toString()} detail="Private support" accent="rose" />
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Essential questions" icon={BookOpen}>
          <div className="question-chips">
            {session.essentialQuestions.map((question) => (
              <span key={question}>{question}</span>
            ))}
          </div>
        </Panel>

        <Panel title="Resources" icon={LinkIcon}>
          <div className="resource-list">
            {session.resources.map((resource) => (
              <a key={resource.id} className="resource-row" href={resource.url} target="_blank" rel="noreferrer">
                <span>
                  <BookOpen size={17} />
                </span>
                <div>
                  <strong>{resource.title}</strong>
                  <small>{resource.relatedTopic}</small>
                </div>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Follow-through tracker" icon={Target}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Attendance</th>
                <th>Follow-up</th>
                <th>Due</th>
                <th>Status</th>
                <th>Readiness</th>
              </tr>
            </thead>
            <tbody>
              {session.followUps.map((followUp) => {
                const student = studentById(followUp.studentId, session.students);
                return (
                  <tr key={followUp.studentId}>
                    <td>
                      <span className="table-student">
                        <Avatar student={student} />
                        {student.name}
                      </span>
                    </td>
                    <td>{attendanceLabel(session.attendance[student.id] ?? "present")}</td>
                    <td>{followUp.reminder}</td>
                    <td>{formatDate(followUp.dueDate)}</td>
                    <td>
                      <StatusPill status={followUp.status} />
                    </td>
                    <td>
                      <ProgressBar value={followUp.score} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {(session.publishAudit ?? []).length > 0 && (
        <Panel title="Publish audit" icon={ClipboardCheck}>
          <div className="publish-audit-list">
            {(session.publishAudit ?? []).map((entry, index) => {
              const auditStudent = entry.studentId ? studentById(entry.studentId, session.students) : null;
              return (
                <div key={`${entry.type}-${entry.studentId ?? "class"}-${index}`} className="publish-audit-row">
                  <span>{auditStudent ? auditStudent.name : "Class-wide"}</span>
                  <strong>{entry.type.replace(/_/g, " ")}</strong>
                  <small>{entry.message}</small>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

function ProductFeedbackPrompt({
  session,
  student,
  onSubmit,
  submittedProductFeedbackKeys,
}: {
  session: Session;
  student: Student;
  onSubmit: ProductFeedbackSubmitter;
  submittedProductFeedbackKeys: string[];
}) {
  const existingFeedback = submittedProductFeedbackKeys.includes(productFeedbackKey(session.id, student.id));
  const [dismissed, setDismissed] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    setDismissed(false);
    setSelectedRating(0);
    setNote("");
    setSubmitted(false);
    setSubmitting(false);
    setSubmitError("");
  }, [session.id, student.id]);

  if ((existingFeedback && !submitted) || dismissed) return null;

  const submit = async (rating: number, feedbackNote = note) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    const delivered = await onSubmit(session, student, rating, feedbackNote);
    setSubmitting(false);
    if (!delivered) {
      setSubmitError("Feedback could not be sent. Try again in a moment.");
      return;
    }
    setSubmitted(true);
    window.setTimeout(() => setDismissed(true), 1800);
  };

  const prompt = (
    <section className="student-feedback-toast" role="region" aria-label="ClassLoop product feedback">
      {submitted ? (
        <div className="feedback-thanks" role="status" aria-live="polite">
          <CheckCircle2 size={18} />
          <span>Thanks. Your feedback helps improve ClassLoop.</span>
        </div>
      ) : (
        <>
          <div className="feedback-toast-header">
            <span>
              <strong>Help improve ClassLoop?</strong>
              <small>
                Rate this follow-up. Your teacher will not see it; ClassLoop sends your feedback and the related transcript
                context to the creator.
              </small>
            </span>
            <button className="icon-button" type="button" aria-label="Dismiss ClassLoop product feedback" onClick={() => setDismissed(true)}>
              <X size={16} />
            </button>
          </div>
          <div className="feedback-rating-row" aria-label="Feedback score">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                className={selectedRating === rating ? "selected" : ""}
                aria-label={`Rate ${rating} out of 5`}
                disabled={submitting}
                onClick={() => {
                  setSelectedRating(rating);
                  if (rating >= 4) void submit(rating, "");
                }}
              >
                {rating}
              </button>
            ))}
          </div>
          {submitError && (
            <p className="settings-message" role="status">
              {submitError}
            </p>
          )}
          {selectedRating > 0 && selectedRating <= 3 && (
            <form
              className="feedback-improvement-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(selectedRating);
              }}
            >
              <label className="field compact">
                <span>What would make ClassLoop better?</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={600}
                  placeholder="Example: show one worked example or explain the task more clearly."
                />
              </label>
              <button className="primary-button" type="submit" disabled={submitting}>
                <Send size={16} />
                {submitting ? "Sending..." : "Send feedback"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );

  return createPortal(prompt, document.body);
}

function StudentDashboard({
  sessions,
  selectedStudentId,
  setSelectedStudentId,
  markFollowUpComplete,
  auth,
  updateSession,
  submitProductFeedback,
  submittedProductFeedbackKeys,
}: {
  sessions: Session[];
  selectedStudentId: string;
  setSelectedStudentId: (id: string) => void;
  markFollowUpComplete: (sessionId: string, studentId: string, note?: string, attachmentUrl?: string) => void;
  auth: AuthSession;
  updateSession?: (sessionId: string, updater: (session: Session) => Session) => void;
  submitProductFeedback?: ProductFeedbackSubmitter;
  submittedProductFeedbackKeys?: string[];
}) {
  const published = sessions.filter((session) => session.status === "published");
  const visibleSessions =
    auth.role === "student"
      ? published.filter((session) => session.students.some((student) => studentMatchesEmail(student, auth.email)))
      : published;

  if (!visibleSessions.length) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No student dashboard yet"
        detail={
          auth.role === "teacher"
            ? "Publish a session first, then ClassLoop will create personalized student recaps and check-ins."
            : "Your teacher has not published any sessions for this account yet."
        }
        action={auth.role === "teacher" ? "Create a session" : undefined}
        onAction={auth.role === "teacher" ? () => navigate("new-session") : undefined}
      />
    );
  }

  const latest = visibleSessions[0];
  const roster = latest.students;

  if (!roster.length) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No student roster yet"
        detail="Add a roster when creating the session to publish personalized student dashboards."
        action="Create a session"
        onAction={() => navigate("new-session")}
      />
    );
  }

  const matchedStudent =
    auth.role === "student" ? roster.find((item) => studentMatchesEmail(item, auth.email)) : undefined;
  const activeStudentId = matchedStudent?.id ?? (roster.some((student) => student.id === selectedStudentId) ? selectedStudentId : roster[0].id);
  const student = studentById(activeStudentId, roster);
  const latestFollowUp = latest?.followUps.find((followUp) => followUp.studentId === activeStudentId);
  const latestFollowUpCompleted = ["submitted", "reviewed", "complete"].includes(latestFollowUp?.status ?? "");
  const studentTasks = visibleSessions.flatMap((session) =>
    session.followUps
      .filter((followUp) => followUp.studentId === activeStudentId)
      .map((followUp) => ({ session, followUp })),
  );
  const sortedStudentTasks = [...studentTasks].sort((a, b) => {
    const aTime = new Date(a.followUp.dueDate).getTime();
    const bTime = new Date(b.followUp.dueDate).getTime();
    return (Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime) - (Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime);
  });
  const dueSoonTasks = sortedStudentTasks.slice(0, 3);

  return (
    <div className="page-stack student-page">
      <section className="student-hero">
        <div>
          <span className="eyebrow">{auth.role === "teacher" ? "Student preview" : "My dashboard"}</span>
          <h2>{student.name}'s follow-up dashboard</h2>
          <p>
            Personalized recaps, resources, and completion check-ins stay calm and simple for students.
          </p>
        </div>
        {auth.role === "teacher" ? (
          <div className="student-picker">
            {roster.map((item) => (
              <button
                key={item.id}
                className={item.id === activeStudentId ? "student-picker-item active" : "student-picker-item"}
                onClick={() => setSelectedStudentId(item.id)}
              >
                <Avatar student={item} />
                <span>{item.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="student-identity">
            <Avatar student={student} />
            <span>{student.email}</span>
          </div>
        )}
      </section>

      {auth.role === "student" && (
        <Panel title="Tasks due soon" icon={Clock3}>
          <div className="task-list">
            {dueSoonTasks.length ? (
              dueSoonTasks.map(({ session, followUp }) => (
                <button
                  key={`due-${session.id}-${followUp.studentId}`}
                  className="task-row"
                  onClick={() => navigate("student-session", { session: session.id })}
                >
                  <span className="task-check">
                    {["submitted", "reviewed", "complete"].includes(followUp.status) ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                  </span>
                  <span>
                    <strong>{followUp.tasks[0]}</strong>
                    <small>
                      {session.title} · due {formatDate(followUp.dueDate)}
                    </small>
                  </span>
                  <StatusPill status={followUp.status} />
                </button>
              ))
            ) : (
              <p className="readable">No open ClassLoop tasks yet.</p>
            )}
          </div>
        </Panel>
      )}

      {latest && latestFollowUp && (
        <section className="today-card">
          <div>
            <span className="eyebrow">Latest class</span>
            <h3>{latest.title}</h3>
            <p>{latestFollowUp.catchUp}</p>
            <div className="tag-row">
              <StatusPill status={latestFollowUp.status} />
              <span>{formatDate(latest.date)}</span>
              <span>Due {formatDate(latestFollowUp.dueDate)}</span>
            </div>
          </div>
          <div className="today-actions">
            <button className="ghost-button" onClick={() => navigate("student-session", { session: latest.id })}>
              <BookOpen size={17} />
              Open detail
            </button>
            <button className="primary-button" onClick={() => markFollowUpComplete(latest.id, activeStudentId)}>
              <CheckCircle2 size={17} />
              Mark complete
            </button>
          </div>
        </section>
      )}

      {auth.role === "student" && latest && latestFollowUp && (
        <Panel title="Since your last visit" icon={SlidersHorizontal}>
          <div className="student-change-list">
            {previewDiffForStudent(latest, student)
              .reasons.slice(0, 3)
              .map((reason) => (
                <div key={`${reason.label}-${reason.detail}`} className="student-change-row">
                  <CheckCircle2 size={17} />
                  <span>
                    <strong>{reason.label}</strong>
                    <small>{reason.detail}</small>
                  </span>
                </div>
              ))}
          </div>
        </Panel>
      )}

      {auth.role === "teacher" && latest && latestFollowUp && updateSession && (
        <StudentVisibleEditor session={latest} studentId={activeStudentId} updateSession={updateSession} compact />
      )}

      <section className="content-grid two-columns align-start">
        <Panel title="My tasks" icon={ListChecks}>
          <div className="task-list">
            {sortedStudentTasks.map(({ session, followUp }) => (
              <button
                key={`${session.id}-${followUp.studentId}`}
                className="task-row"
                onClick={() => navigate("student-session", { session: session.id })}
              >
                <span className="task-check">
                  {["submitted", "reviewed", "complete"].includes(followUp.status) ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
                </span>
                <span>
                  <strong>{followUp.tasks[0]}</strong>
                  <small>
                    {session.title} · due {formatDate(followUp.dueDate)}
                  </small>
                </span>
                <StatusPill status={followUp.status} />
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Resources for me" icon={BookOpen}>
          <div className="resource-list">
            {(latest?.resources ?? []).map((resource) => (
              <a key={resource.id} className="resource-row" href={resource.url} target="_blank" rel="noreferrer">
                <span>
                  <BookOpen size={17} />
                </span>
                <div>
                  <strong>{resource.title}</strong>
                  <small>{resource.relatedTopic}</small>
                </div>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
        </Panel>
      </section>

      {auth.role === "student" && latest && latestFollowUpCompleted && submitProductFeedback && (
        <ProductFeedbackPrompt
          session={latest}
          student={student}
          onSubmit={submitProductFeedback}
          submittedProductFeedbackKeys={submittedProductFeedbackKeys ?? []}
        />
      )}
    </div>
  );
}

function StudentSessionDetail({
  sessions,
  selectedStudentId,
  markFollowUpComplete,
  auth,
  updateSession,
  submitProductFeedback,
  submittedProductFeedbackKeys,
}: {
  sessions: Session[];
  selectedStudentId: string;
  markFollowUpComplete: (sessionId: string, studentId: string, note?: string, attachmentUrl?: string) => void;
  auth: AuthSession;
  updateSession?: (sessionId: string, updater: (session: Session) => Session) => void;
  submitProductFeedback?: ProductFeedbackSubmitter;
  submittedProductFeedbackKeys?: string[];
}) {
  const sessionId = getParam("session");
  const session = sessions.find((item) => item.id === sessionId) ?? sessions[0];
  const roster = session?.students ?? [];
  const emailMatchedStudent =
    auth.role === "student" ? roster.find((student) => studentMatchesEmail(student, auth.email)) : undefined;
  const activeStudentId = emailMatchedStudent?.id ?? (roster.some((student) => student.id === selectedStudentId)
    ? selectedStudentId
    : roster[0]?.id ?? selectedStudentId);
  const student = studentById(activeStudentId, roster);
  const followUp = session?.followUps.find((item) => item.studentId === activeStudentId);
  const events = session?.participationEvents.filter((event) => event.studentId === activeStudentId && event.approved) ?? [];
  const isFollowUpCompleted = ["submitted", "reviewed", "complete"].includes(followUp?.status ?? "");
  const submission = session?.submissions?.find((item) => item.studentId === activeStudentId);
  const [isCelebratingCheckIn, setIsCelebratingCheckIn] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completionAttachmentUrl, setCompletionAttachmentUrl] = useState("");

  useEffect(() => {
    if (!isCelebratingCheckIn) return;
    const celebrationTimer = window.setTimeout(() => setIsCelebratingCheckIn(false), 1800);
    return () => window.clearTimeout(celebrationTimer);
  }, [isCelebratingCheckIn]);

  useEffect(() => {
    setCompletionNote(submission?.note ?? "");
    setCompletionAttachmentUrl(submission?.attachmentUrl ?? "");
  }, [session?.id, activeStudentId, submission?.note, submission?.attachmentUrl]);

  const handleCompleteCheckIn = () => {
    if (!session) return;
    markFollowUpComplete(session.id, activeStudentId, completionNote.trim(), completionAttachmentUrl.trim());
    setIsCelebratingCheckIn(false);
    window.setTimeout(() => setIsCelebratingCheckIn(true), 0);
  };

  if (!session || !followUp) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No student detail found"
        detail="Open the student dashboard to choose a current session."
        action="Student dashboard"
        onAction={() => navigate("student")}
      />
    );
  }

  return (
    <div className="page-stack student-detail">
      <section className="student-session-header">
        <div>
          <div className="student-session-nav">
            <button className="back-button" onClick={() => navigate("student")}>
              <ChevronRight size={16} />
              Back to student dashboard
            </button>
            <span className="student-session-student">{student.name}</span>
          </div>
          <h2>{session.title}</h2>
          <p>{followUp.catchUp}</p>
        </div>
        <div
          className={isCelebratingCheckIn ? "checkin-celebration is-celebrating" : "checkin-celebration"}
          aria-live="polite"
        >
          <div className="checkin-fields">
            <label className="field compact">
              <span>Note to teacher</span>
              <textarea
                value={completionNote}
                onChange={(event) => setCompletionNote(event.target.value)}
                placeholder="What did you finish or where are you stuck?"
              />
            </label>
            <label className="field compact">
              <span>File or link</span>
              <input
                value={completionAttachmentUrl}
                onChange={(event) => setCompletionAttachmentUrl(event.target.value)}
                placeholder="https://docs.google.com/..."
              />
            </label>
          </div>
          <button
            className={isFollowUpCompleted ? "primary-button checkin-button completed" : "primary-button checkin-button"}
            onClick={handleCompleteCheckIn}
          >
            <CheckCircle2 size={17} />
            {isFollowUpCompleted ? "Completed!" : "Complete check-in"}
          </button>
          {isCelebratingCheckIn && (
            <span className="confetti-burst" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, index) => (
                <span key={index} className="confetti-piece" />
              ))}
            </span>
          )}
        </div>
      </section>

      {auth.role === "teacher" && updateSession && (
        <StudentVisibleEditor session={session} studentId={activeStudentId} updateSession={updateSession} />
      )}

      <section className="content-grid two-columns align-start">
        <Panel title="What happened" icon={FileText}>
          <p className="readable">{session.recap}</p>
          <div className="question-chips">
            {session.essentialQuestions.map((question) => (
              <span key={question}>{question}</span>
            ))}
          </div>
        </Panel>
        <Panel title="My next steps" icon={ListChecks}>
          <div className="checklist">
            {followUp.tasks.map((task) => (
              <div key={task} className="checklist-row">
                <CheckCircle2 size={18} />
                <span>{task}</span>
              </div>
            ))}
          </div>
          <div className="student-note">
            <strong>Reminder</strong>
            <p>{followUp.reminder}</p>
          </div>
        </Panel>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="My participation" icon={MessageSquare}>
          {events.length ? (
            <div className="signal-list">
              {events.map((event) => (
                <div key={event.id} className="student-signal">
                  <strong>{participationLabel(event.type)}</strong>
                  <span>{event.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="readable">No public participation notes for this session.</p>
          )}
        </Panel>
        <Panel title="Resources" icon={BookOpen}>
          <div className="resource-list">
            {session.resources.map((resource) => (
              <a key={resource.id} className="resource-row" href={resource.url} target="_blank" rel="noreferrer">
                <span>
                  <BookOpen size={17} />
                </span>
                <div>
                  <strong>{resource.title}</strong>
                  <small>{resource.relatedTopic}</small>
                </div>
                <ArrowUpRight size={16} />
              </a>
            ))}
          </div>
        </Panel>
      </section>

      {auth.role === "student" && isFollowUpCompleted && submitProductFeedback && (
        <ProductFeedbackPrompt
          session={session}
          student={student}
          onSubmit={submitProductFeedback}
          submittedProductFeedbackKeys={submittedProductFeedbackKeys ?? []}
        />
      )}
    </div>
  );
}

function StudentVisibleEditor({
  session,
  studentId,
  updateSession,
  compact = false,
}: {
  session: Session;
  studentId: string;
  updateSession: (sessionId: string, updater: (session: Session) => Session) => void;
  compact?: boolean;
}) {
  const followUp = session.followUps.find((item) => item.studentId === studentId);
  const student = studentById(studentId, session.students);
  const submission = (session.submissions ?? []).find((item) => item.studentId === studentId);

  if (!followUp) return null;

  const updateCurrentSession = (updater: (session: Session) => Session) => updateSession(session.id, updater);
  const updateFollowUp = (changes: Partial<StudentFollowUp>) => {
    updateCurrentSession((current) => patchFollowUp(current, studentId, changes));
  };
  const updateTask = (index: number, value: string) => {
    const tasks = [...followUp.tasks];
    tasks[index] = value;
    updateFollowUp({ tasks: tasks.filter((task) => task.trim()) });
  };
  const addTask = () => updateFollowUp({ tasks: [...followUp.tasks, "New follow-up task"] });
  const removeTask = (index: number) => updateFollowUp({ tasks: followUp.tasks.filter((_, taskIndex) => taskIndex !== index) });
  const updateResource = (resourceId: string, changes: Partial<Resource>) => {
    updateCurrentSession((current) => ({
      ...current,
      resources: current.resources.map((resource) => (resource.id === resourceId ? { ...resource, ...changes } : resource)),
    }));
  };
  const addResource = () => {
    updateCurrentSession((current) => ({
      ...current,
      resources: [
        ...current.resources,
        {
          id: `res-${Date.now().toString(36)}`,
          title: "New resource",
          url: "https://",
          type: "link",
          relatedTopic: current.title,
        },
      ],
    }));
  };
  const removeResource = (resourceId: string) => {
    updateCurrentSession((current) => ({
      ...current,
      resources: current.resources.filter((resource) => resource.id !== resourceId),
    }));
  };
  const markReviewed = () => {
    updateCurrentSession((current) => setStudentSubmission(current, studentId, "reviewed"));
  };

  return (
    <Panel title={`Edit ${student.name}'s student view`} icon={Settings2}>
      <div className={compact ? "student-visible-editor compact-editor" : "student-visible-editor"}>
        <div className="submission-state-card">
          <div>
            <span className="eyebrow">Completion state</span>
            <strong>{statusLabel(followUp.status)}</strong>
            <small>
              {submission?.submittedAt
                ? `Submitted ${formatDate(submission.submittedAt)}`
                : "Student has not submitted this check-in yet."}
              {submission?.reviewedAt ? ` · reviewed ${formatDate(submission.reviewedAt)}` : ""}
            </small>
            {submission?.note && <small>Student note: {submission.note}</small>}
            {submission?.attachmentUrl && (
              <small>
                Submitted link:{" "}
                <a href={submission.attachmentUrl} target="_blank" rel="noreferrer">
                  {submission.attachmentUrl}
                </a>
              </small>
            )}
          </div>
          <button className="ghost-button" type="button" onClick={markReviewed} disabled={followUp.status === "reviewed"}>
            <CheckCircle2 size={17} />
            Mark reviewed
          </button>
        </div>
        <label className="field compact">
          <span>Student-facing recap</span>
          <textarea
            value={session.recap}
            onChange={(event) => updateCurrentSession((current) => ({ ...current, recap: event.target.value }))}
          />
        </label>
        <label className="field compact">
          <span>Catch-up note</span>
          <textarea value={followUp.catchUp} onChange={(event) => updateFollowUp({ catchUp: event.target.value })} />
        </label>
        <label className="field compact">
          <span>Personal reminder</span>
          <textarea value={followUp.reminder} onChange={(event) => updateFollowUp({ reminder: event.target.value })} />
        </label>
        <div className="inline-fields">
          <label className="field compact">
            <span>Due date</span>
            <input type="date" value={followUp.dueDate} onChange={(event) => updateFollowUp({ dueDate: event.target.value })} />
          </label>
          <label className="field compact">
            <span>Status</span>
            <select value={followUp.status} onChange={(event) => updateFollowUp({ status: event.target.value as TaskStatus })}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="submitted">Submitted</option>
              <option value="reviewed">Reviewed</option>
              <option value="complete">Complete</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>
        </div>
        <div className="editable-subsection">
          <div className="subsection-header">
            <strong>Tasks</strong>
            <button className="text-button" type="button" onClick={addTask}>
              <PlusCircle size={16} />
              Add task
            </button>
          </div>
          {followUp.tasks.map((task, index) => (
            <div key={`${task}-${index}`} className="editable-line">
              <input value={task} onChange={(event) => updateTask(index, event.target.value)} />
              <button className="icon-button danger" type="button" onClick={() => removeTask(index)} aria-label="Remove task">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        {!compact && (
          <div className="editable-subsection">
            <div className="subsection-header">
              <strong>Resources</strong>
              <button className="text-button" type="button" onClick={addResource}>
                <PlusCircle size={16} />
                Add resource
              </button>
            </div>
            {session.resources.map((resource) => (
              <div key={resource.id} className="resource-edit-row">
                <input value={resource.title} onChange={(event) => updateResource(resource.id, { title: event.target.value })} />
                <input value={resource.url} onChange={(event) => updateResource(resource.id, { url: event.target.value })} />
                <input
                  value={resource.relatedTopic}
                  onChange={(event) => updateResource(resource.id, { relatedTopic: event.target.value })}
                />
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => removeResource(resource.id)}
                  aria-label={`Remove ${resource.title}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function TeacherAnalytics({ sessions }: { sessions: Session[] }) {
  const published = sessions.filter((session) => session.status === "published");

  if (!published.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No analytics yet"
        detail="Participation, completion, and follow-through reports appear after the first session is published."
        action="Create a session"
        onAction={() => navigate("new-session")}
      />
    );
  }

  const latest = published[0];
  const totalFollowUps = published.flatMap((session) => session.followUps);
  const completed = totalFollowUps.filter((followUp) => ["submitted", "reviewed", "complete"].includes(followUp.status)).length;
  const overdue = totalFollowUps.filter((followUp) => followUp.status === "overdue").length;
  const roster = Array.from(new Map(published.flatMap((session) => session.students).map((student) => [student.id, student])).values());
  const participationTotals = roster.map((student) => {
    const events = published.flatMap((session) =>
      session.participationEvents.filter(
        (event) => event.studentId === student.id && event.approved && !["quiet", "absent"].includes(event.type),
      ),
    );
    const quiet = published.flatMap((session) =>
      session.participationEvents.filter((event) => event.studentId === student.id && event.approved && event.type === "quiet"),
    );
    const absent = published.filter((session) => session.attendance[student.id] === "absent");
    const followUps = totalFollowUps.filter((followUp) => followUp.studentId === student.id);
    const avgScore = followUps.length
      ? Math.round(followUps.reduce((sum, followUp) => sum + followUp.score, 0) / followUps.length)
      : 0;
    return { student, eventCount: events.length, quiet: quiet.length, absent: absent.length, avgScore };
  });

  return (
    <div className="page-stack">
      <section className="analytics-header">
        <div>
          <span className="eyebrow">Participation and follow-through</span>
          <h2>See who spoke, who needs support, and who completed the loop.</h2>
          <p>
            These analytics stay private to you and focused on support, not public ranking.
          </p>
        </div>
        <button className="ghost-button" onClick={() => navigate("new-session")}>
          <RefreshCw size={17} />
          Process another session
        </button>
      </section>

      <section className="metric-grid">
        <MetricCard icon={Target} label="Completion" value={`${completionRate(published)}%`} detail={`${completed} finished`} accent="green" />
        <MetricCard
          icon={MessageSquare}
          label="Latest participation"
          value={latest ? `${classParticipationRate(latest)}%` : "0%"}
          detail="Present students with signals"
          accent="blue"
        />
        <MetricCard icon={Clock3} label="Overdue" value={overdue.toString()} detail="Needs follow-up" accent="amber" />
        <MetricCard icon={Users} label="Tracked learners" value={roster.length.toString()} detail="Current roster" accent="rose" />
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Participation distribution" icon={BarChart3}>
          <div className="analytics-bars">
            {participationTotals.map(({ student, eventCount, quiet, absent }) => (
              <div key={student.id} className="analytics-bar-row">
                <span>{student.name.split(" ")[0]}</span>
                <div>
                  <i style={{ width: eventCount > 0 ? `${Math.min(eventCount * 22, 100)}%` : "0%" }} />
                </div>
                <small>{eventCount} signals</small>
                {(quiet > 0 || absent > 0) && (
                  <em>
                    {quiet > 0 ? "Quiet" : ""}
                    {quiet > 0 && absent > 0 ? " · " : ""}
                    {absent > 0 ? "Absent" : ""}
                  </em>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Follow-through readiness" icon={LineChart}>
          <p className="panel-helper">
            Readiness starts at 52% for present students, 45% for late students, and 22% for absent students. ClassLoop
            adds 6 for useful chat, 7 for asking a question, and 13 for answering. It subtracts 18 for quiet and 16 for
            a possible misconception. The analytics page averages those session scores for each student.
          </p>
          <div className="readiness-list">
            {participationTotals.map(({ student, avgScore }) => (
              <div key={student.id} className="readiness-row">
                <span className="table-student">
                  <Avatar student={student} />
                  {student.name}
                </span>
                <ProgressBar value={avgScore} />
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Teacher action queue" icon={Search}>
        <div className="action-queue">
          {participationTotals
            .filter((row) => row.quiet || row.absent || row.avgScore < 70)
            .map((row) => (
              <AttentionItem
                key={row.student.id}
                icon={row.absent ? UserX : row.quiet ? Mic2 : AlertTriangle}
                title={`${row.student.name} may need a teacher touchpoint`}
                detail={
                  row.absent
                    ? "Missed a recent session and has assigned catch-up."
                    : row.quiet
                      ? "Quiet participation pattern detected."
                      : "Follow-through readiness is below the class target."
                }
              />
            ))}
        </div>
      </Panel>
    </div>
  );
}

function PrivacyControlsPage({
  auth,
  sessions,
  accounts,
  privacySettings,
  setPrivacySettings,
  auditLog,
  appendAudit,
  clearClassData,
}: {
  auth: AuthSession;
  sessions: Session[];
  accounts: Account[];
  privacySettings: PrivacySettings;
  setPrivacySettings: React.Dispatch<React.SetStateAction<PrivacySettings>>;
  auditLog: AuditLogEntry[];
  appendAudit: (action: string, detail: string, actor?: AuthSession | null) => void;
  clearClassData: () => void;
}) {
  const exportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      teacher: { email: auth.email, name: auth.name },
      sessions,
      accounts: accounts.map(({ passwordHash, ...account }) => account),
      privacySettings,
      auditLog,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `classloop-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    appendAudit("export_data", "Exported teacher workspace data.");
  };

  const deleteClassData = () => {
    if (!window.confirm("Delete this teacher workspace's class sessions and drafts? Accounts will remain.")) return;
    clearClassData();
    appendAudit("delete_class_data", "Deleted class sessions and current draft from the teacher workspace.");
  };

  return (
    <div className="page-stack privacy-page">
      <section className="review-banner">
        <div>
          <span className="eyebrow">Privacy controls</span>
          <h2>Manage retention, recording consent, exports, and audit history.</h2>
          <p>Use these controls before running ClassLoop with real student data or school accounts.</p>
        </div>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Data retention" icon={ShieldCheck}>
          <div className="settings-stack">
            <label className="field compact">
              <span>Keep class session data for this many days</span>
              <input
                type="number"
                min={30}
                max={2555}
                value={privacySettings.retentionDays}
                onChange={(event) =>
                  setPrivacySettings((current) => ({
                    ...current,
                    retentionDays: Number(event.target.value) || current.retentionDays,
                  }))
                }
              />
            </label>
            <button
              className="ghost-button full"
              type="button"
              onClick={() => appendAudit("retention_review", `Reviewed ${sessions.length} sessions against retention settings.`)}
            >
              <Search size={17} />
              Review retention
            </button>
          </div>
        </Panel>

        <Panel title="Recording consent" icon={Mic2}>
          <div className="settings-stack">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={privacySettings.recordingConsentRequired}
                onChange={(event) =>
                  setPrivacySettings((current) => ({ ...current, recordingConsentRequired: event.target.checked }))
                }
              />
              <span>Require confirmation before live audio notes start.</span>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={privacySettings.allowStudentExport}
                onChange={(event) =>
                  setPrivacySettings((current) => ({ ...current, allowStudentExport: event.target.checked }))
                }
              />
              <span>Allow student-specific data exports from the workspace.</span>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={privacySettings.auditLogEnabled}
                onChange={(event) =>
                  setPrivacySettings((current) => ({ ...current, auditLogEnabled: event.target.checked }))
                }
              />
              <span>Keep audit history for sign-ins, publishing, exports, and data changes.</span>
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={privacySettings.noTrainingOnStudentData}
                onChange={(event) =>
                  setPrivacySettings((current) => ({ ...current, noTrainingOnStudentData: event.target.checked }))
                }
              />
              <span>No training on student data unless you explicitly allow it.</span>
            </label>
          </div>
        </Panel>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Export or delete" icon={UploadCloud}>
          <div className="settings-stack">
            <button className="primary-button full" type="button" onClick={exportData}>
              <UploadCloud size={17} />
              Export workspace data
            </button>
            <button className="ghost-button full danger-soft" type="button" onClick={deleteClassData}>
              <Trash2 size={17} />
              Delete class data
            </button>
          </div>
        </Panel>

        <Panel title="Audit log" icon={ClipboardCheck}>
          <div className="audit-list">
            {auditLog.length ? (
              auditLog.slice(0, 12).map((entry) => (
                <div key={entry.id} className="audit-row">
                  <strong>{entry.action.replace(/_/g, " ")}</strong>
                  <span>{entry.detail}</span>
                  <small>
                    {entry.actorEmail} · {formatDate(entry.createdAt)}
                  </small>
                </div>
              ))
            ) : (
              <p className="readable">No audit entries yet.</p>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function TutorialPage({ auth }: { auth: AuthSession }) {
  const isTeacher = auth.role === "teacher";
  const homeRoute: RouteKey = isTeacher ? "dashboard" : "student";
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const teacherSteps = [
    {
      title: "Create a session",
      eyebrow: "Start the loop",
      detail: "Choose a template, paste a transcript or notes, add your roster, and include any links students should use.",
      checklist: ["Open New session", "Pick the closest template", "Add transcript, notes, roster, and resources"],
      action: "Create a session",
      route: "new-session" as RouteKey,
      icon: PlusCircle,
    },
    {
      title: "Resolve speaker names",
      eyebrow: "Match participation",
      detail: "If a Zoom display name is not on the roster, add it as a student or link it to the right student account.",
      checklist: ["Review unknown Zoom names", "Add real new students", "Link nicknames or device names to existing students"],
      action: "Open draft review",
      route: "review" as RouteKey,
      icon: Link2,
    },
    {
      title: "Review before publishing",
      eyebrow: "Teacher control",
      detail: "Edit the recap, action items, resources, attendance, participation labels, due dates, and each student preview.",
      checklist: ["Fix the class recap", "Check due dates and resources", "Edit student-specific follow-ups"],
      action: "Review draft",
      route: "review" as RouteKey,
      icon: ClipboardCheck,
    },
    {
      title: "Publish the follow-up",
      eyebrow: "Student-ready view",
      detail: "Students only see the approved version. They get their own recap, tasks, resources, and completion check-in.",
      checklist: ["Open publish preview", "Switch between students", "Publish once each preview looks right"],
      action: "Preview publishing",
      route: "publish-preview" as RouteKey,
      icon: Send,
    },
    {
      title: "Track follow-through",
      eyebrow: "Close the loop",
      detail: "Use analytics to see completion, quiet or absent students, and private support opportunities.",
      checklist: ["Check completion", "Look for quiet or absent students", "Plan the next support touchpoint"],
      action: "Open analytics",
      route: "analytics" as RouteKey,
      icon: BarChart3,
    },
  ];
  const studentSteps = [
    {
      title: "Open your portal",
      eyebrow: "Your class hub",
      detail: "Sign in with the email your teacher used on the roster or the invite sent to you.",
      checklist: ["Use your roster email", "Open My portal", "Choose the latest class"],
      action: "Open my portal",
      route: "student" as RouteKey,
      icon: GraduationCap,
    },
    {
      title: "Read the latest recap",
      eyebrow: "Catch the context",
      detail: "Start with what happened in class, then review the resources your teacher approved.",
      checklist: ["Read the class recap", "Open the resources", "Check anything marked for catch-up"],
      action: "View portal",
      route: "student" as RouteKey,
      icon: BookOpen,
    },
    {
      title: "Complete your tasks",
      eyebrow: "Do the work",
      detail: "Your task list includes class-wide work plus any follow-up connected to your questions or catch-up needs.",
      checklist: ["Review due dates", "Finish assigned work", "Use resources before marking complete"],
      action: "View tasks",
      route: "student" as RouteKey,
      icon: ListChecks,
    },
    {
      title: "Check in",
      eyebrow: "Close your loop",
      detail: "Mark work complete when you finish so your teacher can see that the loop is closed.",
      checklist: ["Mark complete", "Revisit anything unfinished", "Ask for help if a task is unclear"],
      action: "Open my portal",
      route: "student" as RouteKey,
      icon: CheckCircle2,
    },
  ];
  const walkthroughSteps = isTeacher ? teacherSteps : studentSteps;
  const activeStep = walkthroughSteps[activeStepIndex] ?? walkthroughSteps[0];
  const ActiveIcon = activeStep.icon;
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === walkthroughSteps.length - 1;
  const progress = Math.round(((activeStepIndex + 1) / walkthroughSteps.length) * 100);
  const skipWalkthrough = () => navigate(homeRoute);
  const useCases = isTeacher
    ? [
        ["Daily classes", "Turn class notes and transcripts into next-step dashboards."],
        ["Tutoring", "Send each learner a clean recap and targeted practice after a session."],
        ["Clubs", "Track decisions, owners, quiet members, and follow-up tasks."],
        ["Study groups", "Convert peer questions into shared resources and personal reminders."],
      ]
    : [
        ["Missed class", "Catch up from the approved recap without searching through chat logs."],
        ["Homework", "See what is due, why it matters, and when to finish it."],
        ["Questions", "Review explanations connected to what you asked in class."],
        ["Resources", "Keep links and practice materials in one place."],
      ];

  return (
    <div className="page-stack tutorial-page">
      <section className="walkthrough-hero">
        <div>
          <span className="eyebrow">Interactive walkthrough</span>
          <h2>{isTeacher ? "Learn the class follow-up loop one step at a time." : "Learn how to use your student portal."}</h2>
          <p>
            {isTeacher
              ? "Move through the workflow in order, or skip whenever you are ready to return to the dashboard."
              : "Move through the portal basics, or skip whenever you want to return home."}
          </p>
        </div>
        <button className="ghost-button large" onClick={skipWalkthrough}>
          <ChevronRight size={18} />
          Skip tutorial
        </button>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title={`Step ${activeStepIndex + 1} of ${walkthroughSteps.length}`} icon={ActiveIcon}>
          <div className="walkthrough-card">
            <div className="walkthrough-progress-header">
              <span>{activeStep.eyebrow}</span>
              <strong>{progress}%</strong>
            </div>
            <div className="walkthrough-progress-bar" aria-label={`Tutorial progress ${progress}%`}>
              <i style={{ width: `${progress}%` }} />
            </div>
            <div className="walkthrough-step-main">
              <span className="walkthrough-icon">
                <ActiveIcon size={24} />
              </span>
              <div>
                <h3>{activeStep.title}</h3>
                <p>{activeStep.detail}</p>
              </div>
            </div>
            <ul className="walkthrough-checklist">
              {activeStep.checklist.map((item) => (
                <li key={item}>
                  <CheckCircle2 size={17} />
                  {item}
                </li>
              ))}
            </ul>
            <div className="walkthrough-controls">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setActiveStepIndex((index) => Math.max(0, index - 1))}
                disabled={isFirstStep}
              >
                Back
              </button>
              <button className="text-button" type="button" onClick={() => navigate(activeStep.route)}>
                {activeStep.action}
                <ChevronRight size={16} />
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => (isLastStep ? skipWalkthrough() : setActiveStepIndex((index) => Math.min(walkthroughSteps.length - 1, index + 1)))}
              >
                {isLastStep ? "Finish" : "Next"}
                <ChevronRight size={16} />
              </button>
            </div>
            <button className="text-button walkthrough-skip" type="button" onClick={skipWalkthrough}>
              Skip and return home
            </button>
          </div>
        </Panel>

        <Panel title={isTeacher ? "Workflow map" : "Portal map"} icon={ListChecks}>
          <div className="walkthrough-map">
            {walkthroughSteps.map((step, index) => (
              <button
                key={step.title}
                className={index === activeStepIndex ? "walkthrough-map-item active" : "walkthrough-map-item"}
                type="button"
                onClick={() => setActiveStepIndex(index)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.eyebrow}</small>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Common uses" icon={BookOpen}>
          <div className="usage-grid">
            {useCases.map(([title, detail]) => (
              <article key={title} className="usage-card">
                <strong>{title}</strong>
                <p>{detail}</p>
              </article>
            ))}
          </div>
        </Panel>
        {isTeacher && (
          <Panel title="What to prepare for each session" icon={ClipboardCheck}>
            <div className="session-prep-grid">
              <div>
                <strong>Required</strong>
                <p>Session title, template, roster names, and either a transcript or teacher notes.</p>
              </div>
              <div>
                <strong>Helpful</strong>
                <p>Homework details, due date, resource links, student absences, and any participation notes.</p>
              </div>
              <div>
                <strong>Before publishing</strong>
                <p>Check speaker matches, review each student preview, and confirm the publish button sends the right follow-up.</p>
              </div>
            </div>
          </Panel>
        )}
      </section>
    </div>
  );
}

function DesignSystemPage({
  theme,
  setTheme,
}: {
  theme: ThemeSettings;
  setTheme: React.Dispatch<React.SetStateAction<ThemeSettings>>;
}) {
  const selectedPreset = themePresets[theme.key];
  const choosePreset = (key: ThemeKey) => {
    const preset = themePresets[key];
    setTheme((current) => ({ ...current, key, accent: preset.accent }));
  };
  const customPreviewStyle = theme.imageUrl.trim()
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(8, 18, 32, 0.34), rgba(8, 18, 32, 0.78)), ${safeBackgroundUrl(theme.imageUrl)}`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : undefined;

  return (
    <div className="page-stack appearance-page">
      <section className="appearance-hero">
        <div>
          <span className="eyebrow">Experience settings</span>
          <h2>Customize ClassLoop around your classroom.</h2>
          <p>
            Choose a calmer workspace, tune the accent color, or use an image backdrop so the product feels comfortable
            for your teaching style while staying easy to scan during a busy school day.
          </p>
        </div>
        <div className={`live-theme-preview ${themePresets[theme.key].previewClass}`} style={customPreviewStyle}>
          <span className="preview-glow" />
          <div className="preview-nav" />
          <div className="preview-card large">
            <strong>{selectedPreset.name}</strong>
            <span />
            <span />
          </div>
          <div className="preview-card row">
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>

      <section className="content-grid two-columns align-start">
        <Panel title="Screen style presets" icon={Palette}>
          <div className="theme-option-grid">
            {(Object.keys(themePresets) as ThemeKey[]).map((key) => {
              const preset = themePresets[key];
              return (
                <button
                  key={key}
                  className={theme.key === key ? "theme-option selected" : "theme-option"}
                  onClick={() => choosePreset(key)}
                >
                  <span className={`theme-swatch ${preset.previewClass}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{preset.name}</strong>
                  <small>{preset.summary}</small>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Color and imagery" icon={SlidersHorizontal}>
          <div className="accent-grid" aria-label="Accent colors">
            {accentOptions.map((accent) => (
              <button
                key={accent}
                className={theme.accent === accent ? "accent-swatch selected" : "accent-swatch"}
                style={{ background: accent }}
                onClick={() => setTheme((current) => ({ ...current, accent }))}
                aria-label={`Use accent ${accent}`}
              />
            ))}
          </div>
          <label className="field compact">
            <span>Custom accent</span>
            <input
              type="color"
              value={theme.accent}
              onChange={(event) => setTheme((current) => ({ ...current, accent: event.target.value }))}
            />
          </label>
          <label className="field compact">
            <span>Image backdrop URL</span>
            <input
              value={theme.imageUrl}
              onChange={(event) => setTheme((current) => ({ ...current, imageUrl: event.target.value }))}
              placeholder="Paste an image URL for a custom background"
            />
          </label>
          <div className="appearance-actions">
            <button className="ghost-button" onClick={() => setTheme(defaultTheme)}>
              Reset
            </button>
            {theme.imageUrl && (
              <button className="text-button" onClick={() => setTheme((current) => ({ ...current, imageUrl: "" }))}>
                Remove image
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="empty-state">
      <span>
        <Icon size={30} />
      </span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action && onAction && (
        <button className="primary-button" onClick={onAction}>
          {action}
        </button>
      )}
    </section>
  );
}

function InlineEmpty({
  icon: Icon,
  title,
  detail,
  action,
  onAction,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="inline-empty">
      <span>
        <Icon size={20} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action && onAction && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

function Avatar({ student }: { student: Student }) {
  return (
    <span className="avatar" style={{ background: student.avatarColor }}>
      {student.name
        .split(" ")
        .map((part) => part[0])
        .join("")}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clampedValue = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  return (
    <div className="progress-bar" aria-label={`${clampedValue}%`}>
      <span style={{ width: `${clampedValue}%` }} />
      <small>{clampedValue}%</small>
    </div>
  );
}

export default App;
