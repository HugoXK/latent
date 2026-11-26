import { tokenize } from "./tokenize.js";

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
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
        const sign = (hash & 1) === 0 ? 1 : -1;
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
    this.#fetch =
      options.fetchImpl ??
      ((url, init) => globalThis.fetch(url, init));
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.#fetch(`${this.#baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.#apiKey}`,
      },
      body: JSON.stringify({ model: this.#model, input: texts }),
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
      throw new Error("embedding provider returned the wrong number of vectors");
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
