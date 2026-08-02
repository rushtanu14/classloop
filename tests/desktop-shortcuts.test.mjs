import { strict as assert } from "node:assert";
import fs from "node:fs";
import test from "node:test";

const swiftSource = fs.readFileSync(
  new URL("../macos-swift/ClassLoopSwift/Sources/ClassLoopSwift/ClassLoopSwiftApp.swift", import.meta.url),
  "utf8",
);
const electronSource = fs.readFileSync(new URL("../desktop/main.cjs", import.meta.url), "utf8");

test("the primary Swift macOS app exposes standard close, quit, edit, and reopen commands", () => {
  assert.match(swiftSource, /app\.mainMenu\s*=\s*makeApplicationMenu\(\)/);
  assert.match(swiftSource, /title:\s*"Close Window"[\s\S]*keyEquivalent:\s*"w"/);
  assert.match(swiftSource, /title:\s*"Quit ClassLoop"[\s\S]*keyEquivalent:\s*"q"/);
  assert.match(swiftSource, /title:\s*"Copy"[\s\S]*keyEquivalent:\s*"c"/);
  assert.match(swiftSource, /title:\s*"Paste"[\s\S]*keyEquivalent:\s*"v"/);
  assert.match(swiftSource, /applicationShouldTerminateAfterLastWindowClosed[\s\S]*false/);
  assert.match(swiftSource, /applicationShouldHandleReopen/);
});

test("the Electron fallback keeps the same close and quit shortcuts", () => {
  assert.match(electronSource, /const \{ app, BrowserWindow, Menu, shell \} = require\("electron"\)/);
  assert.match(electronSource, /function installApplicationMenu\(\)/);
  assert.match(electronSource, /accelerator:\s*"CommandOrControl\+W"/);
  assert.match(electronSource, /accelerator:\s*"CommandOrControl\+Q"/);
  assert.match(electronSource, /Menu\.setApplicationMenu\(Menu\.buildFromTemplate\(template\)\)/);
});
