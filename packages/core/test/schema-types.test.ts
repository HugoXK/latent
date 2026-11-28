import test from "node:test";
import assert from "node:assert/strict";
import * as generated from "../src/generated/schemas.js";
import type * as Generated from "../src/generated/schemas.js";
import type { Brief, Claim, Fragment, Idea, MemoryEdge } from "../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <
  T,
>() => T extends B ? 1 : 2
  ? true
  : false;
type Assert<T extends true> = T;

// Aliased 1:1 in types.ts (Fragment, Claim, MemoryEdge) and the two shapes that
// stay hand-written because they are equal today (Idea, Brief): if a schema
// change makes any pair differ, `tsc --noEmit` fails here.
type _Fragment = Assert<Equal<Fragment, Generated.Fragment>>;
type _Claim = Assert<Equal<Claim, Generated.Claim>>;
type _MemoryEdge = Assert<Equal<MemoryEdge, Generated.MemoryEdge>>;
type _Idea = Assert<Equal<Idea, Generated.Idea>>;
type _Brief = Assert<Equal<Brief, Generated.Brief>>;

// Exceptions (documented in ADR 0021): Gate, ConstraintState and ReplayCase
// deliberately differ from the schema today, so they are not asserted here.

test("the generated schema module is importable", () => {
  assert.equal(typeof generated, "object");
});
