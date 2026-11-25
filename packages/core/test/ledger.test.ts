import test from "node:test";
import assert from "node:assert/strict";
import { blocksBrief, validateClaim, validateLedger } from "../src/index.js";
import type { Claim } from "../src/index.js";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_test0001",
    text: "t",
    status: "unknown",
    confidence: 0.2,
    confidence_basis: "C",
    sources: [],
    ...overrides,
  };
}

test("a verified claim without a source span is rejected", () => {
  const issues = validateClaim(claim({ status: "verified" }));
  assert.ok(issues.some((i) => i.code === "UNSUPPORTED_VERIFIED"));
});

test("a verified claim with a span is accepted", () => {
  const issues = validateClaim(
    claim({
      status: "verified",
      confidence_basis: "A",
      sources: [
        {
          kind: "paper",
          url: "https://example.org",
          span: "the limit of detection was 10 ng/mL",
          accessed_at: "2026-11-25T00:00:00Z",
        },
      ],
    }),
  );
  assert.deepEqual(issues, []);
});

test("a grade-C claim cannot be verified", () => {
  const issues = validateClaim(
    claim({
      status: "verified",
      confidence_basis: "C",
      sources: [
        {
          kind: "registry",
          url: "https://example.org",
          span: "sequence only",
          accessed_at: "2026-11-25T00:00:00Z",
        },
      ],
    }),
  );
  assert.ok(issues.some((i) => i.code === "C_CANNOT_BE_VERIFIED"));
});

test("a numeric claim needs a unit", () => {
  const issues = validateClaim(claim({ value: 10 }));
  assert.ok(issues.some((i) => i.code === "NUMERIC_WITHOUT_UNIT"));
});

test("unsupported claims block a brief", () => {
  assert.equal(blocksBrief(claim({ status: "unsupported" })), true);
  assert.equal(blocksBrief(claim({ status: "unknown" })), false);
  assert.equal(validateLedger([claim({ status: "unsupported" })]).length, 0);
});
