const { spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function parseLineCoverage(output) {
  const normalizedOutput = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  const summary = normalizedOutput.match(/^(?:#|ℹ)\s+all files\s+\|\s+([0-9]+(?:\.[0-9]+)?)\s+\|/m);
  return summary ? Number(summary[1]) : null;
}

function coverageThreshold(value = process.env.CLASSLOOP_COVERAGE_LINES || "80") {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error(`CLASSLOOP_COVERAGE_LINES must be a number from 0 to 100; received ${JSON.stringify(value)}.`);
  }
  return threshold;
}

function runCoverage() {
  const threshold = coverageThreshold();
  const testFiles = [
    ".test-build/tests/import-flow.test.js",
    ".test-build/tests/cloud-sync.test.js",
  ];
  const result = spawnSync(
    process.execPath,
    ["--experimental-test-coverage", "--test", ...testFiles],
    { cwd: rootDir, encoding: "utf8", env: process.env },
  );
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  process.stdout.write(output);

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);

  const actual = parseLineCoverage(output);
  if (actual === null) {
    throw new Error("Node completed the coverage run but did not emit an all-files line coverage summary.");
  }
  if (actual < threshold) {
    throw new Error(`Line coverage ${actual.toFixed(2)}% is below the required ${threshold.toFixed(2)}%.`);
  }
  process.stdout.write(`Coverage gate passed: ${actual.toFixed(2)}% line coverage (required ${threshold.toFixed(2)}%).\n`);
}

module.exports = { coverageThreshold, parseLineCoverage };

if (require.main === module) runCoverage();
