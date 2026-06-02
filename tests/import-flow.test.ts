import { createGeneratedSession, createPersonalMeetingDraft, readTranscriptFileText } from "../src/data.js";
import { createStructuredTranscriptFromText } from "../src/transcript.js";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

const compressedRoster = `CLASS ROSTER — CS4All Demo Session
Mr. Agrawal | Period 4 | Spring 2026
#Student NameEmail1Aaliyah Carteracarter@cs4all.nyc2Danny Reyesdreyes@cs4all.nyc3Jalen Thompsonjthompson@cs4all.nyc4Keisha Brownkbrown@cs4all.nyc5Leo Fernandezlfernandez@cs4all.nyc6Marcus Williamsmwilliams@cs4all.nyc7Priya Mehtapmehta@cs4all.nyc8Brianna Owensbowens@cs4all.nyc9Caleb Nguyencnguyen@cs4all.nyc10Destiny Lewisdlewis@cs4all.nyc11Elijah Sandersesanders@cs4all.nyc12Fatima Hassanfhassan@cs4all.nyc13Gabriel Torresgtorres@cs4all.nyc14Hannah Kimhkim@cs4all.nyc15Isaiah Mooreimoore@cs4all.nyc16Jasmine Pateljpatel@cs4all.nyc17Kevin Diazkdiaz@cs4all.nyc18Lena Wulwu@cs4all.nyc`;

const zoomTranscript = `CS4ALL Zoom Demo — Full Transcript
Meeting Title: CS4All Intro to Computational Thinking — Demo Session
Date: April 28, 2026
Duration: 47 minutes
Participants: Ms. Rivera (Teacher), 18 Students

[00:00:03] Ms. Rivera: Alright everyone, I'm going to start the recording now. Can everyone give me a thumbs up in the reactions if you can hear me okay?
[00:00:11] Student (Jalen Thompson): I can hear you!
[00:00:13] Student (Priya Mehta): Yes, audio is good.
[00:00:15] Ms. Rivera: Perfect. Okay, so welcome back everyone. Today we're starting Unit 3 — Algorithms and Problem Decomposition. Before we dive in, quick check — did everyone finish the exit ticket from last Thursday?
[00:00:28] Student (Marcus Williams): I forgot 😭
[00:00:31] Ms. Rivera: Marcus, come see me after. Okay, so let's get into it. I'm going to share my screen. Can everyone see the slides?
[00:00:41] Student (Aaliyah Carter): Yes!
[00:00:42] Student (Danny Reyes): Yep.
[00:00:44] Ms. Rivera: Great. So — who can tell me, in their own words, what an algorithm is? Don't look it up, just think about it. Anyone?
[00:00:57] Student (Priya Mehta): Is it like... a set of steps to solve a problem?
[00:01:02] Ms. Rivera: Yes! Exactly. A sequence of instructions. Now here's what I want you to think about — where do you encounter algorithms in your daily life? Drop it in the chat.
[00:01:14] Student (Jalen Thompson): [Chat] TikTok algorithm lol
[00:01:15] Student (Keisha Brown): [Chat] GPS directions
[00:01:16] Student (Danny Reyes): [Chat] recipes
[00:01:17] Student (Marcus Williams): [Chat] alarm clock??
[00:01:18] Student (Priya Mehta): [Chat] found this video that explains it really well → https://www.youtube.com/watch?v=6hfOvs8pY1k
[00:01:20] Ms. Rivera: Love these. Danny — recipes, yes! That's a great one. An alarm clock is actually a really interesting case, Marcus — why do you think that might be algorithmic?
[00:01:33] Student (Marcus Williams): Uh... because it like, checks the time and then does something based on a condition?
[00:01:40] Ms. Rivera: Boom. Conditional logic. That's exactly it. Okay, let's move to the activity. I'm going to put you all into breakout rooms — groups of three. Your task is to write out the steps to make a peanut butter and jelly sandwich as if you were programming a robot. Be super literal. The robot has no common sense.
[00:02:01] Student (Aaliyah Carter): Wait do we write it in a doc?
[00:02:04] Ms. Rivera: Yes, I'm dropping a Docs link in the chat right now. You have 8 minutes. Go!
[00:02:09] [Breakout rooms opened — 6 groups]

[00:10:17] [Breakout rooms closed — all participants returned]
[00:10:22] Ms. Rivera: Okay welcome back! Let's hear from a few groups. Group 2, Keisha — can you share what your group came up with?
[00:10:31] Student (Keisha Brown): Okay so we wrote: Step 1 — Pick up the bread bag. Step 2 — Open the bread bag. Step 3 — Remove two slices of bread. Step 4 — Place slices on a flat surface...
[00:10:45] Ms. Rivera: Already I'm stopping you — "flat surface." What if the robot doesn't know what flat means? Or what surface to use?
[00:10:53] Student (Keisha Brown): Oh... we'd have to define that.
[00:10:55] Ms. Rivera: Exactly! This is what we call the precision problem in programming. Computers do exactly what you tell them — nothing more, nothing less. This is why debugging is so hard. Your logic might be right but your instructions are ambiguous. Okay Group 5, let's hear from you.
[00:11:14] Student (Leo Fernandez): We kind of went overboard — we wrote like 34 steps.
[00:11:18] [Laughter from several students]
[00:11:20] Ms. Rivera: That's not overboard, that's thorough! Can you read a few?
[00:11:24] Student (Leo Fernandez): Step 1 — Initialize hand variable. Step 2 — Assign dominant hand to variable. Step 3 — Extend arm toward bread bag...
[00:11:34] [More laughter]
[00:11:36] Ms. Rivera: I love it, Leo. This is actually really close to pseudocode. You're thinking like a programmer. Alright — let's talk decomposition. When a problem is complex, what do we do?
[00:11:48] Student (Priya Mehta): Break it into smaller parts?
[00:11:51] Ms. Rivera: Yes. We decompose it. The sandwich is actually three sub-problems: bread setup, spread application, and assembly. Each of those can be its own function. This maps directly to how we'll write Python functions next week.
[00:11:58] Student (Leo Fernandez): [Chat] yo this video breaks down decomposition perfectly https://www.youtube.com/watch?v=QXjU9qTsYCc
[00:12:02] Student (Aaliyah Carter): [Chat] omg we watched that in 8th grade lol
[00:12:04] Ms. Rivera: Leo drop the distractions 😄 but yes that's actually a solid resource, I'll add it to Classroom.
[00:12:09] Student (Danny Reyes): Wait are we actually gonna code a sandwich?
[00:12:13] Ms. Rivera: laughs Not quite. But we'll use this mental model. Okay — I want to do a quick Nearpod poll before we wrap up. Checking your understanding. One second while I launch it.
[00:12:28] [Poll launched]
Question: Which of the following is the BEST example of an algorithm?

A) A list of your favorite songs
B) Directions from your house to school
C) A photo of a map
D) The name of a city

[00:12:55] Ms. Rivera: Okay I'm seeing responses come in... 78% of you said B — directions from your house to school. That is correct! Directions are a sequence of steps with a clear start, end, and decision points. A list of songs has no sequence logic. Good job.
[00:13:14] Student (Marcus Williams): What about C though? A map kind of shows steps?
[00:13:19] Ms. Rivera: Great question. A map is a representation of space — it's data. But it's not an algorithm until you apply a process to it — like, GPS takes the map data and runs an algorithm to find the shortest path. Does that distinction make sense?
[00:13:32] Student (Marcus Williams): Yeah okay yeah.
[00:13:35] Ms. Rivera: Alright, we have about 5 minutes left. Homework for Thursday: complete the algorithm design worksheet on Google Classroom — it's the one titled "Everyday Algorithms." Also, for those of you who haven't submitted your Unit 2 reflection, that's now past due and affecting your grade.
[00:13:53] Student (Jalen Thompson): Ms. Rivera is the worksheet the one with the flowcharts?
[00:13:57] Ms. Rivera: Yes, the one with the flowcharts. There are three problems. You pick two of the three. Any other questions?
[00:14:06] Student (Aaliyah Carter): Are we going to keep using Scratch or switch to Python?
[00:14:10] Ms. Rivera: We're transitioning to Python starting next Thursday. We'll use replit — make sure your accounts are set up. I'll send a reminder on Classroom.
[00:14:19] Ms. Rivera: Okay everyone — great work today. I'll see you Thursday. Jalen, Marcus — stay on for a second.
[00:14:26] [Students begin leaving the meeting]
[00:14:31] Student (Jalen Thompson): Yes Ms. Rivera?
[00:14:33] Ms. Rivera: Jalen, you've been really engaged today, I just want to make sure you're keeping up with the written work too. Your participation is great but I need those docs submitted.
[00:14:42] Student (Jalen Thompson): Yeah I'll do it tonight I promise.
[00:14:44] Ms. Rivera: I'm going to hold you to that. Okay, have a good afternoon both of you.
[00:14:49] [Recording ended]`;

const session = createGeneratedSession({
  title: "CS4All Intro to Computational Thinking — Demo Session",
  template: "General classroom",
  transcript: zoomTranscript,
  notes: "",
  roster: compressedRoster,
  resources: "",
});

const rosterFormatVariants = [
  {
    name: "comma-separated lines",
    roster: `Roster
Aaliyah Carter, acarter@cs4all.nyc
Danny Reyes, dreyes@cs4all.nyc
Jalen Thompson, jthompson@cs4all.nyc`,
  },
  {
    name: "pipe-separated rows",
    roster: `Student Name | Email
Aaliyah Carter | acarter@cs4all.nyc
Danny Reyes | dreyes@cs4all.nyc
Jalen Thompson | jthompson@cs4all.nyc`,
  },
  {
    name: "numbered angle-bracket rows",
    roster: `Class roster
1. Aaliyah Carter <acarter@cs4all.nyc>
2. Danny Reyes <dreyes@cs4all.nyc>
3. Jalen Thompson <jthompson@cs4all.nyc>`,
  },
  {
    name: "tabular pasted rows",
    roster: `# Student Name\tEmail
1\tAaliyah Carter\tacarter@cs4all.nyc
2\tDanny Reyes\tdreyes@cs4all.nyc
3\tJalen Thompson\tjthompson@cs4all.nyc`,
  },
  {
    name: "Google Classroom CSV export",
    roster: `First Name,Last Name,Email
Aaliyah,Carter,acarter@cs4all.nyc
Danny,Reyes,dreyes@cs4all.nyc
Jalen,Thompson,jthompson@cs4all.nyc`,
  },
  {
    name: "semicolon-separated export",
    roster: `Student Name;Email
Aaliyah Carter;acarter@cs4all.nyc
Danny Reyes;dreyes@cs4all.nyc
Jalen Thompson;jthompson@cs4all.nyc`,
  },
  {
    name: "CSV with aliases and empty rows",
    roster: `Name,Email,Aliases

Aaliyah Carter,acarter@cs4all.nyc,Aaliyah C
,blank-name@cs4all.nyc
Danny Reyes,dreyes@cs4all.nyc,Danny R
Malformed row with no email
Jalen Thompson,jthompson@cs4all.nyc,Jalen T; JT Laptop`,
  },
];

const speakerFormatTranscript = `Mr. Agrawal: Teacher instructions should not become a student.
Learner (Aaliyah Carter): I can explain the steps.
Speaker - Danny Reyes: I think directions are an algorithm.
Jalen T: Is the worksheet due Thursday?
Resource: https://www.youtube.com/watch?v=6hfOvs8pY1k`;

const zoomVttTranscript = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Student (Aaliyah Carter)>Do we write this in a doc?

00:00:04.000 --> 00:00:06.000
<v Ms. Rivera>Yes, use the shared document.

00:00:06.000 --> 00:00:09.000
<v Student (Danny Reyes)>The recipe is an algorithm.`;

const teamsTranscript = `Aaliyah Carter
4/28/2026, 10:01 AM
I can explain the steps.

Danny Reyes
4/28/2026, 10:02 AM
Directions are a sequence.

Ms. Rivera
4/28/2026, 10:03 AM
Good examples.`;

const googleMeetTranscript = `Aaliyah Carter: I think an algorithm is a list of steps.
Danny Reyes: Is the worksheet due Thursday?
Jalen T: The map is data, not the algorithm.`;

const zoomTimestampedTranscript = `00:00:01 Student (Aaliyah Carter): I can explain the first step.
00:00:04 Danny Reyes: Is the worksheet due Thursday?
[00:00:07] Jalen T: The map is data, not an algorithm.`;

const zoomChatTranscript = `[Chat] Aaliyah Carter: resource for later https://example.com/algorithm-chat
[00:00:05] [Chat] Danny Reyes: recipes are algorithms
[00:00:09] Jalen Thompson: I can compare directions and maps.`;

const scratchStressRoster = `Scratch Club roster export
Facilitator: Rushil Agrawal
Name,Email,Aliases

Mina Park,mina@classloop.test,Mina P; Mina Laptop
Owen Brooks,owen@classloop.test,O Brooks
Aarav Singh,aarav@classloop.test,Aarav S
Nia Johnson,nia@classloop.test,Nia J; Nia Chromebook
Sam Rivera,sam@classloop.test,Sam R
Leah Kim,leah@classloop.test,Leah K
Mina Park,mina@classloop.test,Mina duplicate alias
,blank-name@classloop.test
Malformed row with no deliverable email`;

const scratchStressTranscript = `CS4ALL/Scratch Club Monday reconstructed transcript
Meeting Title: Scratch maze debugging lab
Practice goals: motion blocks, repeat loops, broadcasts, and testing
Privacy reminder before recording: use fake names in support notes.
Debug targets: sprite movement, wall collisions, and win-state broadcast.

[00:00:11] Student (Mina Park): My sprite keeps spinning forever after the green flag?
[00:00:18] Speaker - Owen Brooks: I think the repeat block needs a stop condition because it never changes the variable.
Nia Chromebook: [Chat] Scratch sensing blocks resource https://scratch.mit.edu/projects/editor/?tutorial=getStarted
[Chat] Sam R: I can test the maze after we add the broadcast.
Leah K
5/13/2026, 6:34 PM
I was late but I can finish the backdrop at home.
Mr. Agrawal: Leah late today but present.
Mr. Agrawal: Nia is quiet today; please submit a confidence check-in.
Mr. Agrawal: Aarav is absent and needs the catch-up recap.
Unclear Guest: I am observing from another club.
Student (Mina Park): [Chat] screenshot of the bug https://example.com/scratch-bug.png).
Mr. Agrawal: Homework for next Monday: finish the maze starter and submit one reflection.`;

const zoomDottedVttTranscript = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v.Student (Aaliyah Carter)>The robot needs exact instructions.

00:00:04.000 --> 00:00:06.000
<v.Danny Reyes>Order matters for the steps.

00:00:06.000 --> 00:00:09.000
<v.Jalen T>Can we use a flowchart?`;

const genericSpeakerLabelsTranscript = `Participant - Aaliyah Carter: I can explain decomposition.
Attendee (Danny Reyes): I think the recipe is an algorithm.
User (Jalen Thompson): Does the reflection count as homework?`;

const publicProxyGenericClassroomTranscript = `STUDENT: I think we can divide both sides by the same number.
STUDENT: But I am not sure whose equation that is.
TEACHER: Keep this as a class-level discussion until speakers are linked.`;

const publicProxyNoisyZoomTranscript = `Maya Chen: um okay like so the triangle thing is uh kind of there but the audio unclear and I think the side um like yeah because it is maybe same same.
Jordan Lee: uh yeah okay like I was saying the number is kind of there and the transcript unclear so maybe homework maybe no.
Teacher: [inaudible] finish the practice when the recording makes sense.`;

const publicProxyChatOnlyTranscript = `[Chat] Maya Chen: hello
[Chat] Maya Chen: resource link https://example.com/public-proxy-resource
[Chat] Jordan Lee: Can you share the slides after class?
[Chat] Priya Shah: my wifi dropped can you hear me?
[Chat] Staff Host: Here is the registration link for adults.
[Chat] AI Notetaker: joined the meeting.
[Direct Message] Maya Chen to Staff Host: private follow-up`;

const expectedStudents = [
  ["Aaliyah Carter", "acarter@cs4all.nyc"],
  ["Danny Reyes", "dreyes@cs4all.nyc"],
  ["Jalen Thompson", "jthompson@cs4all.nyc"],
  ["Keisha Brown", "kbrown@cs4all.nyc"],
  ["Leo Fernandez", "lfernandez@cs4all.nyc"],
  ["Marcus Williams", "mwilliams@cs4all.nyc"],
  ["Priya Mehta", "pmehta@cs4all.nyc"],
  ["Brianna Owens", "bowens@cs4all.nyc"],
  ["Caleb Nguyen", "cnguyen@cs4all.nyc"],
  ["Destiny Lewis", "dlewis@cs4all.nyc"],
  ["Elijah Sanders", "esanders@cs4all.nyc"],
  ["Fatima Hassan", "fhassan@cs4all.nyc"],
  ["Gabriel Torres", "gtorres@cs4all.nyc"],
  ["Hannah Kim", "hkim@cs4all.nyc"],
  ["Isaiah Moore", "imoore@cs4all.nyc"],
  ["Jasmine Patel", "jpatel@cs4all.nyc"],
  ["Kevin Diaz", "kdiaz@cs4all.nyc"],
  ["Lena Wu", "lwu@cs4all.nyc"],
];

const expectedMatchedSpeakers = [
  "Student (Jalen Thompson)",
  "Student (Priya Mehta)",
  "Student (Marcus Williams)",
  "Student (Aaliyah Carter)",
  "Student (Danny Reyes)",
  "Student (Keisha Brown)",
  "Student (Leo Fernandez)",
];

assertEqual(session.students.length, 18, "compressed roster should parse exactly 18 students");
expectedStudents.forEach(([name, email]) => {
  assert(
    session.students.some((student) => student.name === name && student.email === email),
    `compressed roster should include ${name} with ${email}`,
  );
});
assertEqual(session.followUps.length, 18, "follow-ups should be created for the full roster");
assert(session.participationEvents.length > 0, "matched student transcript lines should create participation events");
assertEqual(session.resources.length, 2, "two YouTube resources should be extracted");
assert(
  session.resources.some((resource) => resource.url === "https://www.youtube.com/watch?v=6hfOvs8pY1k"),
  "resources should include the algorithm YouTube URL",
);
assert(
  session.resources.some((resource) => resource.url === "https://www.youtube.com/watch?v=QXjU9qTsYCc"),
  "resources should include the decomposition YouTube URL",
);

assert(/peanut butter and jelly sandwich/i.test(session.recap), "teacher recap should preserve the concrete class activity");
assert(/precision problem/i.test(session.recap), "teacher recap should name the key teacher takeaway");
assert(/problem decomposition|smaller steps/i.test(session.recap), "teacher recap should explain the next concept");
assert(/Homework.*algorithm design worksheet/i.test(session.recap), "teacher recap should include the real homework");
assert(
  session.essentialQuestions.some((question) => /precise enough/i.test(question)) &&
    session.essentialQuestions.some((question) => /break a complex task/i.test(question)) &&
    session.essentialQuestions.some((question) => /algorithm.*map/i.test(question)),
  "essential questions should help teachers guide the next lesson instead of staying generic",
);
assert(
  session.actionItems.some((item) => /algorithm design worksheet|Everyday Algorithms/i.test(`${item.title} ${item.description}`)),
  "teacher action items should preserve the specific assignment students need",
);
assert(
  session.actionItems.some((item) => /complete algorithm design worksheet/i.test(item.title)),
  "teacher action item title should be scannable and specific",
);
const marcus = session.students.find((student) => student.name === "Marcus Williams");
const marcusFollowUp = session.followUps.find((followUp) => followUp.studentId === marcus?.id);
if (!marcusFollowUp) throw new Error("student-specific follow-up should exist for Marcus");
assert(
  marcusFollowUp.tasks.some((task) => /algorithm design worksheet|Everyday Algorithms/i.test(task)),
  "student follow-up should include the shared class assignment",
);
assert(
  marcusFollowUp.tasks.some((task) => /Review the answer to your question|Redo the step connected/i.test(task)),
  "student follow-up should include a personalized next step from participation signals",
);
assert(
  session.followUps.every(
    (followUp) =>
      followUp.reminder.length > 24 &&
      followUp.catchUp.length > 32 &&
      followUp.tasks.every((task) => !/Confirm the student follow-up task|No reliable transcript/i.test(task)),
  ),
  "generated student outputs should be concrete enough to be useful before teacher editing",
);

const unmatchedNames = (session.unmatchedParticipants ?? []).map((participant) => participant.name);
assert(!unmatchedNames.includes("Ms. Rivera"), "teacher speaker should not be reported as unmatched");
assert(!unmatchedNames.includes("Mr. Agrawal"), "roster teacher metadata should not be reported as unmatched");
expectedMatchedSpeakers.forEach((speaker) => {
  assert(!unmatchedNames.includes(speaker), `${speaker} should match a roster student`);
});

rosterFormatVariants.forEach((variant) => {
  const variantSession = createGeneratedSession({
    title: `Import robustness check: ${variant.name}`,
    template: "General classroom",
    transcript: speakerFormatTranscript,
    notes: "",
    roster: variant.roster,
    resources: "",
  });
  assertEqual(variantSession.students.length, 3, `${variant.name} should parse three roster students`);
  assert(
    variantSession.students.some((student) => student.name === "Aaliyah Carter" && student.email === "acarter@cs4all.nyc"),
    `${variant.name} should parse Aaliyah Carter`,
  );
  assert(
    variantSession.students.some((student) => student.name === "Danny Reyes" && student.email === "dreyes@cs4all.nyc"),
    `${variant.name} should parse Danny Reyes`,
  );
  assert(
    variantSession.students.some((student) => student.name === "Jalen Thompson" && student.email === "jthompson@cs4all.nyc"),
    `${variant.name} should parse Jalen Thompson`,
  );
  assertEqual(variantSession.unmatchedParticipants?.length ?? 0, 0, `${variant.name} should match known speaker variants`);
  assert(variantSession.participationEvents.length > 0, `${variant.name} should generate participation events`);
  assertEqual(variantSession.resources.length, 1, `${variant.name} should preserve transcript URL extraction`);
});

[
  ["Zoom timestamped lines", zoomTimestampedTranscript],
  ["Zoom chat export lines", zoomChatTranscript],
  ["Zoom dotted VTT voice tags", zoomDottedVttTranscript],
  ["Zoom VTT captions", zoomVttTranscript],
  ["Generic speaker labels", genericSpeakerLabelsTranscript],
  ["Teams transcript blocks", teamsTranscript],
  ["Google Meet captions", googleMeetTranscript],
].forEach(([name, transcript]) => {
  const transcriptSession = createGeneratedSession({
    title: `Transcript robustness check: ${name}`,
    template: "CS workshop",
    transcript,
    notes: "",
    roster: `Aaliyah Carter, acarter@cs4all.nyc
Danny Reyes, dreyes@cs4all.nyc
Jalen Thompson, jthompson@cs4all.nyc`,
    resources: "",
  });
  assertEqual(transcriptSession.students.length, 3, `${name} should preserve roster parsing`);
  assertEqual(transcriptSession.unmatchedParticipants?.length ?? 0, 0, `${name} should match roster speakers`);
  assert(transcriptSession.participationEvents.length > 0, `${name} should create participation events`);
});

const publicProxyGenericSession = createGeneratedSession({
  title: "Public proxy generic classroom transcript",
  template: "Math review",
  transcript: publicProxyGenericClassroomTranscript,
  notes: "",
  roster: `Maya Chen, maya@classloop.test
Jordan Lee, jordan@classloop.test`,
  resources: "",
});
assert(
  publicProxyGenericSession.importWarnings?.some(
    (warning) => warning.id === "generic-speaker-labels" && warning.severity === "blocking",
  ) ?? false,
  "public proxy generic student labels should create a blocking import warning",
);
assertEqual(
  publicProxyGenericSession.participationEvents.length,
  0,
  "generic student labels should not create roster-attributed participation events before linking",
);

const publicProxyNoisySession = createGeneratedSession({
  title: "Public proxy noisy Zoom ASR transcript",
  template: "General classroom",
  transcript: publicProxyNoisyZoomTranscript,
  notes: "",
  roster: `Maya Chen, maya@classloop.test
Jordan Lee, jordan@classloop.test`,
  resources: "",
});
assert(
  publicProxyNoisySession.importWarnings?.some((warning) => warning.id === "noisy-asr" && warning.severity === "blocking") ??
    false,
  "noisy public Zoom-style ASR should create a blocking review warning",
);
assert(
  publicProxyNoisySession.participationEvents.every((event) => !event.approved && event.reviewRequired && event.sourceLine),
  "noisy ASR participation should stay unapproved and show source-line evidence",
);
assert(
  publicProxyNoisySession.followUps.every((followUp) => !followUp.tasks.some((task) => /your question|idea you contributed/i.test(task))),
  "unapproved noisy-ASR signals should not personalize student follow-up tasks by default",
);

const publicProxyChatSession = createGeneratedSession({
  title: "Public proxy Zoom chat transcript",
  template: "General classroom",
  transcript: publicProxyChatOnlyTranscript,
  notes: "",
  roster: `Maya Chen, maya@classloop.test
Jordan Lee, jordan@classloop.test
Priya Shah, priya@classloop.test`,
  resources: "",
});
assert(
  publicProxyChatSession.importWarnings?.some((warning) => warning.id === "chat-only" && warning.severity === "warning") ?? false,
  "chat-only public transcript proxy should create a review warning",
);
assert(
  publicProxyChatSession.importWarnings?.some((warning) => warning.id === "private-chat-artifacts") ?? false,
  "private Zoom chat artifacts should be reported as ignored",
);
assert(
  publicProxyChatSession.importWarnings?.some((warning) => warning.id === "staff-or-bot-speakers") ?? false,
  "staff and bot chat speakers should be filtered and reported",
);
assertEqual(
  publicProxyChatSession.unmatchedParticipants?.length ?? 0,
  0,
  "staff, bot, and private chat artifacts should not create unmatched student speakers",
);
assert(
  publicProxyChatSession.resources.some((resource) => resource.url === "https://example.com/public-proxy-resource"),
  "chat-only proxy should still extract resource links",
);
assert(
  publicProxyChatSession.participationEvents.every((event) => !event.approved && event.reviewRequired && event.sourceLine),
  "chat-only participation signals should stay unapproved with source-line evidence",
);
assert(
  !publicProxyChatSession.participationEvents.some((event) => /hello|wifi|can you hear/i.test(event.text)),
  "greetings and technical-access chat lines should not become participation events",
);

const malformedRosterSession = createGeneratedSession({
  title: "Malformed roster and alias handling",
  template: "General classroom",
  transcript: `Maya iPad: I can summarize the activity.
May C Alt: I found a second way to explain it.
JL: The timeline should start with evidence.
Jordan Alt: I can revise the exit ticket tonight.`,
  notes: "",
  roster: `Name,Email,Aliases

Maya Chen,maya@classloop.test,Maya C; Maya iPad
Maya Chen,maya@classloop.test,Maya Duplicate
Maya Chen,maya.alt@classloop.test,May C Alt
Jordan Lee,jordan@classloop.test,JL
Jordan Lee,jordan.alt@classloop.test,Jordan Alt
,blank-name@classloop.test
Malformed row with no deliverable email
Teacher: Ms. Rivera`,
  resources: "",
});
const malformedEmails = malformedRosterSession.students.map((student) => student.email);
const malformedIds = malformedRosterSession.students.map((student) => student.id);
assertEqual(malformedRosterSession.students.length, 4, "malformed CSV rows should keep four valid unique-email students");
assertEqual(new Set(malformedEmails).size, 4, "duplicate email rows should merge instead of creating duplicate students");
assertEqual(new Set(malformedIds).size, 4, "duplicate student names should receive unique ids");
assert(
  malformedRosterSession.students.find((student) => student.email === "maya@classloop.test")?.aliases?.includes("Maya Duplicate") ?? false,
  "duplicate email rows should merge alternate aliases onto the kept student",
);
assertEqual(
  malformedRosterSession.unmatchedParticipants?.length ?? 0,
  0,
  "mixed roster aliases should match transcript speakers without creating unmatched warnings",
);
assert(
  malformedRosterSession.participationEvents.some(
    (event) => event.studentId === malformedRosterSession.students.find((student) => student.email === "jordan@classloop.test")?.id,
  ),
  "alias-only transcript speakers should still create participation events for the linked roster student",
);

const scratchStressSession = createGeneratedSession({
  title: "CS4ALL/Scratch Club Stress-Test Chaos",
  template: "CS workshop",
  transcript: scratchStressTranscript,
  notes: "Reconstructed from Monday Scratch Club notes with fake student identities.",
  roster: scratchStressRoster,
  resources: "",
});
const scratchUnmatchedNames = (scratchStressSession.unmatchedParticipants ?? []).map((participant) => participant.name);
const scratchStudentByEmail = new Map(scratchStressSession.students.map((student) => [student.email, student]));
assertEqual(scratchStressSession.students.length, 6, "Scratch stress roster should keep six valid students");
assertEqual(scratchStressSession.followUps.length, 6, "Scratch stress import should create follow-ups for every rostered student");
assertEqual(new Set(scratchStressSession.students.map((student) => student.email)).size, 6, "Scratch stress roster should merge duplicate emails");
assert(
  scratchStudentByEmail.get("mina@classloop.test")?.aliases?.includes("Mina duplicate alias") ?? false,
  "Scratch stress duplicate roster row should merge extra aliases",
);
assertEqual(scratchStressSession.attendance[scratchStudentByEmail.get("aarav@classloop.test")?.id ?? ""], "absent", "Aarav should be marked absent");
assertEqual(scratchStressSession.attendance[scratchStudentByEmail.get("leah@classloop.test")?.id ?? ""], "late", "Leah should be marked late");
assert(
  scratchStressSession.participationEvents.some(
    (event) => event.studentId === scratchStudentByEmail.get("nia@classloop.test")?.id && event.type === "quiet",
  ),
  "Scratch stress transcript should create a quiet support signal for Nia",
);
assert(
  scratchStressSession.participationEvents.some(
    (event) =>
      event.studentId === scratchStudentByEmail.get("nia@classloop.test")?.id &&
      event.type === "chat" &&
      event.text.includes("Scratch sensing blocks resource"),
  ),
  "Scratch stress resource links with query strings should stay chat events instead of becoming questions",
);
assert(
  scratchStressSession.participationEvents.some(
    (event) => event.studentId === scratchStudentByEmail.get("sam@classloop.test")?.id,
  ),
  "Scratch stress aliases should match chat speakers",
);
assert(
  scratchStressSession.actionItems.some((item) => /maze starter|reflection/i.test(`${item.title} ${item.description}`)),
  "Scratch stress homework should become a reviewable action item",
);
assert(
  scratchStressSession.resources.some(
    (resource) => resource.url === "https://scratch.mit.edu/projects/editor/?tutorial=getStarted",
  ),
  "Scratch stress import should preserve Scratch resource links",
);
assert(
  scratchStressSession.resources.some((resource) => resource.url === "https://example.com/scratch-bug.png"),
  "Scratch stress import should strip trailing punctuation from resource links",
);
["Practice goals", "Privacy reminder before recording", "Debug targets"].forEach((label) => {
  assert(!scratchUnmatchedNames.includes(label), `${label} should be ignored as metadata in the Scratch stress transcript`);
});
assert(scratchUnmatchedNames.includes("Unclear Guest"), "Scratch stress import should surface unknown observers for review");

const transcriptOnlySession = createGeneratedSession({
  title: "Transcript-only roster estimate",
  template: "General classroom",
  transcript: `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Student (Aaliyah Carter)>I can explain the first example.

Aaliyah Carter: Adding the duplicate display name should not create a second student.

Danny Reyes
4/28/2026, 10:01 AM
I can summarize the homework.

Speaker - Jalen Thompson: Is the worksheet due Thursday?
29: This count label should not become a student.
2s: Timer noise should not become a student.
-Class: Metadata label should not become a student.
Ms. Rivera: Teacher directions should not become an estimated student.`,
  notes: "",
  roster: "",
  resources: "",
});
const transcriptOnlyNames = transcriptOnlySession.students.map((student) => student.name);
assertEqual(transcriptOnlySession.status, "draft", "transcript-only mode should create a draft for teacher confirmation");
assertEqual(transcriptOnlySession.students.length, 3, "transcript-only mode should estimate three student speakers");
assert(transcriptOnlyNames.includes("Aaliyah Carter"), "transcript-only estimates should strip generic Zoom student labels");
assert(transcriptOnlyNames.includes("Danny Reyes"), "transcript-only estimates should support Teams-style speaker blocks");
assert(transcriptOnlyNames.includes("Jalen Thompson"), "transcript-only estimates should strip generic speaker prefixes");
assert(!transcriptOnlyNames.includes("Student (Aaliyah Carter)"), "transcript-only estimates should avoid duplicate generic labels");
assert(!transcriptOnlyNames.includes("Ms. Rivera"), "transcript-only estimates should exclude teacher-like speakers");
assert(!transcriptOnlyNames.includes("29"), "transcript-only estimates should ignore numeric labels");
assert(!transcriptOnlyNames.includes("2s"), "transcript-only estimates should ignore timer/status labels");
assert(!transcriptOnlyNames.includes("-Class"), "transcript-only estimates should ignore class metadata labels");
assert(
  transcriptOnlySession.students.every((student) => student.email === ""),
  "transcript-only estimated students should keep blank emails until imported or manually added",
);
assertEqual(transcriptOnlySession.followUps.length, 3, "transcript-only estimates should create reviewable follow-ups");
assertEqual(
  transcriptOnlySession.unmatchedParticipants?.length ?? 0,
  0,
  "transcript-only mode should not flag estimated speakers as unmatched before teacher confirmation",
);
assert(
  transcriptOnlySession.importWarnings?.some(
    (warning) => warning.id === "estimated-roster" && warning.severity === "blocking",
  ) ?? false,
  "transcript-only mode should block publish until the teacher confirms the estimated roster",
);
assert(
  transcriptOnlySession.importWarnings?.some((warning) => warning.id === "missing-student-emails") ?? false,
  "transcript-only mode should warn that student delivery is incomplete until emails are added",
);

const duplicateNameRosterSession = createGeneratedSession({
  title: "Duplicate student names need review",
  template: "General classroom",
  transcript: `Jordan Lee: I can summarize the graph.
Jordan Lee: I can also explain the second example.`,
  notes: "",
  roster: `Jordan Lee,jordan.one@classloop.test
Jordan Lee,jordan.two@classloop.test
Maya Chen,maya@classloop.test`,
  resources: "",
});
assert(
  duplicateNameRosterSession.importWarnings?.some(
    (warning) => warning.id === "duplicate-roster-names" && warning.severity === "blocking",
  ) ?? false,
  "duplicate roster names should create a blocking warning before transcript speakers are attached to multiple dashboards",
);

const emptyImportSession = createGeneratedSession({
  title: "No usable students yet",
  template: "Study group",
  transcript: "",
  notes: "",
  roster: "",
  resources: "",
});
assert(
  emptyImportSession.importWarnings?.some(
    (warning) => warning.id === "no-students-detected" && warning.severity === "blocking",
  ) ?? false,
  "empty imports should create a blocking warning instead of looking ready to publish",
);

const personalMeeting = createPersonalMeetingDraft({
  ownerEmail: "rushil@classloop.test",
  title: "",
  minutes: `Meeting title: Product sync
Date: 2026-05-27
Context: Reviewing individual meeting minutes mode.
Resources:
- https://example.com/spec
Questions:
- Should statuses stay simple?
Due dates:
- Send template copy link by Friday
Minutes:
- I need to send the template copy link by Friday.
- Review the dashboard polish next week.`,
});
assertEqual(personalMeeting.title, "Product sync", "personal meeting should read the template meeting title");
assertEqual(personalMeeting.date, "2026-05-27", "personal meeting should read the template date");
assertEqual(personalMeeting.resources.length, 1, "personal meeting should parse resource links");
assert(personalMeeting.questions.includes("Should statuses stay simple?"), "personal meeting should collect questions");
assert(
  personalMeeting.tasks.some((task) => task.status === "todo" && task.dueDateText.toLowerCase().includes("friday")),
  "personal meeting tasks should include editable status and due date text",
);

const meetingNotesMetadataSession = createGeneratedSession({
  title: "Meeting note metadata labels",
  template: "Club meeting",
  transcript: `Ms. Kim: Today we need owners for the elementary robotics outreach booth.
Priya Shah: I can own the demo script.
Leo Martinez: I can email the coordinator.`,
  notes: `Decision made: keep three short stations instead of one long demo.
Owners: Priya owns demo script; Leo owns coordinator email.
Next checkpoint: Monday materials list and script draft.`,
  roster: `Priya Shah, priya@classloop.test
Leo Martinez, leo@classloop.test`,
  resources: "",
});
const notesUnmatchedNames = (meetingNotesMetadataSession.unmatchedParticipants ?? []).map((participant) => participant.name);
assert(!notesUnmatchedNames.includes("Decision made"), "singular meeting-note metadata labels should not become unmatched speakers");
assert(!notesUnmatchedNames.includes("Owners"), "owners metadata labels should not become unmatched speakers");
assert(!notesUnmatchedNames.includes("Next checkpoint"), "checkpoint metadata labels should not become unmatched speakers");

const integrationMetadataSession = createGeneratedSession({
  title: "Classroom and Zoom import metadata labels",
  template: "CS workshop",
  transcript: `[00:00:57] Student (Priya Mehta): Is it like a set of steps to solve a problem?
[00:01:14] Student (Jalen Thompson): [Chat] TikTok algorithm lol`,
  notes: `Google Classroom course: CS4All Intro to Computational Thinking
Section/period: Period 4
Course code: CS4ALL-P4
Imported Classroom items are suggestions; teacher confirms what attaches to the recap.
Zoom cloud meeting: CS4All Intro to Computational Thinking (Apr 28, 2026). Raw Zoom transcript should be deleted after recap generation; structured recap, tasks, resources, participation, and follow-ups remain.`,
  roster: `Priya Mehta, priya@classloop.test
Jalen Thompson, jalen@classloop.test`,
  resources: "",
});
const normalizeLabelForTest = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const integrationUnmatchedNames = (integrationMetadataSession.unmatchedParticipants ?? []).map((participant) =>
  normalizeLabelForTest(participant.name),
);
[
  "Google Classroom course",
  "Section period",
  "Course code",
  "Zoom cloud meeting",
].forEach((label) => {
  assert(
    !integrationUnmatchedNames.includes(normalizeLabelForTest(label)),
    `${label} should be ignored as integration metadata instead of becoming an unmatched speaker`,
  );
});
assertEqual(
  integrationMetadataSession.unmatchedParticipants?.length ?? 0,
  0,
  "Classroom and Zoom import metadata should not create false unmatched speakers",
);

const complianceLabelSession = createGeneratedSession({
  title: "Compliance and support label noise",
  template: "General classroom",
  transcript: `Ms. Ortiz: Today we are reviewing the ecosystem claim.
Privacy reminder before recording: do not paste raw student data into support chats.
Support contact for pilot issues: use classloop.donotreply@gmail.com with redacted examples.
Data retention note: draft sessions should be exported before device replacement.
Maya Chen: I can connect the evidence to population changes.
Jordan Lee: The resource link helped me revise the claim: https://example.com/legal-baseline).`,
  notes: `Terms note: teacher must review generated follow-ups before publishing.
EULA note: desktop updates are manual install-over-replace for now.
Child-appropriate safety note: student views should show only approved follow-ups.`,
  roster: `Maya Chen, maya@classloop.test
Jordan Lee, jordan@classloop.test`,
  resources: "",
});
const complianceUnmatchedNames = (complianceLabelSession.unmatchedParticipants ?? []).map((participant) => participant.name);
[
  "Privacy reminder before recording",
  "Support contact for pilot issues",
  "Data retention note",
  "Terms note",
  "EULA note",
  "Child-appropriate safety note",
].forEach((label) => {
  assert(!complianceUnmatchedNames.includes(label), `${label} should be ignored as metadata instead of becoming a speaker`);
});
assertEqual(complianceLabelSession.students.length, 2, "compliance-label noise should not disturb roster parsing");
assertEqual(complianceLabelSession.unmatchedParticipants?.length ?? 0, 0, "compliance-label noise should not create false unmatched speakers");
assert(
  complianceLabelSession.resources.some((resource) => resource.url === "https://example.com/legal-baseline"),
  "compliance-label transcript URLs should be extracted with trailing punctuation stripped",
);

const badTranscriptFormatSession = createGeneratedSession({
  title: "Bad transcript format recovery",
  template: "Study group",
  transcript: `This export lost speaker labels.
The class reviewed proportional reasoning and the teacher assigned a short reflection due Friday.
Malformed links should not break parsing: not-a-url, www.example without protocol, https://example.com/reflection-guide.`,
  notes: "Maya needs a check-in; Jordan should redo one proportion.",
  roster: `Maya Chen, maya@classloop.test
Jordan Lee, jordan@classloop.test`,
  resources: `not a url
https://example.com/study-guide).`,
});
assertEqual(badTranscriptFormatSession.students.length, 2, "bad transcript format should still preserve roster students");
assertEqual(badTranscriptFormatSession.followUps.length, 2, "bad transcript format should still create follow-ups");
assertEqual(
  badTranscriptFormatSession.unmatchedParticipants?.length ?? 0,
  0,
  "bad transcript format without speaker labels should not create false unmatched speakers",
);
assert(
  badTranscriptFormatSession.actionItems.some((item) => /reflection|assigned/i.test(item.title + item.description)),
  "bad transcript format should still surface a reviewable action item",
);
assert(
  badTranscriptFormatSession.resources.some((resource) => resource.url === "https://example.com/study-guide"),
  "malformed resource punctuation should be stripped instead of breaking URL extraction",
);

const scaleStudentCount = 128;
const scaleStudents = Array.from({ length: scaleStudentCount }, (_, index) => {
  const number = `${index + 1}`.padStart(3, "0");
  return {
    name: `Nova Person ${number}`,
    email: `nova.person.${number}@classloop-scale.test`,
  };
});
const scaleRoster = [
  "Class roster export — Period 6",
  "Teacher: Ms. Alvarez",
  "Student Name, Email",
  ...scaleStudents.map((student) => `${student.name}, ${student.email}`),
  "Malformed row with no deliverable email",
  "Room 214 | Spring benchmark",
].join("\n");
const scaleTranscript = [
  "Large transcript export — 92 minutes",
  "Date: May 12, 2026",
  "Participants: Ms. Alvarez and 128 students",
  ...scaleStudents.flatMap((student, index) => {
    const minute = `${Math.floor(index / 2)}`.padStart(2, "0");
    const second = `${(index * 7) % 60}`.padStart(2, "0");
    const lines = [
      `[00:${minute}:${second}] ${student.name}: I think the evidence connects to claim ${index + 1} because the graph changes after the intervention.`,
    ];
    if (index % 8 === 0) {
      lines.push(`[00:${minute}:${(`${(Number(second) + 1) % 60}`.padStart(2, "0"))}] ${student.name}: Is the CER paragraph due Friday?`);
    }
    return lines;
  }),
  "[01:31:02] Unknown Guest: I am observing from the district team.",
  "[01:31:08] Ms. Alvarez: Homework for Friday: finish the CER revision and annotate one peer comment.",
  "[Chat] Nova Person 001: helpful rubric https://example.com/cer-rubric",
  "[Chat] Nova Person 064: data table https://example.com/data-table",
  "[Chat] Nova Person 128: model paragraph https://example.com/model-paragraph",
  "Transcript sync warning: 3 caption lines were dropped by the platform.",
].join("\n");

const scaleStartedAt = Date.now();
const scaleSession = createGeneratedSession({
  title: "Large CER Workshop Import",
  template: "General classroom",
  transcript: scaleTranscript,
  notes: "Partial platform export: a few caption lines were dropped, but the roster and most student turns are intact.",
  roster: scaleRoster,
  resources: "https://example.com/revision-checklist",
});
const scaleElapsedMs = Date.now() - scaleStartedAt;
assertEqual(scaleSession.students.length, scaleStudentCount, "large roster import should preserve all 128 valid students");
assertEqual(scaleSession.followUps.length, scaleStudentCount, "large roster import should create one follow-up per student");
assert(
  scaleSession.participationEvents.length >= scaleStudentCount,
  "large transcript import should create participation signals at realistic scale",
);
assert(scaleSession.resources.length >= 4, "large transcript import should preserve multiple explicit and chat resources");
assert(
  (scaleSession.unmatchedParticipants ?? []).some((participant) => participant.name === "Unknown Guest"),
  "partial transcript failures should surface unknown speakers without breaking the import",
);
assert(scaleElapsedMs < 5_000, `large transcript import should stay responsive enough for tests (${scaleElapsedMs}ms)`);

const repeatedScaleSessions = Array.from({ length: 3 }, (_, index) =>
  createGeneratedSession({
    title: `Repeated Large Import ${index + 1}`,
    template: index === 1 ? "CS workshop" : "General classroom",
    transcript: scaleTranscript,
    notes: index === 2 ? "Repeated import after teacher corrected roster formatting." : "",
    roster: scaleRoster,
    resources: "https://example.com/revision-checklist",
  }),
);
assertEqual(new Set(repeatedScaleSessions.map((item) => item.id)).size, 3, "repeated imports should receive unique session ids");
repeatedScaleSessions.forEach((repeatedSession, index) => {
  assertEqual(repeatedSession.students.length, scaleStudentCount, `repeated import ${index + 1} should preserve roster size`);
  assertEqual(repeatedSession.followUps.length, scaleStudentCount, `repeated import ${index + 1} should preserve follow-ups`);
  assert(repeatedSession.participationEvents.length >= scaleStudentCount, `repeated import ${index + 1} should preserve signals`);
});

const transcriptFile =
  typeof File === "function"
    ? new File([zoomTranscript], "cs4all-demo.vtt", { type: "text/vtt" })
    : { name: "cs4all-demo.vtt", text: async () => zoomTranscript };
const fileTranscript = await readTranscriptFileText(transcriptFile);
const fileSession = createGeneratedSession({
  title: "CS4All file upload path",
  template: "General classroom",
  transcript: fileTranscript,
  notes: "",
  roster: compressedRoster,
  resources: "",
});

assertEqual(fileTranscript, zoomTranscript, "transcript file text should load unchanged");
assertEqual(fileSession.students.length, 18, "file transcript path should preserve roster parsing");
assert(fileSession.participationEvents.length > 0, "file transcript path should generate participation events");
assertEqual(fileSession.resources.length, 2, "file transcript path should preserve resource extraction");

const whisperStructuredTranscript = createStructuredTranscriptFromText(
  `Unknown speaker: We should schedule a follow-up sync next week.
Rushil: I will send the product notes to teammate@classloop.test by Friday.`,
  {
    title: "Whisper recording transcript",
    source: "whisper_transcription",
    model: "whisper-1",
    durationSeconds: 124,
  },
);
const whisperSession = createGeneratedSession({
  title: "Whisper class recording",
  template: "General classroom",
  transcript: whisperStructuredTranscript.text,
  notes: "",
  roster: "Rushil Agrawal, rushil@classloop.test",
  resources: "",
  transcriptSource: "whisper_transcription",
  structuredTranscript: whisperStructuredTranscript,
});
assertEqual(whisperSession.structuredTranscript?.source, "whisper_transcription", "class sessions should preserve Whisper transcript source");
assertEqual(whisperSession.structuredTranscript?.model, "whisper-1", "class sessions should preserve Whisper model metadata");
assert(
  whisperSession.structuredTranscript?.segments.some((segment) => segment.speaker === "Rushil") ?? false,
  "class sessions should keep cleaned speaker labels for the transcript panel",
);

const personalStructuredTranscript = createStructuredTranscriptFromText(
  `Rushil: We need a next planning call with teammate@classloop.test.
Alex: Please create the docs summary and send the follow-up email after review.`,
  {
    title: "Individual meeting transcript",
    source: "screen_recording",
    model: "whisper-1",
  },
);
const personalWhisperMeeting = createPersonalMeetingDraft({
  ownerEmail: "individual@classloop.test",
  title: "Individual launch sync",
  minutes: personalStructuredTranscript.text,
  structuredTranscript: personalStructuredTranscript,
});
assertEqual(personalWhisperMeeting.structuredTranscript?.source, "screen_recording", "individual meetings should preserve recording transcript source");
assert(personalWhisperMeeting.nextMeeting?.title.includes("Individual launch sync") ?? false, "individual meetings should suggest a next meeting");
assert(personalWhisperMeeting.docsSummary?.body.includes("## Transcript Highlights") ?? false, "individual meetings should create a Docs-ready summary");
assert(
  personalWhisperMeeting.emailDraft?.recipients.includes("teammate@classloop.test") ?? false,
  "individual email drafts should extract recipients but still wait for UI permission",
);

const liveCaptureRoster = "Maya Chen, maya@classloop.test\nAarav Patel, aarav@classloop.test";

const noisyInPersonCaptureSession = createGeneratedSession({
  title: "Noisy In-Person Capture",
  template: "Math review",
  captureMode: "in_person",
  captureSourceLabel: "In-person class capture",
  captureDurationSeconds: 74,
  transcriptSource: "live_transcription",
  transcript: [
    "Unknown in-person voice 1: um uh like the ratio is maybe six over x and audio unclear near the projector.",
    "Maya Chen: Is the similar triangles practice due Friday?",
    "Aarav Patel: I can explain the scale factor if the room is quiet.",
    "Unknown in-person voice 2: [inaudible] homework problem seven maybe okay so yeah.",
  ].join("\n"),
  notes: "Noisy room. Teacher will review unknown speaker segments before publishing.",
  roster: liveCaptureRoster,
  resources: "https://example.com/noisy-capture-review",
});
assertEqual(noisyInPersonCaptureSession.capture?.mode, "in_person", "in-person capture should preserve capture mode");
assertEqual(noisyInPersonCaptureSession.capture?.transcriptSource, "live_transcription", "in-person capture should mark live transcript source");
assertEqual(noisyInPersonCaptureSession.capture?.durationSeconds, 74, "in-person capture should preserve duration for review context");
assert(
  noisyInPersonCaptureSession.importWarnings?.some((warning) => warning.id === "noisy-asr" && warning.severity === "blocking") ?? false,
  "noisy in-person live capture should require teacher review before publishing",
);
assert(
  (noisyInPersonCaptureSession.unmatchedParticipants ?? []).some((participant) =>
    /Unknown in-person voice/i.test(participant.name),
  ),
  "unknown in-person live capture segments should stay unmatched until the teacher links them",
);
assert(
  noisyInPersonCaptureSession.participationEvents.every((event) => event.approved === false || event.reviewRequired),
  "noisy live-capture participation should not auto-approve student-specific signals",
);

const transcriptOnlyNoiseLabelsSession = createGeneratedSession({
  title: "Transcript-only noisy labels",
  template: "General classroom",
  transcript: [
    "29: screen share timer started before class.",
    "-Class: worksheet copied into the chat.",
    "2s: short audio artifact from the transcript export.",
    "Student (Maya Chen): I can explain the first step.",
  ].join("\n"),
  notes: "",
  roster: "",
  resources: "",
});
const estimatedNames = transcriptOnlyNoiseLabelsSession.students.map((student) => student.name);
assert(
  estimatedNames.includes("Maya Chen"),
  "transcript-only mode should still estimate real student speakers",
);
assert(
  !estimatedNames.includes("29") && !estimatedNames.includes("-Class") && !estimatedNames.includes("2s"),
  "numeric, class metadata, and timer-like transcript labels should not become students",
);

const onlineMeetingCaptureSession = createGeneratedSession({
  title: "Online Meeting Capture Missing Audio",
  template: "Study group",
  captureMode: "online_meeting",
  captureSourceLabel: "Online meeting capture",
  captureDurationSeconds: 53,
  transcriptSource: "audio_recording",
  transcript: "",
  notes:
    "Online meeting capture ran without a shared meeting-audio track. Teacher pasted no platform transcript yet and should add notes before publishing.",
  roster: liveCaptureRoster,
  resources: "",
});
assertEqual(onlineMeetingCaptureSession.capture?.mode, "online_meeting", "online meeting capture should preserve capture mode");
assertEqual(
  onlineMeetingCaptureSession.capture?.transcriptSource,
  "audio_recording",
  "online meeting capture without live text should fall back to audio recording source",
);
assertEqual(onlineMeetingCaptureSession.followUps.length, 2, "online meeting audio fallback should still create reviewable follow-ups");
assert(
  onlineMeetingCaptureSession.recap.length > 0 && onlineMeetingCaptureSession.actionItems.length > 0,
  "online meeting audio fallback should produce a teacher-reviewable draft instead of crashing",
);
