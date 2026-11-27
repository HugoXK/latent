import test from "node:test";
import assert from "node:assert/strict";
import {
  GateError,
  blockingGates,
  decideGate,
  gatesPromote,
} from "../src/index.js";
import type { Gate } from "../src/index.js";

function gate(overrides: Partial<Gate> = {}): Gate {
  return {
    evidence: [],
    id: "gate_test0001",
    name: "measurable readout",
    status: "unknown",
    criteria: "dose response",
    falsifier: "no response above 2x background",
    fallback: "change_readout",
    hard: true,
    decided_by: "rule",
    ...overrides,
  };
}

test("a model cannot pass a hard gate", () => {
  assert.throws(
    () => decideGate(gate(), "pass", "model"),
    (e: unknown) => e instanceof GateError && e.code === "HUMAN_REQUIRED",
  );
});

test("a human can pass a hard gate", () => {
  const next = decideGate(gate(), "pass", "human", "pilot data");
  assert.equal(next.status, "pass");
  assert.equal(next.decided_by, "human");
});

test("a waiver needs a human and a reason", () => {
  assert.throws(
    () => decideGate(gate({ hard: false }), "waived", "model", "x"),
    (e: unknown) => e instanceof GateError && e.code === "HUMAN_REQUIRED",
  );
  assert.throws(
    () => decideGate(gate({ hard: false }), "waived", "human", null),
    (e: unknown) => e instanceof GateError && e.code === "REASON_REQUIRED",
  );
  const next = decideGate(gate({ hard: false }), "waived", "human", "accepted risk");
  assert.equal(next.status, "waived");
});

test("unknown and fail block; pass and waived do not", () => {
  assert.equal(blockingGates([gate({ status: "unknown" })]).length, 1);
  assert.equal(blockingGates([gate({ status: "fail" })]).length, 1);
  assert.equal(blockingGates([gate({ status: "pass" })]).length, 0);
  assert.equal(blockingGates([gate({ status: "waived" })]).length, 0);
  assert.equal(gatesPromote([gate({ status: "pass" })]), true);
});
