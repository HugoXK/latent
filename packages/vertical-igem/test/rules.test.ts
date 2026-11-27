import test from "node:test";
import assert from "node:assert/strict";
import {
  IGEM_2026,
  RulesStaleError,
  assertRulesFresh,
  rulesFreshness,
} from "../src/index.js";

test("the 2026 config has the expected villages and awards", () => {
  assert.equal(IGEM_2026.version, "2026.1");
  assert.equal(IGEM_2026.villages.length, 15);
  assert.equal(IGEM_2026.special_awards.length, 17);
  assert.equal(new Set(IGEM_2026.villages).size, 15);
  assert.equal(new Set(IGEM_2026.special_awards).size, 17);
  assert.deepEqual(IGEM_2026.medals.bronze, [
    "Competition Deliverables",
    "Project Attributions",
    "Contribution",
  ]);
});

test("the config is fresh within one year", () => {
  const freshness = rulesFreshness(IGEM_2026, new Date("2026-06-01"), 365);
  assert.equal(freshness.fresh, true);
  assert.ok(freshness.age_days > 100);
  assert.doesNotThrow(() =>
    assertRulesFresh(IGEM_2026, new Date("2026-06-01"), 365),
  );
});

test("a stale config warns", () => {
  const freshness = rulesFreshness(IGEM_2026, new Date("2027-12-31"), 365);
  assert.equal(freshness.fresh, false);
  assert.throws(
    () => assertRulesFresh(IGEM_2026, new Date("2027-12-31"), 365),
    (error: unknown) => error instanceof RulesStaleError,
  );
});
