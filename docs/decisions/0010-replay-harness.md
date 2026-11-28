# 0010 — Replay harness: blind scoring and a public plugin view

- Status: accepted (T2)
- Date: 2026-11-28
- Issues: #16, #66

## Context

The replay harness turns a `ReplayCase` into a deterministic run: it calls
`develop()` with the fragment and constraints, then scores seed recovery, variant
coverage, gate agreement, collision precision/recall and unsupported claims. The
first version handed the whole case to the optional gate predictor and collision
detector. Those plugins could read `gate_labels`, `collisions`,
`expected_candidates` or `outcome` and return the answer key, producing a perfect
score without doing the work — the opposite of a blind benchmark.

## Decision

1. **The reconstructor is blind.** `runReplayCase` passes only `fragment`,
   `constraints`, `vertical`, `reconstructor` and `now` to `develop()`, as before.
2. **Plugins get a public view.** `ReplayGatePredictor` and
   `ReplayCollisionDetector` receive `ReplayPublicCase`: `metadata`, `constraints`,
   `fragment` and `prior_art`, built by `replayPublicCase()`. Hidden scoring fields
   are absent by construction, not by convention.
3. **`passed` is candidate/claim/gate only.** A case passes when the seed is
   recovered, no claim is unsupported, and gate agreement (when a predictor is
   supplied) is at least 0.75. Variant coverage and collision metrics are reported
   measurements, not pass thresholds.
4. **Overlap is Jaccard.** `words(hypothesis) ∩ words(seed) / words(hypothesis) ∪
   words(seed)` over content words. A short hypothesis cannot inflate the score.

## Alternatives

- **Keep the full case and document "do not read the answers".** Rejected: it is
  unenforceable and the cheating plugin scored 1.0.
- **Run plugins in a separate process.** Rejected for v0.3: more machinery than
  the leak requires; a typed public view closes it in-process.
- **Drop plugins and score only candidates/claims.** Rejected: gate agreement and
  collision quality are the measurements this harness exists for.

## Consequences

- A plugin cannot see the answer key; the regression tests assert the hidden
  fields are absent and that an echoing plugin scores `compared: 0`.
- A future model-backed predictor implements the same public view contract.
- `passed` is deliberately narrower than "all metrics are good"; the README says
  so.

## Migration and rollback

None: no schema, table or stored format changes. Rollback is a revert of
`packages/core/src/replay-runner.ts`, its tests, the README section and this ADR;
no persisted data to migrate.
