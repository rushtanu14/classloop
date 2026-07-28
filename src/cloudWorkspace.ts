type EmailOwnedRecord = {
  ownerEmail?: string;
};

type AuditOwnedRecord = {
  actorEmail?: string;
};

type OwnerWorkspaceShape = {
  sessions: EmailOwnedRecord[];
  personalMeetings: EmailOwnedRecord[];
  draft: EmailOwnedRecord | null;
  demoLoaded: boolean;
  classGroups: EmailOwnedRecord[];
  rosterTemplates: EmailOwnedRecord[];
  privacySettings: unknown;
  auditLog: AuditOwnedRecord[];
};

type LocalOwnerWorkspaceShape = OwnerWorkspaceShape & {
  accounts: unknown;
  billingProfile: unknown;
};

function normalizeOwnerEmail(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function belongsToOwner(record: EmailOwnedRecord | AuditOwnedRecord, ownerEmail: string) {
  const candidate = record as EmailOwnedRecord & AuditOwnedRecord;
  const recordEmail = candidate.ownerEmail ?? candidate.actorEmail;
  return Boolean(recordEmail) && normalizeOwnerEmail(recordEmail) === ownerEmail;
}

function replaceOwnerRecords<T extends EmailOwnedRecord | AuditOwnedRecord>(
  localRecords: T[],
  remoteRecords: T[] | undefined,
  ownerEmail: string,
) {
  if (!remoteRecords) return localRecords;
  return [
    ...localRecords.filter((record) => !belongsToOwner(record, ownerEmail)),
    ...remoteRecords.filter((record) => belongsToOwner(record, ownerEmail)),
  ];
}

export function toOwnerCloudWorkspaceState<T extends LocalOwnerWorkspaceShape>(
  state: T,
  ownerEmail: string,
): Omit<T, "accounts" | "billingProfile"> {
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  const { accounts: _accounts, billingProfile: _billingProfile, ...cloudState } = state;

  return {
    ...cloudState,
    sessions: state.sessions.filter((session) => belongsToOwner(session, normalizedOwner)),
    personalMeetings: state.personalMeetings.filter((meeting) => belongsToOwner(meeting, normalizedOwner)),
    draft: state.draft && belongsToOwner(state.draft, normalizedOwner) ? state.draft : null,
    demoLoaded: false,
    classGroups: state.classGroups.filter((group) => belongsToOwner(group, normalizedOwner)),
    rosterTemplates: state.rosterTemplates.filter((template) => belongsToOwner(template, normalizedOwner)),
    auditLog: state.auditLog.filter((entry) => belongsToOwner(entry, normalizedOwner)),
  } as Omit<T, "accounts" | "billingProfile">;
}

export function mergeOwnerCloudWorkspaceState<T extends OwnerWorkspaceShape>(
  localState: T,
  remoteState: Partial<Omit<T, "accounts" | "billingProfile">>,
  ownerEmail: string,
): T {
  const normalizedOwner = normalizeOwnerEmail(ownerEmail);
  const localDraftBelongsToOwner = Boolean(
    localState.draft && belongsToOwner(localState.draft, normalizedOwner),
  );
  let mergedDraft = localState.draft;

  if (Object.prototype.hasOwnProperty.call(remoteState, "draft")) {
    if (!localState.draft || localDraftBelongsToOwner) {
      mergedDraft =
        remoteState.draft && belongsToOwner(remoteState.draft, normalizedOwner)
          ? remoteState.draft
          : null;
    }
  }

  return {
    ...localState,
    sessions: replaceOwnerRecords(localState.sessions, remoteState.sessions, normalizedOwner),
    personalMeetings: replaceOwnerRecords(
      localState.personalMeetings,
      remoteState.personalMeetings,
      normalizedOwner,
    ),
    draft: mergedDraft,
    classGroups: replaceOwnerRecords(localState.classGroups, remoteState.classGroups, normalizedOwner),
    rosterTemplates: replaceOwnerRecords(
      localState.rosterTemplates,
      remoteState.rosterTemplates,
      normalizedOwner,
    ),
    auditLog: replaceOwnerRecords(localState.auditLog, remoteState.auditLog, normalizedOwner),
    // These settings are device-global in the current local schema. A cloud
    // download must not silently replace them for every other local account.
    demoLoaded: localState.demoLoaded,
    privacySettings: localState.privacySettings,
  };
}

export function parseCloudWorkspaceResponse<T extends object>(
  value: Partial<T> | { state: Partial<T>; updatedAt?: string } | null,
): { state: Partial<T>; updatedAt?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  if ("state" in value) {
    const nestedState = (value as { state?: unknown }).state;
    if (nestedState && typeof nestedState === "object" && !Array.isArray(nestedState)) {
      return {
        state: nestedState as Partial<T>,
        updatedAt:
          typeof (value as { updatedAt?: unknown }).updatedAt === "string"
            ? (value as { updatedAt: string }).updatedAt
            : undefined,
      };
    }
  }

  const rawState = value as Record<string, unknown>;
  const hasWorkspaceField = [
    "sessions",
    "personalMeetings",
    "draft",
    "classGroups",
    "rosterTemplates",
    "privacySettings",
    "auditLog",
  ].some((key) => Object.prototype.hasOwnProperty.call(rawState, key));
  if (!hasWorkspaceField) return null;

  return {
    state: value as Partial<T>,
    updatedAt: typeof rawState.updatedAt === "string" ? rawState.updatedAt : undefined,
  };
}
