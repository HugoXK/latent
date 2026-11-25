import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/index.js";
import { createConstraintState } from "@latent/core";
import type { Claim, Fragment, Gate, Idea } from "@latent/core";

const fragment: Fragment = {
  id: "frg_test0001",
  captured_at: "2026-11-25T00:00:00Z",
  kind: "text",
  content: "a fragment",
  privacy: "private",
  schema_version: "1.0.0",
};

const idea: Idea = {
  id: "idea_test0001",
  version: 1,
  title: "t",
  one_liner: "o",
  status: "developed",
  hypotheses: [
    {
      id: "hyp_1",
      variant: "conservative",
      statement: "s",
      confidence: 0.4,
      confidence_basis: "C",
    },
  ],
  assumptions: [],
  claims: ["clm_test0001"],
  schema_version: "1.0.0",
};

const claim: Claim = {
  id: "clm_test0001",
  text: "t",
  status: "unknown",
  confidence: 0.2,
  confidence_basis: "C",
  sources: [],
  schema_version: "1.0.0",
};

const gate: Gate = {
  id: "gate_test0001",
  idea_id: idea.id,
  name: "readout",
  status: "unknown",
  criteria: "c",
  falsifier: "f",
  controls: [],
  evidence: [],
  fallback: "change_readout",
  hard: true,
  decided_by: "rule",
  schema_version: "1.0.0",
};

test("store round-trips fragments, ideas, claims and gates", () => {
  const store = new Store(":memory:");
  try {
    store.putFragment(fragment);
    assert.deepEqual(store.getFragment(fragment.id), fragment);

    store.putIdea(idea);
    store.putClaims(idea.id, [claim]);
    store.putGates(idea.id, [gate]);
    const constraint = createConstraintState("igem", []);
    store.putConstraintState(idea.id, constraint);

    assert.deepEqual(store.getIdea(idea.id), idea);
    assert.deepEqual(store.listClaims(idea.id), [claim]);
    assert.deepEqual(store.listGates(idea.id), [gate]);
    assert.deepEqual(store.listIdeas("developed"), [idea]);
    assert.equal(store.getGate(gate.id)?.name, "readout");
    assert.deepEqual(store.getConstraintState(idea.id), constraint);
  } finally {
    store.close();
  }
});

test("events are append-only and queryable", () => {
  const store = new Store(":memory:");
  try {
    store.appendEvent("fragment.captured", fragment.id, { kind: "text" });
    store.appendEvent("idea.developed", idea.id, { gates: 1 });
    assert.equal(store.listEvents().length, 2);
    assert.equal(store.listEvents(fragment.id).length, 1);
  } finally {
    store.close();
  }
});
