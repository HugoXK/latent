import test from "node:test";
import assert from "node:assert/strict";
import {
  SpecValidationError,
  compileSpec,
  renderSpecMarkdown,
} from "../src/index.js";
import type { Claim, Gate, Idea } from "../src/index.js";

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea_spec0001",
    version: 2,
    title: "spec idea",
    one_liner: "A spec one-liner.",
    status: "viable",
    hypotheses: [
      {
        id: "hyp_1",
        variant: "conservative",
        statement: "s",
        confidence: 0.4,
        confidence_basis: "C",
      },
    ],
    assumptions: [
      { id: "asm_1", statement: "readout", status: "confirmed", risk: "high" },
    ],
    claims: ["clm_1"],
    open_questions: [
      {
        id: "q_1",
        question: "What is the number?",
        expected_information_gain: 0.7,
        answered: false,
      },
    ],
    ...overrides,
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_1",
    text: "host is unknown",
    status: "unknown",
    confidence: 0.2,
    confidence_basis: "C",
    sources: [],
    ...overrides,
  };
}

function gate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: "gate_1",
    name: "readout",
    status: "pass",
    criteria: "dose response",
    falsifier: "no response",
    fallback: "change_readout",
    hard: true,
    decided_by: "human",
    ...overrides,
  };
}

test("a valid idea compiles to an implementation-facing spec", () => {
  const spec = compileSpec({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    interfaces: [
      {
        name: "detect",
        contract: "sample -> result",
        inputs: ["sample"],
        outputs: ["result"],
      },
    ],
    data_contracts: [{ name: "sample", schema: "Sample v1" }],
    milestones: [{ name: "pilot", weeks: 3, exit_criteria: "signal" }],
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(spec.tests.length, 1);
  assert.ok(spec.unknowns.length > 0);
  const markdown = renderSpecMarkdown(spec);
  assert.match(markdown, /## Tests/);
  assert.match(markdown, /## Interfaces/);
  assert.match(markdown, /## Still unknown/);
});

test("an unsupported claim blocks the spec", () => {
  assert.throws(
    () =>
      compileSpec({
        idea: idea(),
        claims: [claim({ status: "unsupported" })],
        gates: [gate()],
      }),
    (error: unknown) =>
      error instanceof SpecValidationError &&
      error.issues.some((issue) => issue.startsWith("UNSUPPORTED_CLAIMS")),
  );
});

test("an unknown hard gate blocks the spec", () => {
  assert.throws(
    () =>
      compileSpec({
        idea: idea(),
        claims: [claim()],
        gates: [gate({ status: "unknown" })],
      }),
    (error: unknown) =>
      error instanceof SpecValidationError &&
      error.issues.some((issue) => issue.startsWith("BLOCKING_GATES")),
  );
});

test("an open high-risk assumption blocks the spec", () => {
  assert.throws(
    () =>
      compileSpec({
        idea: idea({
          assumptions: [
            { id: "asm_1", statement: "readout", status: "unconfirmed", risk: "high" },
          ],
        }),
        claims: [claim()],
        gates: [gate()],
      }),
    (error: unknown) =>
      error instanceof SpecValidationError &&
      error.issues.some((issue) => issue.startsWith("BLOCKING_ASSUMPTIONS")),
  );
});
