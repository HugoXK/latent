import type { SearchHit, SearchProvider } from "@latent/core";
import { Bm25Index } from "./bm25.js";
import type { Bm25Options } from "./bm25.js";
import { HashingEmbeddingProvider, cosine } from "./embeddings.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { fuseRanks } from "./rerank.js";
import { tokenize } from "./tokenize.js";

export * from "./bm25.js";
export * from "./embeddings.js";
export * from "./rerank.js";
export * from "./tokenize.js";

export type RetrievalMetadata = Record<
  string,
  string | number | boolean | undefined
>;

export interface RetrievalDocument {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: RetrievalMetadata;
  snapshot_hash?: string;
  /**
   * Mark a document built from a private fragment. The index refuses to hand it
   * to an embedding provider without per-provider consent.
   */
  privacy?: "public" | "private";
}

export interface RetrievalQuery {
  text: string;
  filters?: Record<string, string | number | boolean>;
  limit?: number;
  /** Mark a query built from a private idea; the same consent gate applies. */
  privacy?: "public" | "private";
}

export interface RetrievalHit {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  bm25: number;
  vector: number;
  rerank: number;
  metadata: RetrievalMetadata;
}

export interface LocalRetrievalIndexOptions {
  embedding?: EmbeddingProvider;
  bm25?: Bm25Options;
  /** Maximum candidates from each ranking before fusion. */
  candidateLimit?: number;
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snippet(text: string, tokens: string[], maxLength = 200): string {
  if (text.length <= maxLength) return text;
  const lower = text.toLowerCase();
  let index = -1;
  for (const token of tokens) {
    const found = lower.indexOf(token);
    if (found !== -1 && (index === -1 || found < index)) index = found;
  }
  const start = Math.max(0, (index === -1 ? 0 : index) - 60);
  const end = Math.min(text.length, start + maxLength);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${
    end < text.length ? "…" : ""
  }`;
}

/**
 * A deterministic, local hybrid index: BM25, an embedding provider and
 * reciprocal rank fusion. The default embedding is lexical feature hashing;
 * pass `HttpEmbeddingProvider` for a semantic provider.
 */
export class LocalRetrievalIndex implements SearchProvider {
  readonly #documents: Map<string, RetrievalDocument>;
  readonly #bm25: Bm25Index;
  readonly #vectors: Map<string, number[]>;
  readonly #embedding: EmbeddingProvider;
  readonly #candidateLimit: number;

  private constructor(
    documents: Map<string, RetrievalDocument>,
    bm25: Bm25Index,
    vectors: Map<string, number[]>,
    embedding: EmbeddingProvider,
    candidateLimit: number,
  ) {
    this.#documents = documents;
    this.#bm25 = bm25;
    this.#vectors = vectors;
    this.#embedding = embedding;
    this.#candidateLimit = candidateLimit;
  }

  static async build(
    documents: RetrievalDocument[],
    options: LocalRetrievalIndexOptions = {},
  ): Promise<LocalRetrievalIndex> {
    if (documents.length === 0) {
      throw new Error("at least one retrieval document is required");
    }
    const unique = new Map<string, RetrievalDocument>();
    for (const document of documents) {
      if (unique.has(document.id)) {
        throw new Error(`duplicate retrieval document ${document.id}`);
      }
      unique.set(document.id, document);
    }

    const bm25 = new Bm25Index(
      [...unique.values()].map((document) => ({
        id: document.id,
        tokens: [
          ...tokenize(document.title),
          ...tokenize(document.title),
          ...tokenize(document.text),
        ],
      })),
      options.bm25,
    );

    const embedding = options.embedding ?? new HashingEmbeddingProvider();
    const anyPrivate = [...unique.values()].some(
      (document) => document.privacy === "private",
    );
    const values = await embedding.embed(
      [...unique.values()].map(
        (document) => `${document.title}\n${document.text}`,
      ),
      { private: anyPrivate },
    );
    if (values.length !== unique.size) {
      throw new Error("embedding provider returned the wrong number of vectors");
    }
    const dimension = values[0]?.length ?? 0;
    if (dimension === 0) {
      throw new Error("embedding vectors must not be empty");
    }
    const vectors = new Map<string, number[]>();
    [...unique.keys()].forEach((id, index) => {
      const vector = values[index];
      if (!vector || vector.length !== dimension) {
        throw new Error(`embedding dimension mismatch for ${id}`);
      }
      vectors.set(id, vector);
    });

    return new LocalRetrievalIndex(
      unique,
      bm25,
      vectors,
      embedding,
      options.candidateLimit ?? 50,
    );
  }

  async searchDetailed(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const tokens = tokenize(query.text);
    const filters = query.filters ?? {};
    const allowed = new Set(
      [...this.#documents.values()]
        .filter((document) =>
          Object.entries(filters).every(
            ([key, value]) => document.metadata[key] === value,
          ),
        )
        .map((document) => document.id),
    );
    if (allowed.size === 0) return [];

    const lexical = new Map(
      [...this.#bm25.score(tokens)]
        .filter(([id]) => allowed.has(id))
        .sort((left, right) => right[1] - left[1] || compareIds(left[0], right[0]))
        .slice(0, this.#candidateLimit),
    );
    const queryVector = (
      await this.#embedding.embed([query.text], {
        private: query.privacy === "private",
      })
    )[0];
    if (!queryVector) {
      throw new Error("embedding provider returned no query vector");
    }
    const vector = new Map<string, number>();
    for (const id of allowed) {
      const documentVector = this.#vectors.get(id);
      if (!documentVector) continue;
      const score = cosine(queryVector, documentVector);
      // A zero-cosine document has no shared feature with the query. Ranking it
      // would contribute an arbitrary 1/(k+rank) to the fused score.
      if (score !== 0) vector.set(id, score);
    }
    const semantic = new Map(
      [...vector.entries()]
        .sort((left, right) => right[1] - left[1] || compareIds(left[0], right[0]))
        .slice(0, this.#candidateLimit),
    );
    const fused = fuseRanks(lexical, semantic);
    const limit = query.limit ?? 10;
    const ids = [...fused.keys()]
      .sort(
        (left, right) =>
          (fused.get(right) ?? 0) - (fused.get(left) ?? 0) ||
          compareIds(left, right),
      )
      .slice(0, limit);

    return ids.map((id) => {
      const document = this.#documents.get(id);
      if (!document) throw new Error(`missing retrieval document ${id}`);
      return {
        id,
        title: document.title,
        url: document.url,
        snippet: snippet(document.text, tokens),
        score: fused.get(id) ?? 0,
        bm25: lexical.get(id) ?? 0,
        vector: semantic.get(id) ?? 0,
        rerank: fused.get(id) ?? 0,
        metadata: document.metadata,
      };
    });
  }

  async search(query: string, limit = 10): Promise<SearchHit[]> {
    const hits = await this.searchDetailed({ text: query, limit });
    return hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
    }));
  }
}

export * from "./corpus.js";
