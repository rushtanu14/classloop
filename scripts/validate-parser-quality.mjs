import { readFile } from "node:fs/promises";
import { createGeneratedSession, extractTranscriptSpeakers } from "../.test-build/src/data.js";
import { evaluateParserOutput } from "../.test-build/src/parser-quality.js";

const args = new Set(process.argv.slice(2));
const useAi = args.has("--ai");
const useOnline = args.has("--online");
const requireAi = args.has("--require-ai");
const strictAi = args.has("--strict-ai");
const aiModel = process.env.CLASSLOOP_PARSER_AI_MODEL?.trim() || "qwen3:1.7b";
const ollamaUrl = process.env.CLASSLOOP_OLLAMA_URL?.trim() || "http://127.0.0.1:11434";

const fixtureExpectations = {
  expectedStudents: ["Maya Chen", "Jordan Lee", "Priya Shah", "Luis Gomez", "Emma Davis"],
  requiredOutputPhrases: [
    "osmosis only the movement of water",
    "Diffusion moves particles from high concentration to low concentration",
    "hypotonic sample gained water",
    "Cell Transport Lab",
    "Friday",
  ],
  requiredResourceUrls: ["https://example.org/cell-membrane-animation"],
  forbiddenOutputPhrases: [
    "camera is frozen",
    "subscribe to my channel",
    "random meme",
    "private accommodation detail",
    "bot summary",
  ],
  maxUnmatchedParticipants: 0,
};

function fixtureRoster() {
  return fixtureExpectations.expectedStudents.map((name, index) => `${name}, student-${index + 1}@classloop.test`).join("\n");
}

function createFixtureSession(transcript) {
  return createGeneratedSession({
    title: "Biology: Cell transport lab",
    template: "General classroom",
    transcript,
    notes: "Students compared diffusion and osmosis. The Cell Transport Lab is due Friday.",
    roster: fixtureRoster(),
    resources: "",
  });
}

function sessionOutputForJudge(session) {
  return {
    recap: session.recap,
    students: session.students.map((student) => student.name),
    participation: session.participationEvents.map((event) => ({
      student: session.students.find((student) => student.id === event.studentId)?.name ?? event.studentId,
      type: event.type,
      text: event.text,
      approved: event.approved,
    })),
    actions: session.actionItems.map((item) => ({ title: item.title, description: item.description })),
    resources: session.resources.map((resource) => ({ title: resource.title, url: resource.url })),
    warnings: session.importWarnings?.map((warning) => ({ id: warning.id, severity: warning.severity, source: warning.source })) ?? [],
    unmatchedParticipants: session.unmatchedParticipants ?? [],
  };
}

const aiSchema = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    missingFacts: { type: "array", items: { type: "string" } },
    unsupportedClaims: { type: "array", items: { type: "string" } },
    noiseLeaks: { type: "array", items: { type: "string" } },
    privacyLeaks: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  required: ["passed", "score", "missingFacts", "unsupportedClaims", "noiseLeaks", "privacyLeaks", "summary"],
  additionalProperties: false,
};

async function runLocalAiJudge(transcript, session) {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: aiModel,
      stream: false,
      think: false,
      format: aiSchema,
      options: { temperature: 0, num_predict: 700 },
      messages: [
        {
          role: "system",
          content:
            "You audit a classroom transcript parser. Compare only the supplied source and output. Treat greetings, technical problems, memes, social chatter, private chat, and bot messages as noise. Do not invent requirements. Return JSON matching the schema.",
        },
        {
          role: "user",
          content: [
            "Check whether the parser output preserves the meaningful lesson facts, assignment, student contributions, and instructional resource without leaking noise or private/bot content.",
            "SOURCE TRANSCRIPT:",
            transcript,
            "PARSER OUTPUT:",
            JSON.stringify(sessionOutputForJudge(session), null, 2),
          ].join("\n\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const result = JSON.parse(payload.message?.content ?? "");
  for (const key of aiSchema.required) {
    if (!(key in result)) throw new Error(`Ollama response omitted ${key}`);
  }
  const findingCount = [result.missingFacts, result.unsupportedClaims, result.noiseLeaks, result.privacyLeaks].reduce(
    (total, findings) => total + (Array.isArray(findings) ? findings.length : 0),
    0,
  );
  result.passed = result.passed === true && findingCount === 0;
  return result;
}

function cleanOnlineDisplayName(value) {
  return value.replace(/\s*\((?:she|her|he|him|they|them|ze|zir|zie|hir|xe|xem)(?:\s*[/,]\s*(?:she|her|he|him|they|them|ze|zir|zie|hir|xe|xem))+\)\s*$/i, "").trim();
}

async function runOnlineValidation() {
  const sourceUrl = "https://gist.githubusercontent.com/agoose77/01a22f4c2a3e33c424815ab68ffa2731/raw/chat.txt";
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Public Zoom chat fixture returned HTTP ${response.status}`);
  const transcript = await response.text();
  const names = Array.from(transcript.matchAll(/^\d{1,2}:\d{2}:\d{2}\s+From\s+(.+?)\s+To\s+Everyone:/gim))
    .map((match) => cleanOnlineDisplayName(match[1]))
    .filter((name, index, all) => all.indexOf(name) === index);
  const roster = names.map((name, index) => `${name}, public-${index + 1}@example.com`).join("\n");
  const session = createGeneratedSession({
    title: "Public Zoom saved-chat format validation",
    template: "Club meeting",
    transcript,
    notes: "Public CC-unverified chat content is fetched only for an optional format check and is not committed.",
    roster,
    resources: "",
  });
  const speakerLines = extractTranscriptSpeakers(transcript);
  const checks = [
    [names.length >= 5, `expected at least 5 public speakers, got ${names.length}`],
    [speakerLines.length >= 15, `expected at least 15 parsed messages, got ${speakerLines.length}`],
    [(session.unmatchedParticipants?.length ?? 0) === 0, `expected no unmatched speakers, got ${session.unmatchedParticipants?.length ?? 0}`],
    [session.participationEvents.some((event) => /snippets be maintained/i.test(event.text)), "missing a known substantive public chat question"],
    [session.resources.some((resource) => resource.url.includes("docs.google.com/document")), "missing a known public Google Docs resource"],
  ];
  const failures = checks.filter(([passed]) => !passed).map(([, detail]) => detail);
  return {
    sourceUrl,
    passed: failures.length === 0,
    speakers: names.length,
    parsedMessages: speakerLines.length,
    participationEvents: session.participationEvents.length,
    resources: session.resources.length,
    unmatchedParticipants: session.unmatchedParticipants?.length ?? 0,
    failures,
  };
}

const transcript = await readFile("tests/fixtures/noisy-zoom-class.vtt", "utf8");
const fixtureSession = createFixtureSession(transcript);
const deterministic = evaluateParserOutput(fixtureSession, fixtureExpectations);
const result = { deterministic };

if (useOnline) result.online = await runOnlineValidation();

if (useAi) {
  try {
    result.ai = { model: aiModel, ...(await runLocalAiJudge(transcript, fixtureSession)) };
  } catch (error) {
    result.ai = { model: aiModel, error: error instanceof Error ? error.message : String(error) };
    if (requireAi) process.exitCode = 1;
  }
}

if (!deterministic.passed || (result.online && !result.online.passed) || (strictAi && result.ai && !result.ai.passed)) {
  process.exitCode = 1;
}

console.log(JSON.stringify(result, null, 2));
