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

1. **One generator, no new dependency.** `scripts/generate-schema-types.ts` reads
   every `data/schemas/*.schema.json` (resolving `$defs`, `$ref`, `enum`, `oneOf`,
   `additionalProperties` and nullable `type` arrays) and writes
   `packages/core/src/generated/schemas.ts`. The output is deterministic: schema
   files are sorted, property order follows the schema, and a re-run is
   byte-identical.
2. **The generated file is committed build output.** `pnpm schema:types` writes it;
   `pnpm schema:types:check` regenerates in memory and exits non-zero with the first
   stale line when the committed file differs.
3. **`schema:types:check` runs as its own step in the `node` CI job**, after
   `pnpm install --frozen-lockfile`. It is deliberately **not** part of `pnpm check`:
   `pnpm check` is what `gate-tests` and the `node` job run, and a generator that
   shells out to `tsx` would change the check surface for every PR. Measured cost on
   this repository: ~2.0s wall clock (pnpm + tsx startup included).
4. **Consume where practical.** `packages/core/src/index.ts` re-exports
   `GeneratedSchemas`, and `types.ts` aliases the three shapes that are exactly 1:1
   today: `Fragment`, `Claim`, `MemoryEdge`. `packages/core/test/schema-types.test.ts`
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
