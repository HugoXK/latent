import test from "node:test";
import assert from "node:assert/strict";
import { igem } from "../src/index.js";
import { assertValidPack } from "@latent/core";

test("the iGEM pack has unique variables and gates", () => {
  assert.equal(igem.id, "igem");
  assert.equal(new Set(igem.variables).size, igem.variables.length);
  assert.equal(new Set(igem.gates.map((g) => g.key)).size, igem.gates.length);
});

test("the iGEM pack carries the seven gates from the spec", () => {
  assert.equal(igem.gates.length, 7);
  const keys = igem.gates.map((g) => g.key);
  for (const key of [
    "readout",
    "bsl",
    "design",
    "dbtl",
    "advantage",
    "stakeholder",
    "contribution",
  ]) {
    assert.ok(keys.includes(key), `missing gate: ${key}`);
  }
});

test("every gate names a falsifier and an allowed fallback", () => {
  const allowed = new Set([
    "change_readout",
    "change_host",
    "reduce_scope",
    "compute_only",
    "none",
  ]);
  for (const gate of igem.gates) {
    assert.ok(gate.falsifier.length > 0, gate.key);
    assert.ok(allowed.has(gate.fallback), gate.key);
  }
});

test("the iGEM pack validates against the pack contract", () => {
  assert.doesNotThrow(() => assertValidPack(igem));
});
