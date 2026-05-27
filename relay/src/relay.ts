import type { RelayDraft, RelayDraftInput, RelayResource, RelayTask } from "./types";

const SECTION_LABELS = [
  "Meeting title",
  "Title",
  "Date",
  "Context",
  "Resources",
  "Questions",
  "Open questions",
  "Due dates",
  "Due date",
  "Meeting minutes",
  "Minutes",
  "Notes",
  "Action items",
  "Actions",
  "Tasks",
];

export const relayTemplate = `Meeting title:
Date:
Context:
Resources:
Questions:
Due dates:
Meeting minutes:
`;

export const sampleRelayInput: RelayDraftInput = {
  title: "Hackathon planning sync",
  date: "2026-05-27",
  context: "Solo planning meeting for a hackathon submission. The focus was tightening the demo story, shipping a smaller scope, and making the final task list unambiguous.",
  resources: "Pitch outline: https://docs.google.com/document/d/sample-relay-pitch\nDemo checklist: https://example.com/relay-demo-checklist",
  questions: "What should be shown in the first 30 seconds?\nDo I need a backup screen recording?",
  dueDates: "Finish the 90-second demo script by Friday\nSubmit the project before Sunday night",
  minutes: `We decided the app should stay focused on personal meeting minutes and a smaller demo scope.
I need to finish the 90-second demo script by Friday.
Prepare screenshots for the submission page before Sunday night.
Send the final project summary to the judges after the demo is recorded.
Question: What should be shown in the first 30 seconds?`,
};

function cleanLine(line: string) {
  return line
    .replace(/^[-*•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function shortText(text: string, max = 120) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}...`;
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function createId(prefix: string, seed: string, index: number) {
  return `${prefix}-${slugify(seed, String(index + 1))}-${index + 1}`;
}

function sectionPattern() {
  return SECTION_LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

function extractSection(text: string, labels: string[]) {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:${sectionPattern()})\\s*:?|$)`, "i"),
  );
  return match?.[1]?.trim() ?? "";
}

function combinedMinutes(input: RelayDraftInput) {
  return [
    `Meeting title: ${input.title}`,
    `Date: ${input.date}`,
    `Context:\n${input.context}`,
    `Resources:\n${input.resources}`,
    `Questions:\n${input.questions}`,
    `Due dates:\n${input.dueDates}`,
    `Meeting minutes:\n${input.minutes}`,
  ].join("\n\n");
}

function titleFrom(input: RelayDraftInput, source: string) {
  const direct = input.title.trim();
  if (direct) return direct;
  return shortText(extractSection(source, ["Meeting title", "Title"]).split(/\n+/)[0] || "Personal meeting", 72);
}

function dateFrom(input: RelayDraftInput, source: string) {
  const direct = input.date.trim();
  if (direct) return direct;
  const section = extractSection(source, ["Date"]).split(/\n+/)[0]?.trim();
  if (section) return section;
  return new Date().toISOString().slice(0, 10);
}

function resourceType(url: string): RelayResource["type"] {
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) return "video";
  if (/docs\.google\.com\/presentation|slides/i.test(url)) return "slides";
  if (/docs\.google\.com|notion\.site|\.pdf(?:$|[?#])/i.test(url)) return "doc";
  return "link";
}

function parseResources(resourcesText: string, source: string): RelayResource[] {
  const urls = unique(`${resourcesText}\n${source}`.match(/https?:\/\/[^\s)]+/gi) ?? []);
  return urls.map((url, index) => ({
    id: createId("resource", url, index),
    title: resourceType(url) === "video" ? "Video resource" : resourceType(url) === "slides" ? "Slide deck" : resourceType(url) === "doc" ? "Reference doc" : "Meeting link",
    url,
    type: resourceType(url),
  }));
}

function parseQuestions(input: RelayDraftInput, source: string) {
  const questionSource = `${input.questions}\n${extractSection(source, ["Questions", "Open questions"])}\n${input.minutes}`;
  return unique(
    questionSource
      .split(/\n+/)
      .map(cleanLine)
      .filter((line) => line.includes("?") || /^(question|q)\b/i.test(line))
      .map((line) => line.replace(/^(question|q)\s*[:.-]\s*/i, "").trim()),
  ).slice(0, 8);
}

export function dueDateTextFromLine(line: string) {
  return (
    line.match(/\b(?:due|by|before|on)\s+([^.;,\n]+)/i)?.[1]?.trim() ??
    line.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/i)?.[1]?.trim() ??
    ""
  );
}

function taskTitleFromDueDate(line: string) {
  return line.replace(/\b(?:due|by|before|on)\s+([^.;,\n]+)/i, "").replace(/\s+/g, " ").trim();
}

function parseTasks(input: RelayDraftInput, source: string): RelayTask[] {
  const dueDateLines = input.dueDates
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean);
  const minuteLines = input.minutes
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean);
  const actionLines = minuteLines.filter((line) =>
    /\b(i need to|i will|my task|todo|to do|action item|follow up|complete|finish|submit|send|review|prepare|draft|schedule|email|ask|record)\b/i.test(line),
  );
  const sourceLines = unique([...actionLines, ...dueDateLines, ...extractSection(source, ["Action items", "Actions", "Tasks"]).split(/\n+/).map(cleanLine)]);
  const tasks = sourceLines
    .filter(Boolean)
    .slice(0, 10)
    .map((line, index) => ({
      id: createId("task", line, index),
      title: shortText(
        taskTitleFromDueDate(line)
          .replace(/^(todo|to do|action item|my task)\s*[:.-]\s*/i, "")
          .replace(/^i need to\s+/i, "")
          .replace(/^i will\s+/i, ""),
      ),
      status: "todo" as const,
      dueDateText: dueDateTextFromLine(line),
      source: line,
    }));

  if (tasks.length) return tasks;

  return [
    {
      id: "task-review-recap-1",
      title: "Review the meeting recap",
      status: "todo",
      dueDateText: input.dueDates.split(/\n+/).map(cleanLine).find(Boolean) ?? "",
      source: "Fallback personal follow-up",
    },
  ];
}

function parseRecap(input: RelayDraftInput, title: string) {
  const lines = input.minutes
    .split(/\n+/)
    .map(cleanLine)
    .filter((line) => line.length > 22)
    .filter((line) => !/^(meeting title|date|context|resources|questions|due dates|meeting minutes)\b/i.test(line))
    .slice(0, 3);
  const opener = `${title} focused on ${input.context.trim() || "the pasted meeting context"}.`;
  return lines.length ? [opener, ...lines].join(" ") : `${opener} Review the resources, questions, due dates, and tasks before closing the loop.`;
}

export function createRelayDraft(input: RelayDraftInput): RelayDraft {
  const source = combinedMinutes(input);
  const title = titleFrom(input, source);
  const date = dateFrom(input, source);
  const now = new Date().toISOString();

  return {
    id: `relay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    date,
    context: input.context.trim(),
    minutes: input.minutes.trim(),
    recap: parseRecap(input, title),
    resources: parseResources(input.resources, source),
    questions: parseQuestions(input, source),
    tasks: parseTasks(input, source),
    createdAt: now,
    updatedAt: now,
  };
}

export function createBlankInput(): RelayDraftInput {
  return {
    title: "",
    date: new Date().toISOString().slice(0, 10),
    context: "",
    resources: "",
    questions: "",
    dueDates: "",
    minutes: "",
  };
}
