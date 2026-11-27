import test from "node:test";
import assert from "node:assert/strict";
import {
  IncubationError,
  SuggestionError,
  buildDigest,
  decideSuggestion,
  planIncubation,
  runIncubation,
} from "../src/index.js";
import type {
  AgentRuntime,
  IncubationInput,
  IncubationNode,
  MemoryEdge,
} from "../src/index.js";

const NOW = "2026-11-27T00:00:00.000Z";

const seed = {
  ref: { type: "idea" as const, id: "idea_seed" },
  text: "soil biosensor heavy metals",
};

const nodes: IncubationNode[] = [
  seed,
  {
    ref: { type: "fragment", id: "frg_a" },
    text: "soil biosensor for arsenic",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    ref: { type: "fragment", id: "frg_b" },
    text: "biosensor heavy metal detection",
    updated_at: "2026-11-01T00:00:00Z",
  },
  {
    ref: { type: "fragment", id: "frg_c" },
    text: "software compiler for contracts",
    updated_at: "2026-11-01T00:00:00Z",
  },
];

function input(overrides: Partial<IncubationInput> = {}): IncubationInput {
  return {
    owner_id: "local",
    job_id: "job_seed0001",
    seed: seed.ref,
    nodes,
    budget: 2,
    min_score: 0.2,
    now: NOW,
    ...overrides,
  };
}

test("a job never spends more than its budget", () => {
  const result = planIncubation(input({ budget: 1 }));
  assert.equal(result.spent, 1);
  assert.equal(result.suggestions.length, 1);
  assert.ok(result.skipped >= 1);

  const zero = planIncubation(input({ budget: 0 }));
  assert.equal(zero.spent, 0);
  assert.equal(zero.suggestions.length, 0);

  assert.throws(
    () => planIncubation(input({ budget: -1 })),
    (error: unknown) =>
      error instanceof IncubationError && error.code === "INVALID_BUDGET",
  );
});

test("the proposal engine is deterministic and ordered by score", () => {
  const first = planIncubation(input());
  const second = planIncubation(input());
  assert.deepEqual(
    first.suggestions.map((item) => ({
      to: item.to,
      score: item.score,
      reason: item.reason,
    })),
    second.suggestions.map((item) => ({
      to: item.to,
      score: item.score,
      reason: item.reason,
    })),
  );
  const scores = first.suggestions.map((item) => item.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.ok(!first.suggestions.some((item) => item.to.id === "frg_c"));
});

test("an existing live edge is not proposed again", () => {
  const edge: MemoryEdge = {
    id: "edg_incubation0001",
    owner_id: "local",
    from: seed.ref,
    to: { type: "fragment", id: "frg_a" },
    relation: "references",
    provenance: "test",
    created_at: NOW,
    deleted_at: null,
    schema_version: "1.0.0",
  };
  const result = planIncubation(input({ edges: [edge] }));
  assert.ok(!result.suggestions.some((item) => item.to.id === "frg_a"));
  assert.ok(result.suggestions.some((item) => item.to.id === "frg_b"));
});

test("a node older than the cutoff is a resurface suggestion", () => {
  const result = planIncubation(
    input({ budget: 3, since: "2026-06-01T00:00:00Z" }),
  );
  const old = result.suggestions.find((item) => item.to.id === "frg_a");
  const recent = result.suggestions.find((item) => item.to.id === "frg_b");
  assert.equal(old?.kind, "resurface");
  assert.equal(recent?.kind, "connection");
});

test("the job runs through the runtime port", async () => {
  const scheduled: Array<{ id: string; kind: string }> = [];
  const runtime: AgentRuntime = {
    async schedule(job) {
      scheduled.push({ id: job.id, kind: job.kind });
      return { ref: "fake" };
    },
    async cancel() {
      return;
    },
  };
  const result = await runIncubation(input({ budget: 1 }), runtime);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0]?.id, "job_seed0001");
  assert.equal(scheduled[0]?.kind, "incubate");
  assert.equal(result.spent, 1);
});

test("suggestions are accepted, rejected or revoked by a human only", () => {
  const suggestion = planIncubation(input({ budget: 1 })).suggestions[0];
  assert.ok(suggestion);

  const accepted = decideSuggestion(suggestion, "accepted", NOW);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.decided_by, "human");
  assert.equal(accepted.decided_at, NOW);

  assert.throws(
    () => decideSuggestion(accepted, "rejected", NOW),
    (error: unknown) =>
      error instanceof SuggestionError &&
      error.code === "ILLEGAL_SUGGESTION_TRANSITION",
  );

  const digest = buildDigest([accepted, suggestion], { now: NOW });
  assert.equal(digest.proposed_count, 1);
  assert.equal(digest.items[0]?.id, suggestion.id);
});

test("an existing suggestion is not proposed again", () => {
  const first = planIncubation(input({ budget: 3 }));
  assert.ok(first.suggestions.length > 0);
  const second = planIncubation(
    input({
      budget: 3,
      existing: first.suggestions.map((item) => ({
        from: item.from,
        to: item.to,
      })),
    }),
  );
  assert.equal(second.suggestions.length, 0);
});
