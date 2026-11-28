# 0009 — ReplayCase: a blind benchmark case and its anti-leakage rules

- Status: accepted
- Date: 2026-11-28
- Decision owner: HugoXK
- Context issue: #15; implementation: #61 / `bf611ec`

## Context

The replay harness (#16) needs a case format that is a small, auditable exam rather
than a prompt: the system sees the starting material, and the hidden outcome is
used only for scoring. #61 added the `ReplayCase` schema, a validator and the first
illustrative fixture as a T2 change without the ADR the repository requires, and
its "blind" fixture leaked the hidden seed through `metadata.title`. This ADR
records the shape, the anti-leakage contract and the limits we accept, so a later
change has something to argue against instead of re-deriving it.

## Decision

### Shape

One replay case is one JSON file with eight top-level sections:

| Section | Visibility | Role |
|---|---|---|
| `metadata` | visible | case identity, vertical, season, temporal cutoff, licence |
| `constraints` | visible | the constraint state the reconstructor receives |
| `fragment` | visible | the incomplete idea the case starts from |
| `prior_art` | visible | the literature snapshot, all dated on or before the cutoff |
| `expected_candidates` | hidden | conservative, ambitious and cross-domain answers |
| `collisions` | hidden | which prior-art items a candidate must acknowledge |
| `gate_labels` | hidden | expected gate outcomes used to calibrate gates |
| `outcome` | hidden | seed title/DOI, decision and evidence |

The split follows the pipeline: visible sections are the input to reconstruct, the
hidden sections are the answer key. Fields are JSON, not prose, so a case can be
diffed, reviewed and replayed deterministically without a model.

### Anti-leakage contract

1. **Temporal cutoff.** Every `prior_art[].published_at` is on or before
   `metadata.temporal_cutoff`; the validator rejects `FUTURE_SOURCE`.
2. **Exact seed quote.** `outcome.seed_title` (at least 8 characters) and
   `outcome.seed_doi` (at least 4) must not appear in `fragment.content`, the
   constraint state, or any `prior_art[].title` / `prior_art[].url`. The length
   thresholds avoid false positives on very short titles; they leave a short seed
   title unscanned, which is accepted and tracked below.
3. **Fixture paraphrase policy.** For every valid fixture, no single visible field
   may contain all content tokens of the hidden seed title. Tokens are lowercased,
   punctuation-stripped and stopword-filtered; the check is full containment, not a
   similarity score, to keep false positives near zero. This is enforced by
   `packages/core/test/replay-leak.test.ts`, because the schema cannot express it
   and the exact-substring validator would miss a reordered title.
4. **One seed, consistent references.** Exactly one candidate is `is_seed: true`;
   collision references, prior-art IDs and gate keys are unique and resolvable.

The validator and the fixture test deliberately cover different windows: the
runtime check protects against an exact quote in the input, the fixture test
protects the benchmark corpus against a paraphrase anywhere the schema and the
replay README call visible.

### Known limitation: the visible surface is wider than the exact scan

`metadata.title`, `gate_labels[].rationale` and prior-art `mechanism` / `interface`
are visible to the system, but the exact-substring scan does not read them. A
paraphrase of the seed title placed there would pass the validator; the fixture
test rejects full token containment in those fields, and this paragraph records the
exemption explicitly instead of leaving it implicit.

### Migration note

None. There is no stored data and no persisted primitive: replay cases live in
`data/replay/fixtures/` as reviewed files, no runtime store serialises a
`ReplayCase`, and the schema is additive. No stored record, draft or database
needs rewriting; the change is a file format plus validation. The fixture file
keeps its shape and only `metadata.title` changed.

### Tier

T2 — a canonical schema under `data/schemas/`. It is not a frozen path (ledger,
verifier, gate engine, promotion rule), so owner approval beyond the ADR review is
not required.

## Consequences

- A replay accuracy number is only as good as the blindness of the corpus. The
  illustrative case is labelled `illustrative: true` and must never be cited as a
  historical result.
- The token-containment test catches a reordered or lightly reworded seed title,
  not synonyms or an oblique summary. Fixture review still matters.
- Adding a case now has a mechanical check: a neutral `metadata.title`, no exact
  seed quote, one seed candidate, a dated prior-art snapshot.
- The first case's visible title is neutral ("Illustrative iGEM diagnostics replay
  case"); the topic is carried by the fragment, which is the intended input.

## Reconsider triggers

- A second valid fixture whose seed title has fewer than 4 content tokens (the
  containment test refuses to run and the 8-character validator threshold may
  also skip it).
- A model run that recovers the seed from visible fields despite no full token
  containment (synonyms, oblique summary) — then the fixture test needs a weaker
  containment threshold or a similarity metric, with its own fixtures.
- A decision to show `metadata.title` / `gate_labels` to the system in the harness
  prompt — then those fields become scanned runtime input, not just fixture policy.
- The scoring harness (#16) needs fields outside these eight sections (for example
  a per-case cost budget); that is a schema change and another ADR.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| No ADR, ship the schema as a code comment | The repository requires an ADR for a T2 schema; the shape and the exemption need a durable record |
| Remove `metadata.title` | The schema needs a human-readable catalogue label; a neutral title solves the leak without losing the field |
| Scan every visible field with a similarity score in the validator now | Changes validator behaviour, needs a threshold and false-positive fixtures, and would collide with the open harness PR #66; deferred as a reconsider trigger |
| Mark the illustrative case non-blind | Defeats the purpose of the replay corpus and would poison any accuracy number |
