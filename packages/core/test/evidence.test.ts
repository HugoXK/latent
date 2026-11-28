import test from "node:test";
import assert from "node:assert/strict";
import {
  DeterministicClaimVerifier,
  FixtureContradictionProvider,
  FixtureExistenceProvider,
  verifyEvidence,
} from "../src/index.js";
import type { Claim, Source } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";
const PART = "https://parts.igem.org/Part:BBa_B0034";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_evidence0001",
    text: "The limit of detection is 10 ng/mL.",
    status: "verified",
    confidence: 0.8,
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

const contradiction: Source = {
  kind: "paper",
  url: "https://example.org/opposite",
  span: "no readout was detectable",
  accessed_at: NOW,
};

test("the verifier alone keeps a supported claim verified", async () => {
  const report = await verifyEvidence([claim()], {
    verifier: new DeterministicClaimVerifier({ now: () => NOW }),
    now: NOW,
  });
  assert.equal(report.claims[0]?.status, "verified");
  assert.equal(report.verifications.length, 1);
});

test("a contradiction marks the claim contradicted", async () => {
  const report = await verifyEvidence([claim()], {
    contradiction: new FixtureContradictionProvider({
      clm_evidence0001: [contradiction],
    }),
    now: NOW,
  });
  assert.equal(report.claims[0]?.status, "contradicted");
  assert.equal(report.contradictions.get("clm_evidence0001")?.length, 1);
});

test("a missing object demotes the claim", async () => {
  const report = await verifyEvidence(
    [
      claim({
        sources: [
          {
            kind: "registry",
            url: PART,
            span: "BBa_B0034 is a strong RBS",
            accessed_at: NOW,
          },
        ],
      }),
    ],
    {
      existence: new FixtureExistenceProvider({
        missing: { part: [PART] },
        now: () => NOW,
      }),
      now: NOW,
    },
  );
  assert.equal(report.claims[0]?.status, "unsupported");
  assert.ok(report.existence.get("clm_evidence0001"));
});
