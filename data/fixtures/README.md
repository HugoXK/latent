# Schema fixtures

Every canonical schema has a valid and an invalid fixture:

| Schema | Valid | Invalid |
|---|---|---|
| `fragment` | [`fragment/valid.json`](fragment/valid.json) | [`fragment/invalid.json`](fragment/invalid.json) |
| `constraint-state` | [`constraint-state/valid.json`](constraint-state/valid.json) | [`constraint-state/invalid.json`](constraint-state/invalid.json) |
| `claim` | [`claim/valid.json`](claim/valid.json) | [`claim/invalid.json`](claim/invalid.json) |
| `idea` | [`idea/valid.json`](idea/valid.json) | [`idea/invalid.json`](idea/invalid.json) |
| `gate` | [`gate/valid.json`](gate/valid.json) | [`gate/invalid.json`](gate/invalid.json) |
| `brief` | [`brief/valid.json`](brief/valid.json) | [`brief/invalid.json`](brief/invalid.json) |

The replay case is richer: its fixtures live in `data/replay/fixtures/` and are
validated with the anti-leakage rules in `packages/core/src/replay.ts`.

## Enforcement

`packages/core/test/fixtures.test.ts` iterates `data/schemas/*.schema.json` and
fails when a schema has no mapping or no fixture. `packages/store/test/store.test.ts`
then proves that the store rejects an invalid write for every primitive, so a
hand-written type cannot be stored without the schema agreeing.

## Adding a fixture

1. Add `data/fixtures/<schema>/valid.json` and `invalid.json`.
2. Add the file key to `NAMES` in `packages/core/test/fixtures.test.ts` if the key
   differs from the `SchemaName`.
3. Keep the invalid fixture invalid for a structural reason (a missing required
   field, a bad enum, a bad format or an out-of-range number), not because a
   ledger rule would reject it.
