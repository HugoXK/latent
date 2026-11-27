import test from "node:test";
import assert from "node:assert/strict";
import { FixtureExistenceProvider, runExistenceValidator } from "../src/index.js";
import type { Claim } from "../src/index.js";

const NOW = "2026-11-27T00:00:00.000Z";

function claim(id: string, url: string | null, status: Claim["status"] = "verified"): Claim {
  return {
    id,
    text: "a claim",
    status,
    confidence: 0.8,
    confidence_basis: "A",
    sources:
      url === null
        ? []
        : [
            {
              kind: "paper",
              url,
              span: "the limit of detection was 10 ng/mL",
              accessed_at: NOW,
            },
          ],
  };
}

test("no external objects is a pass, not a skip", async () => {
  const result = await runExistenceValidator([claim("clm_1", null, "unknown")], null, NOW);
  assert.equal(result.validator.name, "existence");
  assert.equal(result.validator.status, "pass");
  assert.match(result.validator.detail ?? "", /no external objects/);
});

test("external objects without a provider fail closed", async () => {
  const result = await runExistenceValidator([claim("clm_1", "doi:10.1/x")], null, NOW);
  assert.equal(result.validator.status, "fail");
  assert.match(result.validator.detail ?? "", /failing closed/);
});

test("an existing object passes and records the verifier", async () => {
  const provider = new FixtureExistenceProvider({
    exists: { paper: ["doi:10.1/ok"] },
    now: () => NOW,
  });
  const result = await runExistenceValidator(
    [claim("clm_1", "doi:10.1/ok")],
    provider,
    NOW,
  );
  assert.equal(result.validator.status, "pass");
  assert.equal(result.claims[0]?.status, "verified");
  assert.equal(result.claims[0]?.verifier, "existence-v1");
});

test("a missing object fails and demotes a verified claim", async () => {
  const provider = new FixtureExistenceProvider({
    missing: { paper: ["doi:10.1/missing"] },
    now: () => NOW,
  });
  const result = await runExistenceValidator(
    [claim("clm_1", "doi:10.1/missing")],
    provider,
    NOW,
  );
  assert.equal(result.validator.status, "fail");
  assert.equal(result.claims[0]?.status, "unsupported");
  assert.equal(result.claims[0]?.verifier, "existence-v1");
});
