import test from "node:test";
import assert from "node:assert/strict";
import { renderBriefMarkdown } from "@latent/core";
import { compileIgemBrief } from "../src/index.js";
import type { Claim, Gate, Idea } from "@latent/core";
import type { MaterialBalanceInput } from "../src/index.js";

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea_igem0001",
    version: 1,
    title: "Arsenic biosensor",
    one_liner: "A field biosensor for arsenic in soil.",
    status: "viable",
    hypotheses: [
      {
        id: "hyp_1",
        variant: "conservative",
        statement: "Use a characterised arsenic-responsive repressor.",
        confidence: 0.4,
        confidence_basis: "B",
      },
    ],
    assumptions: [
      {
        id: "asm_1",
        statement: "The readout is quantitative.",
        status: "confirmed",
        risk: "high",
      },
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

function claim(): Claim {
  return {
    id: "clm_1",
    text: "The host and readout are not yet confirmed.",
    status: "unknown",
    confidence: 0.2,
    confidence_basis: "C",
    sources: [],
  };
}

function gate(overrides: Partial<Gate> = {}): Gate {
  return {
    id: "gate_1",
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

const components = [
  {
    id: "BBa_B0034",
    name: "Strong RBS",
    source: "Registry",
    grade: "A" as const,
  },
  {
    id: "BBa_E0040",
    name: "GFP",
    source: "Registry",
    grade: "C" as const,
    length_bp: 720,
  },
];

const timeline = {
  tasks: [
    { id: "build", name: "Build", min_weeks: 1, likely_weeks: 2, max_weeks: 3 },
    {
      id: "test",
      name: "Test",
      min_weeks: 1,
      likely_weeks: 2,
      max_weeks: 3,
      depends_on: ["build"],
    },
  ],
  calendar: { summer_full_weeks: 8 },
  runs: 200,
  seed: 7,
};

const material: MaterialBalanceInput = {
  target: "C",
  target_amount: 10,
  reactions: [
    { id: "r1", substrates: { A: 1 }, products: { B: 1 } },
    { id: "r2", substrates: { B: 1 }, products: { C: 1 } },
  ],
  available: { A: 20 },
};

test("the iGEM brief carries components, timeline and material sections", () => {
  const brief = compileIgemBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    components,
    timeline,
    material,
    now: "2026-11-25T00:00:00Z",
  });
  assert.equal(brief.sections?.length, 3);
  assert.deepEqual(
    brief.sections?.map((section) => section.title),
    ["Components", "Timeline", "Material balance"],
  );
  assert.ok(brief.unknowns.length > 0);
  const markdown = renderBriefMarkdown(brief);
  assert.match(markdown, /## Components/);
  assert.match(markdown, /## Timeline/);
  assert.match(markdown, /## Material balance/);
  assert.match(markdown, /weeks/);
  assert.match(markdown, /USD/);
});

test("a failed timeline becomes a risk, not a hidden sentence", () => {
  const brief = compileIgemBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    timeline: {
      tasks: [
        { id: "long", name: "Long", min_weeks: 10, likely_weeks: 12, max_weeks: 14 },
      ],
      calendar: { summer_full_weeks: 4 },
      runs: 100,
      seed: 1,
    },
  });
  assert.ok(
    brief.risks.some((risk) => risk.risk.includes("DBTL loop")),
  );
});

test("an infeasible material balance becomes a risk", () => {
  const brief = compileIgemBrief({
    idea: idea(),
    claims: [claim()],
    gates: [gate()],
    material: { ...material, available: { A: 1 } },
  });
  assert.ok(
    brief.risks.some((risk) => risk.risk.includes("Substrate")),
  );
});
