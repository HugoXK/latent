# 0013 — Outcome-backed interviewer priors

- Status: accepted (T2; owner approval recorded 2026-11-28; review at the fix head is the gate)
- Date: 2026-11-28
- Owner: HugoXK
- Issue: #28

## Context

The interviewer asks a fixed set of questions with declared option priors. Those
priors are a guess. Once a project records what actually happened, a question can
be calibrated against the answers users gave before the result was known, instead
of staying a guess forever. The risk is overfitting a handful of outcomes, or
letting an idea without a result masquerade as evidence.

This decision lands the computation on `main` without the outcome primitive that
the full #75 stack carried. `priors.ts` therefore accepts the minimal structural
shape `{ idea_id, realised_success }`; a canonical `Outcome` is assignable to it
when the outcome type lands. The CLI, the API endpoint and the interviewer wiring
are follow-ups, not part of this change.

## Decision

1. **Only outcome-backed ideas are evidence.** An observation is
   `(question, value, success)` read from the constraint state of an idea that has
   a realised outcome. An idea without an outcome contributes nothing; an idea
   without a state contributes nothing.
2. **The prior is a distribution over the declared options.** For a closed
   question, count the observed values that match an option and ignore unmatched
   values. A value keeps its type and its object key order does not split samples:
   the key is a canonical, type-tagged encoding (`null`, `NaN`, `undefined`, the
   string `"undefined"` and `{a:1,b:2}` vs `{b:2,a:1}` are all distinct where they
   should be).
3. **Weighting is add-one smoothed.** With `c` samples for an option and `n`
   declared options, the prior is `(c + 1) / (sample_count + n)`. Smoothing keeps
   every option positive, so information gain stays finite and one option never
   collapses to zero on a small sample.
4. **Sparse questions fall back to uniform.** Below `min_samples` (default 5) the
   prior is `1 / n` regardless of the declared priors. A question with no options
   and a text question have no option distribution and stay uniform.
5. **Expose the evidence.** Every question prior carries `sample_count` and
   `source: "uniform" | "empirical"`, so a caller can see whether a prior moved.
6. **Deterministic.** Observations are grouped by question and the output follows
   the vertical's question order.
7. **Own-property read only.** The constraint state is read with an own-property
   check, so a question variable named `__proto__` or `constructor` cannot read
   through the prototype chain and become an observation.
8. **One observation per idea and question.** A correction is a newer outcome:
   the newest `decided_at` wins for that idea, ties and undated records fall back
   to the last input entry. An idea cannot contribute the same question twice, so
   a corrected outcome does not double its weight.
9. **Duplicate option values are deduplicated, first declaration wins.** A
   declared list with two entries for the same value would otherwise receive the
   same count twice and push the distribution above 1; the value is a single
   option in the distribution and in the smoothing denominator.
10. **`minSamples` must be finite.** A non-finite or non-numeric override is a
    `PriorsError` (`INVALID_MIN_SAMPLES`), not a silently uniform prior.

## Migration note

None. No schema or stored format change: there is no persisted prior table, and
the report is computed on demand. The `PriorOutcome` interface is additive and
structural; the canonical `Outcome` type will satisfy it without a data change.

## Consequences

- A prior moves only when outcome-backed evidence crosses the threshold, and the
  sample count is visible next to it; corrected outcomes replace, they do not
  accumulate, and duplicate option values cannot make a distribution exceed 1.
- The prior describes how this user answers, not whether an idea succeeds; success
  calibration is a separate surface.
- Five is a heuristic. A high-variance vertical may need more; the `minSamples`
  option is exposed without changing the default.
- A single-user local store has selection bias; the report shows the sample size
  rather than hiding it.
- Until the outcome primitive lands, callers pass `{ idea_id, realised_success }`;
  the compiler will accept a real outcome object unchanged.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Use success rates directly as priors | They do not form a distribution over options |
| Pool every idea, outcome or not | An unfinished idea is not evidence |
| Ship the whole #75 stack here | It carries the outcome schema, generated types and calibration; the ruling is that this slice is exactly the priors computation |
| A hierarchical Bayesian model | Too much machinery for a local-first v0.3; revisit with a population |

## Risks

- A small sample that just crosses the threshold can move a prior sharply; add-one
  smoothing and the visible sample count bound the surprise.
- The mapping assumes the constraint state belongs to the same idea version; a
  stale state is a data-quality issue.
- The structural outcome shape is deliberately narrow; a future outcome primitive
  must keep `idea_id` and `realised_success` (and `decided_at` for correction
  ordering) to stay compatible.
- Deduplicating by first declaration means a deliberate repeated option label is
  dropped silently; a config that wants two labels for one value must model one
  option with two labels at the UI layer.
