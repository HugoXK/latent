import test from "node:test";
import assert from "node:assert/strict";
import { assertValidPack, validateVerticalPack } from "@latent/core";
import { research } from "../src/index.js";

test("the research pack validates and covers the second vertical", () => {
  assert.deepEqual(validateVerticalPack(research), []);
  assert.doesNotThrow(() => assertValidPack(research));
  assert.equal(research.id, "research");
  assert.ok(research.rules);
  assert.ok(research.gates.some((gate) => gate.key === "data"));
  assert.ok(
    research.questions.some(
      (question) => question.variable === "success.metric" && question.blocking,
    ),
  );
});
