import test from "node:test";
import assert from "node:assert/strict";
import {
  OutcomeError,
  assertValid,
  brierScore,
  calibrationReport,
  createOutcome,
  logLoss,
  outcomeEdge,
} from "../src/index.js";
import type { Outcome } from "../src/index.js";

const NOW = "2026-11-27T00:00:00.000Z";

function outcome(
  id: string,
  ideaId: string,
  predicted: number,
  realisedSuccess: boolean,
): Outcome {
  return createOutcome(
    {
      id,
      idea_id: ideaId,
      idea_version: 1,
      owner_id: "local",
      decision: realisedSuccess ? "tested" : "failed",
      realised_success: realisedSuccess,
      predicted_confidence: predicted,
      decided_by: "human",
    },
    NOW,
  );
}

test("createOutcome produces a schema-valid immutable record", () => {
  const record = outcome("outcome_aaaa0001", "idea_1", 0.62, true);

  assert.equal(record.created_at, NOW);
  assert.equal(record.decided_at, NOW);
  assert.equal(record.decided_by, "human");
  assert.equal(record.predicted_at, null);
  assert.deepEqual(record.evidence, []);
  assert.equal(record.notes, null);
  assert.doesNotThrow(() => assertValid("outcome", record));
});

test("createOutcome rejects a bad confidence, decision and version", () => {
  const base = {
    idea_id: "idea_1",
    idea_version: 1,
    owner_id: "local",
    decision: "tested" as const,
    realised_success: true,
    predicted_confidence: 0.5,
  };

  assert.throws(
    () => createOutcome({ ...base, predicted_confidence: 1.5 }, NOW),
    (error: unknown) =>
      error instanceof OutcomeError && error.code === "CONFIDENCE_OUT_OF_RANGE",
  );
  assert.throws(
    () => createOutcome({ ...base, decision: "maybe" as never }, NOW),
    (error: unknown) =>
      error instanceof OutcomeError && error.code === "UNKNOWN_DECISION",
  );
  assert.throws(
    () => createOutcome({ ...base, idea_version: 0 }, NOW),
    (error: unknown) =>
      error instanceof OutcomeError && error.code === "INVALID_IDEA_VERSION",
  );
});

test("brier and log loss are scored against the recorded binary", () => {
  const records = [
    outcome("outcome_bbbb0001", "idea_a", 0.9, true),
    outcome("outcome_bbbb0002", "idea_b", 0.2, false),
  ];

  assert.equal(brierScore(records), 0.025);
  const loss = logLoss(records);
  assert.ok(loss !== null);
  assert.ok(Math.abs(loss - 0.164252) < 0.00001);

  const coin = [outcome("outcome_bbbb0003", "idea_c", 0.5, true)];
  const coinLoss = logLoss(coin);
  assert.ok(coinLoss !== null);
  assert.ok(Math.abs(coinLoss - Math.LN2) < 1e-9);

  assert.equal(brierScore([]), null);
  assert.equal(logLoss([]), null);
});

test("calibrationReport is reproducible and exposes missing outcomes", () => {
  const records = [
    outcome("outcome_cccc0002", "idea_a", 0.2, false),
    outcome("outcome_cccc0001", "idea_a", 0.9, true),
  ];

  const report = calibrationReport(records, {
    now: NOW,
    decidedIdeaIds: ["idea_a", "idea_b", "idea_b"],
  });

  assert.equal(report.generated_at, NOW);
  assert.equal(report.sample_count, 2);
  assert.deepEqual(report.missing_outcome_ideas, ["idea_b"]);
  assert.equal(report.bins.length, 10);
  const high = report.bins[9];
  assert.ok(high);
  assert.equal(high.count, 1);
  assert.equal(high.observed_success_rate, 1);

  const again = calibrationReport([...records].reverse(), {
    now: NOW,
    decidedIdeaIds: ["idea_b", "idea_a"],
  });
  assert.deepEqual(again, report);
});

test("outcomeEdge links the outcome to its idea with provenance", () => {
  const record = outcome("outcome_dddd0001", "idea_1", 0.7, true);
  const edge = outcomeEdge(record, NOW);

  assert.equal(edge.from.type, "outcome");
  assert.equal(edge.to.type, "idea");
  assert.equal(edge.relation, "outcome_of");
  assert.equal(edge.provenance, "outcome");
  assert.equal(edge.created_at, NOW);
});
