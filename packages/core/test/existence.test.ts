import test from "node:test";
import assert from "node:assert/strict";
import {
  CachedExistenceProvider,
  FixtureExistenceProvider,
  applyExistence,
  checkClaimExistence,
} from "../src/index.js";
import type { Claim, ExistenceProvider } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";
const PART_ID = "https://parts.igem.org/Part:BBa_B0034";

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: "clm_exist0001",
    text: "The part is a strong ribosome binding site.",
    status: "verified",
    confidence: 0.8,
    confidence_basis: "A",
    sources: [
      {
        kind: "registry",
        url: PART_ID,
        span: "BBa_B0034 is a strong RBS",
        accessed_at: NOW,
      },
    ],
    ...overrides,
  };
}

test("an existing part passes and keeps the claim verified", async () => {
  const provider = new FixtureExistenceProvider({
    exists: { part: [PART_ID] },
    now: () => NOW,
  });
  const check = await checkClaimExistence(claim(), provider);
  assert.equal(check.ok, true);
  const applied = applyExistence(claim(), check.results, NOW);
  assert.equal(applied.status, "verified");
  assert.equal(applied.verifier, "existence-v1");
});

test("a fabricated part is missing and demotes the claim", async () => {
  const provider = new FixtureExistenceProvider({
    missing: { part: [PART_ID] },
    now: () => NOW,
  });
  const check = await checkClaimExistence(claim(), provider);
  assert.equal(check.ok, false);
  assert.ok(check.issues.some((issue) => issue.code === "MISSING_OBJECT"));
  assert.equal(applyExistence(claim(), check.results, NOW).status, "unsupported");
});

test("an offline provider fails closed", async () => {
  const provider = new FixtureExistenceProvider({ offline: true, now: () => NOW });
  const check = await checkClaimExistence(claim(), provider);
  assert.ok(check.issues.some((issue) => issue.code === "EXISTENCE_UNKNOWN"));
  assert.equal(applyExistence(claim(), check.results, NOW).status, "unsupported");
});

test("a repeated query is served from the cache", async () => {
  let calls = 0;
  const inner: ExistenceProvider = {
    async check(query) {
      calls += 1;
      return {
        ...query,
        exists: true,
        source: "counting",
        checked_at: NOW,
      };
    },
  };
  const provider = new CachedExistenceProvider(inner, { rateLimitMs: 0 });
  await provider.check({ kind: "part", id: PART_ID });
  await provider.check({ kind: "part", id: PART_ID });
  assert.equal(calls, 1);
});

test("a web source is not an existence query", async () => {
  const provider = new FixtureExistenceProvider({ now: () => NOW });
  const check = await checkClaimExistence(
    claim({
      sources: [
        {
          kind: "web",
          url: "https://example.org/blog",
          span: "a blog post",
          accessed_at: NOW,
        },
      ],
    }),
    provider,
  );
  assert.deepEqual(check.results, []);
  assert.equal(check.ok, true);
});
