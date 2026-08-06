import type { Session } from "./types";

export type ParserOutputExpectations = {
  expectedStudents?: string[];
  requiredOutputPhrases?: string[];
  requiredResourceUrls?: string[];
  forbiddenOutputPhrases?: string[];
  maxUnmatchedParticipants?: number;
};

export type ParserQualityCheck = {
  id: string;
  passed: boolean;
  detail: string;
};

export type ParserQualityReport = {
  passed: boolean;
  score: number;
  checks: ParserQualityCheck[];
  failures: string[];
};

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function generatedOutputText(session: Session) {
  return normalized(
    [
      session.recap,
      ...session.essentialQuestions,
      ...session.participationEvents.flatMap((event) => [event.text, event.sourceLine ?? ""]),
      ...session.actionItems.flatMap((item) => [item.title, item.description]),
      ...session.followUps.flatMap((followUp) => [followUp.reminder, followUp.catchUp, ...followUp.tasks]),
      ...session.resources.flatMap((resource) => [resource.title, resource.url, resource.relatedTopic]),
    ].join("\n"),
  );
}

export function evaluateParserOutput(session: Session, expectations: ParserOutputExpectations): ParserQualityReport {
  const checks: ParserQualityCheck[] = [];
  const outputText = generatedOutputText(session);
  const studentNames = new Set(session.students.map((student) => normalized(student.name)));
  const resourceUrls = new Set(session.resources.map((resource) => resource.url));

  for (const name of expectations.expectedStudents ?? []) {
    const passed = studentNames.has(normalized(name));
    checks.push({ id: `student:${name}`, passed, detail: passed ? `Found ${name}` : `Missing student ${name}` });
  }

  for (const phrase of expectations.requiredOutputPhrases ?? []) {
    const passed = outputText.includes(normalized(phrase));
    checks.push({
      id: `required:${phrase}`,
      passed,
      detail: passed ? `Preserved required output: ${phrase}` : `Missing required output: ${phrase}`,
    });
  }

  for (const url of expectations.requiredResourceUrls ?? []) {
    const passed = resourceUrls.has(url);
    checks.push({ id: `resource:${url}`, passed, detail: passed ? `Preserved resource ${url}` : `Missing resource ${url}` });
  }

  for (const phrase of expectations.forbiddenOutputPhrases ?? []) {
    const passed = !outputText.includes(normalized(phrase));
    checks.push({
      id: `forbidden:${phrase}`,
      passed,
      detail: passed ? `Filtered forbidden output: ${phrase}` : `Leaked forbidden output: ${phrase}`,
    });
  }

  if (expectations.maxUnmatchedParticipants !== undefined) {
    const actual = session.unmatchedParticipants?.length ?? 0;
    const passed = actual <= expectations.maxUnmatchedParticipants;
    checks.push({
      id: "unmatched-participants",
      passed,
      detail: passed
        ? `${actual} unmatched participant${actual === 1 ? "" : "s"}`
        : `${actual} unmatched participants exceeded the limit of ${expectations.maxUnmatchedParticipants}`,
    });
  }

  const passedCount = checks.filter((check) => check.passed).length;
  const score = checks.length ? Math.round((passedCount / checks.length) * 100) : 100;
  const failures = checks.filter((check) => !check.passed).map((check) => check.detail);
  return { passed: failures.length === 0, score, checks, failures };
}
