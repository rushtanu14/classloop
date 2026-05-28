import type {
  ActionItem,
  ImportQualityWarning,
  ParticipationEvent,
  PersonalMeeting,
  PersonalTask,
  Resource,
  Session,
  SessionCaptureMode,
  SessionType,
  Student,
  StudentFollowUp,
  StudentSubmission,
  UnmatchedParticipant,
} from "./types";

export const sampleTranscript = `Teacher: Today we are reviewing similar triangles and how AA similarity lets us prove triangles are similar when two angle pairs match.
Teacher: We will use proportions to find missing side lengths. Remember, corresponding sides need to be matched in the same order.
Maya: If two triangles share one angle and both have a right angle, is that enough for AA?
Teacher: Yes. The shared angle and the right angle give us two matching angle pairs.
Aarav: So if triangle ABC is similar to triangle DEF, AB over DE should equal AC over DF?
Teacher: Exactly. Keep the corresponding sides aligned.
Jordan: I keep cross-multiplying wrong. I put 6 over x equals 9 over 12, then I multiply 6 times 9 instead of 6 times 12.
Teacher: Great catch. Cross products are diagonal, so 6 times 12 equals 9 times x.
Sofia: The scale factor from the small triangle to the big one is 3 over 2, so the missing side should be 15.
Teacher: Nice answer. Explain why.
Sofia: Because 10 times 3 over 2 is 15, and the matching side grew by that scale factor.
Teacher: Priya, I see you are here but quiet today. I will send you a practice set and you can check in after class.
Teacher: Ethan is absent. He needs the catch-up recap and the review video.
Teacher: Homework is problems 7-12 on the similar triangles worksheet. Due Friday.
Teacher: Resource link: https://example.com/similar-triangles-review`;

export const sampleNotes = `Geometry review with some algebra cleanup.
Need to reinforce:
- AA similarity from two matching angles
- Corresponding sides must stay in the same order
- Cross multiplication errors
- Homework problems 7-12 due Friday
- Ethan absent, Priya quiet, Jordan needs cross-multiplication reminder`;

export const sampleRoster = `Maya Chen, maya@classloop.demo
Aarav Patel, aarav@classloop.demo
Jordan Lee, jordan@classloop.demo
Sofia Ramirez, sofia@classloop.demo
Ethan Brooks, ethan@classloop.demo
Priya Shah, priya@classloop.demo`;

export type ImportDraftInput = {
  title: string;
  template: SessionType;
  transcript: string;
  notes: string;
  roster: string;
  resources: string;
  captureMode?: SessionCaptureMode;
  captureSourceLabel?: string;
  captureDurationSeconds?: number;
  transcriptSource?: "file" | "paste" | "zoom_cloud_transcript" | "live_transcription" | "audio_recording";
};

export type TranscriptTextFile = {
  name?: string;
  text: () => Promise<string>;
};

const avatarColors = ["#f59e0b", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#14b8a6", "#6366f1", "#d946ef"];

export async function readTranscriptFileText(file: TranscriptTextFile) {
  return file.text();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalizeSpeakerName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactSpeakerName(value: string) {
  return normalizeSpeakerName(value).replace(/\s+/g, "");
}

const genericSpeakerLabelPattern = /^(student|learner|participant|attendee|speaker|user|guest)\b/i;
const complianceMetadataLabelPattern =
  /^(privacy|support|data retention|terms|eula|child appropriate safety|recording consent|consent|legal|security)\b.*\b(note|reminder|contact|notice|policy|guidance)\b/i;
const staffOrBotSpeakerPattern =
  /\b(ai|bot|notetaker|note taker|recorder|transcriber|host|cohost|co-host|moderator|admin|organizer|staff|faculty|admissions|panelist|presenter|teacher|instructor|professor)\b/i;

function stripGenericSpeakerLabel(value: string) {
  return value
    .replace(/^\s*(student|learner|participant|attendee|speaker|user|guest)\s*\(([^)]+)\)\s*$/i, "$2")
    .replace(/^\s*(student|learner|participant|attendee|speaker|user|guest)\s*[-:#]?\s*/i, "")
    .replace(/^\(([^)]+)\)$/i, "$1")
    .trim();
}

function cleanSpeakerLabel(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^\[(?:chat|private chat|direct message)\]\s*/i, "")
    .trim();
}

function isPrivateMessageLine(line: string) {
  return /^\s*(?:\[[^\]]+\]\s*)?\[(?:private chat|direct message|dm)\]/i.test(line);
}

function isStaffOrBotSpeaker(speaker: string) {
  return staffOrBotSpeakerPattern.test(speaker);
}

function isAmbiguousGenericSpeaker(speaker: string) {
  const cleaned = cleanSpeakerLabel(speaker).trim();
  const stripped = stripGenericSpeakerLabel(cleaned);
  return Boolean(
    genericSpeakerLabelPattern.test(cleaned) &&
      (!stripped || /^\d+$/.test(stripped) || /^(one|two|three|four|five|six|seven|eight|nine|ten)$/i.test(stripped)),
  );
}

function isChatLine(line: string) {
  return /^\s*(?:\[[^\]]+\]\s*)?\[(?:chat|private chat|direct message|dm)\]/i.test(line);
}

function isNonInstructionalChatText(text: string, sourceLine = "") {
  const normalized = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (isPrivateMessageLine(sourceLine)) return true;
  if (!normalized) return true;
  if (/^(hi|hello|hey|thanks|thank you|yes|yeah|yep|no|nope|ok|okay|cool|great|same|agreed|bye)$/i.test(normalized)) {
    return true;
  }
  if (/\b(wifi|wi fi|internet|audio|microphone|mic|camera|hear me|can't hear|cannot hear|screen share|screenshare|zoom link|logged out|connection)\b/i.test(normalized)) {
    return true;
  }
  return false;
}

function isPlausibleTranscriptSpeakerLabel(value: string) {
  const stripped = stripGenericSpeakerLabel(cleanSpeakerLabel(value));
  const normalized = normalizeSpeakerName(stripped);
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (!normalized || !tokens.length || tokens.length > 5) return false;
  if (genericSpeakerLabelPattern.test(value.trim())) return true;
  if (tokens.length <= 3) return true;

  const hasSentenceWords = tokens.some((token) => /^[a-z]{2,}$/.test(token));
  if (hasSentenceWords) return false;

  const nameLikeTokens = tokens.filter((token) => /^[A-Z0-9]/.test(token) || /^[a-z]?[A-Z]/.test(token));
  return nameLikeTokens.length / tokens.length >= 0.5;
}

function normalizedSpeakerCandidates(value: string) {
  const candidates = [value, stripGenericSpeakerLabel(value)];
  for (const match of value.matchAll(/\(([^)]+)\)/g)) {
    candidates.push(match[1]);
  }
  return unique(candidates.map(normalizeSpeakerName).filter(Boolean));
}

function isTranscriptMetadataSpeaker(speaker: string) {
  const normalized = normalizeSpeakerName(speaker);
  return (
    !normalized ||
    complianceMetadataLabelPattern.test(normalized) ||
    /^(teacher|instructor|professor|facilitator|host|classloop|meeting title|meeting date|meeting id|meeting passcode|passcode|date|duration|participants?|transcript|transcription|recording|audio|chat|question|questions|answer|answers|summary|agenda|topic|topics|resources?|links?|name|email|attendance|zoom names?|student access|speaker|speakers|speaker matching|transcript speaker matching|start time|end time|timezone|language|notes|practice problems?|skills? to reinforce|common mistakes?|project or repo|debug targets?|workshop deliverable|decisions? made|owners?|next checkpoint|peer questions?|practice goals?|google classroom course|classroom course|section period|course code|imported classroom items?|zoom cloud meeting|zoom meeting|raw zoom transcript)$/i.test(
      normalized,
    ) ||
    /^\d+$/.test(normalized) ||
    /\d{1,2}\s+\d{2}/.test(normalized) ||
    /^(mon|tue|wed|thu|fri|sat|sun)\b/i.test(normalized)
  );
}

function isTeacherLikeSpeaker(speaker: string) {
  const normalized = normalizeSpeakerName(speaker);
  return /^(ms|mrs|mr|mx|dr|prof|professor)\s+[a-z]/i.test(normalized);
}

type SpeakerLine = {
  speaker: string;
  text: string;
  line: string;
};

function parseSpeakerLine(line: string): SpeakerLine | null {
  const trimmed = line.trim();
  if (isPrivateMessageLine(trimmed)) return null;
  const vttVoice = trimmed.match(/^(?:<v\s+([^>]+)>|<v\.([^>]+)>)(.*?)$/i);
  if (vttVoice) {
    const speaker = cleanSpeakerLabel(vttVoice[1] || vttVoice[2] || "");
    const text = vttVoice[3].replace(/<\/v>$/i, "").trim();
    if (
      speaker &&
      text &&
      !isTranscriptMetadataSpeaker(speaker) &&
      !isTeacherLikeSpeaker(speaker) &&
      !isStaffOrBotSpeaker(speaker) &&
      isPlausibleTranscriptSpeakerLabel(speaker)
    ) {
      return { speaker, text, line: trimmed };
    }
  }

  const match = trimmed.match(
    /^(?:\[[^\]]+\]\s*)?(?:(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\s+)?([^:\n]{2,80}):\s*(.+)$/i,
  );
  if (!match) return null;
  const speaker = cleanSpeakerLabel(match[1]);
  if (
    !speaker ||
    /^https?$/i.test(speaker) ||
    /-->|webvtt|zoom meeting|recording transcript/i.test(speaker) ||
    !/[a-z]/i.test(speaker) ||
    isTranscriptMetadataSpeaker(speaker) ||
    isTeacherLikeSpeaker(speaker) ||
    isStaffOrBotSpeaker(speaker) ||
    !isPlausibleTranscriptSpeakerLabel(speaker)
  ) {
    return null;
  }
  return { speaker, text: match[2].trim(), line: trimmed };
}

function isTimestampLine(line: string) {
  return /^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?(?:\s*-->\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?)?$/.test(
    line.trim(),
  ) || /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}/.test(line.trim());
}

function isLikelySpeakerNameLine(line: string) {
  const trimmed = stripGenericSpeakerLabel(line.trim());
  const normalized = normalizeSpeakerName(trimmed);
  return Boolean(
    trimmed &&
      !/^webvtt$/i.test(trimmed) &&
      normalized.split(" ").length <= 5 &&
      /^[a-z][a-z .'-]+$/i.test(trimmed) &&
      !isTranscriptMetadataSpeaker(trimmed) &&
      !isTeacherLikeSpeaker(trimmed),
  );
}

export function extractTranscriptSpeakers(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const parsedLines: SpeakerLine[] = [];

  lines.forEach((line, index) => {
    const parsed = parseSpeakerLine(line);
    if (parsed) {
      parsedLines.push(parsed);
      return;
    }

    const next = lines[index + 1] ?? "";
    const afterNext = lines[index + 2] ?? "";
    if (isLikelySpeakerNameLine(line) && isTimestampLine(next) && afterNext && !isTimestampLine(afterNext)) {
      parsedLines.push({
        speaker: stripGenericSpeakerLabel(line),
        text: afterNext,
        line: `${line}: ${afterNext}`,
      });
    }
  });

  return parsedLines.filter((line) => !isTranscriptMetadataSpeaker(line.speaker));
}

function transcriptLineStats(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const parsed = extractTranscriptSpeakers(text);
  const rawSpeakerLines = lines.filter((line) => /:\s*\S+/.test(line));
  const chatLines = lines.filter(isChatLine);
  const rawGenericSpeakerLines = rawSpeakerLines.filter((line) => {
    const speaker = line.match(/^(?:\[[^\]]+\]\s*)?([^:\n]{2,80}):\s*(.+)$/i)?.[1] ?? "";
    return speaker && isAmbiguousGenericSpeaker(speaker);
  });
  const genericSpeakerLines = [...parsed.filter((line) => isAmbiguousGenericSpeaker(line.speaker)), ...rawGenericSpeakerLines];
  const staffOrBotLines = lines.filter((line) => {
    const speaker = line.match(/^(?:\[[^\]]+\]\s*)?([^:\n]{2,80}):\s*(.+)$/i)?.[1] ?? "";
    return speaker && isStaffOrBotSpeaker(speaker);
  });
  const privateLines = lines.filter(isPrivateMessageLine);
  return { lines, parsed, rawSpeakerLines, chatLines, genericSpeakerLines, staffOrBotLines, privateLines };
}

function duplicateRosterNames(students: Student[]) {
  const counts = new Map<string, number>();
  students.forEach((student) => {
    const normalized = normalizeSpeakerName(student.name);
    if (!normalized) return;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function isLikelyNoisyAsr(text: string) {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 35) return false;
  const fillerWords = words.filter((word) => /^(um|uh|erm|hmm|yeah|okay|ok|like|so)$/.test(word)).length;
  const unclearMarkers = (text.match(/\b(inaudible|unintelligible|garbled|audio unclear|transcript unclear|unknown speaker)\b/gi) ?? [])
    .length;
  const shortWords = words.filter((word) => word.length <= 2).length;
  const punctuationCount = (text.match(/[.?!]/g) ?? []).length;
  return unclearMarkers > 0 || fillerWords / words.length > 0.16 || (shortWords / words.length > 0.38 && punctuationCount < 3);
}

function importQualityWarnings(sessionText: string, roster: Student[], hasExplicitRoster: boolean): ImportQualityWarning[] {
  const stats = transcriptLineStats(sessionText);
  const warnings: ImportQualityWarning[] = [];
  const parsedCount = stats.parsed.length;
  const chatOnly = parsedCount > 0 && stats.chatLines.length / Math.max(1, parsedCount) >= 0.75;
  const duplicateNames = duplicateRosterNames(roster);
  const blankEmailCount = roster.filter((student) => !student.email.trim()).length;

  if (!roster.length) {
    warnings.push({
      id: "no-students-detected",
      severity: "blocking",
      title: "No students were detected yet",
      message:
        "ClassLoop could not find any usable student names from the roster or transcript. Paste at least one student name before publishing student dashboards.",
      source: hasExplicitRoster ? "Roster parse returned 0 students" : "No roster and no transcript-estimated students",
    });
  } else if (!hasExplicitRoster) {
    warnings.push({
      id: "estimated-roster",
      severity: "blocking",
      title: "Roster still needs teacher confirmation",
      message:
        "These students were estimated from transcript speaker names. Add the real roster, confirm aliases, and attach student emails before publishing student dashboards.",
      source: `${roster.length} estimated student${roster.length === 1 ? "" : "s"} from transcript speakers`,
    });
  }

  if (duplicateNames.length > 0) {
    warnings.push({
      id: "duplicate-roster-names",
      severity: "blocking",
      title: "Duplicate student names need review",
      message:
        "Two or more roster rows share the same student name. Add aliases or adjust the roster before publishing so ClassLoop does not attach the same transcript speaker to multiple dashboards.",
      source: `${duplicateNames.length} duplicate roster name${duplicateNames.length === 1 ? "" : "s"} detected`,
    });
  }

  if (stats.genericSpeakerLines.length > 0 && hasExplicitRoster) {
    warnings.push({
      id: "generic-speaker-labels",
      severity: "blocking",
      title: "Generic speaker labels need review",
      message:
        "This transcript uses labels like Student or Speaker without a reliable name. Link those lines to the roster or keep them class-level before publishing student dashboards.",
      source: `${stats.genericSpeakerLines.length} generic speaker line${stats.genericSpeakerLines.length === 1 ? "" : "s"} detected`,
    });
  }

  if (isLikelyNoisyAsr(sessionText)) {
    warnings.push({
      id: "noisy-asr",
      severity: "blocking",
      title: "Transcript looks noisy",
      message:
        "The transcript appears to contain garbled or filler-heavy automatic speech recognition. Add teacher notes or clean the key section before publishing.",
      source: "Noisy ASR heuristic",
    });
  }

  if (chatOnly) {
    warnings.push({
      id: "chat-only",
      severity: "warning",
      title: "Chat-only import",
      message:
        "Most detected lines came from chat. ClassLoop will keep participation signals unapproved until you confirm they represent meaningful student participation.",
      source: `${stats.chatLines.length} chat line${stats.chatLines.length === 1 ? "" : "s"} detected`,
    });
  }

  if (stats.privateLines.length > 0) {
    warnings.push({
      id: "private-chat-artifacts",
      severity: "warning",
      title: "Private chat artifacts ignored",
      message:
        "Direct-message or private-chat fragments were ignored for speaker matching and participation to avoid exposing private context.",
      source: `${stats.privateLines.length} private line${stats.privateLines.length === 1 ? "" : "s"} detected`,
    });
  }

  if (stats.staffOrBotLines.length > 0) {
    warnings.push({
      id: "staff-or-bot-speakers",
      severity: "info",
      title: "Staff or bot speakers filtered",
      message:
        "Host, staff, faculty, or notetaker lines were kept out of student participation. Review resources separately if those lines included links.",
      source: `${stats.staffOrBotLines.length} staff/bot line${stats.staffOrBotLines.length === 1 ? "" : "s"} detected`,
    });
  }

  if (!parsedCount && stats.rawSpeakerLines.length > 0) {
    warnings.push({
      id: "unusable-speaker-lines",
      severity: "warning",
      title: "Speaker labels were not usable",
      message:
        "The import had speaker-like lines, but they looked like metadata, staff, bots, private messages, or unsupported labels. Review the draft as a class-level summary.",
      source: `${stats.rawSpeakerLines.length} speaker-like line${stats.rawSpeakerLines.length === 1 ? "" : "s"} skipped`,
    });
  }

  if (blankEmailCount > 0) {
    warnings.push({
      id: "missing-student-emails",
      severity: "warning",
      title: "Some students do not have emails yet",
      message:
        "Student dashboards can still be reviewed, but recap delivery and account linking will stay incomplete until those roster emails are added.",
      source: `${blankEmailCount} student${blankEmailCount === 1 ? "" : "s"} missing email`,
    });
  }

  return warnings;
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextFriday() {
  const date = new Date();
  const day = date.getDay();
  const offset = (5 - day + 7) % 7 || 7;
  date.setDate(date.getDate() + offset);
  return toDateInput(date);
}

function isRosterMetadataText(value: string) {
  const normalized = normalizeSpeakerName(value);
  return (
    !normalized ||
    /^(class roster|roster|demo session|teacher|instructor|period|spring|fall|winter|summer|student name email|student name|name email|student email|students?|participants?)\b/i.test(
      normalized,
    ) ||
    /\b(period|spring|fall|winter|summer)\s+\d{1,4}\b/i.test(normalized) ||
    isTeacherLikeSpeaker(value)
  );
}

function cleanRosterNameChunk(value: string) {
  let text = value
    .replace(/\r/g, "\n")
    .replace(/["“”]+/g, " ")
    .replace(/[|<>;,]+/g, "\n")
    .replace(/[–—]/g, " ");

  text = text.replace(/[\s\S]*#?\s*(?:student\s*)?name\s*email\s*/i, "");
  const segments = text
    .split(/\n+/)
    .map((segment) => segment.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((segment) => !isRosterMetadataText(segment));
  const candidate = segments[segments.length - 1] ?? text;
  return candidate
    .replace(/^\s*#?\s*(?:student\s*)?\d+[\s.)-]*/i, "")
    .replace(/^\s*(?:student|learner)\s+/i, "")
    .replace(/\b(?:first|last|student|name|email)\b/gi, " ")
    .replace(/[#()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type RosterEntry = {
  name: string;
  email: string;
  aliases?: string[];
};

function cleanRosterAliases(value: string) {
  return unique(
    value
      .split(/[,\t|;]+/)
      .map((part) => cleanRosterNameChunk(part))
      .filter(Boolean)
      .filter((part) => !/^\d+$/.test(part))
      .filter((part) => !/@/.test(part))
      .filter((part) => !isRosterMetadataText(part)),
  );
}

function mergeDuplicateEmailEntries(entries: RosterEntry[]) {
  const byEmail = new Map<string, RosterEntry>();
  entries.forEach((entry) => {
    const existing = byEmail.get(entry.email);
    if (!existing) {
      byEmail.set(entry.email, { ...entry, aliases: unique(entry.aliases ?? []) });
      return;
    }
    const alternateName = normalizeSpeakerName(existing.name) === normalizeSpeakerName(entry.name) ? [] : [entry.name];
    existing.aliases = unique([...(existing.aliases ?? []), ...alternateName, ...(entry.aliases ?? [])]);
  });
  return Array.from(byEmail.values());
}

function parseDelimitedRosterRows(roster: string) {
  const entries: RosterEntry[] = [];
  roster
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const emails = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi) ?? [];
      if (emails.length !== 1 || isRosterMetadataText(line)) return;
      const email = emails[0].toLowerCase();
      const emailStart = line.toLowerCase().indexOf(email);
      const beforeEmail = line.slice(0, emailStart);
      const afterEmail = line.slice(emailStart + emails[0].length);
      const parts = beforeEmail
        .split(/[,\t|;]+/)
        .map((part) => cleanRosterNameChunk(part))
        .filter(Boolean)
        .filter((part) => !/^\d+$/.test(part))
        .filter((part) => !isRosterMetadataText(part));
      const name = parts.join(" ").replace(/\s+/g, " ").trim() || cleanRosterNameChunk(beforeEmail);
      if (isPlausibleRosterName(name)) entries.push({ name, email, aliases: cleanRosterAliases(afterEmail) });
    });

  return mergeDuplicateEmailEntries(entries);
}

function isPlausibleRosterName(name: string) {
  const normalized = normalizeSpeakerName(name);
  return Boolean(
    normalized &&
      !isRosterMetadataText(name) &&
      /[a-z]/i.test(name) &&
      !/@/.test(name) &&
      !genericSpeakerLabelPattern.test(name.trim()) &&
      normalized.split(" ").length <= 5,
  );
}

function uniqueStudentId(name: string, index: number, seenIds: Set<string>) {
  const baseId = slugify(name, `student-${index + 1}`);
  let candidate = baseId;
  let suffix = 2;
  while (seenIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  seenIds.add(candidate);
  return candidate;
}

function studentFromRosterEntry(entry: RosterEntry, index: number, seenIds: Set<string>): Student {
  const { name, email, aliases = [] } = entry;
  const cleanName = name.trim() || `Student ${index + 1}`;
  const cleanEmail = email.trim().toLowerCase();
  return {
    id: uniqueStudentId(cleanName, index, seenIds),
    name: cleanName,
    email: cleanEmail,
    avatarColor: avatarColors[index % avatarColors.length],
    aliases: aliases.length ? unique(aliases) : undefined,
  };
}

function studentsFromRosterEntries(entries: RosterEntry[]) {
  const seenIds = new Set<string>();
  return entries.map((entry, index) => studentFromRosterEntry(entry, index, seenIds));
}

function compactNameToken(value: string) {
  return normalizeSpeakerName(value).replace(/\s+/g, "");
}

function splitGluedNameAndEmail(baseName: string, rawEmail: string) {
  const [rawLocal, ...domainParts] = rawEmail.split("@");
  const domain = domainParts.join("@").toLowerCase();
  const baseTokens = normalizeSpeakerName(baseName).split(" ").filter(Boolean);
  if (!rawLocal || !domain || !baseTokens.length) {
    return { name: baseName, email: rawEmail.toLowerCase() };
  }

  const localLower = rawLocal.toLowerCase();
  const initials = baseTokens.map((token) => token.charAt(0)).join("");
  let bestSplit: { name: string; email: string } | null = null;

  for (let index = 1; index < rawLocal.length - 1; index += 1) {
    const gluedNameSuffix = rawLocal.slice(0, index);
    const emailLocal = rawLocal.slice(index);
    const suffixToken = compactNameToken(gluedNameSuffix);
    const emailToken = compactNameToken(emailLocal);
    const firstInitialPattern = `${baseTokens[0].charAt(0)}${suffixToken}`;
    const allInitialsPattern = `${initials}${suffixToken}`;

    if (emailToken === firstInitialPattern || emailToken === allInitialsPattern) {
      bestSplit = {
        name: `${baseName} ${gluedNameSuffix}`.replace(/\s+/g, " ").trim(),
        email: `${emailLocal.toLowerCase()}@${domain}`,
      };
    }
  }

  return bestSplit ?? { name: baseName, email: rawEmail.toLowerCase() };
}

function parseEmailRosterEntries(roster: string) {
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}(?=\d|[^A-Z0-9]|$)/gi;
  const matches = Array.from(roster.matchAll(emailPattern));
  const entries: RosterEntry[] = [];
  let previousEmailEnd = 0;

  matches.forEach((match) => {
    const rawEmail = match[0].replace(/[.,;:)]+$/, "");
    const matchIndex = match.index ?? 0;
    const baseName = cleanRosterNameChunk(roster.slice(previousEmailEnd, matchIndex));
    previousEmailEnd = matchIndex + match[0].length;
    const { name, email } = splitGluedNameAndEmail(baseName, rawEmail);
    if (isPlausibleRosterName(name)) {
      entries.push({ name, email });
    }
  });

  return mergeDuplicateEmailEntries(entries);
}

function parseRoster(roster: string, transcript: string): Student[] {
  const delimitedEntries = parseDelimitedRosterRows(roster);
  if (delimitedEntries.length) {
    return studentsFromRosterEntries(delimitedEntries);
  }

  const emailEntries = parseEmailRosterEntries(roster);
  if (emailEntries.length) {
    return studentsFromRosterEntries(emailEntries);
  }

  const rosterEntries = roster
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isRosterMetadataText(line))
    .map((line, index) => {
      const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const email = emailMatch?.[0] ?? "";
      const name = cleanRosterNameChunk(line.replace(email, ""));
      return isPlausibleRosterName(name) ? { name, email } : null;
    })
    .filter((entry): entry is RosterEntry => Boolean(entry));

  if (rosterEntries.length) return studentsFromRosterEntries(rosterEntries);

  const seenEstimatedNames = new Set<string>();
  const estimatedEntries = extractTranscriptSpeakers(transcript)
    .map((line) => stripGenericSpeakerLabel(line.speaker))
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter((name) => isPlausibleRosterName(name))
    .filter((name) => {
      const normalized = normalizeSpeakerName(name);
      if (seenEstimatedNames.has(normalized)) return false;
      seenEstimatedNames.add(normalized);
      return true;
    })
    .map((name) => ({
      name,
      email: "",
    }));

  return studentsFromRosterEntries(estimatedEntries);
}

export type PersonalMeetingDraftInput = {
  ownerEmail: string;
  title: string;
  minutes: string;
};

function extractTemplateSection(text: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:Meeting title|Date|Context|Resources|Questions|Due dates)\\s*:?|$)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractPersonalTitle(inputTitle: string, minutes: string) {
  const fromInput = inputTitle.trim();
  if (fromInput) return fromInput;
  const fromTemplate = extractTemplateSection(minutes, ["Meeting title", "Title"]).split(/\n+/)[0]?.trim();
  if (fromTemplate) return fromTemplate;
  const firstLine = minutes.split(/\n+/).map((line) => line.trim()).find(Boolean);
  return shortText(firstLine || "Personal meeting", 72);
}

function extractPersonalDate(minutes: string) {
  const fromTemplate = extractTemplateSection(minutes, ["Date"]).split(/\n+/)[0]?.trim();
  if (fromTemplate) return fromTemplate;
  const iso = minutes.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso) return iso;
  const slashDate = minutes.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/)?.[0];
  return slashDate || toDateInput(new Date());
}

function extractPersonalQuestions(minutes: string) {
  const section = extractTemplateSection(minutes, ["Questions", "Open questions"]);
  const source = section || minutes;
  return unique(
    source
      .split(/\n+/)
      .map(cleanLine)
      .filter((line) => line.includes("?") || /^(question|q)\b/i.test(line))
      .map((line) => line.replace(/^(question|q)\s*[:.-]\s*/i, "").trim()),
  ).slice(0, 8);
}

function dueDateTextFromLine(line: string) {
  return (
    line.match(/\b(?:due|by|before|on)\s+([^.;,\n]+)/i)?.[1]?.trim() ??
    line.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)\b/i)?.[1]?.trim() ??
    ""
  );
}

function extractPersonalTasks(minutes: string): PersonalTask[] {
  const lines = minutes.split(/\n+/).map(cleanLine).filter(Boolean);
  const candidates = lines.filter((line) =>
    /\b(i need to|i will|my task|todo|to do|action item|follow up|complete|finish|submit|send|review|prepare|draft|schedule|email|ask)\b/i.test(line),
  );
  const selected = (candidates.length ? candidates : lines.filter((line) => /\b(due|by|before)\b/i.test(line))).slice(0, 8);
  if (!selected.length) {
    return [
      {
        id: "personal-task-1",
        title: "Review the meeting recap",
        status: "todo",
        dueDateText: extractTemplateSection(minutes, ["Due dates", "Due date"]).split(/\n+/)[0]?.trim() ?? "",
        source: "Fallback personal follow-up",
      },
    ];
  }

  return selected.map((line, index) => ({
    id: `personal-task-${index + 1}`,
    title: shortText(line.replace(/^[-*]\s*/, "").replace(/^(todo|to do|action item|my task)\s*[:.-]\s*/i, ""), 120),
    status: "todo",
    dueDateText: dueDateTextFromLine(line),
    source: line,
  }));
}

function extractPersonalRecap(minutes: string, context: string, title: string) {
  const discussionLines = minutes
    .split(/\n+/)
    .map(cleanLine)
    .filter((line) => line.length > 20 && !/^https?:/i.test(line))
    .filter((line) => !/^(meeting title|date|context|resources|questions|due dates)\b/i.test(line))
    .slice(0, 3);
  if (discussionLines.length) {
    return [`${title} focused on ${context || "the meeting context"}.`, ...discussionLines].join(" ");
  }
  return `${title} focused on ${context || "the pasted meeting context"}. Review the questions, resources, and due dates before closing the loop.`;
}

export function createPersonalMeetingDraft(input: PersonalMeetingDraftInput): PersonalMeeting {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const minutes = input.minutes.trim();
  const title = extractPersonalTitle(input.title, minutes);
  const date = extractPersonalDate(minutes);
  const context = extractTemplateSection(minutes, ["Context"]);
  const resources = parseResources(extractTemplateSection(minutes, ["Resources"]), minutes, "Personal meeting");
  const questions = extractPersonalQuestions(minutes);
  const tasks = extractPersonalTasks(minutes);
  const now = new Date().toISOString();

  return {
    id: `personal-meeting-${suffix}`,
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    title,
    date,
    minutes,
    context,
    recap: extractPersonalRecap(minutes, context, title),
    resources,
    questions,
    tasks,
    createdAt: now,
    updatedAt: now,
  };
}

function cleanLine(line: string) {
  const parsed = parseSpeakerLine(line);
  if (parsed) return parsed.text.replace(/^[-*]\s*/, "").trim();
  return line
    .replace(/^[-*]\s*/, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^(?:(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\s+)/, "")
    .replace(/^[^:\n]{2,80}:\s*/, "")
    .trim();
}

function shortText(value: string, maxLength = 96) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
}

function extractTopics(title: string, text: string, template: SessionType) {
  const fromTitle = title.includes(":") ? title.split(":").slice(1).join(":").trim() : title.trim();
  const bulletTopics = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map(cleanLine)
    .filter((line) => line.length > 6 && !/^https?:/i.test(line));
  const sentenceTopics = text
    .split(/[.\n]+/)
    .map(cleanLine)
    .filter((line) => /(review|covered|topic|reinforce|practice|debug|assigned|discussed)/i.test(line))
    .filter((line) => line.length > 12)
    .slice(0, 3);

  const fallback: Record<SessionType, string[]> = {
    "Math review": ["core math concepts", "practice problems", "common mistakes"],
    "CS workshop": ["debugging steps", "project blockers", "code explanations"],
    "General classroom": ["main lesson ideas", "student questions", "next steps"],
    "Club meeting": ["meeting decisions", "assigned owners", "next checkpoint"],
    "Study group": ["review topics", "practice goals", "peer questions"],
  };

  return unique([fromTitle, ...bulletTopics, ...sentenceTopics, ...fallback[template]])
    .filter(Boolean)
    .slice(0, 4);
}

function extractAssignment(text: string) {
  const lines = text
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean);
  const candidates = lines
    .map((item, index) => {
      let score = index / 1000;
      if (/\b(homework|assignment)\b/i.test(item)) score += 12;
      if (/\b(due|by|for)\s+(monday|tuesday|wednesday|thursday|friday|tomorrow|next|today|\d{1,2}\/\d{1,2})\b/i.test(item)) {
        score += 9;
      }
      if (/\b(finish|complete|submit|problems?)\b/i.test(item)) score += 6;
      if (/\b(worksheet|reflection|practice|flowchart|design|quiz|exit ticket|checkpoint)\b/i.test(item)) score += 4;
      if (/\b(did everyone|quick check|can everyone|hear me|see the slides|before we dive in)\b/i.test(item)) score -= 12;
      if (/\b(last thursday|last class|already submitted)\b/i.test(item)) score -= 5;
      return { item, score };
    })
    .filter(({ score }) => score > 5)
    .sort((a, b) => b.score - a.score);
  return cleanAssignmentText(candidates[0]?.item || "Review the session recap and complete the assigned follow-up check.");
}

function cleanAssignmentText(value: string) {
  const forwardLooking = value.match(/\b(?:homework|assignment)\b[\s\S]*$/i);
  return (forwardLooking?.[0] ?? value).replace(/\s+/g, " ").trim();
}

function actionTitleFromAssignment(assignment: string) {
  if (/review the session recap and complete the assigned follow-up check/i.test(assignment)) {
    return "Review session recap and complete follow-up";
  }
  const withoutPrefix = assignment
    .replace(/^homework\s*(?:for\s+\w+)?:\s*/i, "")
    .replace(/^homework\s+is\s+/i, "")
    .replace(/^assignment\s*:?\s*/i, "")
    .split(/\bAlso\b/i)[0]
    .trim();
  const completeMatch = withoutPrefix.match(/\b(complete|finish|submit)\s+(?:the\s+)?(.+?)(?:\s+on\s+|[.!?]|$)/i);
  const title = completeMatch
    ? `${completeMatch[1][0].toUpperCase()}${completeMatch[1].slice(1).toLowerCase()} ${completeMatch[2]}`
    : withoutPrefix;
  return shortText(title || assignment, 72);
}

function stripCaptureMetadata(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => {
      const normalized = cleanLine(line);
      return (
        normalized &&
        !/^(capture method|captured duration|audio capture consent|student voice identification|online meeting capture|live transcript|no live transcript)/i.test(
          normalized,
        )
      );
    })
    .join("\n")
    .trim();
}

function extractRecapSummary(text: string, template: SessionType, topics: string[], assignment: string, resourcesCount: number) {
  const lower = text.toLowerCase();
  const hasActivity = /peanut butter and jelly|pb&j|sandwich.*robot|robot.*sandwich/i.test(lower);
  const hasPrecision = /precision problem|precision in programming|ambiguous .* instruction|precise enough|exact instruction/i.test(lower);
  const hasDecomposition = /decompose|decomposition|smaller parts|function/i.test(lower);
  const hasPython = /python/i.test(lower);
  const hasPoll = /nearpod poll|poll launched|78% of you said|best example of an algorithm|map is data/i.test(lower);
  const lessonGoals = topics.filter((topic) => !/(main lesson ideas|student questions|next steps|meeting|review topics|core math concepts)/i.test(topic)).slice(0, 3);
  const topicPhrase = lessonGoals.length ? lessonGoals.join(", ") : "the class topic";
  const recapLines = [`This ${template.toLowerCase()} session focused on ${topicPhrase}.`];

  if (hasActivity) {
    recapLines.push(
      "Students practiced writing exact, step-by-step instructions by programming a peanut butter and jelly sandwich for a robot.",
    );
  }

  if (hasPrecision) {
    recapLines.push(
      "The class explored the precision problem, where vague instructions can cause a program to fail.",
    );
  }

  if (hasDecomposition) {
    recapLines.push(
      "We connected that work to problem decomposition by breaking the task into smaller steps that can become functions.",
    );
  }

  if (hasPoll) {
    recapLines.push("A quick Nearpod poll checked whether students understood algorithms versus data.");
  }

  if (hasPython) {
    recapLines.push("The teacher announced a transition to Python next week so students can apply these ideas in code.");
  }

  if (assignment && !/review the session recap/i.test(assignment)) {
    recapLines.push(/^homework\b/i.test(assignment) ? assignment : `Homework: ${assignment}`);
  }

  if (resourcesCount) {
    recapLines.push(`Shared ${resourcesCount} video resource${resourcesCount === 1 ? "" : "s"} in chat for extra review.`);
  }

  return recapLines.join(" ");
}

function generateEssentialQuestions(text: string, topics: string[], dueDate: string) {
  const lower = text.toLowerCase();
  const questions: string[] = [];

  if (/(precision problem|precise enough|vague .* instruction|ambiguous .* instruction)/i.test(lower)) {
    questions.push("What makes an instruction precise enough for an algorithm or robot?");
  } else {
    questions.push(`What were the most important takeaways about ${topics[0] ?? "today's lesson"}?`);
  }

  if (/(decompose|decomposition|smaller parts|function)/i.test(lower)) {
    questions.push("How can you break a complex task into smaller, more manageable steps?");
  } else {
    questions.push("Which students need support or catch-up before the next session?");
  }

  if (/(nearpod poll|poll launched|78% of you said|best example of an algorithm|map is data)/i.test(lower)) {
    questions.push("Why is a sequence of directions an algorithm while a map is just a representation of data?");
  } else {
    questions.push(`What follow-up work should be completed by ${dueDate}?`);
  }

  return questions;
}

function eventTypeFromText(text: string) {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, "");
  if (withoutUrls.includes("?")) return "asked_question" as const;
  if (/\b(because|so|should|equals|answer|i think|we can|it is|therefore|the fix|the reason)\b/i.test(withoutUrls)) {
    return "answered_question" as const;
  }
  return "chat" as const;
}

function shouldIgnoreParticipationLine(line: string) {
  const parsed = parseSpeakerLine(line);
  if (!parsed) return false;
  return isNonInstructionalChatText(parsed.text, parsed.line);
}

function participationConfidence(line: string, hasChatOnlyWarning: boolean, hasBlockingWarning: boolean) {
  const parsed = parseSpeakerLine(line);
  if (!parsed) return hasBlockingWarning ? 0.58 : 0.74;
  if (isAmbiguousGenericSpeaker(parsed.speaker)) return 0.42;
  if (hasBlockingWarning) return 0.54;
  if (hasChatOnlyWarning || isChatLine(parsed.line)) return 0.62;
  return 0.86;
}

function detectsMisconception(text: string) {
  return /(wrong|mistake|confus|hard|stuck|error|bug|doesn't|does not|not sure|missed|forgot|failed|incorrect)/i.test(text);
}

function studentReadinessScore({
  attendance,
  isQuiet,
  askedQuestion,
  hasMisconception,
  answeredQuestion,
  usefulChat,
}: {
  attendance: "present" | "absent" | "late";
  isQuiet: boolean;
  askedQuestion: boolean;
  hasMisconception: boolean;
  answeredQuestion: boolean;
  usefulChat: boolean;
}) {
  if (attendance === "absent") return 22;
  let score = attendance === "late" ? 45 : 52;
  if (usefulChat) score += 6;
  if (askedQuestion) score += 7;
  if (answeredQuestion) score += 13;
  if (isQuiet) score -= 18;
  if (hasMisconception) score -= 16;
  return Math.max(18, Math.min(88, score));
}

function parseResources(resourcesText: string, sessionText: string, relatedTopic: string): Resource[] {
  const combined = `${resourcesText}\n${sessionText}`;
  const urls = unique((combined.match(/https?:\/\/[^\s)]+/g) ?? []).map((url) => url.replace(/[.,;]+$/, "")));
  return urls.map((url, index) => {
    const sourceLine = combined.split(/\n+/).find((line) => line.includes(url)) ?? "";
    const label = sourceLine
      .replace(url, "")
      .replace(/resource link:?/i, "")
      .replace(/resources?:?/i, "")
      .trim();
    let fallbackTitle = `Resource ${index + 1}`;
    try {
      fallbackTitle = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      fallbackTitle = `Resource ${index + 1}`;
    }
    return {
      id: `res-${index + 1}`,
      title: label || fallbackTitle,
      url,
      type: /video|youtube|youtu\.be|vimeo/i.test(url) ? "video" : "link",
      relatedTopic,
    };
  });
}

function speakerMatchesStudent(speaker: string, student: Student) {
  const first = student.name.split(" ")[0];
  const tokens = normalizeSpeakerName(student.name).split(" ").filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const firstInitial = tokens[0]?.charAt(0) ?? "";
  const lastInitial = last.charAt(0);
  const aliases = student.aliases ?? [];
  const normalizedSpeakers = normalizedSpeakerCandidates(speaker);
  const normalizedStudentCandidates = [
    student.name,
    first,
    last && `${first} ${lastInitial}`,
    last && `${firstInitial} ${last}`,
    ...aliases,
  ].flatMap(normalizedSpeakerCandidates);
  return normalizedSpeakers.some((speakerCandidate) =>
    normalizedStudentCandidates.some(
      (studentCandidate) =>
        speakerCandidate === studentCandidate ||
        compactSpeakerName(speakerCandidate) === compactSpeakerName(studentCandidate),
    ),
  );
}

function lineForStudent(lines: string[], student: Student) {
  const first = student.name.split(" ")[0];
  const speakerPattern = new RegExp(`^(${escapeRegExp(student.name)}|${escapeRegExp(first)})\\s*:`, "i");
  return lines.filter((line) => {
    const parsed = parseSpeakerLine(line);
    return parsed ? speakerMatchesStudent(parsed.speaker, student) : speakerPattern.test(line);
  });
}

function suggestedStudentIdForSpeaker(name: string, roster: Student[]) {
  const speakerCandidates = normalizedSpeakerCandidates(name);
  return roster.find((student) =>
    speakerCandidates.some((candidate) => {
      const firstToken = candidate.split(" ")[0];
      const firstInitial = firstToken.charAt(0);
      const studentName = normalizeSpeakerName(student.name);
      return studentName.startsWith(firstToken) || (firstInitial && studentName.charAt(0) === firstInitial);
    }),
  )?.id;
}

function findUnmatchedParticipants(sessionText: string, roster: Student[], hasExplicitRoster: boolean): UnmatchedParticipant[] {
  if (!hasExplicitRoster) return [];
  const speakerLines = extractTranscriptSpeakers(sessionText);
  const speakers = unique(speakerLines.map((line) => line.speaker));
  return speakers
    .filter((speaker) => !roster.some((student) => speakerMatchesStudent(speaker, student)))
    .map((speaker) => ({
      name: speaker,
      lines: speakerLines.filter((line) => line.speaker === speaker).map((line) => line.line).slice(0, 3),
      suggestedStudentId: suggestedStudentIdForSpeaker(speaker, roster),
    }));
}

export function createGeneratedSession(input: ImportDraftInput): Session {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const rawSessionText = `${input.transcript}\n${input.notes}`.trim();
  const sessionText = stripCaptureMetadata(rawSessionText);
  const hasSubstantiveSessionText = Boolean(sessionText.trim());
  const sessionTitle = input.title || `${input.template} session`;
  const roster = parseRoster(input.roster, input.transcript);
  const hasExplicitRoster = Boolean(input.roster.trim());
  const unmatchedParticipants = findUnmatchedParticipants(sessionText, roster, hasExplicitRoster);
  const importWarnings = importQualityWarnings(sessionText, roster, hasExplicitRoster);
  const hasBlockingImportWarning = importWarnings.some((warning) => warning.severity === "blocking");
  const hasChatOnlyWarning = importWarnings.some((warning) => warning.id === "chat-only");
  const topics = extractTopics(sessionTitle, sessionText, input.template);
  const assignment = hasSubstantiveSessionText ? extractAssignment(sessionText) : "Confirm the student follow-up task before publishing.";
  const dueDate = nextFriday();
  const lines = sessionText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const resources = parseResources(input.resources, sessionText, topics[0] ?? input.template);
  const recap = hasSubstantiveSessionText
    ? extractRecapSummary(sessionText, input.template, topics, assignment, resources.length)
    : `This ${input.template.toLowerCase()} draft was created from a recorded session without enough transcript text yet. Add the main takeaways, assignments, and any student-specific context before publishing.`;
  const essentialQuestions = generateEssentialQuestions(sessionText, topics, dueDate);
  const speakerLines = extractTranscriptSpeakers(sessionText);

  const attendance = roster.reduce<Record<string, "present" | "absent" | "late">>((acc, student) => {
    const first = student.name.split(" ")[0].toLowerCase();
    const full = student.name.toLowerCase();
    const lower = sessionText.toLowerCase();
    if (lower.includes(`${first} is absent`) || lower.includes(`${full} absent`) || lower.includes(`absent: ${first}`)) {
      acc[student.id] = "absent";
    } else if (lower.includes(`${first} late`) || lower.includes(`${full} late`)) {
      acc[student.id] = "late";
    } else {
      acc[student.id] = "present";
    }
    return acc;
  }, {});

  const participationEvents: ParticipationEvent[] = roster.flatMap((student) => {
    const first = student.name.split(" ")[0];
    const lower = sessionText.toLowerCase();
    const parsedSpoken = speakerLines
      .filter((line) => speakerMatchesStudent(line.speaker, student))
      .map((line) => line.line);
    const spoken = unique([...parsedSpoken, ...lineForStudent(lines, student)]).filter((line) => !shouldIgnoreParticipationLine(line));
    const events: ParticipationEvent[] = spoken.slice(0, 2).map((line, index) => {
      const clean = cleanLine(line);
      const type = eventTypeFromText(clean);
      const confidence = participationConfidence(line, hasChatOnlyWarning, hasBlockingImportWarning);
      return {
        id: `p-${student.id}-${index}-${suffix}`,
        studentId: student.id,
        type,
        text:
          type === "asked_question"
            ? `Asked: ${clean}`
            : type === "answered_question"
              ? `Contributed: ${clean}`
              : `Shared: ${clean}`,
        confidence,
        approved: confidence >= 0.75 && !hasChatOnlyWarning && !hasBlockingImportWarning,
        reviewRequired: confidence < 0.75 || hasChatOnlyWarning || hasBlockingImportWarning,
        sourceLine: line,
      };
    });

    if (lower.includes(`${first.toLowerCase()} is absent`) || attendance[student.id] === "absent") {
      events.push({
        id: `p-${student.id}-absent-${suffix}`,
        studentId: student.id,
        type: "absent",
        text: "Marked absent and needs catch-up materials.",
        confidence: 0.94,
        approved: true,
        sourceLine: `${first} is absent`,
      });
    }

    if (lower.includes(`${first.toLowerCase()} is quiet`) || lower.includes(`${first.toLowerCase()} was quiet`)) {
      events.push({
        id: `p-${student.id}-quiet-${suffix}`,
        studentId: student.id,
        type: "quiet",
        text: "Present but flagged for a private confidence check-in.",
        confidence: 0.82,
        approved: true,
        sourceLine: `${first} is quiet`,
      });
    }

    return events;
  });

  const followUps: StudentFollowUp[] = roster.map((student) => {
    const events = participationEvents.filter((event) => event.studentId === student.id && event.approved);
    const isAbsent = attendance[student.id] === "absent";
    const isQuiet = events.some((event) => event.type === "quiet");
    const askedQuestion = events.find((event) => event.type === "asked_question");
    const answeredQuestion = events.find((event) => event.type === "answered_question");
    const usefulChat = events.some((event) => event.type === "chat");
    const misconceptionEvent = events.find((event) => detectsMisconception(event.text));
    const baseTasks = [assignment];
    if (isAbsent) baseTasks.unshift("Read the catch-up recap");
    if (isQuiet) baseTasks.push("Submit a quick confidence check-in");
    if (askedQuestion) baseTasks.push(`Review the answer to your question: ${shortText(askedQuestion.text.replace(/^Asked:\s*/i, ""), 72)}`);
    if (misconceptionEvent) baseTasks.push(`Redo the step connected to: ${shortText(misconceptionEvent.text.replace(/^(Asked|Contributed|Shared):\s*/i, ""), 72)}`);
    if (answeredQuestion && !misconceptionEvent) baseTasks.push("Write one sentence explaining the idea you contributed in class.");

    const readinessScore = studentReadinessScore({
      attendance: attendance[student.id],
      isQuiet,
      askedQuestion: Boolean(askedQuestion),
      hasMisconception: Boolean(misconceptionEvent),
      answeredQuestion: Boolean(answeredQuestion),
      usefulChat,
    });

    return {
      studentId: student.id,
      reminder: isAbsent
        ? `Catch up on ${topics[0]} before starting the assigned work.`
        : isQuiet
          ? `Use the recap to check your confidence on ${topics[0]}, then send a quick check-in.`
          : misconceptionEvent
            ? `Revisit the part of ${topics[0]} that caused confusion, then complete the class follow-up.`
            : askedQuestion
              ? `Start with the answer to your question, then complete the shared class follow-up.`
              : `Review ${topics[0]} and complete the assigned follow-up.`,
      catchUp: isAbsent
        ? "You were marked absent for this session. Start with the recap, then use the resources and assigned work to catch up."
        : events.length
          ? misconceptionEvent
            ? "Your dashboard includes the shared class recap plus extra review for the part that seemed confusing during class."
            : askedQuestion
              ? "Your dashboard includes the shared class recap plus a review task tied to the question you asked."
              : "Your dashboard connects your class participation to the follow-up work."
          : "You were marked present. Use the recap and resources to confirm the main takeaways.",
      tasks: unique(baseTasks),
      dueDate,
      status: "todo",
      score: readinessScore,
    };
  });

  const actionItems: ActionItem[] = [
    {
      id: `task-class-${suffix}`,
      title: actionTitleFromAssignment(assignment),
      description: hasSubstantiveSessionText
        ? `Class-level follow-up generated from the imported ${input.template.toLowerCase()} record. Assignment: ${assignment}`
        : "No reliable transcript text was available, so confirm the actual student task before publishing.",
      dueDate,
      status: "todo",
      source: "Detected from transcript, notes, or your session details.",
    },
    ...followUps
      .filter((followUp) => attendance[followUp.studentId] === "absent" || followUp.score < 55)
      .map((followUp, index) => ({
        id: `task-student-${index}-${suffix}`,
        title: `${roster.find((student) => student.id === followUp.studentId)?.name ?? "Student"} support check`,
        description: followUp.reminder,
        ownerId: followUp.studentId,
        dueDate: followUp.dueDate,
        status: followUp.status,
        source: "Generated from attendance and participation signals.",
      })),
  ];
  const submissions: StudentSubmission[] = roster.map((student) => ({
    studentId: student.id,
    sessionId: `session-generated-${suffix}`,
    status: "todo",
    note: "",
  }));

  return {
    id: `session-generated-${suffix}`,
    title: sessionTitle,
    type: input.template,
    date: toDateInput(new Date()),
    status: "draft",
    students: roster,
    transcript: input.transcript,
    notes: input.notes,
    capture: {
      mode: input.captureMode ?? "transcript",
      sourceLabel: input.captureSourceLabel ?? "Transcript import",
      capturedAt: new Date().toISOString(),
      durationSeconds: input.captureDurationSeconds,
      transcriptSource: input.transcriptSource ?? (input.transcript.trim() ? "paste" : "audio_recording"),
    },
    recap,
    essentialQuestions,
    attendance,
    resources,
    actionItems,
    participationEvents,
    followUps,
    submissions,
    unmatchedParticipants,
    importWarnings,
    transcriptAliases: {},
    emailDelivery: {
      status: "not_sent",
      recipients: [],
      skipped: [],
    },
  };
}
