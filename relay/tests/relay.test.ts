import assert from "node:assert/strict";
import { createRelayDraft, dueDateTextFromLine, relayTemplate, sampleRelayInput } from "../src/relay.js";

function test(name: string, run: () => void) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("turns pasted personal meeting notes into recap, tasks, resources, and questions", () => {
  const draft = createRelayDraft(sampleRelayInput);

  assert.equal(draft.title, "Hackathon planning sync");
  assert.equal(draft.date, "2026-05-27");
  assert.match(draft.recap, /personal meeting minutes/);
  assert.equal(draft.resources.length, 2);
  assert.equal(draft.resources[0].type, "doc");
  assert.ok(draft.questions.includes("What should be shown in the first 30 seconds?"));
  assert.ok(draft.tasks.some((task) => task.title.includes("90-second demo script")));
  assert.ok(draft.tasks.some((task) => task.dueDateText.toLowerCase().includes("friday")));
});

test("uses due date lines as tasks when action language is sparse", () => {
  const draft = createRelayDraft({
    title: "One-on-one notes",
    date: "2026-05-27",
    context: "A short check-in about portfolio work.",
    resources: "",
    questions: "",
    dueDates: "Portfolio polish by tomorrow\nSend reflection before Friday",
    minutes: "We discussed project priorities and clarified what success looks like.",
  });

  assert.equal(draft.tasks.length, 2);
  assert.deepEqual(
    {
      title: draft.tasks[0].title,
      status: draft.tasks[0].status,
      dueDateText: draft.tasks[0].dueDateText,
    },
    {
      title: "Portfolio polish",
      status: "todo",
      dueDateText: "tomorrow",
    },
  );
});

test("keeps the standalone template focused on personal meeting fields", () => {
  assert.match(relayTemplate, /Meeting title:/);
  assert.match(relayTemplate, /Date:/);
  assert.match(relayTemplate, /Context:/);
  assert.match(relayTemplate, /Resources:/);
  assert.match(relayTemplate, /Questions:/);
  assert.match(relayTemplate, /Due dates:/);
  assert.doesNotMatch(relayTemplate, /classroom|teacher|student|legacy app/i);
});

test("extracts simple due date text from action lines", () => {
  assert.equal(dueDateTextFromLine("Send the recap by Friday at 5 PM"), "Friday at 5 PM");
  assert.equal(dueDateTextFromLine("Review the notes tomorrow"), "tomorrow");
});
