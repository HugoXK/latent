import { tokenize } from "./tokenize.js";

export interface EmbeddingContext {
  /** True when any text in this call comes from a private fragment or idea. */
  private?: boolean;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[], context?: EmbeddingContext): Promise<number[][]>;
}

export class EmbeddingConsentError extends Error {
  readonly code = "EMBEDDING_PRIVATE_REFUSED";

  constructor() {
    super(
      "private text needs explicit per-provider consent (allowPrivate: true) before an embedding request",
    );
    this.name = "EmbeddingConsentError";
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * A deterministic, offline feature-hashing embedding. It is lexical, not a
 * semantic model: use `HttpEmbeddingProvider` for a real embedding provider.
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  readonly name = "hashing-v1";
  readonly #dimensions: number;

  constructor(dimensions = 128) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error("dimensions must be a positive integer");
    }
    this.#dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector = new Array<number>(this.#dimensions).fill(0);
      for (const token of tokenize(text)) {
        const hash = fnv1a(token);
        const index = hash % this.#dimensions;
        // The sign comes from the top bit, not bit 0: bit 0 of FNV-1a is close
        // to a character-parity bit and correlates with the bucket.
        const sign = ((hash >>> 31) & 1) === 0 ? 1 : -1;
        vector[index] = (vector[index] ?? 0) + sign;
      }
      const norm = Math.sqrt(
        vector.reduce((sum, value) => sum + value * value, 0),
      );
      return norm === 0 ? vector : vector.map((value) => value / norm);
    });
  }
}

export type EmbeddingFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface HttpEmbeddingOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * Send text marked private to this provider. Default false: a private idea
   * never leaves the machine without explicit per-provider consent. The model
   * reconstructor's `LATENT_MODEL_SEND_PRIVATE` is the precedent.
   */
  allowPrivate?: boolean;
  /** Abort a hanging provider. Default 30s. */
  timeoutMs?: number;
  /** Texts per request; large corpora are split into sequential batches. */
  batchSize?: number;
  fetchImpl?: EmbeddingFetch;
}

/**
 * An OpenAI-compatible `/embeddings` adapter. Tests inject `fetchImpl`; the
 * default uses the global fetch and is never exercised in CI.
 */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly name = "http-embeddings-v1";
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #model: string;
  readonly #allowPrivate: boolean;
  readonly #timeoutMs: number;
  readonly #batchSize: number;
  readonly #fetch: EmbeddingFetch;

  constructor(options: HttpEmbeddingOptions) {
    if (!options.baseUrl.trim()) throw new Error("baseUrl is required");
    if (!options.apiKey.trim()) throw new Error("apiKey is required");
    if (!options.model.trim()) throw new Error("model is required");
    let baseUrl = options.baseUrl;
    while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
    this.#baseUrl = baseUrl;
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#allowPrivate = options.allowPrivate ?? false;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#batchSize = options.batchSize ?? 64;
    this.#fetch =
      options.fetchImpl ??
      ((url, init) => globalThis.fetch(url, init));
  }

  async embed(
    texts: string[],
    context: EmbeddingContext = {},
  ): Promise<number[][]> {
    if (context.private === true && !this.#allowPrivate) {
      throw new EmbeddingConsentError();
    }
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += this.#batchSize) {
      const batch = texts.slice(offset, offset + this.#batchSize);
      vectors.push(...(await this.#embedBatch(batch)));
    }
    return vectors;
  }

  async #embedBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify({ model: this.#model, input: texts }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
          `embedding provider returned HTTP ${response.status}: ${body.slice(0, 200)}`,
        );
      }
      const data = (await response.json()) as {
        data?: Array<{ embedding?: unknown }>;
      };
      if (!Array.isArray(data.data) || data.data.length !== texts.length) {
        throw new Error(
          "embedding provider returned the wrong number of vectors",
        );
      }
      return data.data.map((entry, index) => {
        const vector = entry.embedding;
        if (
          !Array.isArray(vector) ||
          vector.length === 0 ||
          !vector.every(
            (value) => typeof value === "number" && Number.isFinite(value),
          )
        ) {
          throw new Error(
            `embedding provider returned an invalid vector at ${index}`,
          );
        }
        return vector as number[];
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function cosine(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error("vector dimensions differ");
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
