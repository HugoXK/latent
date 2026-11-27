# 0018 — Persistent source snapshots and local hybrid retrieval

- Status: proposed (T2, schema + migration)
- Date: 2026-11-27
- Owner: HugoXK
- Issues: #34, #33, #39

## Context

The evidence ledger refers to `snapshot_hash`, and the retrieval package already
has BM25, hashing embeddings and reciprocal-rank fusion, but neither was persisted
or reachable from the CLI/API. A source could change under a claim, and retrieval
could only be exercised in a unit test.

## Decision

1. **A `SourceSnapshot` is a primitive.** `hash` (SHA-256 of the content) is the
   identity; `url` is provenance. The schema records `url`, `title`, `fetched_at`,
   `content`, optional `content_type` and `snapshot_version`.
2. **Snapshots and retrieval documents are stored in SQLite** (`user_version 4 -> 5`):
   - `snapshots(hash PK, url, title, fetched_at, content, data)`;
   - `retrieval_documents(id PK, snapshot_hash, title, url, text, metadata, data)`.
   The content lives in the row for a local install; a blob store can replace the
   content column behind the same methods when the corpus grows.
3. **Ingest is content-addressed and idempotent.** `Store.ingestDocuments`
   deduplicates snapshots by hash, upserts documents by id, rejects duplicate ids
   and empty documents, and returns `{documents, snapshots_added, snapshots_cached}`.
4. **Retrieval is built on demand.** `LocalRetrievalIndex` (BM25 + deterministic
   hashing embeddings + RRF) is built from the stored documents for each query. It
   is deterministic and offline; an HTTP embedding provider can be injected later.
5. **Surfaces:** CLI `ingest <file>` and `retrieve <query> [--limit] [--filter k=v]`;
   API `POST /v1/corpus` (`ideas:write`) and `POST /v1/retrieval` (`memory:read`);
   typed client methods. Retrieval without a corpus fails closed (`NO_CORPUS`).
6. **Network corpus adapters remain ports.** The Registry/wiki/paper adapters are
   future `CorpusSource` implementations; this change ships the local JSON ingest
   and the cache/snapshot contract they will use.

## Migration note

- `user_version 4 -> 5`.
- `CREATE TABLE snapshots`, `CREATE TABLE retrieval_documents` and their indexes.
- No existing row is rewritten. Existing briefs/claims are unchanged.
- Downgrade is not supported; the additions are append-only.

## Consequences

- A claim can point at an immutable snapshot hash and a retrieval hit carries the
  same provenance.
- Rebuilding the index per query is cheap at local scale and avoids a stale index.
- `retrieval_documents.text` duplicates snapshot content for indexing; a later
  blob-store/index change can remove it.
- Filters are exact matches on metadata primitives; range filters and pagination
  are follow-ups.
- Snapshots are local and single-owner; per-tenant scoping arrives with #50-hosted
  work (the local token is a single owner).
- Ingesting untrusted text does not make it instructions; retrieval output is data.

## Alternatives considered

- **Filesystem blob store now.** Rejected for v0.3: SQLite rows keep one file and
  one transaction domain. Revisit for large corpora.
- **A persistent inverted index.** Rejected: a rebuild is cheap and avoids a
  second source of truth.
- **Network ingestion now.** Deferred: adapter contracts and rate-limit policy
  need a source-specific decision.
- **A vector database.** Rejected: a local hybrid index with hashing embeddings is
  deterministic and dependency-free.

## Risks

- Large snapshots inflate the SQLite file; the blob-store refactor is the escape
  hatch.
- The hashing embedding is lexical, not semantic; the API documents the default.
- Snapshot growth has no retention policy yet.
