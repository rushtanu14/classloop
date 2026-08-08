import net from "node:net";

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4_096;
const DEFAULT_MAX_SIGNATURE_AGE_MS = 48 * 60 * 60 * 1000;
const INSTREAM_CHUNK_BYTES = 64 * 1024;

function scannerError(message = "ClamAV could not complete the scan.") {
  return new Error(message);
}

function sanitizedResponse(value) {
  const clean = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean || clean.length > 512) throw scannerError();
  return clean;
}

async function clamdCommand({ host, port, timeoutMs, maxResponseBytes, write }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks = [];
    let totalBytes = 0;
    const socket = net.createConnection({ host, port });

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => finish(scannerError("ClamAV scan timed out.")), timeoutMs);
    socket.once("connect", () => {
      try {
        write(socket);
      } catch {
        finish(scannerError());
      }
    });
    socket.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxResponseBytes) {
        finish(scannerError("ClamAV returned an oversized response."));
        return;
      }
      chunks.push(Buffer.from(chunk));
      const combined = Buffer.concat(chunks);
      const terminator = combined.indexOf(0);
      if (terminator >= 0) finish(null, sanitizedResponse(combined.subarray(0, terminator).toString("utf8")));
    });
    socket.once("error", () => finish(scannerError()));
    socket.once("close", () => {
      if (!settled) finish(scannerError("ClamAV closed the scan without a verdict."));
    });
  });
}

function optionsWithDefaults(options = {}) {
  const host = String(options.host || "127.0.0.1").trim();
  const port = Number(options.port ?? 3310);
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxResponseBytes = Number(options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
  if (!host || host.length > 253 || /[\s/?#@]/.test(host)) throw scannerError("ClamAV host is invalid.");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw scannerError("ClamAV port is invalid.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw scannerError("ClamAV timeout is invalid.");
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 64 || maxResponseBytes > 32_768) {
    throw scannerError("ClamAV response limit is invalid.");
  }
  return { host, port, timeoutMs, maxResponseBytes };
}

function versionReceipt(version, { nowMs, maxSignatureAgeMs }) {
  const segments = version.split("/");
  if (segments.length < 3 || !/^ClamAV\s+[0-9]/.test(segments[0])) throw scannerError("ClamAV version response is invalid.");
  const signatureDateText = segments.slice(2).join("/").trim();
  const signatureMs = Date.parse(`${signatureDateText} UTC`);
  if (!Number.isFinite(signatureMs)) throw scannerError("ClamAV signature date is invalid.");
  if (signatureMs > nowMs + 5 * 60 * 1000) throw scannerError("ClamAV signature date is in the future.");
  if (nowMs - signatureMs > maxSignatureAgeMs) throw scannerError("ClamAV definitions are stale.");
  return {
    engine: "ClamAV",
    engineVersion: version,
    signatureUpdatedAt: new Date(signatureMs).toISOString(),
  };
}

export async function getClamdVersionReceipt(options = {}) {
  const connection = optionsWithDefaults(options);
  const nowMs = (options.now || Date.now)();
  const maxSignatureAgeMs = Number(options.maxSignatureAgeMs ?? DEFAULT_MAX_SIGNATURE_AGE_MS);
  if (!Number.isInteger(maxSignatureAgeMs) || maxSignatureAgeMs < 60 * 60 * 1000 || maxSignatureAgeMs > 7 * 24 * 60 * 60 * 1000) {
    throw scannerError("ClamAV signature age limit is invalid.");
  }
  const version = await clamdCommand({
    ...connection,
    write: (socket) => socket.end(Buffer.from("zVERSION\0", "utf8")),
  });
  return versionReceipt(version, { nowMs, maxSignatureAgeMs });
}

function writeInstream(socket, buffer) {
  socket.write(Buffer.from("zINSTREAM\0", "utf8"));
  for (let offset = 0; offset < buffer.length; offset += INSTREAM_CHUNK_BYTES) {
    const chunk = buffer.subarray(offset, Math.min(offset + INSTREAM_CHUNK_BYTES, buffer.length));
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(chunk.length);
    socket.write(length);
    socket.write(chunk);
  }
  socket.end(Buffer.alloc(4));
}

function verdictFromResponse(response) {
  if (response === "stream: OK") return { verdict: "clean", threats: [] };
  const found = /^stream:\s+(.{1,200})\s+FOUND$/.exec(response);
  if (found && !/[\u0000-\u001f\u007f]/.test(found[1])) {
    return { verdict: "malicious", threats: [found[1].trim()] };
  }
  throw scannerError();
}

export async function scanBufferWithClamd(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) throw scannerError("ClamAV requires a non-empty file.");
  const maxFileBytes = Number(options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES);
  if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > DEFAULT_MAX_FILE_BYTES) {
    throw scannerError("ClamAV file limit is invalid.");
  }
  if (buffer.length > maxFileBytes) throw scannerError("File exceeds the ClamAV scan limit.");

  const connection = optionsWithDefaults(options);
  const version = await getClamdVersionReceipt(options);
  const response = await clamdCommand({
    ...connection,
    write: (socket) => writeInstream(socket, buffer),
  });
  const verdict = verdictFromResponse(response);
  return {
    ...verdict,
    ...version,
    scannedAt: new Date((options.now || Date.now)()).toISOString(),
  };
}

