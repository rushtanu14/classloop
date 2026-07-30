import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { coverageThreshold, parseLineCoverage } = require("../scripts/check-test-coverage.cjs");

test("parseLineCoverage reads Node's all-files coverage summary", () => {
  const report = [
    "# file | line % | branch % | funcs % | uncovered lines",
    "# src/data.js | 98.34 | 90.35 | 96.15 | 12-14",
    "# all files | 90.80 | 82.24 | 91.21 |",
  ].join("\n");

  assert.equal(parseLineCoverage(report), 90.8);
  assert.equal(parseLineCoverage("ℹ all files             |  90.80 | 82.24 | 91.21 |"), 90.8);
  assert.equal(parseLineCoverage("TAP version 13\n1..2"), null);
});

test("coverageThreshold accepts inclusive percentages and rejects invalid configuration", () => {
  assert.equal(coverageThreshold("0"), 0);
  assert.equal(coverageThreshold("80.5"), 80.5);
  assert.equal(coverageThreshold("100"), 100);
  assert.throws(() => coverageThreshold("-1"), /0 to 100/);
  assert.throws(() => coverageThreshold("101"), /0 to 100/);
  assert.throws(() => coverageThreshold("not-a-number"), /0 to 100/);
});
