import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/index.js";
import { createOutcome } from "@latent/core";
import type { Idea, Outcome } from "@latent/core";

const NOW = "2026-11-27T00:00:00.000Z";

function idea(id: string, status: Idea["status"]): Idea {
  return {
    id,
    version: 1,
    fragment_ids: [],
    title: "t",
    one_liner: "o",
    status,
    hypotheses: [
      {
        id: "hyp_1",
        variant: "conservative",
        statement: "s",
        confidence: 0.5,
        confidence_basis: "C",
      },
    ],
    assumptions: [],
    claims: [],
    schema_version: "1.0.0",
  };
}

function outcome(
  id: string,
  ideaId: string,
  predicted: number,
  success: boolean,
  ownerId = "local",
): Outcome {
  return createOutcome(
    {
      id,
      idea_id: ideaId,
      idea_version: 1,
      owner_id: ownerId,
      decision: success ? "tested" : "failed",
      realised_success: success,
      predicted_confidence: predicted,
      decided_by: "human",
    },
    NOW,
  );
}

test("the store migrates to the outcome schema version", () => {
  const store = new Store(":memory:");
  try {
    assert.equal(store.schemaVersion(), 5);
  } finally {
    store.close();
  }
});

test("outcomes are owner-scoped and filterable by idea", () => {
  const store = new Store(":memory:");
  try {
    store.putOutcome(outcome("outcome_aaaa0001", "idea_a", 0.8, true, "alice"));
    store.putOutcome(outcome("outcome_aaaa0002", "idea_b", 0.3, false, "bob"));

    assert.equal(store.listOutcomes({ ownerId: "alice" }).length, 1);
    assert.equal(store.listOutcomes({ ideaId: "idea_b" }).length, 1);
    assert.equal(store.getOutcome("outcome_aaaa0001")?.realised_success, true);
    assert.equal(store.listOutcomes({ ownerId: "carol" }).length, 0);
  } finally {
    store.close();
  }
});

test("the calibration report lists decided ideas without an outcome", () => {
  const store = new Store(":memory:");
  try {
    store.putIdea(idea("idea_with0001", "briefed"));
    store.putIdea(idea("idea_without0001", "briefed"));
    store.putIdea(idea("idea_developed0001", "developed"));
    store.putOutcome(outcome("outcome_bbbb0001", "idea_with0001", 0.7, true));

    const report = store.calibrationReport({ now: NOW });
    assert.equal(report.generated_at, NOW);
    assert.equal(report.sample_count, 1);
    assert.deepEqual(report.missing_outcome_ideas, ["idea_without0001"]);
    assert.ok(report.brier !== null);
    assert.ok(report.brier > 0);
  } finally {
    store.close();
  }
});

test("outcomes survive a reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "latent-outcome-"));
  const path = join(dir, "latent.sqlite");
  try {
    const first = new Store(path);
    first.putOutcome(outcome("outcome_cccc0001", "idea_a", 0.4, false));
    first.close();

    const second = new Store(path);
    try {
      assert.equal(second.schemaVersion(), 5);
      assert.equal(second.getOutcome("outcome_cccc0001")?.decision, "failed");
    } finally {
      second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
