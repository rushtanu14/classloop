import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createImportDraftPreview,
  parseTranscriptPreview,
  prepareClassroomPost,
  readClassLoopWorkspace,
  workspaceSummary,
} from "../dist-mcp/mcp/classloop-core.js";
import { createGeneratedSession } from "../dist-mcp/src/data.js";

const transcript = [
  "Teacher: Today we are reviewing computational thinking.",
  "Maya Chen: Is decomposition like breaking it into smaller functions?",
  "Teacher: Yes. Homework is the algorithm worksheet due Friday.",
  "Resource: https://example.com/algorithms",
].join("\n");

const session = createGeneratedSession({
  title: "MCP Smoke Session",
  template: "CS workshop",
  transcript,
  roster: "Maya Chen, maya@school.example",
  notes: "Maya asked the key decomposition question.",
  resources: "https://example.com/algorithms",
});

const tmp = mkdtempSync(join(tmpdir(), "classloop-mcp-"));
const statePath = join(tmp, "workspace.json");
writeFileSync(statePath, `${JSON.stringify({ sessions: [session], draft: session, auditLog: [] }, null, 2)}\n`);

const workspace = readClassLoopWorkspace({ statePath });
const summary = workspaceSummary(workspace, { statePath, mode: "strict" });
assert.equal(summary.sessionCount, 1);
assert.equal(summary.redactionMode, "strict");

const draft = createImportDraftPreview(
  {
    title: "MCP Import Preview",
    template: "CS workshop",
    transcript,
    roster: "Maya Chen, maya@school.example",
    resources: "https://example.com/algorithms",
  },
  { mode: "strict" },
);
const draftText = JSON.stringify(draft);
assert.equal(draft.mode, "preview_only");
assert.equal(draft.publishAvailable, false);
assert.ok(!draftText.includes("maya@school.example"));
assert.ok(!draftText.includes("Maya Chen: Is decomposition"));
assert.ok(!draftText.includes("maya-chen"));

const preview = parseTranscriptPreview({ transcript }, { mode: "strict" });
assert.equal(preview.transcript.included, false);
assert.equal(preview.transcript.speakerCount >= 1, true);

const post = prepareClassroomPost(workspace, {
  sessionId: session.id,
  postType: "announcement",
});
assert.equal(post.mode, "preview_only");
assert.equal(post.directPublishAvailable, false);
assert.equal(post.confirmationRequired, true);

const encryptedPath = join(tmp, "encrypted.json");
writeFileSync(encryptedPath, `${JSON.stringify({ encrypted: true, payload: "ciphertext" })}\n`);
const encryptedWorkspace = readClassLoopWorkspace({ statePath: encryptedPath });
assert.equal(encryptedWorkspace.readOnly, true);
assert.match(encryptedWorkspace.readError ?? "", /encrypted/i);

console.log("MCP smoke checks passed.");
