import assert from "node:assert/strict";
import {
  applyIntegrationDraftPatch,
  createDefaultIntegrationFieldDecisions,
  serializeIntegrationResources,
  serializeIntegrationRoster,
  type IntegrationDraftPatch,
  type IntegrationImportFormState,
  type IntegrationRecordCandidate,
} from "../src/integration-imports.js";

const emptyForm: IntegrationImportFormState = {
  title: "",
  transcript: "",
  notes: "",
  roster: "",
  resources: "",
};

function makePatch(fields: IntegrationDraftPatch["fields"]): IntegrationDraftPatch {
  return {
    schemaVersion: 1,
    importId: "import-1",
    integrationId: "google-drive",
    providerLabel: "Google Drive",
    sourceLabel: "Unit 3 lesson",
    occurredAt: "2026-07-29T18:00:00.000Z",
    fields,
    warnings: [],
    receipt: { id: "receipt-1" },
  };
}

{
  const source = [
    { name: " Maya   Chen ", email: "MAYA@Example.edu" },
    { name: "Maya Chen", email: "maya@example.edu" },
    { name: "Maya Chen" },
    { name: "Aarav Patel", email: "not-an-email" },
    { name: " Jordan Lee " },
    { email: "priya@example.edu" },
  ] as const;
  const snapshot = structuredClone(source);

  const serialized = serializeIntegrationRoster(source);

  assert.equal(
    serialized.value,
    ["Maya Chen, maya@example.edu", "Jordan Lee", "priya@example.edu"].join("\n"),
  );
  assert.deepEqual(serialized.warnings, [
    "Skipped roster item 4 because its email is invalid.",
  ]);
  assert.deepEqual(source, snapshot, "roster serialization must not mutate provider records");
}

{
  const source = [
    { title: "Lesson plan", url: "HTTPS://Example.COM/lesson/#section" },
    { title: "Duplicate", url: "https://example.com/lesson" },
    { title: "Unsafe", url: "javascript:alert(1)" },
    { title: "Credentials", url: "https://teacher:secret@example.com/private" },
    { url: "https://example.com/worksheet?week=2" },
  ] as const;
  const snapshot = structuredClone(source);

  const serialized = serializeIntegrationResources(source);

  assert.equal(
    serialized.value,
    [
      "Lesson plan — https://example.com/lesson",
      "https://example.com/worksheet?week=2",
    ].join("\n"),
  );
  assert.deepEqual(serialized.warnings, [
    "Skipped resource item 3 because its URL is invalid.",
    "Skipped resource item 4 because its URL is invalid.",
  ]);
  assert.deepEqual(source, snapshot, "resource serialization must not mutate provider records");
}

{
  const patch = makePatch({
    title: "Imported lesson",
    transcript: "[00:01] Maya: Hello",
    notes: ["Provider note", "Second provider note"],
    roster: [{ name: "Maya Chen", email: "maya@example.edu" }],
    resources: [{ title: "Slides", url: "https://example.com/slides" }],
  });
  const decisions = createDefaultIntegrationFieldDecisions(patch);

  assert.deepEqual(decisions, {
    title: { include: true, mode: "fill-empty" },
    transcript: { include: true, mode: "append" },
    notes: { include: true, mode: "append" },
    roster: { include: true, mode: "append" },
    resources: { include: true, mode: "append" },
  });
}

{
  const form: IntegrationImportFormState = {
    title: "Teacher title",
    transcript: "Existing transcript",
    notes: "Existing notes",
    roster: [
      "Maya Chen, MAYA@example.edu",
      "Jordan Lee",
      "Legacy Student, legacy@example.edu",
      "No Email Yet",
    ].join("\n"),
    resources: [
      "Existing slides — https://example.com/slides/",
      "Existing handout — https://example.com/handout",
    ].join("\n"),
  };
  const patch = makePatch({
    title: "Provider title",
    transcript: "Imported transcript",
    notes: "Replacement notes",
    roster: [
      { name: "Maya Chen", email: "maya@example.edu" },
      { name: "JORDAN   LEE" },
      { name: "Aarav Patel", email: "aarav@example.edu" },
      { name: "No Email Yet", email: "no-email-yet@example.edu" },
      { name: "Unsafe Student", email: "invalid-email" },
    ],
    resources: [
      { title: "Duplicate slides", url: "https://EXAMPLE.com/slides" },
      { title: "Practice", url: "https://example.com/practice/" },
      { title: "Unsafe", url: "javascript:alert(1)" },
    ],
  });
  const formSnapshot = structuredClone(form);
  const patchSnapshot = structuredClone(patch);
  const decisions = createDefaultIntegrationFieldDecisions(patch);
  const result = applyIntegrationDraftPatch(form, patch, {
    ...decisions,
    title: { include: true, mode: "fill-empty" },
    notes: { include: true, mode: "replace" },
    resources: { include: false, mode: "append" },
  });

  assert.equal(result.title, "Teacher title", "fill-empty must preserve a nonempty field");
  assert.equal(result.transcript, "Existing transcript\n\nImported transcript");
  assert.equal(result.notes, "Replacement notes");
  assert.equal(
    result.roster,
    [
      "Maya Chen, MAYA@example.edu",
      "Jordan Lee",
      "Legacy Student, legacy@example.edu",
      "No Email Yet",
      "Aarav Patel, aarav@example.edu",
    ].join("\n"),
  );
  assert.equal(result.resources, form.resources, "include=false must preserve the field");
  assert.deepEqual(form, formSnapshot, "merge must not mutate the existing form");
  assert.deepEqual(patch, patchSnapshot, "merge must not mutate the import patch");

  const repeated = applyIntegrationDraftPatch(result, patch, {
    ...decisions,
    title: { include: true, mode: "fill-empty" },
    notes: { include: true, mode: "replace" },
    resources: { include: false, mode: "append" },
  });
  assert.deepEqual(repeated, result, "applying the same patch twice must be idempotent");
}

{
  const patch = makePatch({
    title: "  Imported lesson  ",
    transcript: "  Transcript body  ",
    notes: [" First note ", "Second note", "First note"],
    roster: [{ name: "Aarav Patel", email: "aarav@example.edu" }],
    resources: [{ title: "Worksheet", url: "https://example.com/worksheet/" }],
  });
  const result = applyIntegrationDraftPatch(
    emptyForm,
    patch,
    createDefaultIntegrationFieldDecisions(patch),
  );

  assert.deepEqual(result, {
    title: "Imported lesson",
    transcript: "Transcript body",
    notes: "First note\n\nSecond note",
    roster: "Aarav Patel, aarav@example.edu",
    resources: "Worksheet — https://example.com/worksheet",
  });
}

{
  const candidate: IntegrationRecordCandidate = {
    selectionKey: "record-1",
    integrationId: "google-drive",
    title: "Unit 3 lesson",
    subtitle: "Updated today",
    occurredAt: "2026-07-29T18:00:00.000Z",
    availableFields: ["title", "notes", "resources"],
  };
  assert.equal(candidate.availableFields[1], "notes");
}

console.log("integration import merge tests passed");
