const net = require("net");
const { spawn } = require("child_process");

const args = process.argv.slice(2);
const host = process.env.CLASSLOOP_PLAYWRIGHT_HOST || "127.0.0.1";
const port = Number(process.env.CLASSLOOP_PLAYWRIGHT_PORT || process.env.FRONTEND_PORT || 5177);
const baseURL = `http://${host}:${port}`;

function hasArg(name) {
  return args.includes(name);
}

function configArgValue() {
  const shortIndex = args.indexOf("-c");
  if (shortIndex !== -1) return args[shortIndex + 1] || "";
  const longIndex = args.indexOf("--config");
  if (longIndex !== -1) return args[longIndex + 1] || "";
  const inline = args.find((arg) => arg.startsWith("--config="));
  return inline ? inline.slice("--config=".length) : "";
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function needsLocalWebServer() {
  if (hasArg("--help") || hasArg("-h")) return false;
  const config = configArgValue();
  if (config.includes("playwright.web.config")) {
    return isLocalUrl(process.env.CLASSLOOP_WEB_TEST_URL || "");
  }
  return true;
}

function canBindLocalPort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve({ ok: false, error }));
    server.once("listening", () => {
      server.close(() => resolve({ ok: true }));
    });
    server.listen(port, host);
  });
}

function canReachExistingServer() {
  return fetch(baseURL, { method: "HEAD" })
    .then((response) => response.ok || response.status < 500)
    .catch(() => false);
}

function playwrightBin() {
  return process.platform === "win32" ? "node_modules/.bin/playwright.cmd" : "node_modules/.bin/playwright";
}

async function main() {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;

  if (needsLocalWebServer() && env.CLASSLOOP_REUSE_PLAYWRIGHT_SERVER !== "1") {
    const bind = await canBindLocalPort();
    if (!bind.ok) {
      const canReuse = await canReachExistingServer();
      if (canReuse) {
        env.CLASSLOOP_REUSE_PLAYWRIGHT_SERVER = "1";
        console.warn(`Reusing existing ClassLoop dev server at ${baseURL}; sandbox could not bind a new one (${bind.error.code}).`);
      } else if (["EACCES", "EPERM"].includes(bind.error.code)) {
        console.error(
          [
            `ClassLoop browser tests need a local Vite server at ${baseURL}, but this sandbox cannot bind that port (${bind.error.code}).`,
            "This is an environment limitation, not a ClassLoop app failure.",
            `Start a dev server outside the sandbox with: npm run dev -- --host ${host} --port ${port} --strictPort`,
            "Then rerun with: CLASSLOOP_REUSE_PLAYWRIGHT_SERVER=1 npm run test:browser",
          ].join("\n"),
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  const child = spawn(playwrightBin(), ["test", ...args], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code || 0;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
