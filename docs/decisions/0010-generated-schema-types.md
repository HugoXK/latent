# 0010 — Generate TypeScript types from the canonical schemas

- Status: proposed (T2, owner approval pending)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #20

## Context

`data/schemas/*.schema.json` is canonical, but the TypeScript types in
`packages/core/src/types.ts` were hand-written. A schema can gain a required field
and the runtime type keeps compiling, which is exactly the drift the standards
forbid. The issue is a P0, and the new `edge`/`outcome` primitives made the gap
larger.

## Decision

1. **Generate one committed file**:
   `packages/core/src/generated/schemas.ts`.
2. **The generator is local and dependency-free**:
   `scripts/generate-schema-types.ts` reads `data/schemas/` and emits interfaces.
   It supports the subset the schemas use (object, array, enum, const, `$ref`,
   nullable type arrays, `$defs`); it throws on `oneOf`/`anyOf`/`allOf`/`if`/`then`
   rather than emitting a vague type.
3. **The check is part of `pnpm check`**:
   `pnpm schema:types` writes the file; `pnpm schema:types:check` fails when it is
   stale. A schema change without regenerated types fails CI.
4. **The core consumes generated types where practical.** `MemoryEdge`,
   `MemoryEdgeNode`, `Outcome` and the derived `MemoryNodeType`,
   `MemoryRelation`, `OutcomeDecision`, `OutcomeDecider` are aliases of generated
   types.
5. **The remaining primitives are a documented exception list.** `Fragment`,
   `Claim`, `Idea`, `Gate`, `Brief`, `ConstraintState` and `ReplayCase` stay
   hand-written because they carry domain invariants and are used in function
   signatures. A type-level test
   (`packages/core/test/generated-types.test.ts`) asserts that each hand-written
   type remains assignable to the generated one; adding a required field or
   narrowing a union breaks `tsc`.
6. **No runtime behaviour changes.** The generated file contains types only.

## Migration note

None. This ADR changes no schema, adds no table and no stored field. The generated
file is additive.

## Consequences

- The drift test already found one real mismatch: `Gate.evidence` was optional in
  the hand-written type while the schema requires it. The type is now required.
- The exception list is honest but temporary. Migrating `Idea`/`Brief` fully needs
  branded ids or a generator change for `additionalProperties: $ref`
  (`ConstraintState.variables` currently generates `Record<string, unknown>`).
- The generator is intentionally small; a new schema construct fails loudly and
  requires an explicit generator change, not a silent `unknown`.
- The generated file is reviewed like source; it is not ignored.

## Alternatives considered

- **Add `json-schema-to-typescript`.** Rejected for now: a new supply-chain
  dependency for a 260-line deterministic file. Revisit if the schema grows
  union/conditional constructs.
- **Keep hand-written types and rely on Ajv at runtime.** Rejected: the compiler
  cannot see a missing required field.
- **Delete the hand-written types immediately.** Rejected: the domain types encode
  invariants and are used across the core; that is a separate behaviour change.

## Risks

- A generator bug can emit a too-broad type. The assignability test and the
  schema fixture tests bound the damage.
- The exception list can rot. It is linked here and in `data/schemas/README.md`;
  the follow-up is a dedicated migration issue.
