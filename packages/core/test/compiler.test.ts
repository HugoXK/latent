import test from "node:test";
import assert from "node:assert/strict";
import {
  BriefValidationError,
  compileBrief,
  renderBriefMarkdown,
} from "../src/index.js";
import type { Claim, Gate, Idea } from "../src/index.js";

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea_test0001",
    version: 3,
    title: "soil biosensor",
    one_liner: "A soil microbial biosensor for field heavy-metal detection.",
    status: "viable",
    hypotheses: [
      {
        id: "hyp_1",
        variant: "conservative",
        statement: "Use a characterised whole-cell reporter.",
        confidence: 0.4,
        confidence_basis: "B",
      },
    ],
    assumptions: [
      { id: "asm_1", statement: "readout", status: "confirmed", risk: "high" },
    ],
    claims: ["clm_1"],
    open_questions: [
      {
        id: "q_1",
        question: "What is the one measurable number?",
        expected_information_gain: 0.7,
        answered: false,
      },
    ],
    ...overrides,
  };
}

function gate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: "gate_test0001",
    name: "measurable readout",
    status: "pass",
    criteria: "dose response",
    falsifier: "no response",
    fallback: "change_readout",
    hard: true,
    decided_by: "human",
    ...overrides,
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_1",
    text: "The host and readout are not yet confirmed.",
    status: "unknown",
    confidence: 0.2,
    confidence_basis: "C",
    sources: [],
    ...overrides,
  };
}

test("a valid idea compiles to a brief with explicit unknowns", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(brief.idea_id, "idea_test0001");
  assert.ok(brief.unknowns.length > 0);
  assert.equal(brief.validators.length, 4);
  const status = Object.fromEntries(
    brief.validators.map((v) => [v.name, v.status]),
  );
  assert.equal(status.citation, "pass");
  assert.equal(status.numeric, "pass");
  assert.equal(status.existence, "skipped");
  assert.equal(status.vertical_rules, "skipped");
  assert.ok(renderBriefMarkdown(brief).includes("## Still unknown"));
});

test("a supplied validator result overrides skipped", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    validators: {
      existence: { name: "existence", status: "pass", detail: "registry" },
    },
  });
  assert.equal(
    brief.validators.find((v) => v.name === "existence")?.status,
    "pass",
  );
});

test("a blocking gate blocks compilation", () => {
  assert.throws(
    () =>
      compileBrief({
        idea: idea(),
        claims: [claim()],
        gates: [gate({ status: "unknown" })],
      }),
    (e: unknown) =>
      e instanceof BriefValidationError &&
      e.issues.some((i) => i.startsWith("BLOCKING_GATES")),
  );
});

test("an unsupported claim blocks compilation", () => {
  assert.throws(
    () =>
      compileBrief({
        idea: idea(),
        claims: [claim({ status: "unsupported" })],
        gates: [gate()],
      }),
    (e: unknown) =>
      e instanceof BriefValidationError &&
      e.issues.some((i) => i.startsWith("UNSUPPORTED_CLAIMS")),
  );
});

test("an open high-risk assumption blocks compilation", () => {
  assert.throws(
    () =>
      compileBrief({
        idea: idea({
          assumptions: [
            { id: "asm_1", statement: "readout", status: "unconfirmed", risk: "high" },
          ],
        }),
        claims: [claim()],
        gates: [gate()],
      }),
    (e: unknown) =>
      e instanceof BriefValidationError &&
      e.issues.some((i) => i.startsWith("BLOCKING_ASSUMPTIONS")),
  );
});

test("collisions are compiled into the brief", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    collisions: [
      {
        kind: "interface",
        prior_id: "pa_x",
        prior_label: "Prior project",
        severity: "medium",
        note: "mechanism collides; the interface differs",
      },
    ],
  });
  assert.equal(brief.collisions?.length, 1);
  assert.match(renderBriefMarkdown(brief), /Novelty and collisions/);
});
