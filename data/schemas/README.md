# Schemas

JSON Schema **2020-12** for the five primitives. The schemas are canonical; runtime
types are generated from them. A change needs an ADR (see
[`../../docs/decisions/`](../../docs/decisions/)), a migration note and a fixture.

| Schema | Primitive | Required by |
|---|---|---|
| [`fragment.schema.json`](fragment.schema.json) | Fragment | Capture |
| [`constraint-state.schema.json`](constraint-state.schema.json) | Constraint state | Interviewer |
| [`claim.schema.json`](claim.schema.json) | Claim | Ledger |
| [`idea.schema.json`](idea.schema.json) | Idea | Reconstruction, gates |
| [`gate.schema.json`](gate.schema.json) | Gate | Gate engine |
| [`brief.schema.json`](brief.schema.json) | Brief | Compiler |
| [`edge.schema.json`](edge.schema.json) | MemoryEdge | Memory graph |
| [`outcome.schema.json`](outcome.schema.json) | Outcome | Calibration loop |
| [`replay-case.schema.json`](replay-case.schema.json) | ReplayCase | Replay harness |

`replay-case.schema.json` refers to `constraint-state.schema.json` and
`fragment.schema.json` by `$id`. The loader registers every schema before it
compiles a validator, so the references resolve.

## Validate

```sh
python3 - <<'PY'
import glob, json
for path in sorted(glob.glob("data/schemas/*.schema.json")):
    with open(path, encoding="utf-8") as fh:
        json.load(fh)
    print("ok", path)
PY
```

The CI workflow runs the same check and fails on invalid JSON.

## Rules encoded in the schema

- A `Claim` always carries a `status`, a `confidence` and a `confidence_basis`. It
  cannot be "just text".
- A `Claim` with `status: verified` should have at least one source with a `span`
  (the runtime enforces this; the schema permits an empty list for `unknown`).
- An `Idea` always has at least one hypothesis. There is no single-answer idea.
- A `Gate` always names a `falsifier` and a `fallback`. A gate without a falsifier
  is not a gate.
- A `Gate` with `hard: true` is decided by a human; the gate engine rejects a
  model decision.
- A `Brief` must list at least one unknown. A brief with no unknowns is suspect.

## Versioning

- `schema_version` is a string on every object.
- The schema `$id` is stable per version (`.../fragment.schema.json`); a breaking
  change publishes a new file name or a new major path.
- Additive fields do not bump the API version.
- Stored objects keep their `schema_version`; a migration reads the old version and
  writes the new one, never in place.

## Fixtures

Fixtures live next to the tests in the runtime repository (`v0.2`). Every new
required field needs at least one fixture. A fixture that fails schema validation
is a build failure.
