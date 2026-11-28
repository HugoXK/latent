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

test("collision cells escape a backslash before a pipe", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    collisions: [
      {
        kind: "interface",
        prior_id: "pa_escape",
        prior_label: "c\\|d",
        severity: "medium",
        note: "a\\|b",
        claim_ids: ["clm_1"],
        source_url: "https://example.org/a\\|b",
      },
    ],
  });
  const markdown = renderBriefMarkdown(brief);
  const row = markdown
    .split("\n")
    .find((line) => line.startsWith("| interface |"));
  assert.ok(row, markdown);
  assert.ok(
    row.includes("a\\\\\\|b"),
    `the note must stay in its cell: ${row}`,
  );
  assert.ok(
    row.includes("https://example.org/a\\\\\\|b"),
    `the source must stay in its cell: ${row}`,
  );
});

test("collision cells collapse raw newlines and carriage returns", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    collisions: [
      {
        kind: "mechanism",
        prior_id: "pa_newline",
        prior_label: "prior\nlabel",
        severity: "high",
        note: "first line\nsecond line\rthird",
      },
    ],
  });
  const markdown = renderBriefMarkdown(brief);
  const row = markdown
    .split("\n")
    .find((line) => line.startsWith("| mechanism |"));
  assert.ok(row, markdown);
  assert.ok(
    row.includes("first line second line third"),
    `a raw newline must not break the row: ${row}`,
  );
  assert.equal(row.includes("\r"), false);
});

test("a brief without a collision check says so", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
  });
  assert.equal(brief.collision_check?.status, "not_checked");
  const markdown = renderBriefMarkdown(brief);
  assert.match(markdown, /Status: \*\*not_checked\*\*/);
  assert.match(markdown, /not a clean result/);
});

test("an explicit collision list is checked, including an empty one", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    collisions: [],
  });
  assert.equal(brief.collision_check?.status, "checked");
  const markdown = renderBriefMarkdown(brief);
  assert.match(markdown, /Status: \*\*checked\*\*/);
});

test("risk cells escape a pipe and collapse a raw newline", () => {
  const brief = compileBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    extraRisks: [
      { risk: "a|b", trigger: "t\nx", fallback: "reduce_scope" },
    ],
  });
  const markdown = renderBriefMarkdown(brief);
  const row = markdown.split("\n").find((line) => line.includes("a\\|b"));
  assert.ok(row, `the risk row must stay on one line:\n${markdown}`);
  assert.match(row, /a\\\|b/);
  assert.ok(row.includes("t x"), `the trigger must collapse its newline: ${row}`);
});
