import test from "node:test";
import assert from "node:assert/strict";
import {
  answerConstraint,
  blockingQuestions,
  createConstraintState,
  entropy,
  isReadyForVerification,
  nextQuestion,
  questionInformationGain,
} from "../src/index.js";
import type { QuestionDefinition } from "../src/index.js";

const questions: QuestionDefinition[] = [
  {
    id: "q.bsl",
    variable: "lab.bsl",
    prompt: "BSL?",
    blocking: true,
    options: [
      { value: 1, label: "BSL-1", prior: 0.5 },
      { value: 2, label: "BSL-2", prior: 0.3 },
      { value: "unknown", label: "Not sure", prior: 0.2 },
    ],
  },
  {
    id: "q.reader",
    variable: "lab.readers",
    prompt: "Reader?",
    blocking: true,
    options: [
      { value: "plate", label: "Plate reader" },
      { value: "none", label: "None" },
    ],
  },
  {
    id: "q.weeks",
    variable: "time.summer_weeks",
    prompt: "Weeks?",
    options: [
      { value: 2, label: "2" },
      { value: 4, label: "4" },
      { value: 6, label: "6" },
      { value: 10, label: "10" },
    ],
  },
];

test("entropy is 2 bits for four equally likely options", () => {
  assert.equal(entropy([1, 1, 1, 1]), 2);
  assert.equal(entropy([1, 0, 0, 0]), 0);
});

test("blocking questions are asked first", () => {
  const state = createConstraintState("test", questions);
  const next = nextQuestion(state, questions);
  assert.equal(next?.variable, "lab.bsl");
  assert.equal(next?.blocking, true);
});

test("a blocking question loses priority once answered", () => {
  let state = createConstraintState("test", questions);
  state = answerConstraint(state, questions, "lab.bsl", 1);
  assert.equal(nextQuestion(state, questions)?.variable, "lab.readers");
});

test("answering removes the unknown and updates blocking", () => {
  let state = createConstraintState("test", questions, "t0");
  assert.equal(state.unknowns.length, 3);
  assert.equal(state.blocking_unknowns.length, 2);

  state = answerConstraint(state, questions, "lab.bsl", 1, 1, "t1");
  assert.ok(!state.unknowns.includes("lab.bsl"));
  assert.deepEqual(state.blocking_unknowns, ["lab.readers"]);
  assert.equal(state.variables["lab.bsl"]?.value, 1);
  assert.equal(state.variables["lab.bsl"]?.source, "user");

  state = answerConstraint(state, questions, "lab.readers", "plate", 1, "t2");
  assert.deepEqual(blockingQuestions(state, questions), []);
  assert.equal(isReadyForVerification(state, questions), true);
});

test("a free-text question has information gain and no options", () => {
  const freeText: QuestionDefinition = {
    id: "q.why",
    variable: "problem.why",
    prompt: "Why now?",
    options: [],
    freeText: true,
  };
  const state = createConstraintState("test", [freeText]);
  assert.ok(questionInformationGain(freeText, state) > 0);
  assert.equal(nextQuestion(state, [freeText])?.id, "q.why");
});

test("nextQuestion returns null when everything is answered", () => {
  let state = createConstraintState("test", questions);
  for (const q of questions) {
    state = answerConstraint(state, questions, q.variable, "x");
  }
  assert.equal(nextQuestion(state, questions), null);
});
