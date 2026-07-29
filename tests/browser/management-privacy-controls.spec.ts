import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import type { ClassGroup, RosterTemplate, Session } from "../../src/types";

const secureStorageKeys = {
  sessions: "classloop:secure:sessions:v3",
  draft: "classloop:secure:draft:v3",
  classGroups: "classloop:secure:class-groups:v1",
  rosterTemplates: "classloop:secure:roster-templates:v1",
  auditLog: "classloop:secure:audit:v1",
} as const;

const legacyStorageKeys = {
  accounts: "classloop:accounts:v1",
  sessions: "classloop:sessions:v3",
  draft: "classloop:draft:v3",
  classGroups: "classloop:class-groups:v1",
  rosterTemplates: "classloop:roster-templates:v1",
  privacySettings: "classloop:privacy:v1",
  auditLog: "classloop:audit:v1",
} as const;

type SeedAccount = {
  id: string;
  role: "teacher";
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
};

type PrivacySettings = {
  retentionDays: number;
  recordingConsentRequired: boolean;
  allowStudentExport: boolean;
  auditLogEnabled: boolean;
  noTrainingOnStudentData: boolean;
};

type SeedAuditEntry = {
  id: string;
  actorEmail: string;
  actorRole: "teacher";
  action: string;
  detail: string;
  createdAt: string;
};

type WorkspaceSeed = {
  accounts: SeedAccount[];
  sessions?: Session[];
  draft?: Session | null;
  classGroups?: ClassGroup[];
  rosterTemplates?: RosterTemplate[];
  privacySettings?: PrivacySettings;
  auditLog?: SeedAuditEntry[];
};

const defaultPrivacySettings: PrivacySettings = {
  retentionDays: 365,
  recordingConsentRequired: true,
  allowStudentExport: true,
  auditLogEnabled: true,
  noTrainingOnStudentData: true,
};

function makeTeacherAccount(name: string, email: string, password: string): SeedAccount {
  return {
    id: `teacher-${email.replace(/[^a-z0-9]/gi, "-")}`,
    role: "teacher",
    email,
    name,
    passwordHash: createHash("sha256").update(password).digest("hex"),
    createdAt: new Date().toISOString(),
  };
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function makeSession(ownerEmail: string, title: string, date: string, status: "draft" | "published" = "published"): Session {
  const id = `session-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return {
    id,
    ownerEmail,
    title,
    type: "General classroom",
    date,
    status,
    students: [],
    transcript: "Teacher: Review the lesson and complete the follow-up.",
    notes: "",
    recap: `${title} recap`,
    essentialQuestions: ["What should students do next?"],
    attendance: {},
    resources: [],
    actionItems: [],
    participationEvents: [],
    followUps: [],
    submissions: [],
    unmatchedParticipants: [],
    importWarnings: [],
    transcriptAliases: {},
    emailDelivery: {
      status: "not_sent",
      recipients: [],
      skipped: [],
    },
  };
}

function makeClassGroup(ownerEmail: string, name: string): ClassGroup {
  const now = new Date().toISOString();
  return {
    id: `class-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ownerEmail,
    name,
    description: "",
    defaultSessionType: "General classroom",
    students: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeRosterTemplate(ownerEmail: string, name: string): RosterTemplate {
  const now = new Date().toISOString();
  return {
    id: `roster-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    ownerEmail,
    name,
    sessionType: "General classroom",
    students: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeAuditEntry(ownerEmail: string, action: string): SeedAuditEntry {
  return {
    id: `audit-${ownerEmail}-${action}`,
    actorEmail: ownerEmail,
    actorRole: "teacher",
    action,
    detail: `Seeded ${action} entry.`,
    createdAt: new Date().toISOString(),
  };
}

async function seedWorkspace(page: Page, seed: WorkspaceSeed) {
  await page.goto("/manifest.webmanifest");
  await page.evaluate(
    ({ keys, state }) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(keys.accounts, JSON.stringify(state.accounts));
      localStorage.setItem(keys.sessions, JSON.stringify(state.sessions ?? []));
      localStorage.setItem(keys.draft, JSON.stringify(state.draft ?? null));
      localStorage.setItem(keys.classGroups, JSON.stringify(state.classGroups ?? []));
      localStorage.setItem(keys.rosterTemplates, JSON.stringify(state.rosterTemplates ?? []));
      localStorage.setItem(
        keys.privacySettings,
        JSON.stringify(state.privacySettings ?? {
          retentionDays: 365,
          recordingConsentRequired: true,
          allowStudentExport: true,
          auditLogEnabled: true,
          noTrainingOnStudentData: true,
        }),
      );
      localStorage.setItem(keys.auditLog, JSON.stringify(state.auditLog ?? []));
    },
    { keys: legacyStorageKeys, state: seed },
  );
  await page.goto("/#/dashboard");
}

async function openSignInForm(page: Page) {
  const signInHeading = page.getByText(/Sign in to ClassLoop/i);
  if (await signInHeading.isVisible().catch(() => false)) return;

  await page.waitForSelector(".auth-entry-actions, .auth-mode-link", { timeout: 15_000 });
  const logInButton = page.locator(".auth-entry-actions").getByRole("button", { name: /^log in$/i });
  if (await logInButton.isVisible().catch(() => false)) {
    await logInButton.click();
  } else {
    await page.locator(".auth-mode-link").click();
  }
  await expect(signInHeading).toBeVisible();
}

async function signInTeacher(page: Page, email: string, password: string) {
  await openSignInForm(page);
  await page.getByRole("tab", { name: /^class$/i }).click();
  await page.getByRole("tab", { name: /^teacher$/i }).click();
  await page.getByPlaceholder("name@example.com").fill(email);
  await page.getByPlaceholder("Enter password").fill(password);
  await page.locator("form.login-form button[type='submit']").click();
  await expect(page.getByText("Today in ClassLoop")).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("heading", { name: /^ClassLoop$/i })).toBeVisible();
}

async function respondToConfirm(
  page: Page,
  trigger: () => Promise<void>,
  expectedMessage: RegExp,
  response: "accept" | "dismiss",
) {
  const dialogPromise = page.waitForEvent("dialog");
  const actionPromise = trigger();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toMatch(expectedMessage);
  if (response === "accept") {
    await dialog.accept();
  } else {
    await dialog.dismiss();
  }
  await actionPromise;
}

async function readSecureJson<T>(page: Page, storageKey: string): Promise<T | null> {
  return page.evaluate(async (key) => {
    const stored = localStorage.getItem(key);
    const rawKey = localStorage.getItem("classloop:local-storage-key:v1");
    if (!stored || !rawKey) return null;

    const decodeBase64 = (value: string) => {
      const binary = window.atob(value);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    };
    const envelope = JSON.parse(stored) as {
      encrypted?: boolean;
      iv?: string;
      payload?: string;
    };
    if (!envelope.encrypted) return envelope as T;
    if (!envelope.iv || !envelope.payload) return null;

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      decodeBase64(rawKey),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(envelope.iv) },
      cryptoKey,
      decodeBase64(envelope.payload),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  }, storageKey);
}

function sessionRow(page: Page, title: string) {
  return page.locator(".session-row").filter({ hasText: title });
}

test.describe("class, roster, and privacy management controls", () => {
  test("class and saved-roster managers support create, edit, save-as-class, and confirmed deletion", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Management CRUD runs once on the desktop browser project.");
    test.setTimeout(60_000);

    const runId = Date.now().toString(36);
    const email = `manager-${runId}@classloop.test`;
    const password = `manager-pass-${runId}`;
    const className = `Algebra Lab ${runId}`;
    const rosterName = `Reusable Algebra ${runId}`;
    const account = makeTeacherAccount(`Manager Teacher ${runId}`, email, password);

    await seedWorkspace(page, { accounts: [account] });
    await signInTeacher(page, email, password);

    await page.getByRole("button", { name: /^classes$/i }).click();
    await page.getByRole("button", { name: /^create class$/i }).first().click();

    const classSettings = page.locator(".class-group-page .roster-template-settings");
    await classSettings.locator("input").first().fill(className);
    await classSettings.locator("select").first().selectOption("Math review");
    await classSettings.locator("textarea").first().fill("Period 2 algebra support and review.");
    await expect(page.locator(".roster-template-card").filter({ hasText: className })).toBeVisible();
    await expect(classSettings.locator("select").first()).toHaveValue("Math review");
    await expect(classSettings.locator("textarea").first()).toHaveValue("Period 2 algebra support and review.");

    await page.getByRole("button", { name: /manage roster/i }).click();
    const classRoster = page.locator("section.panel").filter({ hasText: "Class roster" });
    await classRoster.getByRole("button", { name: /add student/i }).click();
    const classStudent = classRoster.locator(".roster-row").first();
    await classStudent.locator(".roster-name-field input").fill("Avery Stone");
    await classStudent.locator(".roster-email-field input").fill(`avery-${runId}@classloop.test`);
    await classStudent.locator(".roster-aliases-field input").fill("Avery Chromebook");
    await expect(classRoster.locator(".roster-count")).toContainText("1");
    await expect
      .poll(async () => {
        const groups = await readSecureJson<ClassGroup[]>(page, secureStorageKeys.classGroups);
        const group = groups?.find((item) => item.ownerEmail === email && item.name === className);
        if (!group) return null;
        return {
          description: group.description,
          defaultSessionType: group.defaultSessionType,
          students: group.students.map((student) => ({
            name: student.name,
            email: student.email,
            aliases: student.aliases,
          })),
        };
      })
      .toEqual({
        description: "Period 2 algebra support and review.",
        defaultSessionType: "Math review",
        students: [
          {
            name: "Avery Stone",
            email: `avery-${runId}@classloop.test`,
            aliases: ["Avery Chromebook"],
          },
        ],
      });

    await page.getByRole("button", { name: /^create saved roster$/i }).click();
    const rosterDetails = page.locator(".roster-template-layout");
    const rosterSettings = page.locator(".roster-template-page .roster-template-settings");
    await rosterSettings.locator("input").first().fill(rosterName);
    await rosterSettings.locator("select").first().selectOption("Math review");
    await rosterDetails.getByRole("button", { name: /add student/i }).click();
    const rosterStudent = rosterDetails.locator(".roster-row").first();
    await rosterStudent.locator(".roster-name-field input").fill("Jordan Park");
    await rosterStudent.locator(".roster-email-field input").fill(`jordan-${runId}@classloop.test`);
    await rosterStudent.locator(".roster-aliases-field input").fill("Jordan iPad");
    await expect(rosterDetails.locator(".roster-count")).toContainText("1");
    await expect
      .poll(async () => {
        const templates = await readSecureJson<RosterTemplate[]>(page, secureStorageKeys.rosterTemplates);
        const template = templates?.find((item) => item.ownerEmail === email && item.name === rosterName);
        if (!template) return null;
        return {
          sessionType: template.sessionType,
          students: template.students.map((student) => ({
            name: student.name,
            email: student.email,
            aliases: student.aliases,
          })),
        };
      })
      .toEqual({
        sessionType: "Math review",
        students: [
          {
            name: "Jordan Park",
            email: `jordan-${runId}@classloop.test`,
            aliases: ["Jordan iPad"],
          },
        ],
      });

    await rosterDetails.getByRole("button", { name: /save as class/i }).click();
    await expect
      .poll(async () => {
        const groups = await readSecureJson<ClassGroup[]>(page, secureStorageKeys.classGroups);
        const group = groups?.find((item) => item.ownerEmail === email && item.name === rosterName);
        if (!group) return null;
        return {
          defaultSessionType: group.defaultSessionType,
          students: group.students.map((student) => ({
            name: student.name,
            email: student.email,
            aliases: student.aliases,
          })),
        };
      })
      .toEqual({
        defaultSessionType: "Math review",
        students: [
          {
            name: "Jordan Park",
            email: `jordan-${runId}@classloop.test`,
            aliases: ["Jordan iPad"],
          },
        ],
      });
    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.locator(".roster-template-card").filter({ hasText: className })).toBeVisible();
    await expect(page.locator(".roster-template-card").filter({ hasText: rosterName })).toBeVisible();

    await page.getByRole("button", { name: /^rosters$/i }).click();
    const deleteRoster = page.getByRole("button", { name: /delete roster/i });
    await respondToConfirm(
      page,
      () => deleteRoster.click(),
      new RegExp(`Delete saved roster "${rosterName}"\\?`),
      "dismiss",
    );
    await expect(page.locator(".roster-template-card").filter({ hasText: rosterName })).toBeVisible();
    await respondToConfirm(
      page,
      () => deleteRoster.click(),
      new RegExp(`Delete saved roster "${rosterName}"\\?`),
      "accept",
    );
    await expect(page.getByRole("heading", { name: /no saved roster templates yet/i })).toBeVisible();

    await page.getByRole("button", { name: /^classes$/i }).click();
    await page.locator(".roster-template-card").filter({ hasText: className }).click();
    const deleteClass = page.getByRole("button", { name: /delete class/i });
    await respondToConfirm(
      page,
      () => deleteClass.click(),
      new RegExp(`Delete class "${className}"\\? Sessions already published from it will remain\\.`),
      "dismiss",
    );
    await expect(page.locator(".roster-template-card").filter({ hasText: className })).toBeVisible();
    await respondToConfirm(
      page,
      () => deleteClass.click(),
      new RegExp(`Delete class "${className}"\\? Sessions already published from it will remain\\.`),
      "accept",
    );
    await expect(page.locator(".roster-template-card").filter({ hasText: className })).toHaveCount(0);
    await expect(page.locator(".roster-template-card").filter({ hasText: rosterName })).toBeVisible();

    await expect
      .poll(async () => {
        const templates = await readSecureJson<RosterTemplate[]>(page, secureStorageKeys.rosterTemplates);
        return templates?.filter((template) => template.ownerEmail === email).map((template) => template.name) ?? null;
      })
      .toEqual([]);
    await expect
      .poll(async () => {
        const groups = await readSecureJson<ClassGroup[]>(page, secureStorageKeys.classGroups);
        return groups?.filter((group) => group.ownerEmail === email).map((group) => group.name) ?? null;
      })
      .toEqual([rosterName]);
  });

  test("retention shows a no-op status and honors cancel before confirmed expired-session deletion", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Retention mutation runs once on the desktop browser project.");
    test.setTimeout(60_000);

    const runId = Date.now().toString(36);
    const email = `retention-${runId}@classloop.test`;
    const password = `retention-pass-${runId}`;
    const recentTitle = `Recent session ${runId}`;
    const expiredTitle = `Expired session ${runId}`;
    const account = makeTeacherAccount(`Retention Teacher ${runId}`, email, password);
    const recentSession = makeSession(email, recentTitle, dateDaysAgo(2));
    const expiredSession = makeSession(email, expiredTitle, dateDaysAgo(90));

    await seedWorkspace(page, {
      accounts: [account],
      sessions: [recentSession, expiredSession],
      privacySettings: defaultPrivacySettings,
    });
    await signInTeacher(page, email, password);

    await page.getByRole("button", { name: /^privacy$/i }).click();
    const retentionDays = page.getByLabel(/keep class session data/i);
    await retentionDays.fill("2555");
    await page.getByRole("button", { name: /enforce retention/i }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /No sessions exceed the 2555-day retention window/i }),
    ).toBeVisible();

    await retentionDays.fill("30");
    await respondToConfirm(
      page,
      () => page.getByRole("button", { name: /enforce retention/i }).click(),
      /Delete 1 session older than 30 days\? This cannot be undone\./i,
      "dismiss",
    );

    await page.getByRole("button", { name: /^dashboard$/i }).click();
    await expect(sessionRow(page, recentTitle)).toHaveCount(1);
    await expect(sessionRow(page, expiredTitle)).toHaveCount(1);

    await page.getByRole("button", { name: /^privacy$/i }).click();
    await respondToConfirm(
      page,
      () => page.getByRole("button", { name: /enforce retention/i }).click(),
      /Delete 1 session older than 30 days\? This cannot be undone\./i,
      "accept",
    );
    await expect(
      page.getByRole("status").filter({ hasText: /Deleted 1 expired session\./i }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const sessions = await readSecureJson<Session[]>(page, secureStorageKeys.sessions);
        return sessions?.filter((session) => session.ownerEmail === email).map((session) => session.title) ?? null;
      })
      .toEqual([recentTitle]);

    await page.getByRole("button", { name: /^dashboard$/i }).click();
    await expect(sessionRow(page, recentTitle)).toHaveCount(1);
    await expect(sessionRow(page, expiredTitle)).toHaveCount(0);
  });

  test("retention never claims deletion when the encrypted workspace write fails", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The forced persistence failure only needs one browser project.");
    test.setTimeout(60_000);

    const runId = Date.now().toString(36);
    const email = `retention-write-failure-${runId}@classloop.test`;
    const password = `retention-write-failure-pass-${runId}`;
    const recentTitle = `Write-safe recent session ${runId}`;
    const expiredTitle = `Write-safe expired session ${runId}`;
    const account = makeTeacherAccount(`Write Failure Teacher ${runId}`, email, password);

    await seedWorkspace(page, {
      accounts: [account],
      sessions: [
        makeSession(email, recentTitle, dateDaysAgo(2)),
        makeSession(email, expiredTitle, dateDaysAgo(90)),
      ],
      privacySettings: { ...defaultPrivacySettings, retentionDays: 30 },
    });
    await signInTeacher(page, email, password);
    await expect
      .poll(async () => {
        const sessions = await readSecureJson<Session[]>(page, secureStorageKeys.sessions);
        return sessions?.map((session) => session.title).sort() ?? null;
      })
      .toEqual([expiredTitle, recentTitle].sort());

    await page.getByRole("button", { name: /^privacy$/i }).click();
    await page.evaluate(() => {
      const subtle = window.crypto.subtle;
      Object.defineProperty(subtle, "encrypt", {
        configurable: true,
        value: async () => {
          throw new DOMException("Simulated encrypted storage failure", "OperationError");
        },
      });
    });
    await respondToConfirm(
      page,
      () => page.getByRole("button", { name: /enforce retention/i }).click(),
      /Delete 1 session older than 30 days\? This cannot be undone\./i,
      "accept",
    );
    await expect(
      page.getByRole("status").filter({
        hasText: /No sessions were deleted because this device could not save the change/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: /Deleted 1 expired session/i }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /^dashboard$/i }).click();
    await expect(sessionRow(page, recentTitle)).toHaveCount(1);
    await expect(sessionRow(page, expiredTitle)).toHaveCount(1);

    await page.reload();
    await page.goto("/#/dashboard");
    await signInTeacher(page, email, password);
    await expect(sessionRow(page, recentTitle)).toHaveCount(1);
    await expect(sessionRow(page, expiredTitle)).toHaveCount(1);
  });

  test("Delete all class data is cancelable, teacher-scoped, and durable after reload", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Destructive account-isolation coverage runs once on desktop.");
    test.setTimeout(60_000);

    const runId = Date.now().toString(36);
    const keeperEmail = `keeper-${runId}@classloop.test`;
    const keeperPassword = `keeper-pass-${runId}`;
    const deletingEmail = `deleting-${runId}@classloop.test`;
    const deletingPassword = `deleting-pass-${runId}`;
    const keeperTitle = `Keeper workspace session ${runId}`;
    const deletingTitle = `Deleting workspace session ${runId}`;
    const draftTitle = `Deleting workspace draft ${runId}`;
    const keeperClassName = `Keeper class ${runId}`;
    const deletingClassName = `Deleting class ${runId}`;
    const keeperRosterName = `Keeper roster ${runId}`;
    const deletingRosterName = `Deleting roster ${runId}`;
    const keeper = makeTeacherAccount(`Keeper Teacher ${runId}`, keeperEmail, keeperPassword);
    const deleting = makeTeacherAccount(`Deleting Teacher ${runId}`, deletingEmail, deletingPassword);

    await seedWorkspace(page, {
      accounts: [keeper, deleting],
      sessions: [
        makeSession(keeperEmail, keeperTitle, dateDaysAgo(3)),
        makeSession(deletingEmail, deletingTitle, dateDaysAgo(1)),
      ],
      draft: makeSession(deletingEmail, draftTitle, dateDaysAgo(0), "draft"),
      classGroups: [
        makeClassGroup(keeperEmail, keeperClassName),
        makeClassGroup(deletingEmail, deletingClassName),
      ],
      rosterTemplates: [
        makeRosterTemplate(keeperEmail, keeperRosterName),
        makeRosterTemplate(deletingEmail, deletingRosterName),
      ],
      privacySettings: defaultPrivacySettings,
      auditLog: [
        makeAuditEntry(keeperEmail, "keeper_history"),
        makeAuditEntry(deletingEmail, "deleting_history"),
      ],
    });
    await signInTeacher(page, deletingEmail, deletingPassword);
    await expect(sessionRow(page, deletingTitle)).toHaveCount(1);
    await expect(sessionRow(page, keeperTitle)).toHaveCount(0);

    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.locator(".roster-template-card").filter({ hasText: deletingClassName })).toBeVisible();
    await expect(page.locator(".roster-template-card").filter({ hasText: keeperClassName })).toHaveCount(0);
    await page.getByRole("button", { name: /^rosters$/i }).click();
    await expect(page.locator(".roster-template-card").filter({ hasText: deletingRosterName })).toBeVisible();
    await expect(page.locator(".roster-template-card").filter({ hasText: keeperRosterName })).toHaveCount(0);

    await page.getByRole("button", { name: /^privacy$/i }).click();
    await respondToConfirm(
      page,
      () => page.getByRole("button", { name: /delete all class data/i }).click(),
      /Delete this teacher workspace's sessions, draft, classes, saved rosters, and previous audit history\? The account will remain\./i,
      "dismiss",
    );
    await expect
      .poll(async () => {
        const groups = await readSecureJson<ClassGroup[]>(page, secureStorageKeys.classGroups);
        const templates = await readSecureJson<RosterTemplate[]>(page, secureStorageKeys.rosterTemplates);
        const entries = await readSecureJson<SeedAuditEntry[]>(page, secureStorageKeys.auditLog);
        return {
          deletingClass: groups?.some(
            (group) => group.ownerEmail === deletingEmail && group.name === deletingClassName,
          ),
          deletingRoster: templates?.some(
            (template) => template.ownerEmail === deletingEmail && template.name === deletingRosterName,
          ),
          deletingHistory: entries?.some(
            (entry) => entry.actorEmail === deletingEmail && entry.action === "deleting_history",
          ),
        };
      })
      .toEqual({
        deletingClass: true,
        deletingRoster: true,
        deletingHistory: true,
      });
    await page.getByRole("button", { name: /^dashboard$/i }).click();
    await expect(sessionRow(page, deletingTitle)).toHaveCount(1);
    await expect(page.getByRole("button", { name: /continue draft/i })).toBeVisible();

    await page.getByRole("button", { name: /^privacy$/i }).click();
    await respondToConfirm(
      page,
      () => page.getByRole("button", { name: /delete all class data/i }).click(),
      /Delete this teacher workspace's sessions, draft, classes, saved rosters, and previous audit history\? The account will remain\./i,
      "accept",
    );
    await expect(
      page.getByRole("status").filter({
        hasText: /This teacher account's class sessions, draft, classes, and saved rosters were deleted/i,
      }),
    ).toBeVisible();

    await expect
      .poll(async () => {
        const sessions = await readSecureJson<Session[]>(page, secureStorageKeys.sessions);
        return sessions?.map((session) => session.title) ?? null;
      })
      .toEqual([keeperTitle]);
    await expect
      .poll(async () => readSecureJson<Session | null>(page, secureStorageKeys.draft))
      .toBeNull();
    await expect
      .poll(async () => {
        const groups = await readSecureJson<ClassGroup[]>(page, secureStorageKeys.classGroups);
        return groups?.map((group) => group.name) ?? null;
      })
      .toEqual([keeperClassName]);
    await expect
      .poll(async () => {
        const templates = await readSecureJson<RosterTemplate[]>(page, secureStorageKeys.rosterTemplates);
        return templates?.map((template) => template.name) ?? null;
      })
      .toEqual([keeperRosterName]);
    await expect
      .poll(async () => {
        const entries = await readSecureJson<SeedAuditEntry[]>(page, secureStorageKeys.auditLog);
        if (!entries) return null;
        return {
          keeperHistory: entries.some(
            (entry) => entry.actorEmail === keeperEmail && entry.action === "keeper_history",
          ),
          deletingHistory: entries.some(
            (entry) => entry.actorEmail === deletingEmail && entry.action === "deleting_history",
          ),
          deletionAudit: entries.some(
            (entry) => entry.actorEmail === deletingEmail && entry.action === "delete_class_data",
          ),
        };
      })
      .toEqual({
        keeperHistory: true,
        deletingHistory: false,
        deletionAudit: true,
      });

    await page.reload();
    await page.goto("/#/dashboard");
    await signInTeacher(page, deletingEmail, deletingPassword);
    await expect(sessionRow(page, deletingTitle)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /continue draft/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.getByRole("heading", { name: /no classes yet/i })).toBeVisible();
    await page.getByRole("button", { name: /^rosters$/i }).click();
    await expect(page.getByRole("heading", { name: /no saved rosters yet/i })).toBeVisible();

    await signOut(page);
    await signInTeacher(page, keeperEmail, keeperPassword);
    await expect(sessionRow(page, keeperTitle)).toHaveCount(1);
    await expect(sessionRow(page, deletingTitle)).toHaveCount(0);
    await page.getByRole("button", { name: /^classes$/i }).click();
    await expect(page.locator(".roster-template-card").filter({ hasText: keeperClassName })).toBeVisible();
    await page.getByRole("button", { name: /^rosters$/i }).click();
    await expect(page.locator(".roster-template-card").filter({ hasText: keeperRosterName })).toBeVisible();
  });
});
