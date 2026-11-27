import test from "node:test";
import assert from "node:assert/strict";
import type * as Generated from "../src/generated/schemas.js";
import type {
  Brief,
  Claim,
  ConstraintState,
  Fragment,
  Gate,
  Idea,
  MemoryEdge,
  Outcome,
  Suggestion,
} from "../src/index.js";

// Type-level drift guard: if a schema gains a required field or changes a union,
// the hand-written type stops being assignable to the generated one and `tsc`
// fails. The generated file itself is checked by `pnpm schema:types:check`.
const _fragment: Generated.Fragment = {} as Fragment;
const _claim: Generated.Claim = {} as Claim;
const _idea: Generated.Idea = {} as Idea;
const _gate: Generated.Gate = {} as Gate;
const _brief: Generated.Brief = {} as Brief;
const _constraint: Generated.ConstraintState = {} as ConstraintState;
const _edge: Generated.MemoryEdge = {} as MemoryEdge;
const _outcome: Generated.Outcome = {} as Outcome;
const _suggestion: Generated.Suggestion = {} as Suggestion;

test("core types stay assignable to the generated schemas", () => {
  assert.ok(true);
});
