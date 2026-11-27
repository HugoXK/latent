import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/index.js";
import { createEdge } from "@latent/core";
import type { Fragment, Idea, MemoryEdge } from "@latent/core";

const NOW = "2026-11-27T00:00:00.000Z";

const fragment: Fragment = {
  id: "frg_memory0001",
  captured_at: NOW,
  kind: "text",
  content: "soil microbial biosensor for heavy metals",
  privacy: "private",
  schema_version: "1.0.0",
};

const idea: Idea = {
  id: "idea_memory0001",
  version: 1,
  fragment_ids: [fragment.id],
  title: "Soil biosensor",
  one_liner: "detect heavy metals with a soil community",
  status: "developed",
  hypotheses: [
    {
      id: "hyp_1",
      variant: "conservative",
      statement: "use the community as a whole-cell sensor",
      confidence: 0.4,
      confidence_basis: "C",
    },
  ],
  assumptions: [],
  claims: [],
  schema_version: "1.0.0",
};

function edge(
  id: string,
  fromId: string,
  toId: string,
  ownerId = "local",
): MemoryEdge {
  return createEdge(
    {
      id,
      owner_id: ownerId,
      from: { type: "fragment", id: fromId },
      to: { type: "idea", id: toId },
      relation: "derived_from",
      provenance: "develop",
    },
    NOW,
  );
}

test("a new store reports the current schema version", () => {
  const store = new Store(":memory:");
  try {
    assert.equal(store.schemaVersion(), 4);
  } finally {
    store.close();
  }
});

test("migrations and edges survive a reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "latent-memory-"));
  const path = join(dir, "latent.sqlite");
  try {
    const first = new Store(path);
    first.putFragment(fragment);
    first.putIdea(idea);
    first.putEdge(edge("edg_dddd0001", fragment.id, idea.id));
    first.close();

    const second = new Store(path);
    try {
      assert.equal(second.schemaVersion(), 4);
      assert.deepEqual(second.getFragment(fragment.id), fragment);
      assert.equal(second.getEdge("edg_dddd0001")?.relation, "derived_from");
    } finally {
      second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("edges and connection queries are owner-scoped", () => {
  const store = new Store(":memory:");
  try {
    store.putEdge(edge("edg_eeee0001", "frg_shared", "idea_alice", "alice"));
    store.putEdge(edge("edg_eeee0002", "frg_shared", "idea_bob", "bob"));

    assert.equal(store.listEdges({ ownerId: "alice" }).length, 1);

    const alice = store.connectionExplanation(
      { type: "fragment", id: "frg_shared" },
      { type: "idea", id: "idea_alice" },
      { ownerId: "alice" },
    );
    assert.equal(alice.found, true);

    const cross = store.connectionExplanation(
      { type: "fragment", id: "frg_shared" },
      { type: "idea", id: "idea_alice" },
      { ownerId: "bob" },
    );
    assert.equal(cross.found, false);

    assert.equal(store.exportMemory({ ownerId: "alice", now: NOW }).edges.length, 1);
  } finally {
    store.close();
  }
});

test("searchMemory finds ideas and live fragments", () => {
  const store = new Store(":memory:");
  try {
    store.putFragment(fragment);
    store.putIdea(idea);

    const hits = store.searchMemory("biosensor");
    assert.deepEqual(
      hits.map((hit) => `${hit.type}:${hit.id}`).sort(),
      [`fragment:${fragment.id}`, `idea:${idea.id}`],
    );

    assert.equal(store.searchMemory("nothing-matches-this").length, 0);
  } finally {
    store.close();
  }
});

test("deleting a referenced fragment blocks, then an explicit mark records the orphans", () => {
  const store = new Store(":memory:");
  try {
    store.putFragment(fragment);
    store.putIdea(idea);
    store.putEdge(edge("edg_ffff0001", fragment.id, idea.id));

    const blocked = store.deleteFragment(fragment.id);
    assert.equal(blocked.deleted, false);
    assert.equal(blocked.reason, "in_use");
    assert.deepEqual(blocked.orphanedIdeas, [idea.id]);
    assert.notEqual(store.getFragment(fragment.id), null);

    const marked = store.deleteFragment(fragment.id, { policy: "mark", now: NOW });
    assert.equal(marked.deleted, true);
    assert.equal(store.getFragment(fragment.id), null);
    assert.equal(
      store.listEdges({ node: { type: "fragment", id: fragment.id } }).length,
      0,
    );
    assert.ok(
      store
        .listEvents(fragment.id)
        .some((event) => event.type === "fragment.deleted"),
    );
  } finally {
    store.close();
  }
});

test("exportMemory is a deterministic open-format graph", () => {
  const store = new Store(":memory:");
  try {
    store.putEdge(edge("edg_99990002", "frg_b", "idea_b"));
    store.putEdge(edge("edg_99990001", "frg_a", "idea_a"));

    const exported = store.exportMemory({ now: NOW });
    assert.equal(exported.schema_version, "1.0.0");
    assert.equal(exported.exported_at, NOW);
    assert.deepEqual(
      exported.edges.map((item) => item.id),
      ["edg_99990001", "edg_99990002"],
    );
    assert.deepEqual(
      exported.nodes.map((node) => `${node.type}:${node.id}`),
      [
        "fragment:frg_a",
        "fragment:frg_b",
        "idea:idea_a",
        "idea:idea_b",
      ],
    );
  } finally {
    store.close();
  }
});

test("an existing v1 database migrates to the current version without losing fragments", () => {
  const dir = mkdtempSync(join(tmpdir(), "latent-migrate-"));
  const path = join(dir, "latent.sqlite");
  try {
    const old = new DatabaseSync(path);
    old.exec(
      `CREATE TABLE fragments (
         id TEXT PRIMARY KEY,
         captured_at TEXT NOT NULL,
         data TEXT NOT NULL
       );
       PRAGMA user_version = 1;`,
    );
    old
      .prepare("INSERT INTO fragments (id, captured_at, data) VALUES (?, ?, ?)")
      .run(fragment.id, fragment.captured_at, JSON.stringify(fragment));
    old.close();

    const store = new Store(path);
    try {
      assert.equal(store.schemaVersion(), 4);
      assert.deepEqual(store.getFragment(fragment.id), fragment);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
