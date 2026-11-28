import test from "node:test";
import assert from "node:assert/strict";
import {
  FixtureContradictionProvider,
  applyContradictions,
  findContradictions,
  validateClaim,
} from "../src/index.js";
import type { Claim, Source } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";

const contradiction: Source = {
  kind: "paper",
  url: "https://example.org/opposite",
  span: "the readout was not detectable in soil",
  accessed_at: NOW,
};

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_contra0001",
    text: "The readout is detectable in soil.",
    status: "verified",
    confidence: 0.8,
    confidence_basis: "A",
    sources: [
      {
        kind: "paper",
        url: "https://example.org/support",
        span: "the readout was detectable",
        accessed_at: NOW,
      },
    ],
    ...overrides,
  };
}

test("a contradiction marks the claim contradicted and keeps the source", () => {
  const applied = applyContradictions(claim(), [contradiction], NOW);
  assert.equal(applied.status, "contradicted");
  assert.equal(applied.contradictions?.length, 1);
  assert.deepEqual(validateClaim(applied), []);
});

test("no contradictions leave the claim unchanged", () => {
  const original = claim();
  assert.equal(applyContradictions(original, [], NOW), original);
});

test("findContradictions returns a map and the rewritten claims", async () => {
  const provider = new FixtureContradictionProvider({
    clm_contra0001: [contradiction],
  });
  const result = await findContradictions([claim()], provider, NOW);
  assert.equal(result.claims[0]?.status, "contradicted");
  assert.equal(result.results.get("clm_contra0001")?.length, 1);
});
