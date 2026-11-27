import test from "node:test";
import assert from "node:assert/strict";
import {
  assessComponent,
  componentTable,
  renderComponentTableMarkdown,
} from "../src/index.js";
import type { ComponentInput } from "../src/index.js";

function component(overrides: Partial<ComponentInput> = {}): ComponentInput {
  return {
    id: "BBa_B0034",
    name: "Strong RBS",
    source: "Registry",
    grade: "A",
    ...overrides,
  };
}

test("A reuses, B re-characterises and C builds", () => {
  assert.equal(assessComponent(component({ grade: "A" })).decision, "reuse");
  assert.equal(
    assessComponent(component({ grade: "B" })).decision,
    "recharacterise",
  );
  assert.equal(assessComponent(component({ grade: "C" })).decision, "build");
});

test("a C component synthesis cost scales with length", () => {
  const short = assessComponent(component({ grade: "C", length_bp: 800 }));
  const long = assessComponent(component({ grade: "C", length_bp: 2400 }));
  assert.equal(short.estimated_cost_usd, 300);
  assert.equal(long.estimated_cost_usd, 500);
  assert.ok(long.estimated_weeks > short.estimated_weeks - 1);
});

test("the table counts decisions, work and cost", () => {
  const table = componentTable([
    component({ id: "a", grade: "A" }),
    component({ id: "b", grade: "B" }),
    component({ id: "c", grade: "C", length_bp: 1000 }),
  ]);
  assert.equal(table.reuse, 1);
  assert.equal(table.recharacterise, 1);
  assert.equal(table.build, 1);
  assert.equal(table.max_weeks, 6);
  assert.ok(table.total_weeks > table.max_weeks);
  assert.ok(table.total_cost_usd > 0);
  assert.match(renderComponentTableMarkdown(table), /## Components/);
});
