function ranks(scores: Map<string, number>): Map<string, number> {
  return new Map(
    [...scores.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id], index) => [id, index + 1]),
  );
}

/**
 * Reciprocal rank fusion. It is robust to incomparable raw scores from BM25 and
 * an embedding provider, and needs no tuning per corpus.
 */
export function fuseRanks(
  bm25: Map<string, number>,
  vector: Map<string, number>,
  k = 60,
): Map<string, number> {
  const bm25Rank = ranks(bm25);
  const vectorRank = ranks(vector);
  const ids = new Set([...bm25Rank.keys(), ...vectorRank.keys()]);
  const fused = new Map<string, number>();
  for (const id of ids) {
    let score = 0;
    const lexical = bm25Rank.get(id);
    const semantic = vectorRank.get(id);
    if (lexical !== undefined) score += 1 / (k + lexical);
    if (semantic !== undefined) score += 1 / (k + semantic);
    fused.set(id, score);
  }
  return fused;
}
