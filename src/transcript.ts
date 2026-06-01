import type { StructuredTranscript, TranscriptSegment } from "./types";

type TranscriptInputSegment = {
  start?: number;
  startSeconds?: number;
  end?: number;
  endSeconds?: number;
  text: string;
  speaker?: string;
};

const speakerLinePattern =
  /^(?:\[(?<timestamp>[^\]]+)\]\s*)?(?:(?<speaker>[^:\n]{2,80}):\s*)?(?<text>.+)$/;

function shortId(value: string, index: number) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug || `segment-${index + 1}`;
}

function parseTimestampSeconds(value = "") {
  const parts = value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!parts.length) return undefined;
  if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function normalizeSpeaker(value?: string, fallback = "Unknown speaker") {
  const cleaned = (value ?? "")
    .replace(/^\s*(student|learner|participant|attendee|speaker|user|guest)\s*\(([^)]+)\)\s*$/i, "$2")
    .replace(/^\s*(student|learner|participant|attendee|speaker|user|guest)\s*[-:#]?\s*/i, "")
    .trim();
  if (!cleaned || /^https?$/i.test(cleaned)) return fallback;
  return cleaned;
}

export function formatTranscriptTime(seconds?: number) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "";
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function createStructuredTranscriptFromSegments(
  segments: TranscriptInputSegment[],
  options: {
    title?: string;
    source: StructuredTranscript["source"];
    model?: string;
    language?: string;
    durationSeconds?: number;
  },
): StructuredTranscript {
  const normalizedSegments: TranscriptSegment[] = segments
    .map((segment, index) => ({
      id: `transcript-${shortId(`${segment.speaker ?? ""}-${segment.text}`, index)}`,
      speaker: normalizeSpeaker(segment.speaker),
      text: segment.text.replace(/\s+/g, " ").trim(),
      startSeconds: segment.start ?? segment.startSeconds,
      endSeconds: segment.end ?? segment.endSeconds,
    }))
    .filter((segment) => segment.text);

  return {
    title: options.title || "Meeting transcript",
    source: options.source,
    model: options.model,
    language: options.language,
    durationSeconds: options.durationSeconds,
    generatedAt: new Date().toISOString(),
    text: normalizedSegments.map((segment) => `${segment.speaker}: ${segment.text}`).join("\n"),
    segments: normalizedSegments,
  };
}

export function createStructuredTranscriptFromText(
  text: string,
  options: {
    title?: string;
    source: StructuredTranscript["source"];
    model?: string;
    language?: string;
    durationSeconds?: number;
  },
): StructuredTranscript {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    const match = line.match(speakerLinePattern);
    const speaker = match?.groups?.speaker;
    const timestamp = match?.groups?.timestamp;
    const body = match?.groups?.text ?? line;
    return {
      speaker,
      start: parseTimestampSeconds(timestamp),
      text: body
        .replace(/^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\s+/, "")
        .replace(/^[-*]\s*/, "")
        .trim(),
    };
  });

  return createStructuredTranscriptFromSegments(parsed, options);
}
