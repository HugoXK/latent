import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotStore } from "@latent/core";
import {
  CorpusIngestor,
  IngestionCache,
  PaperSource,
  TeamWikiSource,
  parsePartsFasta,
  toRetrievalDocuments,
} from "../src/index.js";
import type { CorpusSource } from "../src/index.js";

const NOW = "2026-11-25T00:00:00Z";

const FASTA = `>BBa_B0034 B BBa_B0034 RBS "strong RBS"
actagt
>BBa_E0040 C BBa_E0040 CDS "GFP"
atggtgagcaag
`;

test("the Registry FASTA parser keeps the sequence and assigns C/B", () => {
  const items = parsePartsFasta(FASTA, {
    characterized: new Set(["BBa_B0034"]),
  });
  assert.equal(items.length, 2);
  assert.equal(items[0]?.id, "BBa_B0034");
  assert.equal(items[0]?.source_grade, "B");
  assert.equal(items[0]?.metadata.sequence, "actagt");
  assert.equal(items[1]?.source_grade, "C");
  assert.match(items[1]?.url ?? "", /BBa_E0040/);
});

test("paper and team-wiki sources set A and B", async () => {
  const paper = new PaperSource([
    {
      id: "p1",
      title: "Arsenic paper",
      abstract: "A paper about arsenic",
      doi: "10.1000/x",
      year: 2024,
    },
  ]);
  const wiki = new TeamWikiSource([
    { id: "w1", title: "Team page", text: "Engineering", url: "https://wiki/1" },
  ]);
  assert.equal((await paper.list())[0]?.source_grade, "A");
  assert.equal((await wiki.list())[0]?.source_grade, "B");
});

test("the ingestor snapshots, caches and reports stats", async () => {
  const source: CorpusSource = {
    name: "fixture",
    async list() {
      return [
        {
          id: "doc_1",
          kind: "part",
          title: "Part one",
          text: "arsenic biosensor",
          url: "https://example.org/1",
          metadata: {},
          source_grade: "C",
        },
        {
          id: "doc_2",
          kind: "paper",
          title: "Paper two",
          text: "a paper",
          url: "https://example.org/2",
          metadata: {},
          source_grade: "A",
        },
      ];
    },
  };
  const snapshots = new SnapshotStore();
  const cache = new IngestionCache();
  const ingestor = new CorpusIngestor([source], {
    snapshots,
    cache,
    rateLimitMs: 0,
    now: () => NOW,
  });

  const first = await ingestor.ingest();
  assert.equal(first.documents.length, 2);
  assert.equal(first.stats.added, 2);
  assert.equal(first.stats.cached, 0);
  assert.equal(snapshots.size, 2);
  assert.ok(first.documents.every((document) => document.snapshot_hash.length === 64));

  const second = await ingestor.ingest();
  assert.equal(second.stats.cached, 2);
  assert.equal(second.stats.added, 0);
  assert.equal(snapshots.size, 2);
});

test("corpus documents map to retrieval documents", async () => {
  const source: CorpusSource = {
    name: "fixture",
    async list() {
      return [
        {
          id: "doc_1",
          kind: "part",
          title: "Part one",
          text: "arsenic biosensor",
          url: "https://example.org/1",
          metadata: {},
          source_grade: "C",
        },
      ];
    },
  };
  const result = await new CorpusIngestor([source], { now: () => NOW }).ingest();
  const documents = toRetrievalDocuments(result.documents);
  assert.equal(documents.length, 1);
  assert.equal(documents[0]?.snapshot_hash, result.documents[0]?.snapshot_hash);
});
