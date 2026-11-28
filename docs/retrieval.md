# Retrieval

- Status: implemented (local)
- Date: 2026-11-26
- Owner: HugoXK

The first retrieval layer is a **local hybrid index**: BM25, an embedding provider
and reciprocal rank fusion. It is deterministic and offline by default, and it
implements the `SearchProvider` port from the core.

## Components

- [`bm25.ts`](../packages/retrieval/src/bm25.ts) — a BM25 index with configurable
  `k1` and `b`; the title is weighted twice.
- [`embeddings.ts`](../packages/retrieval/src/embeddings.ts) —
  `HashingEmbeddingProvider` (deterministic, offline) and
  `HttpEmbeddingProvider` (OpenAI-compatible `/embeddings`, tested with a fake).
- [`rerank.ts`](../packages/retrieval/src/rerank.ts) — reciprocal rank fusion.
- [`index.ts`](../packages/retrieval/src/index.ts) — `LocalRetrievalIndex`, the
  `SearchProvider` implementation.

## Embeddings

The default `HashingEmbeddingProvider` is a feature-hashing vector: it is
deterministic and offline, but it is **lexical, not semantic**. It exists so the
index can be built and tested without a provider. Pass `HttpEmbeddingProvider`
for a real embedding model; the tests inject `fetchImpl` and make no network call.

## Filters

`RetrievalQuery.filters` is an exact metadata match:

```ts
await index.searchDetailed({
  text: "pathogen detection",
  filters: { bsl: 2, village: "Diagnostics" },
});
```

Range filters (year, BSL) are a later item. The metadata keys are open so a new
vertical can add `kind`, `host` or a domain-specific field without a core change.

## Recall

The test suite has a fixed query set over an illustrative corpus and asserts
**recall@3 ≥ 0.8**. The corpus is small on purpose: it catches a broken tokenizer,
a filter bug or a ranking regression, not a domain-wide quality claim. A real
corpus is ingested in #39 and the replay harness (#16) is the end-to-end judge.

## Limitations

- The default embedding is lexical; semantic recall needs the HTTP adapter.
- The index is rebuilt from a document array; persistence and snapshot manifests
  are #34.
- No learned reranker yet; reciprocal rank fusion is deliberately simple and
  auditable.
