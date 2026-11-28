# 0017 — Collision evidence and an explicit "not checked" state

- Status: proposed (T2)
- Date: 2026-11-28
- Owner: HugoXK
- Issue: #38

## Context

The compiler accepted `collisions` and the Markdown exporter rendered them when
present, but a collision carried no link to a claim or a source, the cells were
interpolated raw (a `|` or a line break could break or inject a table row), and a
brief with no collision data looked identical to a brief where the novelty check
had run and found nothing. A missing check must not read as clean.

This is the main-based replacement for the orphan stack PR #83: it carries the
collision-evidence slice and the review fixes (escape order, per-test temp dirs)
onto `main`'s own renderer rather than importing the stack's `compiler.ts`.

## Decision

1. **A collision can carry evidence.** `BriefCollision` gains optional
   `claim_ids: string[]` and `source_url: string | null`.
2. **A brief records whether the check ran.** `Brief` gains
   `collision_check: { status: "checked" | "not_checked"; note: string }`.
   `compileBrief` sets `not_checked` when no `collisions` input is supplied and
   `checked` for an explicit list, including an empty one.
3. **The novelty section is always rendered.** Markdown and HTML always show the
   status and note; a checked-clean brief says so, and a missing check says it is not a
   clean result. The collision table gains Claims and Source columns.
4. **Table cells are escaped in order.** `cell()` escapes backslashes first
   (`\` -> `\\`), then pipes (`|` -> `\|`), then collapses `\r\n?|\n` to a space,
   so a caller-supplied `\|` and a raw newline both stay inside one cell.
5. **No new store table.** The brief already stores the structured field; the
   schema change is additive and optional.

## Fixture policy

- `data/schemas/*.schema.json` stay canonical; `data/fixtures/<schema>/valid.json`
  is a valid document per schema, and `packages/core/test/boundary.test.ts` keeps
  one rejecting case per schema.
- That test enumerates `data/schemas/` and fails when a schema file has no case,
  so a new schema (for example a future `source-snapshot`) cannot land
  unexercised.
- Tests never write into the committed `data/` tree; scratch files use a per-test
  `mkdtempSync` directory.

## Migration note

No table or stored-format migration. `data/fixtures/brief/valid.json` gains one
collision with claims/source and a `collision_check`. Old briefs remain valid
because every new field is optional, and a stored brief without
`collision_check` renders as `not_checked`.

## Consequences

- A reader can see what collided, the prior work, the claims that depend on it and
  the source URL; a brief compiled without a novelty check is visibly incomplete.
- The CLI `novelty` command and the API/server wiring for `collisions` remain
  follow-ups; this PR delivers the types, compiler, renderer and tests. The
  exported `graphFromPriorArt` / `priorArtSourceUrls` / `toBriefCollisions(report,
  {sourceUrls, claimIds})` are the building blocks for that wiring.
- The novelty check is a structured comparison over the supplied prior-art list,
  not a claim that the corpus is complete; the note says to confirm coverage.

## Alternatives considered

- **Omit the section when there is no data.** Rejected: it looks clean.
- **Require a source on every collision.** Rejected: a prior-art id may be enough
  for a local check; the field is optional.
- **A boolean `collision_checked`.** Rejected: a note is needed to explain what
  "checked" covered.
- **Escape only pipes (as the stack branch did).** Rejected: a backslash before a
  pipe still splits the cell, and a raw newline breaks the row.

## Risks

- The escaping is Markdown-specific; other exporters must reuse `cell()` (or an
  equivalent) when they render collision tables. Regression tests cover the Markdown path
  and the HTML escaping path.
- The fixture policy depends on the coverage test; if it is deleted, a new schema
  can ship without a boundary case.
