import test from "node:test";
import assert from "node:assert/strict";
import {
  PackValidationError,
  assertValidPack,
  validateVerticalPack,
  verticalRulesValidator,
} from "../src/index.js";
import type { VerticalPack } from "../src/index.js";

const gate = {
  key: "readout",
  name: "Readout",
  criteria: "dose response",
  falsifier: "no response",
  fallback: "change_readout" as const,
  hard: true,
};

const base: VerticalPack = {
  id: "test",
  name: "Test pack",
  variables: ["lab.bsl", "lab.readers"],
  questions: [
    {
      id: "q.bsl",
      variable: "lab.bsl",
      prompt: "BSL?",
      options: [
        { value: 1, label: "1" },
        { value: 2, label: "2" },
      ],
    },
    {
      id: "q.readers",
      variable: "lab.readers",
      prompt: "Reader?",
      dependsOn: [{ variable: "lab.bsl", equals: 2 }],
      options: [{ value: "plate", label: "Plate" }],
    },
  ],
  gates: [gate],
  briefTemplate: "brief.md",
};

test("the base pack validates", () => {
  assert.deepEqual(validateVerticalPack(base), []);
  assert.doesNotThrow(() => assertValidPack(base));
});

test("duplicate variables are rejected", () => {
  const issues = validateVerticalPack({ ...base, variables: ["x", "x"] });
  assert.ok(issues.some((issue) => issue.code === "DUPLICATE_VARIABLE"));
});

test("a question variable must be declared", () => {
  const issues = validateVerticalPack({
    ...base,
    questions: [{ ...base.questions[0]!, variable: "missing" }],
  });
  assert.ok(issues.some((issue) => issue.code === "UNKNOWN_VARIABLE"));
});

test("a conditional dependency must name an existing option", () => {
  const issues = validateVerticalPack({
    ...base,
    questions: [
      base.questions[0]!,
      { ...base.questions[1]!, dependsOn: [{ variable: "lab.bsl", equals: 9 }] },
    ],
  });
  assert.ok(issues.some((issue) => issue.code === "DEPENDENCY_VALUE"));
});

test("gates must be unique and complete", () => {
  const issues = validateVerticalPack({
    ...base,
    gates: [gate, { ...gate, name: "" }],
  });
  assert.ok(issues.some((issue) => issue.code === "DUPLICATE_GATE"));
  assert.ok(issues.some((issue) => issue.code === "INCOMPLETE_GATE"));
});

test("assertValidPack throws PackValidationError", () => {
  assert.throws(
    () => assertValidPack({ ...base, gates: [] }),
    (error: unknown) => error instanceof PackValidationError,
  );
});

test("rules freshness is a real vertical validator", () => {
  const now = new Date("2026-11-27T00:00:00Z");
  const fresh = verticalRulesValidator(
    { ...base, rules: { version: "2026.1", checked_at: "2026-01-01" } },
    now,
  );
  assert.equal(fresh.status, "pass");

  const stale = verticalRulesValidator(
    { ...base, rules: { version: "2024.1", checked_at: "2024-01-01" } },
    now,
  );
  assert.equal(stale.status, "fail");

  const none = verticalRulesValidator(base, now);
  assert.equal(none.status, "pass");
  assert.match(none.detail ?? "", /no versioned rules/);
});
