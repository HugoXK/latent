import test from "node:test";
import assert from "node:assert/strict";
import {
  answerConstraint,
  createConstraintState,
  diffConstraintStates,
  undoConstraint,
} from "../src/index.js";
import type { QuestionDefinition } from "../src/index.js";

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
    ],
  },
  {
    id: "q.b",
    variable: "b",
    prompt: "B?",
    blocking: true,
    options: [
      { value: "x", label: "x" },
      { value: "y", label: "y" },
    ],
  },
];

test("undo restores the previous values as a new version", () => {
  const initial = createConstraintState("test", questions, NOW);
  assert.deepEqual(initial.blocking_unknowns, ["a", "b"]);

  const answered = answerConstraint(initial, questions, "a", 1, 1, NOW);
  assert.equal(answered.version, initial.version + 1);
  assert.deepEqual(answered.blocking_unknowns, ["b"]);

  const restored = undoConstraint(answered, initial, questions, NOW);
  assert.equal(restored.version, answered.version + 1);
  assert.equal(restored.variables["a"], undefined);
  assert.deepEqual(restored.blocking_unknowns, ["a", "b"]);
});

test("diff reports only the variables that changed", () => {
  const initial = createConstraintState("test", questions, NOW);
  const answered = answerConstraint(initial, questions, "a", 1, 1, NOW);

  assert.deepEqual(diffConstraintStates(initial, answered), [
    { variable: "a", before: null, after: 1 },
  ]);

  const changed = answerConstraint(answered, questions, "a", 2, 1, NOW);
  assert.deepEqual(diffConstraintStates(answered, changed), [
    { variable: "a", before: 1, after: 2 },
  ]);

  assert.deepEqual(diffConstraintStates(answered, answered), []);
});
