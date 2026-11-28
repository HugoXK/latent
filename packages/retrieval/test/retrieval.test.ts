import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpEmbeddingProvider,
  LocalRetrievalIndex,
} from "../src/index.js";
import type {
  EmbeddingFetch,
  RetrievalDocument,
} from "../src/index.js";

const documents: RetrievalDocument[] = [
  {
    id: "doc_arsenic",
    title: "Arsenic whole-cell biosensor",
    text: "arsenic responsive repressor fluorescence E. coli soil field",
    url: "https://example.org/arsenic",
    metadata: { village: "Diagnostics", year: 2019, bsl: 1, host: "E. coli" },
  },
  {
    id: "doc_paper",
    title: "Colorimetric paper strip for arsenic",
    text: "colorimetric paper strip water sample naked eye field",
    url: "https://example.org/paper",
    metadata: { village: "Diagnostics", year: 2020, bsl: 1, host: "cell-free" },
  },
  {
    id: "doc_soil",
    title: "Soil metagenome sequencing",
    text: "soil metagenome sequencing microbial community",
    url: "https://example.org/soil",
    metadata: {
      village: "Foundational Advance",
      year: 2021,
      bsl: 1,
      host: "E. coli",
    },
  },
  {
    id: "doc_rna",
    title: "RNA thermosensor",
    text: "RNA thermosensor temperature control",
    url: "https://example.org/rna",
    metadata: {
      village: "Foundational Advance",
      year: 2020,
      bsl: 1,
      host: "E. coli",
    },
  },
  {
    id: "doc_pathogen",
    title: "CRISPR pathogen detection",
    text: "CRISPR pathogen detection clinical sample",
    url: "https://example.org/pathogen",
    metadata: { village: "Diagnostics", year: 2022, bsl: 2, host: "E. coli" },
  },
];

const index = await LocalRetrievalIndex.build(documents);

test("bm25 + vector rank the arsenic document first", async () => {
  const hits = await index.searchDetailed({ text: "arsenic biosensor", limit: 3 });
  assert.equal(hits[0]?.id, "doc_arsenic");
});

test("metadata filters are exact", async () => {
  const hits = await index.searchDetailed({
    text: "pathogen detection",
    filters: { bsl: 2 },
    limit: 5,
  });
  assert.deepEqual(
    hits.map((hit) => hit.id),
    ["doc_pathogen"],
  );
});

test("the SearchProvider port returns SearchHit", async () => {
  const hits = await index.search("paper strip", 3);
  assert.equal(hits[0]?.id, "doc_paper");
  assert.ok((hits[0]?.snippet.length ?? 0) > 0);
});

test("recall@3 on a fixed query set", async () => {
  const queries = [
    { text: "arsenic biosensor", expected: "doc_arsenic" },
    { text: "colorimetric paper strip", expected: "doc_paper" },
    { text: "soil metagenome", expected: "doc_soil" },
    { text: "RNA thermosensor", expected: "doc_rna" },
    { text: "CRISPR pathogen", expected: "doc_pathogen" },
  ];
  let found = 0;
  for (const query of queries) {
    const hits = await index.searchDetailed({ text: query.text, limit: 3 });
    if (hits.some((hit) => hit.id === query.expected)) found += 1;
  }
  assert.ok(found / queries.length >= 0.8);
});

test("the index is deterministic", async () => {
  const left = await LocalRetrievalIndex.build(documents);
  const right = await LocalRetrievalIndex.build(documents);
  const a = await left.searchDetailed({ text: "arsenic biosensor", limit: 3 });
  const b = await right.searchDetailed({ text: "arsenic biosensor", limit: 3 });
  assert.deepEqual(
    a.map((hit) => hit.id),
    b.map((hit) => hit.id),
  );
});

test("the index is deterministic across corpus order", async () => {
  const forward = await LocalRetrievalIndex.build(documents);
  const backward = await LocalRetrievalIndex.build([...documents].reverse());
  for (const text of [
    "arsenic biosensor",
    "unrelated query about economics",
    "pathogen detection",
  ]) {
    const a = await forward.searchDetailed({ text, limit: 5 });
    const b = await backward.searchDetailed({ text, limit: 5 });
    assert.deepEqual(
      a.map((hit) => hit.id),
      b.map((hit) => hit.id),
      `different order for query: ${text}`,
    );
  }
});

test("a zero-cosine document never enters the semantic ranking", async () => {
  const hits = await index.searchDetailed({
    text: "unrelated economics query",
    limit: 5,
  });
  for (const hit of hits) {
    assert.ok(hit.vector > 0, `${hit.id} was ranked with a zero semantic score`);
  }
});

test("a private document is refused before an HTTP embedding call", async () => {
  let calls = 0;
  const fetchImpl: EmbeddingFetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ data: documents.map(() => ({ embedding: [1, 0] })) }),
    };
  };
  const provider = new HttpEmbeddingProvider({
    baseUrl: "https://example.test/v1",
    apiKey: "k",
    model: "m",
    fetchImpl,
  });
  const privateDocument = { ...documents[0], privacy: "private" } as RetrievalDocument;
  await assert.rejects(
    () => LocalRetrievalIndex.build([privateDocument], { embedding: provider }),
    (error: unknown) =>
      (error as { code?: string }).code === "EMBEDDING_PRIVATE_REFUSED",
  );
  assert.equal(calls, 0, "a private document must not reach the provider");
});
