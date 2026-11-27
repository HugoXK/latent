import test from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "../src/index.js";
import { Store } from "@latent/store";

const AUTH = { authorization: "Bearer test-token" };

test("corpus ingest stores snapshots and retrieval ranks the corpus", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const corpus = await app.inject({
      method: "POST",
      url: "/v1/corpus",
      headers: AUTH,
      payload: {
        documents: [
          {
            id: "doc_arsenic",
            title: "Arsenic whole-cell biosensor",
            url: "https://example.org/arsenic",
            text: "arsenic responsive repressor fluorescence soil field",
            metadata: { village: "Diagnostics", year: 2019 },
          },
          {
            id: "doc_pathogen",
            title: "CRISPR pathogen detection",
            url: "https://example.org/pathogen",
            text: "CRISPR pathogen detection clinical sample",
            metadata: { village: "Diagnostics", year: 2022 },
          },
        ],
      },
    });
    assert.equal(corpus.statusCode, 201);
    assert.deepEqual(corpus.json(), {
      documents: 2,
      snapshots_added: 2,
      snapshots_cached: 0,
    });
    assert.equal(store.counts().snapshots, 2);
    assert.equal(store.counts().documents, 2);

    const retrieval = await app.inject({
      method: "POST",
      url: "/v1/retrieval",
      headers: AUTH,
      payload: { query: "arsenic biosensor", limit: 3 },
    });
    assert.equal(retrieval.statusCode, 200);
    const body = retrieval.json() as {
      hits: Array<{ id: string; snippet: string }>;
    };
    assert.equal(body.hits[0]?.id, "doc_arsenic");
    assert.ok((body.hits[0]?.snippet.length ?? 0) > 0);

    const filtered = await app.inject({
      method: "POST",
      url: "/v1/retrieval",
      headers: AUTH,
      payload: {
        query: "detection",
        filters: { village: "Diagnostics", year: 2022 },
      },
    });
    assert.equal(filtered.statusCode, 200);
    assert.deepEqual(
      (filtered.json() as { hits: Array<{ id: string }> }).hits.map(
        (hit) => hit.id,
      ),
      ["doc_pathogen"],
    );
  } finally {
    await app.close();
    store.close();
  }
});

test("retrieval fails closed without a corpus", async () => {
  const store = new Store(":memory:");
  const app = buildServer({ store, authToken: "test-token" });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/v1/retrieval",
      headers: AUTH,
      payload: { query: "anything" },
    });
    assert.equal(response.statusCode, 409);
    assert.equal(
      (response.json() as { error: { code: string } }).error.code,
      "NO_CORPUS",
    );
  } finally {
    await app.close();
    store.close();
  }
});
