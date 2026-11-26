export interface Bm25Document {
  id: string;
  tokens: string[];
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

export class Bm25Index {
  readonly #postings = new Map<string, Map<string, number>>();
  readonly #lengths = new Map<string, number>();
  readonly #docFreq = new Map<string, number>();
  readonly #k1: number;
  readonly #b: number;
  readonly #count: number;
  readonly #avgLength: number;

  constructor(documents: Bm25Document[], options: Bm25Options = {}) {
    this.#k1 = options.k1 ?? 1.5;
    this.#b = options.b ?? 0.75;
    let total = 0;

    for (const document of documents) {
      if (this.#lengths.has(document.id)) {
        throw new Error(`duplicate BM25 document ${document.id}`);
      }
      this.#lengths.set(document.id, document.tokens.length);
      total += document.tokens.length;
      const seen = new Set<string>();
      for (const token of document.tokens) {
        let postings = this.#postings.get(token);
        if (!postings) {
          postings = new Map();
          this.#postings.set(token, postings);
        }
        postings.set(document.id, (postings.get(document.id) ?? 0) + 1);
        if (!seen.has(token)) {
          seen.add(token);
          this.#docFreq.set(token, (this.#docFreq.get(token) ?? 0) + 1);
        }
      }
    }

    this.#count = documents.length;
    this.#avgLength = this.#count === 0 ? 0 : total / this.#count;
  }

  score(queryTokens: string[]): Map<string, number> {
    const scores = new Map<string, number>();
    const unique = new Set(queryTokens);
    for (const term of unique) {
      const postings = this.#postings.get(term);
      if (!postings) continue;
      const docFreq = this.#docFreq.get(term) ?? 0;
      const idf = Math.log(
        1 + (this.#count - docFreq + 0.5) / (docFreq + 0.5),
      );
      for (const [id, tf] of postings) {
        const length = this.#lengths.get(id) ?? 0;
        const normalizer =
          this.#b * (length / (this.#avgLength || 1)) + (1 - this.#b);
        const contribution =
          idf * ((tf * (this.#k1 + 1)) / (tf + this.#k1 * normalizer));
        scores.set(id, (scores.get(id) ?? 0) + contribution);
      }
    }
    return scores;
  }
}
