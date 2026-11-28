import test from "node:test";
import assert from "node:assert/strict";
import {
  DeterministicClaimVerifier,
  ModelClaimVerifier,
  applyVerification,
  blocksBrief,
  spanHash,
  verifyClaims,
} from "../src/index.js";
import type { Claim, ModelProvider } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_verifier0001",
    text: "The limit of detection is 10 ng/mL.",
    status: "verified",
    confidence: 0.86,
    confidence_basis: "A",
    sources: [
      {
        kind: "paper",
        url: "https://example.org/paper",
        span: "the limit of detection was 10 ng/mL",
        accessed_at: NOW,
      },
    ],
    ...overrides,
  };
}

class FakeModel implements ModelProvider {
  constructor(private readonly text: string) {}

  async complete(): Promise<{ text: string }> {
    return { text: this.text };
  }

  async embed(input: string[]): Promise<number[][]> {
    return input.map(() => [0, 0, 0]);
  }
}

test("a matching span is supported and keeps the claim verified", async () => {
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const result = await verifier.verify(claim());
  assert.equal(result.supported, true);
  assert.equal(result.span_hash, spanHash("the limit of detection was 10 ng/mL"));
  const applied = applyVerification(claim(), result);
  assert.equal(applied.status, "verified");
  assert.equal(applied.verifier, "deterministic-span-v1");
});

test("a URL without a span is unsupported and demoted", async () => {
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const noSpan = claim({
    sources: [
      {
        kind: "paper",
        url: "https://example.org/paper",
        span: null,
        accessed_at: NOW,
      },
    ],
  });
  const result = await verifier.verify(noSpan);
  assert.equal(result.supported, false);
  const applied = applyVerification(noSpan, result);
  assert.equal(applied.status, "unsupported");
  assert.equal(blocksBrief(applied), true);
});

test("a span that does not share the claim's terms is unsupported", async () => {
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const bad = claim({
    sources: [
      {
        kind: "paper",
        url: "https://example.org/paper",
        span: "the sky was blue that afternoon",
        accessed_at: NOW,
      },
    ],
  });
  const result = await verifier.verify(bad);
  assert.equal(result.supported, false);
  assert.equal(applyVerification(bad, result).status, "unsupported");
});

test("verifyClaims demotes only the failed verified claim", async () => {
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const good = claim();
  const bad = claim({
    id: "clm_verifier0002",
    sources: [
      {
        kind: "paper",
        url: "https://example.org/paper",
        span: "unrelated words",
        accessed_at: NOW,
      },
    ],
  });
  const result = await verifyClaims([good, bad], verifier);
  assert.equal(result.claims[0]?.status, "verified");
  assert.equal(result.claims[1]?.status, "unsupported");
  assert.equal(result.results.length, 2);
});

test("the model verifier accepts a valid verdict", async () => {
  const verifier = new ModelClaimVerifier(
    new FakeModel('{"supported": true, "reason": "the span states the limit"}'),
    { now: () => NOW },
  );
  const result = await verifier.verify(claim());
  assert.equal(result.supported, true);
  assert.equal(result.verifier, "model-span-v1");
});

test("the model verifier fails closed on malformed output", async () => {
  const verifier = new ModelClaimVerifier(new FakeModel("not json"), {
    now: () => NOW,
  });
  const result = await verifier.verify(claim());
  assert.equal(result.supported, false);
  assert.match(result.reason, /invalid JSON/);
});

test("the model verifier fails closed when the model says no", async () => {
  const verifier = new ModelClaimVerifier(
    new FakeModel('{"supported": false, "reason": "the span is about water"}'),
    { now: () => NOW },
  );
  const result = await verifier.verify(claim());
  assert.equal(result.supported, false);
});

test("an unrelated span sharing two common tokens is not support", async () => {
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const overlapOnly = claim({
    text: "The protein folds correctly in vitro.",
    sources: [
      {
        kind: "paper",
        url: "https://example.org/paper",
        span: "The protein was purified in vitro",
        accessed_at: NOW,
      },
    ],
  });
  const result = await verifier.verify(overlapOnly);
  assert.equal(result.supported, false);
  assert.equal(applyVerification(overlapOnly, result).status, "unsupported");
});
