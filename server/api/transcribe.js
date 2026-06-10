import { assertIpRateLimit, httpError, json, methodNotAllowed, readRawBody, sendApiError } from "./_shared.js";

const maxAudioBytes = 25 * 1024 * 1024;
const defaultModel = "whisper-1";

function headerValue(headers, name) {
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || "";
}

function safeFilename(value, contentType) {
  const cleaned = String(value || "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  if (cleaned) return cleaned;
  if (contentType.includes("mp4")) return "classloop-recording.mp4";
  if (contentType.includes("mpeg")) return "classloop-recording.mp3";
  if (contentType.includes("wav")) return "classloop-recording.wav";
  if (contentType.includes("m4a")) return "classloop-recording.m4a";
  return "classloop-recording.webm";
}

function assertSupportedMedia(contentType) {
  const normalized = contentType.toLowerCase();
  if (
    normalized.includes("audio/") ||
    normalized.includes("video/") ||
    normalized.includes("application/octet-stream")
  ) {
    return;
  }
  throw httpError(415, "Upload an audio or video recording for transcription.");
}

function normalizeSegments(payload) {
  const rawSegments = Array.isArray(payload?.segments) ? payload.segments : [];
  if (rawSegments.length) {
    return rawSegments
      .map((segment, index) => ({
        id: String(segment.id || `whisper-segment-${index + 1}`),
        speaker: String(segment.speaker || "Unknown speaker"),
        text: String(segment.text || "").replace(/\s+/g, " ").trim(),
        startSeconds: typeof segment.start === "number" ? segment.start : undefined,
        endSeconds: typeof segment.end === "number" ? segment.end : undefined,
      }))
      .filter((segment) => segment.text);
  }

  const text = String(payload?.text || "").trim();
  return text
    ? [
        {
          id: "whisper-segment-1",
          speaker: "Unknown speaker",
          text,
          startSeconds: undefined,
          endSeconds: undefined,
        },
      ]
    : [];
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);

  try {
    assertIpRateLimit(request, response, { endpoint: "transcribe", limit: 12, windowMs: 60 * 1000 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw httpError(503, "Recording transcription is not available right now.");
    }

    const contentType = headerValue(request.headers, "content-type") || "application/octet-stream";
    assertSupportedMedia(contentType);
    const body = await readRawBody(request, { maxBytes: maxAudioBytes, name: "Recording" });
    if (!body.length) throw httpError(400, "Recording is required.");

    const model = process.env.OPENAI_TRANSCRIPTION_MODEL || defaultModel;
    const form = new FormData();
    form.append("file", new Blob([body], { type: contentType }), safeFilename(headerValue(request.headers, "x-classloop-filename"), contentType));
    form.append("model", model);
    if (model === "whisper-1") {
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      throw httpError(openaiResponse.status >= 500 ? 502 : openaiResponse.status, "Recording transcription failed.");
    }

    const segments = normalizeSegments(payload);
    const text = String(payload.text || segments.map((segment) => segment.text).join(" ")).trim();
    return json(response, 200, {
      text,
      model,
      language: payload.language,
      durationSeconds: payload.duration,
      segments,
    });
  } catch (error) {
    return sendApiError(response, error, "Recording transcription failed.");
  }
}
