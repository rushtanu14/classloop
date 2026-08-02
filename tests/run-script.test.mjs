import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const launcher = path.resolve(testDir, "../run.sh");

function runCheck(packageJson) {
  const workspace = mkdtempSync(path.join(tmpdir(), "classloop-run-"));
  const copiedLauncher = path.join(workspace, "run.sh");

  try {
    copyFileSync(launcher, copiedLauncher);
    chmodSync(copiedLauncher, 0o755);
    writeFileSync(path.join(workspace, "package.json"), packageJson);
    return spawnSync(copiedLauncher, ["--check-env"], {
      cwd: workspace,
      encoding: "utf8",
      env: process.env,
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("launcher rejects unresolved merge markers before npm runs", () => {
  const result = runCheck('{\n<<<<<<< ours\n  "name": "classloop"\n=======\n>>>>>>> theirs\n}\n');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unresolved Git merge markers/i);
});

test("launcher accepts a valid package manifest", () => {
  const result = runCheck('{"name":"classloop","private":true}\n');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /environment loaded successfully/i);
});
