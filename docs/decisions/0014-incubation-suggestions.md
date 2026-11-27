# 0014 — Budgeted incubation proposals and a reviewable digest

- Status: proposed (T2)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #53

## Context

The memory graph (#52) can explain a connection once it exists, and outcomes
(#54) can score a decision, but nothing resurfaces an old fragment when a new idea
touches it. The product needs a background loop that proposes connections without
editing the graph behind the user's back.

The risk is twofold: an expensive job that runs away, and a "smart" system that
silently rewrites the user's memory. Both are unacceptable.

## Decision

1. **The artifact is a `Suggestion`.** It records `from`, `to`, `kind`, `reason`,
   `score`, `budget_cost`, `status` and timestamps. A suggestion is a proposal; it
   never inserts an edge or edits an idea.
2. **A human decides.** `proposed -> accepted | rejected | revoked`, and
   `accepted -> revoked`. A model cannot accept a suggestion.
3. **The local engine is deterministic.** It scores term overlap (Jaccard over
   Latin words and Han bigrams) between the seed and other fragments/ideas. No
   network, no embedding model. A retrieval-backed or model-backed scorer is a
   later adapter behind the same proposal shape.
4. **Duplicates are suppressed.** A pair already linked by a live memory edge, or
   already present as a suggestion, is not proposed again.
5. **The budget is enforced by the core.** One credit per suggestion; the plan
   never spends more than `budget`. The store also caps a job at 100 credits and a
   user at four open jobs.
6. **The job runs through `AgentRuntime`.** `runIncubation` calls
   `runtime.schedule({kind: "incubate"})` before executing the deterministic plan.
   The local CLI uses a no-op runtime; FlyBot (#55) can replace it.
7. **`since` distinguishes a connection from a resurface.** A node last updated
   before the cutoff is a `resurface`; otherwise a `connection`.
8. **The digest is read-only.** It lists proposed suggestions since a time, grouped
   by kind. It does not accept, reject or notify anyone; scheduling the digest is
   the runtime's job.
9. **Migration 4** adds `jobs` and `suggestions` with owner/status indexes.

## Migration note

- `user_version 3 -> 4`.
- `CREATE TABLE jobs`, `CREATE TABLE suggestions` and their indexes.
- Existing fragments, ideas, claims, gates, briefs, edges, outcomes and events are
  unchanged.
- Downgrade is not supported; the tables are additive.

## Consequences

- A user can review why two nodes are connected, accept or reject the proposal,
  and undo an acceptance with `revoke`.
- The engine is cheap and explainable, but it is lexical: a paraphrase with no
  shared terms is missed. Retrieval/embeddings can replace the scorer without
  changing the suggestion contract.
- A suggestion acceptance does not auto-create a memory edge. That is deliberate:
  the graph should change through an explicit user action. A follow-up can add
  "accept and link".
- The HTTP job/suggestion endpoints are not part of this change. The CLI is the
  first surface; the OpenAPI spec already documents `/v1/jobs` as a resource but the
  routes ship with the runtime work.
- The weekly digest is a query, not a scheduler. The runtime port is the seam for a
  real schedule.

## Alternatives considered

- **Insert edges automatically.** Rejected: a silent edit to the user's memory.
- **A background daemon inside the core.** Rejected: local-first and the runtime
  port already exist.
- **Vector similarity now.** Rejected for v0.4: an embedding dependency and a
  provider decision are larger than the proposal contract.
- **No budget.** Rejected: silent spend is a failure mode in the architecture.

## Risks

- Lexical overlap is language- and vocabulary-sensitive; the reason string makes
  the limitation visible.
- Re-running a job must pass existing suggestions; the CLI does, but a future
  adapter must keep that contract.
- The job cap is per owner in one SQLite database; a hosted deployment needs a
  shared queue.
