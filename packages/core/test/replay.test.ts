import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ReplayValidationError,
  assertReplayCase,
  validateReplayCase,
} from "../src/index.js";

function fixture(path: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../data/replay/fixtures/${path}`, import.meta.url),
      ),
      "utf8",
    ),
  ) as unknown;
}

const valid = fixture("valid/igem-illustrative-001.json");

test("the illustrative replay case validates", () => {
  assert.deepEqual(validateReplayCase(valid), []);
  assert.doesNotThrow(() => assertReplayCase(valid));
});

test("a hidden seed title in the input is a leak", () => {
  const issues = validateReplayCase(fixture("invalid/leak-seed.json"));
  assert.ok(issues.some((issue) => issue.code === "SEED_LEAK"));
});

test("a source after the temporal cutoff is rejected", () => {
  const issues = validateReplayCase(fixture("invalid/future-source.json"));
  assert.ok(issues.some((issue) => issue.code === "FUTURE_SOURCE"));
});

test("a missing outcome fails schema validation", () => {
  const issues = validateReplayCase(fixture("invalid/missing-outcome.json"));
  assert.ok(issues.some((issue) => issue.code === "SCHEMA"));
});

test("a collision with an unknown prior-art id is rejected", () => {
  const issues = validateReplayCase(fixture("invalid/unknown-collision.json"));
  assert.ok(issues.some((issue) => issue.code === "UNKNOWN_PRIOR_ART"));
});

test("exactly one seed candidate is required", () => {
  const issues = validateReplayCase(fixture("invalid/two-seeds.json"));
  assert.ok(issues.some((issue) => issue.code === "SEED_CANDIDATE_COUNT"));
});

test("assertReplayCase throws ReplayValidationError", () => {
  assert.throws(
    () => assertReplayCase(fixture("invalid/leak-seed.json")),
    (error: unknown) => error instanceof ReplayValidationError,
  );
});
