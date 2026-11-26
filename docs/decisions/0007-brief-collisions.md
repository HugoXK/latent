# 0007 — The brief carries the collision report

- Status: accepted
- Date: 2026-11-26
- Decision owner: HugoXK

## Context

A novelty verdict that lives only in a separate report is easy to ignore. The
brief is the artifact a person reads before spending a season on an idea, so it
must say what collided with prior work. The novelty package ([../novelty.md](../novelty.md))
already produces a `CollisionReport`; the core should not depend on that package.

## Decision

- Add an **optional** `collisions` array to `Brief` and `brief.schema.json`.
- `compileBrief` accepts `collisions?: BriefCollision[]` and copies it into the
  brief; an older brief without the field remains valid.
- The novelty adapter maps its report with `toBriefCollisions`; the core never
  imports the novelty package.
- `renderBriefMarkdown` adds a "Novelty and collisions" section only when the
  array is non-empty.
- A collision does **not** block compilation by itself. A `blocked` verdict is a
  human decision; the brief records the evidence, the gate engine decides.

## Consequences

- The schema change is additive and needs no migration.
- The field is structured (`kind`, `prior_id`, `prior_label`, `severity`,
  `note`), so a later UI can filter and link it.
- A missing collision check is not rendered as "clean"; the brief simply has no
  section, and the evaluation harness reports collision availability separately.
- A collision change is a T2 change: the brief contract and the renderer move
  together.
