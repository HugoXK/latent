import test from "node:test";
import assert from "node:assert/strict";
import {
  answerConstraint,
  createConstraintState,
  createOutcome,
  observationsFromOutcomes,
  questionPriors,
} from "../src/index.js";
import type {
  ConstraintState,
  Outcome,
  PriorObservation,
  QuestionDefinition,
} from "../src/index.js";

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

  const outcome = (id: string, ideaId: string, success: boolean): Outcome =>
    createOutcome(
      {
        id,
        idea_id: ideaId,
        idea_version: 1,
        owner_id: "local",
        decision: success ? "tested" : "failed",
        realised_success: success,
        predicted_confidence: 0.5,
        decided_by: "human",
      },
      NOW,
    );

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
