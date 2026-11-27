# BLAST

- Status: implemented (local)
- Date: 2026-11-26
- Owner: HugoXK

Sequence collision is a deep check, not a fuzzy text comparison. The adapter runs
`blastn` against a local part database through a **runner port**; CI injects a
fake runner and makes no process or network call.

Implementation: [`packages/novelty/src/blast.ts`](../packages/novelty/src/blast.ts).

## Pieces

- `BlastRunner` — `run(args, input): Promise<string>`; a real implementation
  executes `blastn`, tests return a fixture.
- `BlastPlusAdapter` — builds the `-outfmt 6` command and parses the tabular
  output.
- `parseBlastTabular` — columns `qseqid sseqid pident length qlen slen evalue
  bitscore stitle`; `identity = pident / 100`, `coverage = length / qlen`.
- `CachedBlastProvider` — SHA-256 of the sequence is the cache key.
- `highConfidenceHits` — default identity ≥ 0.9 and coverage ≥ 0.9.

## Use

```ts
const hits = await new CachedBlastProvider(
  new BlastPlusAdapter(runner, "/data/parts"),
).search(sequence);

for (const hit of highConfidenceHits(hits)) {
  // treat hit.part_id as a sequence collision
}
```

## Limitations

- The default thresholds are a starting point, not a biological judgement; tune
  them per part family.
- The run is local and offline in tests; a production adapter must provide the
  database and its own compute budget.
- A BLAST hit is evidence for a collision, not a decision; the collision report
  and a human decide.
