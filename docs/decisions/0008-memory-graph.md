# 0008 — Memory graph, ownership and explicit deletion

- Status: proposed (T2, owner approval pending)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #52

## Context

The long-term moat is the user's own idea graph and outcomes, not generated text.
Today `packages/store` has rows for fragments, ideas, claims, gates and briefs, but
no edges and no way to explain why two ideas are connected. The architecture
describes a memory graph and a taste model, but the store cannot answer a
connection query, and deleting a fragment can silently orphan the ideas derived
from it.

The issue's acceptance criteria include "no private content leaks to another
user", but there is no identity model yet (#50). This ADR deliberately scopes the
graph to a single owner with an explicit `owner_id` column, so the query surface is
already owner-scoped when auth lands, without pretending that isolation is
enforced today.

## Decision

1. **Edges live in SQLite, not in a separate graph database.** One writer, one
   transaction domain, local-first. An edge is a row, not a document.
2. **The relation vocabulary is closed**: `derived_from`, `references`,
   `supports`, `contradicts`, `supersedes`, `duplicates`, `collided_with`,
   `outcome_of`. A new relation is a schema change, not a free-form string.
3. **Every edge has an owner, a provenance and a timestamp.** Local mode uses
   `owner_id = "local"`. Every read is owner-scoped; cross-owner queries return
   nothing. Auth enforcement is #50; this ADR only makes the boundary explicit.
4. **Edges are proposals, never silent edits.** `develop` creates
   `fragment -> idea`, `idea -> claim` and `idea -> gate` edges with provenance
   `develop`. An incubator will add more edges with its own provenance (#53).
5. **Deletion is explicit.** Fragments and edges are soft-deleted via
   `deleted_at`. `deleteFragment` blocks by default when a live idea references the
   fragment and returns the orphaned idea ids. `policy: "mark"` is the explicit
   override: it marks the fragment and its edges deleted and appends a
   `fragment.deleted` event that lists the orphaned ideas. The idea status is not
   changed silently.
6. **Export is an open, deterministic graph.** `exportMemory` returns
   `{ schema_version, exported_at, owner_id, nodes, edges }`, sorted by id. No
   private content is embedded beyond node ids and edge provenance.
7. **Search is a local text match** over fragment content and idea title/one-liner,
   excluding deleted fragments. It is not the retrieval index (#33) and it is not
   vector novelty (#35).
8. **Migrations use `PRAGMA user_version`.** A shape change appends a migration; it
   never rewrites stored rows in place.

## Migration note

- `user_version 0/1 -> 2`.
- `ALTER TABLE fragments ADD COLUMN deleted_at TEXT` (nullable; existing rows are
  live).
- `CREATE TABLE edges (...)` plus owner/from/to indexes.
- Existing fragments, ideas, claims, gates and events are unchanged.
- Downgrade is not supported; the additions are nullable/append-only.

## Consequences

- A connection query is bounded BFS over sorted edges; depth is capped at 5 and the
  result is deterministic.
- Ownership is application-enforced until #50; the column exists now so the
  follow-up does not need a second migration.
- Deleting a referenced fragment requires a human decision; the audit log keeps the
  orphan list.
- Search scans local rows. That is acceptable for a single-machine store; an FTS5
  table is a later optimisation behind the same method.
- Embeddings are deliberately absent. Novelty remains a structured comparison
  (#35), not a cosine score.

## Alternatives considered

- **A separate graph database.** Rejected: breaks local-first and transactions for
  a store that is currently measured in rows.
- **Adjacency embedded in `Idea` JSON.** Rejected: reverse queries and deletion
  semantics become scan-and-rewrite.
- **Edges from an LLM with no provenance.** Rejected: an unexplained connection is
  not memory, it is noise.
- **Hard delete with a cascade.** Rejected: silent orphaning and no audit trail.

## Risks

- `owner_id` is a convention until #50; a bug that forgets the filter would leak
  within the same machine.
- The graph can grow without a retention policy; #52 does not add one.
- A future relation needs a schema migration and a fixture, by design.
