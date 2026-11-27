# 0017 — Collision evidence and an explicit "not checked" state

- Status: proposed (T2)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #38

## Context

The compiler accepted `collisions`, and the Markdown/HTML exporters rendered them
when present. Two gaps remained: a collision was not linked to a claim or a source,
and a brief with no collision data looked identical to a brief where the novelty
check had run and found nothing. A missing check must not read as clean.

## Decision

1. **A collision can carry evidence.** `BriefCollision` gains optional
   `claim_ids: string[]` and `source_url: string | null`.
2. **A brief records whether the check ran.** `Brief` gains
   `collision_check: { status: "checked" | "not_checked"; note: string }`.
   `compileBrief` sets `not_checked` when no `collisions` input is supplied, and
   `checked` for an explicit list, including an empty one.
3. **The novelty section is always rendered.** Markdown and HTML always show the
   status and note; a checked-clean brief says so, and a missing check says it is
   not a clean result. Collision tables include claims and source.
4. **The CLI can produce and consume the evidence.** `latent novelty <idea-id>
   --input <json>` builds a typed graph from a prior-art list, computes the
   collision report and returns `BriefCollision[]` with the idea's claim ids and
   prior-art URLs. `latent brief --collisions <file>` passes that array to the
   compiler.
5. **No new store table.** Briefs already store the structured field; the schema
   change is additive. Existing briefs without `collision_check` render as
   `not_checked`.

## Migration note

No table or stored-format migration. `data/fixtures/brief/valid.json` gains a
collision with claims/source and a `collision_check`; the generated types are
rebuilt. Old briefs remain valid because the new fields are optional.

## Consequences

- A reader can see what collided, the prior work, the claims that depend on it and
  the source URL.
- A brief compiled without a novelty check is visibly incomplete.
- The API and typed client do not yet accept `collisions` on `POST /v1/ideas/{id}/brief`;
  the UI therefore renders `not_checked`. That is honest; wiring the API input is a
  follow-up.
- The novelty check is still a structured comparison over the supplied prior-art
  list, not a claim that the corpus is complete. The note says to confirm coverage.

## Alternatives considered

- **Omit the section when there is no data.** Rejected: it looks clean.
- **Require a source on every collision.** Rejected: a prior-art id may be enough
  for a local check; the field is optional.
- **A boolean `collision_checked`.** Rejected: the note is needed to explain what
  "checked" covered.

## Risks

- `claim_ids` can be empty for an idea with no claims; the table renders `—`.
- A caller can pass an empty array to claim "checked". The compiler trusts the
  caller; the CLI only produces it from an explicit prior-art graph.
