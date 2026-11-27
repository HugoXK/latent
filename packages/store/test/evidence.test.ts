import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceError, Store } from "../src/index.js";
import { createSnapshot, SchemaValidationError } from "@latent/core";
import type { StoredRetrievalDocument } from "../src/index.js";

const NOW = "2026-11-27T00:00:00.000Z";

test("snapshots are content-addressed and retrieval documents persist", () => {
  const store = new Store(":memory:");
  try {
    assert.equal(store.schemaVersion(), 5);
    const first = createSnapshot({
      content: "arsenic biosensor soil",
      url: "https://example.org/a",
      title: "A",
      fetched_at: NOW,
    });
    const second = createSnapshot({
      content: "arsenic biosensor soil",
      url: "https://example.org/b",
      fetched_at: NOW,
    });
    assert.equal(first.hash, second.hash);

    store.putSnapshot(first);
    store.putSnapshot(second);
    assert.equal(store.hasSnapshot(first.hash), true);
    assert.equal(store.getSnapshot(first.hash)?.url, "https://example.org/a");
    assert.equal(store.listSnapshots().length, 1);

    const document: StoredRetrievalDocument = {
      id: "doc_a",
      title: "Arsenic biosensor",
      url: "https://example.org/a",
      text: "arsenic biosensor soil",
      metadata: { village: "Diagnostics", year: 2019 },
      snapshot_hash: first.hash,
    };
    store.putRetrievalDocument(document);
    assert.deepEqual(store.getRetrievalDocument("doc_a"), document);
    assert.equal(store.listRetrievalDocuments().length, 1);
    assert.equal(store.counts().snapshots, 1);
    assert.equal(store.counts().documents, 1);

    assert.throws(
      () =>
        store.putSnapshot({
          ...first,
          hash: "not-a-hash",
        }),
      SchemaValidationError,
    );
  } finally {
    store.close();
  }
});

test("snapshots and documents survive a reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "latent-evidence-"));
  const path = join(dir, "latent.sqlite");
  try {
    const first = new Store(path);
    const snapshot = createSnapshot({
      content: "a source",
      url: "https://example.org/source",
      fetched_at: NOW,
    });
    first.putSnapshot(snapshot);
    first.putRetrievalDocument({
      id: "doc_1",
      title: "Source",
      url: snapshot.url,
      text: snapshot.content,
      metadata: {},
      snapshot_hash: snapshot.hash,
    });
    first.close();

    const second = new Store(path);
    try {
      assert.equal(second.schemaVersion(), 5);
      assert.equal(second.getSnapshot(snapshot.hash)?.content, "a source");
      assert.equal(second.getRetrievalDocument("doc_1")?.title, "Source");
    } finally {
      second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("corpus ingest deduplicates snapshots by content", () => {
  const store = new Store(":memory:");
  try {
    const result = store.ingestDocuments([
      {
        id: "doc_1",
        title: "One",
        url: "https://example.org/1",
        text: "same content",
        metadata: { year: 2024 },
      },
      {
        id: "doc_2",
        title: "Two",
        url: "https://example.org/2",
        text: "same content",
      },
    ]);
    assert.deepEqual(result, {
      documents: 2,
      snapshots_added: 1,
      snapshots_cached: 1,
    });
    assert.equal(store.listRetrievalDocuments().length, 2);
    assert.equal(store.listSnapshots().length, 1);

    assert.throws(
      () =>
        store.ingestDocuments([
          { id: "doc_1", title: "x", url: "u", text: "t" },
          { id: "doc_1", title: "y", url: "u", text: "t" },
        ]),
      (error: unknown) =>
        error instanceof EvidenceError && error.code === "DUPLICATE_DOCUMENT",
    );
    assert.throws(
      () => store.ingestDocuments([]),
      (error: unknown) =>
        error instanceof EvidenceError && error.code === "EMPTY_CORPUS",
    );
  } finally {
    store.close();
  }
});
