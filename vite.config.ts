import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const buildVersion = String(packageJson.version || "");

function safeExec(command: string) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const buildSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  safeExec("git rev-parse HEAD");
const buildEnv = process.env.VERCEL_ENV || process.env.NODE_ENV || "";
const buildTime =
  process.env.CLASSLOOP_BUILD_TIME ||
  process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
  safeExec("git log -1 --format=%cI");

export default defineConfig({
  plugins: [react()],
  define: {
    __CLASSLOOP_VERSION__: JSON.stringify(buildVersion),
    __CLASSLOOP_BUILD_SHA__: JSON.stringify(buildSha),
    __CLASSLOOP_BUILD_ENV__: JSON.stringify(buildEnv),
    __CLASSLOOP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    chunkSizeWarningLimit: 650,
  },
});
