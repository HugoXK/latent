import test from "node:test";
import assert from "node:assert/strict";
import {
  SchemaValidationError,
  assertValid,
  isValid,
} from "../src/index.js";

test("a valid fragment passes runtime schema validation", () => {
  const fragment = {
    id: "frg_test0001",
    captured_at: "2026-11-25T00:00:00Z",
    kind: "text",
    content: "a fragment",
    privacy: "private",
  };
  assert.equal(isValid("fragment", fragment), true);
  assert.doesNotThrow(() => assertValid("fragment", fragment));
});

test("an invalid fragment throws with the schema name and errors", () => {
  assert.throws(
    () => assertValid("fragment", { id: "nope" }),
    (error: unknown) =>
      error instanceof SchemaValidationError &&
      error.schema === "fragment" &&
      error.errors.length > 0,
  );
});

test("a constraint state passes validation", () => {
  assert.doesNotThrow(() =>
    assertValid("constraint", {
      version: 1,
      vertical: "igem",
      variables: {},
      unknowns: [],
      blocking_unknowns: [],
      schema_version: "1.0.0",
    }),
  );
});

test("an idea with no hypotheses is rejected", () => {
  assert.throws(
    () =>
      assertValid("idea", {
        id: "idea_test0001",
        version: 1,
        title: "t",
        one_liner: "o",
        status: "developed",
        hypotheses: [],
        assumptions: [],
        claims: [],
      }),
    (error: unknown) =>
      error instanceof SchemaValidationError && error.schema === "idea",
  );
});
