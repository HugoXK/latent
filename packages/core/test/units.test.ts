import test from "node:test";
import assert from "node:assert/strict";
import {
  checkNumericClaim,
  compareQuantities,
  normalizeQuantity,
} from "../src/index.js";
import type { Claim } from "../src/index.js";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_units0001",
    text: "The limit of detection is 10 ng/mL.",
    value: 10,
    unit: "ng/mL",
    status: "verified",
    confidence: 0.8,
    confidence_basis: "A",
    sources: [],
    ...overrides,
  };
}

test("10 ng/mL normalizes to 1e-5 g/L", () => {
  const result = normalizeQuantity(10, "ng/mL");
  assert.equal(result.ok, true);
  assert.equal(result.normalized?.base_unit, "g/L");
  assert.ok(Math.abs((result.normalized?.base_value ?? 0) - 1e-5) < 1e-12);
});

test("micro symbols and spaces are normalized", () => {
  const result = normalizeQuantity(10, " µg / mL ");
  assert.equal(result.ok, true);
  assert.ok(Math.abs((result.normalized?.base_value ?? 0) - 1e-2) < 1e-12);
});

test("equal concentrations compare to zero across units", () => {
  const difference = compareQuantities(
    { value: 1, unit: "mg/mL" },
    { value: 1000, unit: "ug/mL" },
  );
  assert.ok(Math.abs(difference) < 1e-12);
});

test("an unknown unit is reported, not guessed", () => {
  const result = normalizeQuantity(1, "furlongs");
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === "UNKNOWN_UNIT"));
});

test("a negative quantity is reported", () => {
  const result = normalizeQuantity(-1, "ng/mL");
  assert.ok(result.issues.some((issue) => issue.code === "NEGATIVE_QUANTITY"));
});

test("a numeric claim without a unit is rejected", () => {
  const check = checkNumericClaim(claim({ unit: null }));
  assert.equal(check.ok, false);
  assert.ok(check.issues.some((issue) => issue.code === "NUMERIC_WITHOUT_UNIT"));
});

test("bounds compare in the same base unit", () => {
  const check = checkNumericClaim(claim(), {
    min: { value: 20, unit: "ng/mL" },
  });
  assert.equal(check.ok, false);
  assert.ok(check.issues.some((issue) => issue.code === "BELOW_MIN"));
});
