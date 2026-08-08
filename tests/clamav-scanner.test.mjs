import { strict as assert } from "node:assert";
import { once } from "node:events";
import net from "node:net";
import {
  createScannerServer,
  scanBufferWithClamd,
} from "../services/clamav-scanner/server.mjs";

const nowMs = Date.parse("2026-08-08T12:00:00.000Z");
const version = "ClamAV 1.4.3/27723/Sat Aug  8 11:30:00 2026";
const token = "test-scanner-token-with-at-least-32-characters";

function parseInstreamPayload(buffer) {
  const prefix = Buffer.from("zINSTREAM\0", "utf8");
  assert.deepEqual(buffer.subarray(0, prefix.length), prefix);
  const chunks = [];
  let offset = prefix.length;
  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    if (length === 0) {
      assert.equal(offset, buffer.length);
      return Buffer.concat(chunks);
    }
    assert.ok(length <= 64 * 1024, "INSTREAM chunks stay bounded");
    assert.ok(offset + length <= buffer.length, "INSTREAM frame is complete");
    chunks.push(buffer.subarray(offset, offset + length));
    offset += length;
  }
  throw new Error("INSTREAM terminator was not received.");
}

async function startFakeClamd(scanReplies, versionReply = version) {
  const scannedPayloads = [];
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
      const request = Buffer.concat(chunks);
      if (request.equals(Buffer.from("zVERSION\0", "utf8"))) {
        socket.end(`${versionReply}\0`);
        return;
      }
      if (!request.subarray(0, 10).equals(Buffer.from("zINSTREAM\0", "utf8"))) return;
      if (request.length < 14 || request.readUInt32BE(request.length - 4) !== 0) return;
      scannedPayloads.push(parseInstreamPayload(request));
      socket.end(`${scanReplies.shift() || "stream: OK"}\0`);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    host: "127.0.0.1",
    port: address.port,
    scannedPayloads,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

const fakeClamd = await startFakeClamd([
  "stream: OK",
  "stream: Win.Test.EICAR_HDB-1 FOUND",
  "stream: INSTREAM size limit exceeded. ERROR",
]);

try {
  const clean = await scanBufferWithClamd(Buffer.from("clean-class-resource"), {
    host: fakeClamd.host,
    port: fakeClamd.port,
    now: () => nowMs,
  });
  assert.deepEqual(clean, {
    verdict: "clean",
    engine: "ClamAV",
    engineVersion: version,
    signatureUpdatedAt: "2026-08-08T11:30:00.000Z",
    scannedAt: "2026-08-08T12:00:00.000Z",
    threats: [],
  });

  const malicious = await scanBufferWithClamd(Buffer.from("eicar-control"), {
    host: fakeClamd.host,
    port: fakeClamd.port,
    now: () => nowMs,
  });
  assert.equal(malicious.verdict, "malicious");
  assert.deepEqual(malicious.threats, ["Win.Test.EICAR_HDB-1"]);

  await assert.rejects(
    scanBufferWithClamd(Buffer.from("scan-error"), {
      host: fakeClamd.host,
      port: fakeClamd.port,
      now: () => nowMs,
    }),
    /could not complete/i,
  );
  assert.deepEqual(
    fakeClamd.scannedPayloads.map((payload) => payload.toString("utf8")),
    ["clean-class-resource", "eicar-control", "scan-error"],
  );
} finally {
  await fakeClamd.close();
}

const staleClamd = await startFakeClamd([], "ClamAV 1.4.3/20000/Mon Aug  3 09:00:00 2026");
try {
  await assert.rejects(
    scanBufferWithClamd(Buffer.from("clean"), {
      host: staleClamd.host,
      port: staleClamd.port,
      now: () => nowMs,
      maxSignatureAgeMs: 48 * 60 * 60 * 1000,
    }),
    /definitions are stale/i,
  );
  assert.equal(staleClamd.scannedPayloads.length, 0);
} finally {
  await staleClamd.close();
}

async function startGateway({ scanImpl, rateLimit = "30", maxFileBytes = "10485760" }) {
  const server = createScannerServer({
    env: {
      SCANNER_AUTH_TOKEN: token,
      SCANNER_RATE_LIMIT_PER_MINUTE: rateLimit,
      MAX_FILE_BYTES: maxFileBytes,
    },
    scanImpl,
    now: () => nowMs,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

let scanCalls = 0;
const gateway = await startGateway({
  scanImpl: async (body) => {
    scanCalls += 1;
    assert.equal(body.toString("utf8"), "worksheet");
    return {
      verdict: "clean",
      engine: "ClamAV",
      engineVersion: version,
      signatureUpdatedAt: "2026-08-08T11:30:00.000Z",
      scannedAt: "2026-08-08T12:00:00.000Z",
      threats: [],
    };
  },
});

try {
  const unauthorized = await fetch(`${gateway.url}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Content-Length": "9" },
    body: "worksheet",
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: "Scanner authorization failed." });
  assert.equal(scanCalls, 0);

  const wrongType = await fetch(`${gateway.url}/scan`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain", "Content-Length": "9" },
    body: "worksheet",
  });
  assert.equal(wrongType.status, 415);
  assert.equal(scanCalls, 0);

  const cleanResponse = await fetch(`${gateway.url}/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": "9",
    },
    body: "worksheet",
  });
  assert.equal(cleanResponse.status, 200);
  assert.equal(cleanResponse.headers.get("cache-control"), "no-store");
  assert.equal(cleanResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await cleanResponse.json()).verdict, "clean");
  assert.equal(scanCalls, 1);
} finally {
  await gateway.close();
}

const smallGateway = await startGateway({
  scanImpl: async () => {
    throw new Error("oversized body must not reach ClamAV");
  },
  maxFileBytes: "8",
});
try {
  const tooLarge = await fetch(`${smallGateway.url}/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": "9",
    },
    body: "worksheet",
  });
  assert.equal(tooLarge.status, 413);
} finally {
  await smallGateway.close();
}

const failureGateway = await startGateway({
  scanImpl: async () => {
    throw new Error("raw clamd socket detail must stay private");
  },
  rateLimit: "1",
});
try {
  const failure = await fetch(`${failureGateway.url}/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": "4",
    },
    body: "file",
  });
  assert.equal(failure.status, 503);
  const failureBody = await failure.text();
  assert.match(failureBody, /could not complete/i);
  assert.doesNotMatch(failureBody, /raw clamd|socket detail/i);

  const limited = await fetch(`${failureGateway.url}/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": "4",
    },
    body: "file",
  });
  assert.equal(limited.status, 429);
} finally {
  await failureGateway.close();
}

console.log("ClamAV scanner gateway tests passed.");
