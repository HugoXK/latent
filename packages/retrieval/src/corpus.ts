import { SnapshotStore, createSnapshot } from "@latent/core";
import type { RetrievalDocument, RetrievalMetadata } from "./index.js";

export type SourceGrade = "A" | "B" | "C";

export interface CorpusItem {
  id: string;
  kind: string;
  title: string;
  text: string;
  url: string;
  metadata: RetrievalMetadata;
  source_grade: SourceGrade;
}

export interface CorpusDocument extends CorpusItem {
  snapshot_hash: string;
}

export interface CorpusSource {
  readonly name: string;
  list(): Promise<CorpusItem[]>;
}

export class IngestionCache {
  readonly #items = new Map<string, CorpusDocument>();

  get(url: string): CorpusDocument | null {
    return this.#items.get(url) ?? null;
  }

  set(url: string, document: CorpusDocument): void {
    this.#items.set(url, document);
  }

  get size(): number {
    return this.#items.size;
  }
}

export interface CorpusIngestorOptions {
  cache?: IngestionCache;
  snapshots?: SnapshotStore;
  rateLimitMs?: number;
  now?: () => string;
}

export interface CorpusIngestStats {
  sources: number;
  items: number;
  cached: number;
  added: number;
}

export interface CorpusIngestResult {
  documents: CorpusDocument[];
  stats: CorpusIngestStats;
}

/**
 * Fetch items from each source, snapshot the text, deduplicate by URL and
 * return documents that the retrieval index can consume. The source is a port;
 * a real Registry/wiki/paper adapter does the network access, the ingestor does
 * the cache, the snapshot and the rate limit.
 */
export class CorpusIngestor {
  readonly #sources: CorpusSource[];
  readonly #cache: IngestionCache;
  readonly #snapshots: SnapshotStore;
  readonly #rateLimitMs: number;
  readonly #now: () => string;

  constructor(sources: CorpusSource[], options: CorpusIngestorOptions = {}) {
    this.#sources = sources;
    this.#cache = options.cache ?? new IngestionCache();
    this.#snapshots = options.snapshots ?? new SnapshotStore();
    this.#rateLimitMs = options.rateLimitMs ?? 0;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  get snapshots(): SnapshotStore {
    return this.#snapshots;
  }

  async ingest(): Promise<CorpusIngestResult> {
    const documents: CorpusDocument[] = [];
    let cached = 0;
    let added = 0;

    for (const [index, source] of this.#sources.entries()) {
      const items = await source.list();
      for (const item of items) {
        const hit = this.#cache.get(item.url);
        if (hit) {
          documents.push(hit);
          cached += 1;
          continue;
        }
        const snapshot = createSnapshot({
          content: item.text,
          url: item.url,
          title: item.title,
          fetched_at: this.#now(),
        });
        this.#snapshots.put(snapshot);
        const document: CorpusDocument = {
          ...item,
          snapshot_hash: snapshot.hash,
          metadata: { ...item.metadata, source_grade: item.source_grade },
        };
        this.#cache.set(item.url, document);
        documents.push(document);
        added += 1;
      }
      if (this.#rateLimitMs > 0 && index < this.#sources.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.#rateLimitMs),
        );
      }
    }

    return {
      documents,
      stats: {
        sources: this.#sources.length,
        items: documents.length,
        cached,
        added,
      },
    };
  }
}

export interface RegistryPart {
  id: string;
  name: string;
  status: string;
  type: string;
  description: string;
  sequence: string;
}

export interface ParsePartsOptions {
  characterized?: Set<string>;
}

/**
 * Parse the Registry FASTA header format:
 * `>PartName Status-first-letter PartID PartType description`.
 * The sequence follows on the next lines.
 */
export function parsePartsFasta(
  fasta: string,
  options: ParsePartsOptions = {},
): CorpusItem[] {
  const characterized = options.characterized ?? new Set<string>();
  const items: CorpusItem[] = [];
  let current: RegistryPart | null = null;

  const flush = (): void => {
    if (!current) return;
    const grade: SourceGrade = characterized.has(current.id) ? "B" : "C";
    items.push({
      id: current.id,
      kind: "part",
      title: `${current.name} (${current.type})`,
      text: [current.name, current.type, current.description]
        .filter((value) => value !== "")
        .join(" "),
      url: `https://parts.igem.org/Part:${current.id}`,
      metadata: {
        source: "registry",
        part_id: current.id,
        part_type: current.type,
        status: current.status,
        sequence: current.sequence,
      },
      source_grade: grade,
    });
    current = null;
  };

  for (const rawLine of fasta.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith(">")) {
      flush();
      const fields = line.slice(1).trim().split(/\s+/);
      current = {
        name: fields[0] ?? "",
        status: fields[1] ?? "",
        id: fields[2] ?? "",
        type: fields[3] ?? "",
        description: fields.slice(4).join(" "),
        sequence: "",
      };
      continue;
    }
    if (current) current.sequence += line;
  }
  flush();
  return items;
}

export interface WikiPageInput {
  id: string;
  title: string;
  text: string;
  url: string;
}

export class TeamWikiSource implements CorpusSource {
  readonly name = "team-wiki";

  constructor(private readonly pages: WikiPageInput[]) {}

  async list(): Promise<CorpusItem[]> {
    return this.pages.map((page) => ({
      id: page.id,
      kind: "wiki",
      title: page.title,
      text: page.text,
      url: page.url,
      metadata: { source: "team-wiki" },
      source_grade: "B",
    }));
  }
}

export interface PaperInput {
  id: string;
  title: string;
  abstract: string;
  doi: string;
  year: number;
}

export class PaperSource implements CorpusSource {
  readonly name = "papers";

  constructor(private readonly papers: PaperInput[]) {}

  async list(): Promise<CorpusItem[]> {
    return this.papers.map((paper) => ({
      id: paper.id,
      kind: "paper",
      title: paper.title,
      text: paper.abstract,
      url: `https://doi.org/${paper.doi}`,
      metadata: { source: "paper", doi: paper.doi, year: paper.year },
      source_grade: "A",
    }));
  }
}

export function toRetrievalDocuments(
  documents: CorpusDocument[],
): RetrievalDocument[] {
  return documents.map((document) => ({
    id: document.id,
    title: document.title,
    text: document.text,
    url: document.url,
    metadata: document.metadata,
    snapshot_hash: document.snapshot_hash,
  }));
}
