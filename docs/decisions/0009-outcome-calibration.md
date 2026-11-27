# 0009 — Immutable outcomes and a reproducible calibration report

- Status: proposed (T2, owner approval pending)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #54

## Context

A confidence is decoration until it is scored against something that happened.
The idea graph (#52) now records what was proposed; it does not record whether a
decision was right. Without outcomes, the interviewer priors (#28) cannot be
calibrated, the taste model has no signal, and "confidence 0.62" is a number with
no history.

The dangerous shortcut is to infer success from a fluent note or from a decision
label. "Parked" is not "failed"; "shipped" is not necessarily "worked". Calibration
must score an explicit binary, recorded by a human, against the confidence that
was predicted before the result was known.

## Decision

1. **An outcome is an immutable record**, not a field on an idea. A correction is a
   new outcome; the ledger keeps both.
2. **`realised_success` is explicit and required.** It is a boolean recorded by a
   human or an expert. It is never inferred from `decision` or from `notes`.
   `decision` (`shipped`, `tested`, `parked`, `killed`, `failed`) is descriptive
   context, not the calibration label.
3. **The prediction snapshot is part of the record.** `predicted_confidence` and
   `predicted_at` are stored with the outcome. A later confidence cannot rewrite
   the prediction.
4. **Ownership is explicit.** Every outcome carries `owner_id`; reads are
   owner-scoped. Local mode uses `local`. Auth is #50; this makes the boundary
   ready without pretending it is enforced.
5. **Outcomes are in the memory graph.** Recording an outcome writes an
   `outcome_of` edge from the outcome to its idea, with provenance `outcome`.
6. **The calibration report is reproducible.** Outcomes are sorted by id, the clock
   is injected, and the report contains `sample_count`, Brier, log loss, ten
   reliability bins and `missing_outcome_ideas`. Missing outcomes are listed, never
   assumed to be failures.
7. **Decided ideas without an outcome are visible.** For the report, "decided"
   means `briefed`, `learned` or `killed`. A parked idea is reversible and is not
   counted as a missing result.
8. **Recording the first outcome for a `briefed` idea moves it to `learned`.** The
   state machine already defines that transition; the outcome is its exit
   condition.
9. **Priors do not change yet.** #28 consumes this report only after a documented
   minimum sample; uniform priors remain the fallback.

## Migration note

- `user_version 2 -> 3`.
- `CREATE TABLE outcomes (...)` with owner and idea indexes.
- Existing fragments, ideas, claims, gates, briefs, edges and events are unchanged.
- Downgrade is not supported; the table is additive.

## Consequences

- Brier and log loss are only meaningful with a sample. The report exposes
  `sample_count` and per-bin counts; no gate or release decision reads a Brier
  score from a handful of rows.
- `realised_success` is a judgement. The record names the decider (`human` or
  `expert`) and keeps the evidence refs; a disagreement is a new record.
- The calibration report is one query plus one scan of decided ideas. That is
  acceptable for a single-machine store; a materialised view is a later
  optimisation.
- The outcome and the idea can disagree (for example, a shipped idea judged a
  failure). That is the point: the graph records the result, not the intention.

## Alternatives considered

- **Derive success from `decision`.** Rejected: `parked`, `killed` and `failed` are
  not the same, and `shipped` does not imply success.
- **A single "quality" scalar on the idea.** Rejected: mutates history and cannot be
  re-scored.
- **Automatic outcomes from telemetry.** Rejected for now: it is an external side
  effect and a model must not decide what happened.
- **A separate calibration database.** Rejected: local-first, one writer, one
  transaction domain.

## Risks

- Small samples produce noisy Brier scores; the report must be read with
  `sample_count`.
- `owner_id` is a convention until #50.
- A missing outcome can look like success if a caller filters the list; the report
  is the required surface, not an ad-hoc query.
