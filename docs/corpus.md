# Corpus ingestion

- Status: implemented (local)
- Date: 2026-11-26
- Owner: HugoXK

The corpus layer turns the iGEM Registry, team wikis and papers into documents the
retrieval index and the novelty graph can consume. It is a **port + ingestor**:
the source does the network access, the ingestor does the cache, the snapshot and
the rate limit.

Implementation: [`packages/retrieval/src/corpus.ts`](../packages/retrieval/src/corpus.ts).

## Sources

| Source | Grade | What it is |
|---|---|---|
| `PaperSource` | **A** | peer-reviewed title + abstract + DOI |
| `TeamWikiSource` | **B** | Engineering / Parts pages, not the promo video |
| `parsePartsFasta` | **C**, or **B** when characterised | Registry `All_Parts` FASTA; the sequence is kept in metadata |

The A/B/C scale matches the iGEM vertical: a sequence-only part is budgeted as
"re-characterise", never as "use as is".

## Ingest

```ts
const ingestor = new CorpusIngestor([registry, wiki, papers], {
  cache: new IngestionCache(),
  snapshots: new SnapshotStore(),
  rateLimitMs: 1000,
});
const { documents, stats } = await ingestor.ingest();
const index = await LocalRetrievalIndex.build(toRetrievalDocuments(documents));
```

- **Content snapshot**: every item gets a SHA-256 of its text; identical text is
  stored once, whatever the URL.
- **URL cache**: a repeated ingest reuses the document and does not re-snapshot.
- **Rate limit**: a delay between sources, not between items; a real adapter adds
  its own provider limit.

## Tests

`packages/retrieval/test/corpus.test.ts` uses fixtures only: a FASTA sample, a
paper, a wiki page and a fake source. It asserts the A/B/C grades, the sequence
hash, the cache reuse and the stats. No network call is made in CI.

## Add a real adapter

1. Implement `CorpusSource.list()` with the provider's client.
2. Return `CorpusItem`s with a stable `id`, `url` and `text`.
3. Do not snapshot or cache inside the adapter; the ingestor does both.
4. Add a fixture test and a rate-limit note.
