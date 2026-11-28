# 0021 — Generate the TypeScript types from the JSON Schemas

- Status: accepted (T2)
- Date: 2026-11-28
- Owner: HugoXK
- Issue: #20

## Context

`data/schemas/*.schema.json` is the runtime contract: the store and the compiler
validate against it. The TypeScript types were hand-written beside it, so a schema
change could land while `types.ts` still described the old shape — for example the
`claim.status` enum or the brief collision fields. Nothing failed until a runtime
path happened to exercise the difference.

## Decision

1. **One generator, no new dependency, inside the typecheck.** `scripts/generate-schema-types.ts`
   reads every `data/schemas/*.schema.json` and writes
   `packages/core/src/generated/schemas.ts`. Supported constructs: `$defs`, `$ref`,
   `enum`, `const`, `type` arrays including `null`, objects, arrays, and the
   property-less-object fallback to `Record<string, unknown>`. **Unsupported on
   purpose:** `oneOf`, `anyOf`, `allOf`, `if` and `then` are not resolved — the
   generator throws rather than guesses, and the file to extend when one arrives is
   `scripts/generate-schema-types.ts`. **`additionalProperties` is not modelled**
   beyond the property-less-object fallback; a schema that closes an object relies
   on its `properties` being the full shape. The output is deterministic: schema
   files are sorted, property order follows the schema, and a re-run is
   byte-identical. `tsconfig.json` includes `scripts/**/*.ts`, so the generator is
   checked by `pnpm typecheck`.
2. **The generated file is committed build output.** `pnpm schema:types` writes it;
   `pnpm schema:types:check` regenerates in memory and exits non-zero with the first
   stale line when the committed file differs.
3. **Enforcement is a test in the required `node` job, not a new workflow step.**
   `packages/core/test/schema-types-drift.test.ts` imports the generator's pure
   `renderSchemaTypes()`, renders every schema in memory and asserts byte-equality
   with the committed file, naming the first stale line on failure. This is
   deliberately **not** a `ci.yml` edit: `ci-ok-published` refuses any pull request
   whose head `ci.yml` blob differs from the default branch (`ci_ok_publish.py`
   `evaluate_run()`), by design, as the anti-weakening rule — so a workflow edit
   would make that check red on this PR and on every later PR based on an older
   `main`. The `node` job is part of `ci-ok`, so the test is enforced on every PR
   with no workflow change. `pnpm schema:types` / `pnpm schema:types:check` remain
   the human and agent interface (write / check by hand).
4. **Consume where practical.** `packages/core/src/index.ts` re-exports
   `GeneratedSchemas`, and `types.ts` aliases the three shapes that are exactly 1:1
   today: `Fragment`, `Claim`, `MemoryEdge`. The enum unions are derived from those
   generated types — `Privacy`, `FragmentKind`, `ClaimStatus`, `ConfidenceBasis`,
   `SourceKind`, `MemoryRelation` — so a schema enum change widens the union at the
   use sites, not only inside the generated file. `packages/core/test/schema-types.test.ts`
   also asserts equality for `Idea` and `Brief` (equal today, kept hand-written in
   this PR to keep the diff to three aliases); a schema change that makes any pair
   differ fails `tsc --noEmit`.
5. **`data/schemas/` remains the single source of truth.** The generated file is
   never edited by hand; a schema change is reviewed together with its regenerated
   diff.

## Exception list (deliberately different from the schema)

- **`Gate`** — the schema requires `evidence`, but the runtime lets a gate exist
  before any evidence is attached; the hand-written type keeps `evidence?` optional.
  Aliasing it would introduce a false required field at every call site. Reconcile
  the schema or the code first, then drop this exception.
- **`ConstraintState`** — the hand-written type carries
  `variables: Record<string, ConstraintVariable>` (typed `value`/`confidence`/
  `source`/`evidence_ref`) and a required `blocking_unknowns`; the schema leaves the
  variable map open (`Record<string, unknown>`) and `blocking_unknowns` optional.
  Keeping it preserves type precision the interviewer relies on.
- **`ReplayCase`** — it embeds the stricter hand-written `ConstraintState` and
  `Fragment` above; aliasing it to the generated shape would silently swap in the
  open variable map. Revisit once `ConstraintState` is reconciled.

## Migration note

No runtime behaviour change and no data migration. The generated file is additive;
`types.ts` changes are type aliases only. Rollback is deleting the generator, the
two scripts, the committed file and the re-export — no schema or stored data is
touched.

## Risks

- A stale generated file must fail CI (that is the point); determinism is required
  or the check flakes. The generator sorts schema files and preserves property
  order, and the check reports the first differing line.
- The exception list above is short and per-type; a new exception needs its own
  line here, not a catch-all bucket.
- The generator fails on unsupported schema constructs instead of guessing, so a new
  construct needs a generator change in the same PR.
