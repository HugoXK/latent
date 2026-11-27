# 0013 — Outcome-backed interviewer priors

- Status: proposed (T2)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #28

## Context

The interviewer uses declared option priors. They are a guess. Outcomes now exist
(#54), so a question can be calibrated against what users actually answered before
a result was known. The risk is overfitting a handful of outcomes or letting an
idea without a result masquerade as evidence.

## Decision

1. **Only outcome-backed ideas are evidence.** An observation is
   `(question, value, success)` read from the constraint state of an idea that has
   an `Outcome`. An idea without an outcome contributes nothing.
2. **The prior is a distribution over the declared options.** For a closed
   question, count the observed values that match an option; ignore unmatched
   values. Apply add-one smoothing so every option stays positive and information
   gain stays finite.
3. **Sparse questions stay uniform.** Below `min_samples` (default 5) the prior is
   `1 / options.length`, regardless of the declared priors. A text question has no
   option distribution and stays uniform.
4. **Expose the sample count and the source.** Every question prior carries
   `sample_count` and `source: "uniform" | "empirical"`. The CLI is
   `latent priors [--min-samples N]`; the API is `GET /v1/priors`.
5. **No interface change.** `nextQuestion`, `blockingQuestions` and
   `isReadyForVerification` keep their contracts. This ADR does not change gates,
   the ledger or any frozen path.
6. **Deterministic.** Observations are read in idea order and grouped by question;
   the output follows the vertical's question order.

## Migration note

None. No schema or stored format change; the prior report is computed.

## Consequences

- A prior moves only when outcome-backed evidence crosses the threshold; the
  sample count is visible next to it.
- The prior describes how this user answers, not whether an idea succeeds. The
  Brier/log-loss report from #54 is the separate success-calibration surface.
- Five is a heuristic. A vertical with high variance may need a larger threshold;
  the CLI/API expose the override without changing defaults.
- A single-user local store has selection bias; the report exposes the sample size
  rather than hiding it.

## Alternatives considered

- **Use success rates directly as priors.** Rejected: they do not form a
  distribution over options.
- **Pool every idea, outcome or not.** Rejected: an unfinished idea is not
  evidence.
- **A hierarchical Bayesian model.** Rejected for now: too much machinery for a
  local-first v0.3; revisit with a population.

## Risks

- A small sample that just crosses the threshold can move a prior sharply; the
  add-one smoothing and the visible sample count bound the surprise.
- The mapping from outcomes to answered values assumes the constraint state
  belongs to the same idea version; a stale state is a data-quality issue.
