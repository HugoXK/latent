import test from "node:test";
import assert from "node:assert/strict";
import {
  DeterministicClaimVerifier,
  detectSourceChanges,
  reverifyClaim,
  snapshotClaim,
} from "../src/index.js";
import type { Claim } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";

function claim(span = "the limit of detection was 10 ng/mL"): Claim {
  return {
    id: "clm_version0001",
    text: "The limit of detection is 10 ng/mL.",
    status: "verified",
    confidence: 0.8,
    confidence_basis: "A",
    sources: [
      {
        kind: "paper",
        url: "https://example.org/paper",
        span,
        accessed_at: NOW,
      },
    ],
  };
}

test("a snapshot is stable and an unchanged claim has no changes", () => {
  const snapshot = snapshotClaim(claim(), NOW);
  assert.equal(snapshot.sources.length, 1);
  assert.equal(snapshot.sources[0]?.span_hash?.length, 64);
  assert.deepEqual(detectSourceChanges(snapshot, claim().sources), []);
});

test("a changed span, a removed source and an added source are detected", () => {
  const snapshot = snapshotClaim(claim(), NOW);
  const changed = detectSourceChanges(snapshot, claim("unrelated words").sources);
  assert.ok(changed.some((change) => change.code === "SPAN_CHANGED"));

  const removed = detectSourceChanges(snapshot, []);
  assert.ok(removed.some((change) => change.code === "REMOVED"));

  const added = detectSourceChanges(snapshot, [
    ...claim().sources,
    {
      kind: "web",
      url: "https://example.org/extra",
      span: "extra",
      accessed_at: NOW,
    },
  ]);
  assert.ok(added.some((change) => change.code === "ADDED"));
});

test("a changed span is re-verified and can demote the claim", async () => {
  const snapshot = snapshotClaim(claim(), NOW);
  const changed = claim("the sky was blue that afternoon");
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const result = await reverifyClaim(changed, snapshot, verifier);
  assert.ok(result.changes.some((change) => change.code === "SPAN_CHANGED"));
  assert.equal(result.claim.status, "unsupported");
  assert.equal(result.verification?.supported, false);
});

test("a changed supporting span keeps the claim verified", async () => {
  const snapshot = snapshotClaim(claim(), NOW);
  const changed = claim("the measured limit of detection was 10 ng/mL");
  const verifier = new DeterministicClaimVerifier({ now: () => NOW });
  const result = await reverifyClaim(changed, snapshot, verifier);
  assert.equal(result.claim.status, "verified");
});
