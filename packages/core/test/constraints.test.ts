import test from "node:test";
import assert from "node:assert/strict";
import {
  ConstraintAnswerError,
  answerConstraint,
  blockingQuestions,
  createConstraintState,
  entropy,
  isReadyForVerification,
  nextQuestion,
  questionInformationGain,
  setConstraintVariable,
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
    state = answerConstraint(state, questions, q.variable, q.options[0]?.value ?? "x");
  }
  assert.equal(nextQuestion(state, questions), null);
});

test("a text answer is accepted and a non-string is rejected", () => {
  const text: QuestionDefinition = {
    id: "q.text",
    variable: "candidate.a",
    prompt: "Candidate?",
    options: [],
    kind: "text",
  };
  let state = createConstraintState("test", [text]);
  state = answerConstraint(state, [text], "candidate.a", "soil biosensor");
  assert.equal(state.variables["candidate.a"]?.value, "soil biosensor");
  assert.throws(
    () => answerConstraint(state, [text], "candidate.a", 42),
    ConstraintAnswerError,
  );
});

test("a multi answer accepts option values and rejects an unknown one", () => {
  const multi: QuestionDefinition = {
    id: "q.equip",
    variable: "lab.equipment",
    prompt: "Equipment?",
    kind: "multi",
    options: [
      { value: "plate", label: "Plate" },
      { value: "hplc", label: "HPLC" },
    ],
  };
  let state = createConstraintState("test", [multi]);
  state = answerConstraint(state, [multi], "lab.equipment", ["plate", "hplc"]);
  assert.deepEqual(state.variables["lab.equipment"]?.value, ["plate", "hplc"]);
  assert.throws(
    () => answerConstraint(state, [multi], "lab.equipment", ["ms"]),
    ConstraintAnswerError,
  );
  assert.throws(
    () => answerConstraint(state, [multi], "lab.equipment", []),
    ConstraintAnswerError,
  );
});

test("allowOther accepts a custom string only when enabled", () => {
  const other: QuestionDefinition = {
    id: "q.other",
    variable: "problem.who",
    prompt: "Who?",
    allowOther: true,
    options: [{ value: "patients", label: "Patients" }],
  };
  const strict: QuestionDefinition = {
    ...other,
    id: "q.strict",
    variable: "problem.strict",
    allowOther: false,
  };
  let state = createConstraintState("test", [other, strict]);
  state = answerConstraint(state, [other, strict], "problem.who", "a local clinic");
  assert.equal(state.variables["problem.who"]?.value, "a local clinic");
  assert.throws(
    () => answerConstraint(state, [other, strict], "problem.strict", "a local clinic"),
    ConstraintAnswerError,
  );
});

test("a conditional question is skipped until its dependency is met", () => {
  const conditional: QuestionDefinition[] = [
    {
      id: "q.bsl",
      variable: "lab.bsl",
      prompt: "BSL?",
      blocking: true,
      options: [
        { value: 1, label: "1" },
        { value: 2, label: "2" },
      ],
    },
    {
      id: "q.flow",
      variable: "lab.flow_model",
      prompt: "Flow model?",
      blocking: true,
      dependsOn: [{ variable: "lab.bsl", equals: 2 }],
      options: [{ value: "reporter", label: "Reporter" }],
    },
  ];
  let state = createConstraintState("test", conditional);
  assert.deepEqual(state.blocking_unknowns, ["lab.bsl"]);
  assert.equal(
    blockingQuestions(state, conditional).some(
      (question) => question.variable === "lab.flow_model",
    ),
    false,
  );
  state = answerConstraint(state, conditional, "lab.bsl", 2);
  assert.deepEqual(state.blocking_unknowns, ["lab.flow_model"]);
  assert.equal(
    blockingQuestions(state, conditional).some(
      (question) => question.variable === "lab.flow_model",
    ),
    true,
  );
});

test("prototype-dangerous variable names are rejected", () => {
  const state = createConstraintState("igem", questions);
  for (const name of [
    "__proto__",
    "constructor",
    "prototype",
    "lab.__proto__",
    "lab.constructor",
    "Constructor",
  ]) {
    assert.throws(
      () => setConstraintVariable(state, name, 1),
      (error: unknown) =>
        error instanceof ConstraintAnswerError &&
        error.code === "INVALID_CONSTRAINT_ANSWER",
      `expected ${name} to be rejected`,
    );
  }
  assert.equal(Object.getPrototypeOf(state.variables), Object.prototype);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("variable names outside the documented shape are rejected", () => {
  const state = createConstraintState("igem", questions);
  for (const name of [
    "",
    ".",
    "lab..bsl",
    ".lab",
    "lab.",
    "lab bsl",
    "lab/bsl",
    "__x",
    "lab.__cache",
  ]) {
    assert.throws(
      () => setConstraintVariable(state, name, 1),
      (error: unknown) => error instanceof ConstraintAnswerError,
      `expected ${JSON.stringify(name)} to be rejected`,
    );
  }
  assert.throws(
    () => answerConstraint(state, questions, "__proto__", 1),
    (error: unknown) => error instanceof ConstraintAnswerError,
  );
});
