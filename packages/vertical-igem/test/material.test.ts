import test from "node:test";
import assert from "node:assert/strict";
import {
  CobraFbaRunner,
  FbaError,
  FixtureFbaRunner,
  materialBalance,
} from "../src/index.js";
import type { ProcessRunner, Reaction } from "../src/index.js";

const chain: Reaction[] = [
  { id: "r1", substrates: { A: 1 }, products: { B: 1 } },
  { id: "r2", substrates: { B: 1 }, products: { C: 1 } },
];

test("a pathway is feasible when the external substrate is sufficient", () => {
  const result = materialBalance({
    target: "C",
    target_amount: 10,
    reactions: chain,
    available: { A: 20 },
  });
  assert.equal(result.feasible, true);
  assert.equal(result.required.A, 10);
  assert.deepEqual(result.limiting, []);
});

test("a limiting substrate makes the balance infeasible", () => {
  const result = materialBalance({
    target: "C",
    target_amount: 10,
    reactions: chain,
    available: { A: 5 },
  });
  assert.equal(result.feasible, false);
  assert.deepEqual(result.limiting, ["A"]);
  assert.equal(result.theoretical_yield, 5);
});

test("stoichiometric coefficients are respected", () => {
  const result = materialBalance({
    target: "B",
    target_amount: 10,
    reactions: [{ id: "r", substrates: { A: 2 }, products: { B: 1 } }],
    available: { A: 20 },
  });
  assert.equal(result.required.A, 20);
});

test("a cycle is reported, not guessed", () => {
  const result = materialBalance({
    target: "A",
    target_amount: 10,
    reactions: [
      { id: "r1", substrates: { B: 1 }, products: { A: 1 } },
      { id: "r2", substrates: { A: 1 }, products: { B: 1 } },
    ],
    available: {},
  });
  assert.equal(result.feasible, false);
  assert.ok(result.notes.some((note) => note.startsWith("cycle")));
});

test("the COBRA runner parses a valid result and rejects bad JSON", async () => {
  const runner: ProcessRunner = {
    async run() {
      return JSON.stringify({
        feasible: true,
        growth_rate: 0.42,
        objective_value: 12.5,
      });
    },
  };
  const fba = await new CobraFbaRunner(runner, "cobra_fba.py").run({
    model: "iML1515",
    objective: "BIOMASS",
  });
  assert.equal(fba.growth_rate, 0.42);

  const bad: ProcessRunner = { async run() { return "not json"; } };
  await assert.rejects(
    () =>
      new CobraFbaRunner(bad, "cobra_fba.py").run({
        model: "iML1515",
        objective: "BIOMASS",
      }),
    (error: unknown) => error instanceof FbaError,
  );
});

test("the fixture FBA runner returns its result", async () => {
  const fba = await new FixtureFbaRunner({
    feasible: true,
    growth_rate: 0.3,
    objective_value: 1,
  }).run();
  assert.equal(fba.feasible, true);
});
