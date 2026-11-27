# Replay cases

A replay case is a **blinded** project used to evaluate the idea-development
loop. The system sees only the input:

- `metadata`
- `constraints`
- `fragment`
- `prior_art`

`expected_candidates`, `collisions`, `gate_labels` and `outcome` are hidden and
used only for scoring. A case is not a prompt; it is a small, auditable exam.

## Format

- Schema: [`../schemas/replay-case.schema.json`](../schemas/replay-case.schema.json)
- Valid example: [`fixtures/valid/igem-illustrative-001.json`](fixtures/valid/igem-illustrative-001.json)
- Invalid examples: [`fixtures/invalid/`](fixtures/invalid/) (a seed leak, a future
  source, a missing outcome, an unknown collision and two seed candidates)
- Validator: [`packages/core/src/replay.ts`](../../packages/core/src/replay.ts)

Validate a case:

```sh
pnpm latent eval validate data/replay/fixtures/valid/igem-illustrative-001.json
```

The command prints `{ "ok": true, ... }` and exits `0`, or prints the issues and
exits `1`.

## Anti-leakage rules

The JSON Schema enforces the shape. The validator enforces the rules a schema
cannot express:

1. **Temporal cutoff.** Every `prior_art[].published_at` is on or before
   `metadata.temporal_cutoff`.
2. **Seed leak.** `outcome.seed_title` and `outcome.seed_doi` do not appear in the
   fragment, the constraint state or any prior-art title/URL.
3. **Hidden outcome.** `outcome.hidden` is `true`.
4. **One seed.** Exactly one `expected_candidates[]` has `is_seed: true`.
5. **Consistent references.** Every `collisions[].prior_art_id` names an existing
   prior-art item, prior-art IDs are unique, and gate keys are unique.

## Illustrative versus historical

The first fixture is **illustrative**. It is a shaped example for the harness, not
a historical claim, and its outcome is labelled as such.

A real case needs:

- a source snapshot and a licence that permits evaluation;
- a temporal cutoff before the seed paper;
- expert gate labels with a rationale;
- an outcome record (shipped, tested, parked, killed or failed);
- redaction of private or identifying data;
- a note on how the contributors consented.

Do not put a private fragment, a person's name or an unpublished result in a
fixture.

## Adding a case

1. Copy the valid fixture.
2. Keep `illustrative: true` unless you have a real, consented case.
3. Fill `prior_art`, `expected_candidates`, `collisions` and `gate_labels`.
4. Run the validator.
5. Keep synthetic fixtures in `fixtures/`; keep real cases in a private store, not
   in this repository.

## Scoring

`latent eval replay <case>` runs
[`packages/core/src/replay-runner.ts`](../../packages/core/src/replay-runner.ts).
It scores:

- candidate recovery: token overlap between the seed statement and the generated
  hypotheses;
- variant coverage: conservative / ambitious / cross-domain;
- gate agreement: when a gate predictor is supplied;
- collision precision and recall: when a collision detector is supplied;
- unsupported claims: the brief compiler's blocking set.

The harness never passes `expected_candidates`, `collisions`, `gate_labels` or
`outcome` to the reconstructor; they are scoring-only fields. The CLI uses the
template reconstructor by default; `LATENT_MODEL_REPLAY=1` makes the model adapter
read recorded fixtures instead of a provider.
