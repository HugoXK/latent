import test from "node:test";
import assert from "node:assert/strict";
import { Store, JobError } from "../src/index.js";
import { SuggestionError } from "@latent/core";
import type { Suggestion } from "@latent/core";

const NOW = "2026-11-27T00:00:00.000Z";

function suggestion(
  id: string,
  jobId: string,
  ownerId = "local",
): Suggestion {
  return {
    id,
    owner_id: ownerId,
    job_id: jobId,
    kind: "connection",
    from: { type: "idea", id: "idea_a" },
    to: { type: "fragment", id: "frg_a" },
    reason: "shared terms: soil, biosensor",
    score: 0.5,
    budget_cost: 1,
    status: "proposed",
    created_at: NOW,
    decided_at: null,
    decided_by: null,
    schema_version: "1.0.0",
  };
}

test("the store migrates to the incubation schema version", () => {
  const store = new Store(":memory:");
  try {
    assert.equal(store.schemaVersion(), 5);
  } finally {
    store.close();
  }
});

test("jobs are owner-scoped and the global cap is enforced", () => {
  const store = new Store(":memory:");
  try {
    const job = store.createJob({ ownerId: "alice", budget: 2 });
    assert.equal(job.status, "queued");
    assert.equal(job.spent, 0);
    assert.equal(store.listJobs({ ownerId: "alice" }).length, 1);
    assert.equal(store.listJobs({ ownerId: "bob" }).length, 0);

    assert.throws(
      () => store.createJob({ budget: -1 }),
      (error: unknown) =>
        error instanceof JobError && error.code === "INVALID_BUDGET",
    );
    assert.throws(
      () => store.createJob({ budget: 101 }),
      (error: unknown) =>
        error instanceof JobError && error.code === "INVALID_BUDGET",
    );

    for (let index = 0; index < 3; index += 1) {
      store.createJob({ ownerId: "alice", budget: 1 });
    }
    assert.throws(
      () => store.createJob({ ownerId: "alice", budget: 1 }),
      (error: unknown) =>
        error instanceof JobError && error.code === "JOB_CAP_REACHED",
    );
  } finally {
    store.close();
  }
});

test("a suggestion is proposed, accepted and kept in the audit log", () => {
  const store = new Store(":memory:");
  try {
    const job = store.createJob({ budget: 2 });
    store.putSuggestion(suggestion("sug_test0001", job.id));
    store.putSuggestion(suggestion("sug_test0002", job.id, "bob"));

    assert.equal(store.listSuggestions({ ownerId: "local" }).length, 1);
    assert.equal(store.listSuggestions({ ownerId: "bob" }).length, 1);
    assert.equal(
      store.listSuggestions({ ownerId: "local", status: "proposed" }).length,
      1,
    );

    const accepted = store.decideSuggestion("sug_test0001", "accepted", {
      now: NOW,
    });
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.decided_by, "human");
    assert.ok(
      store
        .listEvents("sug_test0001")
        .some((event) => event.type === "suggestion.decided"),
    );

    assert.throws(
      () => store.decideSuggestion("sug_test0001", "rejected"),
      (error: unknown) =>
        error instanceof SuggestionError &&
        error.code === "ILLEGAL_SUGGESTION_TRANSITION",
    );

    const digest = store.suggestionDigest({ now: NOW });
    assert.equal(digest.proposed_count, 1);
    assert.equal(digest.items[0]?.id, "sug_test0002");
  } finally {
    store.close();
  }
});
