import test from "node:test";
import assert from "node:assert/strict";
import {
  MemoryEdgeError,
  assertValid,
  createEdge,
  developEdges,
  explainConnection,
} from "../src/index.js";
import type { Idea, MemoryEdge } from "../src/index.js";

const NOW = "2026-11-27T00:00:00.000Z";

function makeEdge(
  id: string,
  fromId: string,
  toId: string,
  relation: MemoryEdge["relation"] = "derived_from",
  deletedAt: string | null = null,
): MemoryEdge {
  return {
    id,
    owner_id: "local",
    from: { type: "fragment", id: fromId },
    to: { type: "idea", id: toId },
    relation,
    weight: 1,
    provenance: "test",
    created_at: NOW,
    deleted_at: deletedAt,
    schema_version: "1.0.0",
  };
}

test("createEdge produces a schema-valid typed edge", () => {
  const edge = createEdge(
    {
      owner_id: "local",
      from: { type: "fragment", id: "frg_00000001" },
      to: { type: "idea", id: "idea_00000001" },
      relation: "derived_from",
      provenance: "develop",
    },
    NOW,
  );

  assert.equal(edge.created_at, NOW);
  assert.equal(edge.weight, 1);
  assert.equal(edge.schema_version, "1.0.0");
  assert.match(edge.id, /^edg_[a-z0-9]{8,}$/);
  assert.doesNotThrow(() => assertValid("edge", edge));
});

test("createEdge rejects a self edge, empty provenance and a bad weight", () => {
  const base = {
    owner_id: "local",
    from: { type: "fragment" as const, id: "frg_00000001" },
    to: { type: "idea" as const, id: "idea_00000001" },
    relation: "references" as const,
    provenance: "test",
  };

  assert.throws(
    () => createEdge({ ...base, to: base.from }, NOW),
    (error: unknown) =>
      error instanceof MemoryEdgeError && error.code === "SELF_EDGE",
  );
  assert.throws(
    () => createEdge({ ...base, provenance: "   " }, NOW),
    (error: unknown) =>
      error instanceof MemoryEdgeError && error.code === "PROVENANCE_REQUIRED",
  );
  assert.throws(
    () => createEdge({ ...base, weight: 2 }, NOW),
    (error: unknown) =>
      error instanceof MemoryEdgeError && error.code === "WEIGHT_OUT_OF_RANGE",
  );
});

test("explainConnection finds a deterministic two-hop path", () => {
  const first = makeEdge("edg_aaaa0001", "frg_1", "idea_1");
  const second: MemoryEdge = {
    ...makeEdge("edg_aaaa0002", "idea_1", "clm_1", "references"),
    from: { type: "idea", id: "idea_1" },
    to: { type: "claim", id: "clm_1" },
  };

  const result = explainConnection(
    [second, first],
    { type: "fragment", id: "frg_1" },
    { type: "claim", id: "clm_1" },
    3,
  );

  assert.equal(result.found, true);
  assert.equal(result.depth, 2);
  assert.deepEqual(
    result.path.map((step) => step.edge.id),
    ["edg_aaaa0001", "edg_aaaa0002"],
  );
  assert.deepEqual(
    result.path.map((step) => step.direction),
    ["forward", "forward"],
  );
});

test("explainConnection honours maxDepth and ignores deleted edges", () => {
  const first = makeEdge("edg_bbbb0001", "frg_1", "idea_1");
  const second: MemoryEdge = {
    ...makeEdge("edg_bbbb0002", "idea_1", "clm_1", "references"),
    from: { type: "idea", id: "idea_1" },
    to: { type: "claim", id: "clm_1" },
  };

  const shallow = explainConnection(
    [first, second],
    { type: "fragment", id: "frg_1" },
    { type: "claim", id: "clm_1" },
    1,
  );
  assert.equal(shallow.found, false);

  const deleted = explainConnection(
    [first, { ...second, deleted_at: NOW }],
    { type: "fragment", id: "frg_1" },
    { type: "claim", id: "clm_1" },
    3,
  );
  assert.equal(deleted.found, false);
});

test("explainConnection returns depth 0 for the same node", () => {
  const result = explainConnection(
    [],
    { type: "idea", id: "idea_1" },
    { type: "idea", id: "idea_1" },
    3,
  );
  assert.equal(result.found, true);
  assert.equal(result.depth, 0);
  assert.deepEqual(result.path, []);
});

test("developEdges links the fragment, claims and gates to the idea", () => {
  const idea: Idea = {
    id: "idea_00000001",
    version: 1,
    fragment_ids: ["frg_00000001"],
    title: "t",
    one_liner: "o",
    status: "developed",
    hypotheses: [],
    assumptions: [],
    claims: ["clm_00000001"],
    gate_ids: ["gate_00000001"],
    schema_version: "1.0.0",
  };

  const edges = developEdges({
    idea,
    fragmentId: "frg_00000001",
    now: NOW,
  });

  assert.deepEqual(
    edges.map((edge) => `${edge.from.type}:${edge.to.type}:${edge.relation}`),
    [
      "fragment:idea:derived_from",
      "idea:claim:references",
      "idea:gate:references",
    ],
  );
  for (const edge of edges) {
    assert.equal(edge.created_at, NOW);
    assert.doesNotThrow(() => assertValid("edge", edge));
  }
});
