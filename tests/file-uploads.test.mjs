import { strict as assert } from "node:assert";
import {
  createFilestackFinalizeHandler,
  createFilestackUploadSession,
  createFilestackUploadSessionHandler,
  decodeFilestackPolicy,
  verifyUploadReceipt,
} from "../server/backend/api/file-uploads.js";

const env = {
  FILESTACK_API_KEY: "test-public-key",
  FILESTACK_APP_SECRET: "test-secret-that-never-reaches-the-client",
  FILESTACK_SECURITY_ENABLED: "true",
  CLASSLOOP_MALWARE_SCANNER_URL: "https://scanner.classloop.test/scan",
  CLASSLOOP_MALWARE_SCANNER_TOKEN: "scanner-test-token-0123456789abcdef",
};
const user = { id: "teacher-123", email: "teacher@classloop.test" };
const nowMs = Date.parse("2026-08-06T12:00:00.000Z");

function mockRequest({ method = "POST", body, ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}` } = {}) {
  return {
    method,
    body,
    headers: {
      host: "classloop.test",
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    socket: { remoteAddress: ip },
  };
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
      return this;
    },
    end(payload = "") {
      this.body = String(payload);
      return this;
    },
    json() {
      return this.body ? JSON.parse(this.body) : {};
    },
  };
}

const session = createFilestackUploadSession({ env, user, nowMs, nonce: "0123456789abcdef01234567" });
assert.equal(session.apiKey, env.FILESTACK_API_KEY);
assert.equal("appSecret" in session, false);
assert.equal(JSON.stringify(session).toLowerCase().includes("test-secret"), false);
assert.deepEqual(decodeFilestackPolicy(session.policy), {
  expiry: Math.floor(nowMs / 1000) + 300,
  call: ["pick", "store"],
  maxSize: 10_485_760,
});
assert.deepEqual(verifyUploadReceipt(session.uploadReceipt, { env, user, nowMs }), {
  prefix: session.filenamePrefix,
  expiresAt: session.expiresAt,
});
assert.throws(
  () => verifyUploadReceipt(session.uploadReceipt, { env, user: { ...user, id: "another-teacher" }, nowMs }),
  (error) => error.statusCode === 403,
);
assert.throws(
  () => verifyUploadReceipt(session.uploadReceipt, { env, user, nowMs: nowMs + 6 * 60 * 1000 }),
  (error) => error.statusCode === 403,
);
assert.throws(
  () => createFilestackUploadSession({ env: { ...env, FILESTACK_SECURITY_ENABLED: "false" }, user, nowMs }),
  (error) => error.statusCode === 503,
);
assert.throws(
  () =>
    createFilestackUploadSession({
      env: { ...env, CLASSLOOP_MALWARE_SCANNER_URL: "", CLASSLOOP_MALWARE_SCANNER_TOKEN: "" },
      user,
      nowMs,
    }),
  (error) => error.statusCode === 503,
);

const authorize = async () => ({ user });
const sessionHandler = createFilestackUploadSessionHandler({
  authorize,
  env,
  now: () => nowMs,
  nonce: () => "89abcdef0123456789abcdef",
});
const sessionResponse = mockResponse();
await sessionHandler(mockRequest(), sessionResponse);
assert.equal(sessionResponse.statusCode, 200);
assert.equal(sessionResponse.headers["cache-control"], "no-store");
assert.equal(sessionResponse.json().apiKey, env.FILESTACK_API_KEY);

const disallowedMethodResponse = mockResponse();
await sessionHandler(mockRequest({ method: "GET" }), disallowedMethodResponse);
assert.equal(disallowedMethodResponse.statusCode, 405);
assert.equal(disallowedMethodResponse.headers.allow, "POST");

const unauthorizedHandler = createFilestackUploadSessionHandler({
  authorize: async () => {
    const error = new Error("Sign in before uploading a resource.");
    error.statusCode = 401;
    throw error;
  },
  env,
  now: () => nowMs,
  nonce: () => "fedcba9876543210fedcba98",
});
const unauthorizedResponse = mockResponse();
await unauthorizedHandler(mockRequest(), unauthorizedResponse);
assert.equal(unauthorizedResponse.statusCode, 401);
assert.match(unauthorizedResponse.json().error, /sign in/i);

const handlerSession = sessionResponse.json();
let metadataRequestUrl = "";
const cleanScanReceipt = {
  verdict: "clean",
  threats: [],
  engine: "ClamAV",
  engineVersion: "1.5.3",
  signatureUpdatedAt: "2026-08-06T06:00:00.000Z",
  scannedAt: "2026-08-06T12:00:00.000Z",
};
const finalizeCalls = [];
const finalizeHandler = createFilestackFinalizeHandler({
  authorize,
  env,
  now: () => nowMs,
  fetchImpl: async (url, options) => {
    const requestUrl = String(url);
    finalizeCalls.push({ url: requestUrl, options });
    assert.equal(options.redirect, "error");
    if (requestUrl.includes("/metadata")) {
      metadataRequestUrl = requestUrl;
      return new Response(
        JSON.stringify({
          filename: `${handlerSession.filenamePrefix}cell-worksheet.pdf`,
          mimetype: "application/pdf",
          size: 24,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (requestUrl.startsWith("https://cdn.filestackcontent.com/")) {
      return new Response(Buffer.from("%PDF-1.7 clean worksheet"), {
        status: 200,
        headers: { "content-type": "application/pdf", "content-length": "24" },
      });
    }
    if (requestUrl === env.CLASSLOOP_MALWARE_SCANNER_URL) {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, `Bearer ${env.CLASSLOOP_MALWARE_SCANNER_TOKEN}`);
      assert.equal(options.headers["Content-Type"], "application/octet-stream");
      assert.match(Buffer.from(options.body).toString("utf8"), /^%PDF-1\.7/);
      return new Response(JSON.stringify(cleanScanReceipt), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch: ${requestUrl}`);
  },
});
const finalizeResponse = mockResponse();
await finalizeHandler(
  mockRequest({
    body: {
      handle: "AbCdEfGhIjKlMnOpQrSt",
      uploadReceipt: handlerSession.uploadReceipt,
      originalFilename: "cell-worksheet.pdf",
    },
  }),
  finalizeResponse,
);
assert.equal(finalizeResponse.statusCode, 200);
assert.equal(finalizeResponse.headers["cache-control"], "no-store");
assert.equal(new URL(metadataRequestUrl).hostname, "www.filestackapi.com");
const finalized = finalizeResponse.json();
const shareUrl = new URL(finalized.url);
assert.equal(shareUrl.hostname, "cdn.filestackcontent.com");
assert.equal(shareUrl.pathname, "/AbCdEfGhIjKlMnOpQrSt");
assert.deepEqual(decodeFilestackPolicy(shareUrl.searchParams.get("policy")), {
  expiry: Math.floor(nowMs / 1000) + 5 * 365 * 24 * 60 * 60,
  call: ["read"],
  handle: "AbCdEfGhIjKlMnOpQrSt",
});
assert.match(finalized.title, /cell worksheet/i);
assert.equal(finalized.type, "worksheet");
assert.deepEqual(finalized.scan, cleanScanReceipt);
assert.deepEqual(
  finalizeCalls.map(({ url }) => new URL(url).hostname),
  ["www.filestackapi.com", "cdn.filestackcontent.com", "scanner.classloop.test"],
);

async function runBlockedFinalize(scannerReceipt, scannerStatus = 200, downloadHeaders = {}) {
  const calls = [];
  const handler = createFilestackFinalizeHandler({
    authorize,
    env,
    now: () => nowMs,
    fetchImpl: async (url, options) => {
      const requestUrl = String(url);
      calls.push({ url: requestUrl, options });
      if (requestUrl.includes("/metadata")) {
        return new Response(
          JSON.stringify({
            filename: `${handlerSession.filenamePrefix}cell-worksheet.pdf`,
            mimetype: "application/pdf",
            size: 29,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (requestUrl.startsWith("https://cdn.filestackcontent.com/")) {
        return new Response(Buffer.from("%PDF-1.7 suspicious worksheet"), {
          status: 200,
          headers: downloadHeaders,
        });
      }
      if (requestUrl === env.CLASSLOOP_MALWARE_SCANNER_URL) {
        return new Response(JSON.stringify(scannerReceipt), {
          status: scannerStatus,
          headers: { "content-type": "application/json" },
        });
      }
      if (requestUrl.startsWith("https://www.filestackapi.com/api/file/AbCdEfGhIjKlMnOpQrSt?")) {
        assert.equal(options.method, "DELETE");
        return new Response("", { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${requestUrl}`);
    },
  });
  const response = mockResponse();
  await handler(
    mockRequest({
      body: {
        handle: "AbCdEfGhIjKlMnOpQrSt",
        uploadReceipt: handlerSession.uploadReceipt,
        originalFilename: "cell-worksheet.pdf",
      },
    }),
    response,
  );
  return { response, calls };
}

const maliciousResult = await runBlockedFinalize({
  ...cleanScanReceipt,
  verdict: "malicious",
  threats: ["Eicar-Signature"],
});
assert.equal(maliciousResult.response.statusCode, 422);
assert.match(maliciousResult.response.json().error, /malware.*blocked/i);
assert.equal("url" in maliciousResult.response.json(), false);
assert.equal(maliciousResult.calls.some(({ options }) => options.method === "DELETE"), true);

const staleResult = await runBlockedFinalize({
  ...cleanScanReceipt,
  signatureUpdatedAt: "2026-08-01T06:00:00.000Z",
});
assert.equal(staleResult.response.statusCode, 502);
assert.match(staleResult.response.json().error, /could not complete malware scanning/i);
assert.equal(staleResult.calls.some(({ options }) => options.method === "DELETE"), true);

const futureResult = await runBlockedFinalize({
  ...cleanScanReceipt,
  scannedAt: "2026-08-06T12:10:00.000Z",
});
assert.equal(futureResult.response.statusCode, 502);
assert.match(futureResult.response.json().error, /could not complete malware scanning/i);

const malformedResult = await runBlockedFinalize("not-a-scanner-receipt");
assert.equal(malformedResult.response.statusCode, 502);
assert.match(malformedResult.response.json().error, /could not complete malware scanning/i);

const oversizedDownloadResult = await runBlockedFinalize(cleanScanReceipt, 200, {
  "content-length": "10485761",
});
assert.equal(oversizedDownloadResult.response.statusCode, 502);
assert.match(oversizedDownloadResult.response.json().error, /could not securely inspect/i);
assert.equal(
  oversizedDownloadResult.calls.some(({ url }) => url === env.CLASSLOOP_MALWARE_SCANNER_URL),
  false,
);
assert.equal(oversizedDownloadResult.calls.some(({ options }) => options.method === "DELETE"), true);

const outageResult = await runBlockedFinalize({ error: "scanner unavailable" }, 503);
assert.equal(outageResult.response.statusCode, 502);
assert.match(outageResult.response.json().error, /could not complete malware scanning/i);
assert.equal(outageResult.calls.some(({ options }) => options.method === "DELETE"), true);

const wrongPrefixHandler = createFilestackFinalizeHandler({
  authorize,
  env,
  now: () => nowMs,
  fetchImpl: async () =>
    new Response(JSON.stringify({ filename: "other-teacher.pdf", mimetype: "application/pdf", size: 2048 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
});
const wrongPrefixResponse = mockResponse();
await wrongPrefixHandler(
  mockRequest({
    body: {
      handle: "AbCdEfGhIjKlMnOpQrSt",
      uploadReceipt: handlerSession.uploadReceipt,
      originalFilename: "cell-worksheet.pdf",
    },
  }),
  wrongPrefixResponse,
);
assert.equal(wrongPrefixResponse.statusCode, 403);
assert.match(wrongPrefixResponse.json().error, /upload session/i);

const badMimeHandler = createFilestackFinalizeHandler({
  authorize,
  env,
  now: () => nowMs,
  fetchImpl: async () =>
    new Response(
      JSON.stringify({
        filename: `${handlerSession.filenamePrefix}malware.exe`,
        mimetype: "application/octet-stream",
        size: 1024,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
});
const badMimeResponse = mockResponse();
await badMimeHandler(
  mockRequest({
    body: {
      handle: "AbCdEfGhIjKlMnOpQrSt",
      uploadReceipt: handlerSession.uploadReceipt,
      originalFilename: "malware.exe",
    },
  }),
  badMimeResponse,
);
assert.equal(badMimeResponse.statusCode, 400);
assert.match(badMimeResponse.json().error, /PDF|text/i);

console.log("Filestack resource upload tests passed.");
