export const INTEGRATION_IMPORT_FIELDS = [
  "title",
  "transcript",
  "notes",
  "roster",
  "resources",
] as const;

export type IntegrationImportField = (typeof INTEGRATION_IMPORT_FIELDS)[number];

export type IntegrationImportFormState = {
  title: string;
  transcript: string;
  notes: string;
  roster: string;
  resources: string;
};

export type IntegrationRosterRecord = {
  readonly name?: unknown;
  readonly email?: unknown;
};

export type IntegrationResourceRecord = {
  readonly title?: unknown;
  readonly url?: unknown;
};

export type IntegrationImportWarning = {
  readonly code: string;
  readonly message: string;
};

export type IntegrationDraftPatch = {
  readonly schemaVersion: 1;
  readonly importId: string;
  readonly integrationId: string;
  readonly providerLabel: string;
  readonly sourceLabel: string;
  readonly occurredAt?: string;
  readonly fields: {
    readonly title?: string;
    readonly transcript?: string;
    readonly notes?: string | readonly string[];
    readonly roster?: string | readonly IntegrationRosterRecord[];
    readonly resources?: string | readonly IntegrationResourceRecord[];
  };
  readonly warnings: readonly IntegrationImportWarning[];
  readonly receipt?: {
    readonly id: string;
    readonly importedAt?: string;
  };
};

export type IntegrationRecordCandidate = {
  readonly selectionKey: string;
  readonly integrationId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly occurredAt?: string;
  readonly availableFields: readonly IntegrationImportField[];
};

export type IntegrationFieldDecision = {
  readonly include: boolean;
  readonly mode: "fill-empty" | "append" | "replace";
};

export type IntegrationFieldDecisions = Readonly<
  Record<IntegrationImportField, IntegrationFieldDecision>
>;

export type SerializedIntegrationField = {
  readonly value: string;
  readonly warnings: readonly string[];
};

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function cleanSingleLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function normalizeEmail(value: unknown): string | null {
  const email = cleanSingleLine(value, 255).toLocaleLowerCase();
  if (
    !email ||
    email.length > 254 ||
    email.startsWith(".") ||
    email.includes("..") ||
    !EMAIL_PATTERN.test(email)
  ) {
    return null;
  }
  return email;
}

function normalizeHttpUrl(value: unknown): string | null {
  const rawUrl = typeof value === "string" ? value.trim() : "";
  if (!rawUrl || rawUrl.length > 2_048) return null;

  try {
    const parsed = new URL(rawUrl);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname
    ) {
      return null;
    }

    parsed.hash = "";
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function serializeIntegrationRoster(
  entries: readonly IntegrationRosterRecord[],
): SerializedIntegrationField {
  const lines: string[] = [];
  const warnings: string[] = [];
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();

  entries.forEach((entry, index) => {
    const name = cleanSingleLine(entry.name, 160);
    const rawEmail = cleanSingleLine(entry.email, 255);
    const email = rawEmail ? normalizeEmail(rawEmail) : null;

    if (rawEmail && !email) {
      warnings.push(`Skipped roster item ${index + 1} because its email is invalid.`);
      return;
    }
    if (!name && !email) {
      warnings.push(`Skipped roster item ${index + 1} because it has no usable name or email.`);
      return;
    }

    const nameKey = normalizeName(name);
    if (
      (email && seenEmails.has(email)) ||
      (nameKey && seenNames.has(nameKey))
    ) {
      return;
    }

    if (email) seenEmails.add(email);
    if (nameKey) seenNames.add(nameKey);
    lines.push(name && email ? `${name}, ${email}` : name || email || "");
  });

  return { value: lines.join("\n"), warnings };
}

export function serializeIntegrationResources(
  entries: readonly IntegrationResourceRecord[],
): SerializedIntegrationField {
  const lines: string[] = [];
  const warnings: string[] = [];
  const seenUrls = new Set<string>();

  entries.forEach((entry, index) => {
    const url = normalizeHttpUrl(entry.url);
    if (!url) {
      warnings.push(`Skipped resource item ${index + 1} because its URL is invalid.`);
      return;
    }
    if (seenUrls.has(url)) return;

    seenUrls.add(url);
    const title = cleanSingleLine(entry.title, 200);
    lines.push(title ? `${title} — ${url}` : url);
  });

  return { value: lines.join("\n"), warnings };
}

function rosterRecordsFromText(value: string): IntegrationRosterRecord[] {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const emailMatch = line.match(
        /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/i,
      );
      if (emailMatch) {
        const email = emailMatch[0];
        const name = line
          .slice(0, emailMatch.index)
          .replace(/[\s,;|:–—-]+$/u, "")
          .trim();
        return { name, email };
      }

      const separatorIndex = line.search(/[,;|\t]/u);
      if (separatorIndex >= 0) {
        return {
          name: line.slice(0, separatorIndex),
          email: line.slice(separatorIndex + 1),
        };
      }
      return { name: line };
    });
}

function resourceRecordsFromText(value: string): IntegrationResourceRecord[] {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const urlMatch = line.match(/https?:\/\/[^\s<>"']+/iu);
      if (!urlMatch) return { title: line, url: "" };

      const rawUrl = urlMatch[0].replace(/[),.;!?]+$/u, "");
      const title = line
        .slice(0, urlMatch.index)
        .replace(/[\s:–—-]+$/u, "")
        .trim();
      return { title, url: rawUrl };
    });
}

function serializeNotes(value: string | readonly string[]): string {
  if (typeof value === "string") return normalizeText(value);

  const uniqueNotes: string[] = [];
  const seen = new Set<string>();
  value.forEach((note) => {
    if (typeof note !== "string") return;
    const normalized = normalizeText(note);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    uniqueNotes.push(normalized);
  });
  return uniqueNotes.join("\n\n");
}

function serializedPatchField(
  patch: IntegrationDraftPatch,
  field: IntegrationImportField,
): string {
  const value = patch.fields[field];
  if (value === undefined) return "";

  if (field === "roster") {
    const entries = typeof value === "string"
      ? rosterRecordsFromText(value)
      : Array.isArray(value)
        ? (value as readonly IntegrationRosterRecord[])
        : [];
    return serializeIntegrationRoster(entries).value;
  }
  if (field === "resources") {
    const entries = typeof value === "string"
      ? resourceRecordsFromText(value)
      : Array.isArray(value)
        ? (value as readonly IntegrationResourceRecord[])
        : [];
    return serializeIntegrationResources(entries).value;
  }
  if (field === "notes") {
    return serializeNotes(value as string | readonly string[]);
  }
  return normalizeText(value as string);
}

export function createDefaultIntegrationFieldDecisions(
  patch: IntegrationDraftPatch,
): IntegrationFieldDecisions {
  return {
    title: {
      include: Boolean(serializedPatchField(patch, "title")),
      mode: "fill-empty",
    },
    transcript: {
      include: Boolean(serializedPatchField(patch, "transcript")),
      mode: "append",
    },
    notes: {
      include: Boolean(serializedPatchField(patch, "notes")),
      mode: "append",
    },
    roster: {
      include: Boolean(serializedPatchField(patch, "roster")),
      mode: "append",
    },
    resources: {
      include: Boolean(serializedPatchField(patch, "resources")),
      mode: "append",
    },
  };
}

function appendText(existingValue: string, patchValue: string, separator: string): string {
  const existing = normalizeText(existingValue);
  const addition = normalizeText(patchValue);
  if (!addition) return existing;
  if (!existing) return addition;
  if (
    existing === addition ||
    existing.startsWith(`${addition}${separator}`) ||
    existing.endsWith(`${separator}${addition}`) ||
    existing.includes(`${separator}${addition}${separator}`)
  ) {
    return existing;
  }
  return `${existing}${separator}${addition}`;
}

type RosterIdentity = {
  readonly email: string | null;
  readonly name: string;
};

function rosterIdentity(line: string): RosterIdentity {
  const [entry] = rosterRecordsFromText(line);
  const email = entry ? normalizeEmail(entry.email) : null;
  const name = entry ? normalizeName(cleanSingleLine(entry.name, 160)) : "";
  return { email, name };
}

function appendRoster(existingValue: string, patchValue: string): string {
  const existing = normalizeText(existingValue);
  const additions = normalizeText(patchValue).split("\n").filter(Boolean);
  if (!additions.length) return existing;

  const existingLines = existing ? existing.split("\n").filter(Boolean) : [];
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();
  existingLines.forEach((line) => {
    const identity = rosterIdentity(line);
    if (identity.email) seenEmails.add(identity.email);
    if (identity.name) seenNames.add(identity.name);
  });

  const newLines = additions.filter((line) => {
    const identity = rosterIdentity(line);
    const duplicate =
      Boolean(identity.email && seenEmails.has(identity.email)) ||
      Boolean(identity.name && seenNames.has(identity.name));
    if (duplicate) return false;
    if (identity.email) seenEmails.add(identity.email);
    if (identity.name) seenNames.add(identity.name);
    return true;
  });

  return [...existingLines, ...newLines].join("\n");
}

function resourceUrlFromLine(line: string): string | null {
  const [entry] = resourceRecordsFromText(line);
  return entry ? normalizeHttpUrl(entry.url) : null;
}

function appendResources(existingValue: string, patchValue: string): string {
  const existing = normalizeText(existingValue);
  const additions = normalizeText(patchValue).split("\n").filter(Boolean);
  if (!additions.length) return existing;

  const existingLines = existing ? existing.split("\n").filter(Boolean) : [];
  const seenUrls = new Set(
    existingLines
      .map(resourceUrlFromLine)
      .filter((url): url is string => Boolean(url)),
  );
  const newLines = additions.filter((line) => {
    const url = resourceUrlFromLine(line);
    if (!url || seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });

  return [...existingLines, ...newLines].join("\n");
}

function mergeField(
  field: IntegrationImportField,
  currentValue: string,
  patchValue: string,
  decision: IntegrationFieldDecision,
): string {
  if (!decision.include || !patchValue) return currentValue;
  if (decision.mode === "fill-empty") {
    return currentValue.trim() ? currentValue : patchValue;
  }
  if (decision.mode === "replace") return patchValue;
  if (field === "roster") return appendRoster(currentValue, patchValue);
  if (field === "resources") return appendResources(currentValue, patchValue);
  return appendText(currentValue, patchValue, "\n\n");
}

export function applyIntegrationDraftPatch(
  form: Readonly<IntegrationImportFormState>,
  patch: IntegrationDraftPatch,
  decisions: IntegrationFieldDecisions,
): IntegrationImportFormState {
  return INTEGRATION_IMPORT_FIELDS.reduce<IntegrationImportFormState>(
    (nextForm, field) => ({
      ...nextForm,
      [field]: mergeField(
        field,
        form[field],
        serializedPatchField(patch, field),
        decisions[field],
      ),
    }),
    { ...form },
  );
}
