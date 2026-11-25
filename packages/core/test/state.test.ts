import test from "node:test";
import assert from "node:assert/strict";
import {
  TransitionError,
  canTransition,
  transition,
} from "../src/index.js";
import type { Idea } from "../src/index.js";

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
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
        confidence: 0.5,
        confidence_basis: "C",
      },
    ],
    assumptions: [],
    claims: [],
    ...overrides,
  };
}

test("developed -> verifying is allowed when no high-risk assumption is open", () => {
  const next = transition(idea(), "verifying", "2026-11-25T00:00:00Z");
  assert.equal(next.status, "verifying");
  assert.equal(next.version, 2);
});

test("developed -> verifying is blocked by a high-risk unconfirmed assumption", () => {
  const blocked = idea({
    assumptions: [
      { id: "asm_1", statement: "s", status: "unconfirmed", risk: "high" },
    ],
  });
  assert.throws(
    () => transition(blocked, "verifying"),
    (e: unknown) => e instanceof TransitionError && e.code === "BLOCKING_ASSUMPTIONS",
  );
});

test("illegal transitions throw", () => {
  assert.equal(canTransition("killed", "developed"), false);
  assert.throws(
    () => transition(idea({ status: "killed" }), "developed"),
    (e: unknown) => e instanceof TransitionError && e.code === "ILLEGAL_TRANSITION",
  );
});

test("viable -> briefed is allowed", () => {
  const next = transition(idea({ status: "viable" }), "briefed");
  assert.equal(next.status, "briefed");
});
