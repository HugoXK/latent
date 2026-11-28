import test from "node:test";
import assert from "node:assert/strict";
import { answerConstraint, createConstraintState } from "../src/index.js";
import { observationsFromOutcomes, questionPriors } from "../src/priors.js";
import type { ConstraintState, QuestionDefinition } from "../src/index.js";
import type { PriorObservation, PriorOutcome } from "../src/priors.js";

const NOW = "2026-11-27T00:00:00.000Z";

const questions: QuestionDefinition[] = [
  {
    id: "q.a",
    variable: "a",
    prompt: "A?",
    blocking: true,
    options: [
      { value: 1, label: "one" },
      { value: 2, label: "two" },
      { value: 3, label: "three" },
    ],
  },
  {
    id: "q.free",
    variable: "free",
    prompt: "Free?",
    kind: "text",
    options: [],
  },
];

function observation(value: unknown): PriorObservation {
  return { question_id: "q.a", variable: "a", value, success: true };
}

test("a sparse question keeps a uniform prior", () => {
  const priors = questionPriors(questions, [
    observation(1),
    observation(1),
  ]);
  const q = priors[0];
  assert.ok(q);
  assert.equal(q.sample_count, 2);
  assert.equal(q.source, "uniform");
  for (const option of q.options) {
    assert.ok(Math.abs(option.prior - 1 / 3) < 1e-12);
  }
});

test("priors change only when the evidence threshold is reached", () => {
  const four = questionPriors(questions, [
    observation(1),
    observation(1),
    observation(1),
    observation(1),
  ])[0];
  assert.ok(four);
  assert.equal(four.source, "uniform");

  const five = questionPriors(questions, [
    observation(1),
    observation(1),
    observation(1),
    observation(2),
    observation(2),
  ])[0];
  assert.ok(five);
  assert.equal(five.source, "empirical");
  assert.equal(five.sample_count, 5);
  assert.ok(Math.abs((five.options[0]?.prior ?? 0) - 4 / 8) < 1e-12);
  assert.ok(Math.abs((five.options[1]?.prior ?? 0) - 3 / 8) < 1e-12);
  assert.ok(Math.abs((five.options[2]?.prior ?? 0) - 1 / 8) < 1e-12);
  assert.equal(five.options[0]?.samples, 3);
  assert.equal(five.options[1]?.samples, 2);
  assert.equal(five.options[2]?.samples, 0);
});

test("an unmatched value is not evidence for a declared option", () => {
  const priors = questionPriors(questions, [
    observation(9),
    observation(9),
    observation(9),
    observation(9),
    observation(9),
  ])[0];
  assert.ok(priors);
  assert.equal(priors.sample_count, 0);
  assert.equal(priors.source, "uniform");
});

test("a text question stays uniform and has no option distribution", () => {
  const priors = questionPriors(questions, []);
  const free = priors[1];
  assert.ok(free);
  assert.equal(free.source, "uniform");
  assert.deepEqual(free.options, []);
});

test("observations come only from ideas with an outcome and a state", () => {
  const state = createConstraintState("test", questions, NOW);
  const answeredA = answerConstraint(state, questions, "a", 1, 1, NOW);
  const answeredB = answerConstraint(state, questions, "a", 2, 1, NOW);

  const outcome = (
    id: string,
    ideaId: string,
    success: boolean,
  ): PriorOutcome => ({ idea_id: ideaId, realised_success: success });

  const states = new Map<string, ConstraintState>([
    ["idea_a", answeredA],
    ["idea_b", answeredB],
  ]);
  const observations = observationsFromOutcomes(
    [
      outcome("outcome_aaaa0001", "idea_a", true),
      outcome("outcome_aaaa0002", "idea_b", false),
      outcome("outcome_aaaa0003", "idea_without_state", true),
    ],
    states,
    questions,
  );

  assert.deepEqual(
    observations.map((item) => `${item.question_id}:${item.value}:${item.success}`),
    ["q.a:1:true", "q.a:2:false"],
  );
});

test("option values are keyed by type so null and NaN cannot merge", () => {
  const question: QuestionDefinition = {
    id: "q.edge",
    variable: "edge",
    prompt: "Edge?",
    blocking: true,
    options: [
      { value: null, label: "null" },
      { value: Number.NaN, label: "nan" },
    ],
  };
  const edge = (value: unknown): PriorObservation => ({
    question_id: "q.edge",
    variable: "edge",
    value,
    success: true,
  });
  const priors = questionPriors(
    [question],
    [edge(null), edge(null), edge(null), edge(null), edge(null)],
  )[0];
  assert.ok(priors);
  assert.equal(priors.source, "empirical");
  assert.equal(priors.options[0]?.samples, 5);
  assert.equal(priors.options[1]?.samples, 0);
});

test("a prototype-named variable is not an observation", () => {
  const question: QuestionDefinition = {
    id: "q.proto",
    variable: "__proto__",
    prompt: "Proto?",
    blocking: true,
    options: [],
  };
  const state = createConstraintState("test", questions, NOW);
  const outcome: PriorOutcome = {
    idea_id: "idea_proto",
    realised_success: true,
  };
  const observations = observationsFromOutcomes(
    [outcome],
    new Map([["idea_proto", state]]),
    [question],
  );
  assert.deepEqual(observations, []);
});

test("a different object key order does not split samples", () => {
  const question: QuestionDefinition = {
    id: "q.order",
    variable: "order",
    prompt: "Order?",
    blocking: true,
    options: [{ value: { a: 1, b: 2 }, label: "both" }],
  };
  const observation = (): PriorObservation => ({
    question_id: "q.order",
    variable: "order",
    value: { b: 2, a: 1 },
    success: true,
  });
  const priors = questionPriors(
    [question],
    [observation(), observation(), observation(), observation(), observation()],
  )[0];
  assert.ok(priors);
  assert.equal(priors.source, "empirical");
  assert.equal(priors.options[0]?.samples, 5);
});

test("undefined and the string undefined are distinct option values", () => {
  const question: QuestionDefinition = {
    id: "q.undef",
    variable: "undef",
    prompt: "Undef?",
    blocking: true,
    options: [
      { value: undefined, label: "undefined" },
      { value: "undefined", label: "string" },
    ],
  };
  const observation = (): PriorObservation => ({
    question_id: "q.undef",
    variable: "undef",
    value: undefined,
    success: true,
  });
  const priors = questionPriors(
    [question],
    [observation(), observation(), observation(), observation(), observation()],
  )[0];
  assert.ok(priors);
  assert.equal(priors.options[0]?.samples, 5);
  assert.equal(priors.options[1]?.samples, 0);
});
