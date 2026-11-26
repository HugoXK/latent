import test from "node:test";
import assert from "node:assert/strict";
import {
  SnapshotStore,
  createSnapshot,
  hashContent,
  withSnapshot,
} from "../src/index.js";
import type { Source } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";

test("a content hash is stable and SHA-256 sized", () => {
  assert.equal(hashContent("arsenic"), hashContent("arsenic"));
  assert.notEqual(hashContent("arsenic"), hashContent("arsenic "));
  assert.equal(hashContent("arsenic").length, 64);
});

test("the store deduplicates identical content across URLs", () => {
  const store = new SnapshotStore();
  const a = createSnapshot({ content: "same", url: "https://a", fetched_at: NOW });
  const b = createSnapshot({ content: "same", url: "https://b", fetched_at: NOW });
  store.put(a);
  store.put(b);
  assert.equal(store.size, 1);
  assert.equal(store.get(a.hash)?.url, "https://a");
});

test("a source records the snapshot hash", () => {
  const source: Source = {
    kind: "paper",
    url: "https://example.org/paper",
    span: "a span",
    accessed_at: NOW,
  };
  const snapshot = createSnapshot({
    content: "the page body",
    url: source.url,
    fetched_at: NOW,
  });
  const withHash = withSnapshot(source, snapshot);
  assert.equal(withHash.snapshot_hash, snapshot.hash);
  assert.equal(source.snapshot_hash, undefined);
});
