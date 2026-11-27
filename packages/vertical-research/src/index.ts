import type { VerticalPack } from "@latent/core";

/**
 * A research-proposal vertical. It proves the pack contract is not iGEM-specific:
 * the core supplies the state machine, ledger, gates and compiler; the pack
 * supplies the domain's questions and falsifiers.
 */
export const research: VerticalPack = {
  id: "research",
  name: "Research proposal",
  description:
    "A falsifiable research question with an available dataset, a feasible compute plan, an ethics path and a baseline.",
  evidenceScale: [
    "A: peer-reviewed measurement or a replicated experiment",
    "B: a preprint, a public dataset or a documented protocol",
    "C: a plan, an analogy or an expert estimate",
    "expert: a named advisor's judgement, recorded as an assumption",
  ],
  rules: { version: "2026.1", checked_at: "2026-01-01" },
  variables: [
    "field",
    "question",
    "prior.work",
    "novelty.claim",
    "data.access",
    "data.license",
    "compute.level",
    "advisor",
    "timeline.weeks",
    "success.metric",
    "ethics.review",
    "budget.total",
  ],
  questions: [
    {
      id: "q.field",
      variable: "field",
      prompt: "Which field is the proposal in?",
      blocking: true,
      options: [
        { value: "ml", label: "Machine learning", prior: 0.3 },
        { value: "biology", label: "Biology", prior: 0.3 },
        { value: "climate", label: "Climate", prior: 0.2 },
        { value: "social", label: "Social science", prior: 0.1 },
        { value: "other", label: "Other", prior: 0.1 },
      ],
    },
    {
      id: "q.question",
      variable: "question",
      prompt: "What is the one question the work would answer?",
      kind: "text",
      blocking: true,
      options: [],
    },
    {
      id: "q.prior.work",
      variable: "prior.work",
      prompt: "Which three prior works are closest, and what is the delta?",
      kind: "text",
      blocking: true,
      options: [],
    },
    {
      id: "q.novelty.claim",
      variable: "novelty.claim",
      prompt: "What exactly is new: the mechanism, the interface, the data or the evaluation?",
      kind: "text",
      blocking: true,
      options: [],
    },
    {
      id: "q.data.access",
      variable: "data.access",
      prompt: "Can the team access the data the question needs?",
      blocking: true,
      options: [
        { value: "public", label: "Public dataset", prior: 0.4 },
        { value: "restricted", label: "Restricted / application", prior: 0.4 },
        { value: "none", label: "No data yet", prior: 0.2 },
      ],
    },
    {
      id: "q.data.license",
      variable: "data.license",
      prompt: "What license or agreement covers the restricted data?",
      dependsOn: [{ variable: "data.access", equals: "restricted" }],
      options: [
        { value: "academic", label: "Academic agreement", prior: 0.5 },
        { value: "dua", label: "Data-use agreement", prior: 0.3 },
        { value: "none", label: "Not granted yet", prior: 0.2 },
      ],
    },
    {
      id: "q.compute.level",
      variable: "compute.level",
      prompt: "What compute can the team actually use?",
      blocking: true,
      options: [
        { value: "laptop", label: "Laptop only", prior: 0.25 },
        { value: "single_gpu", label: "One GPU", prior: 0.35 },
        { value: "cluster", label: "Cluster allocation", prior: 0.3 },
        { value: "none", label: "None yet", prior: 0.1 },
      ],
    },
    {
      id: "q.advisor",
      variable: "advisor",
      prompt: "Is there a named advisor for the domain?",
      options: [
        { value: "yes", label: "Yes", prior: 0.6 },
        { value: "no", label: "No", prior: 0.2 },
        { value: "unknown", label: "Not yet asked", prior: 0.2 },
      ],
    },
    {
      id: "q.timeline.weeks",
      variable: "timeline.weeks",
      prompt: "How many weeks are available?",
      blocking: true,
      options: [
        { value: 8, label: "Up to 8", prior: 0.2 },
        { value: 16, label: "About 16", prior: 0.4 },
        { value: 24, label: "About 24", prior: 0.3 },
        { value: 52, label: "A year or more", prior: 0.1 },
      ],
    },
    {
      id: "q.success.metric",
      variable: "success.metric",
      prompt: "Which result decides success?",
      blocking: true,
      options: [
        { value: "effect_size", label: "An effect size above a baseline", prior: 0.3 },
        { value: "replication", label: "A replication of a published result", prior: 0.25 },
        { value: "benchmark", label: "A benchmark improvement", prior: 0.3 },
        { value: "negative_result", label: "A well-supported negative result", prior: 0.15 },
      ],
    },
    {
      id: "q.ethics.review",
      variable: "ethics.review",
      prompt: "What is the ethics or IRB status?",
      blocking: true,
      options: [
        { value: "not_required", label: "Not required", prior: 0.4 },
        { value: "approved", label: "Approved", prior: 0.3 },
        { value: "pending", label: "Pending", prior: 0.3 },
      ],
    },
    {
      id: "q.budget.total",
      variable: "budget.total",
      prompt: "What is the rough budget, in USD?",
      options: [
        { value: 0, label: "No budget", prior: 0.15 },
        { value: 1000, label: "Under 5k", prior: 0.35 },
        { value: 10000, label: "5k–25k", prior: 0.35 },
        { value: 50000, label: "25k+", prior: 0.15 },
      ],
    },
  ],
  gates: [
    {
      key: "falsifiable",
      name: "falsifiable question",
      criteria:
        "The question names an observation that would change the plan and a baseline to compare against.",
      falsifier: "No observation could change the plan, or there is no baseline.",
      fallback: "reduce_scope",
      hard: true,
    },
    {
      key: "prior_art",
      name: "prior-art collision",
      criteria:
        "The three closest works are named and the delta is stated in mechanism, interface, data or evaluation.",
      falsifier: "A prior work already answers the same question with the same data.",
      fallback: "reduce_scope",
      hard: true,
    },
    {
      key: "data",
      name: "data availability",
      criteria: "The data exists, is accessible and its license permits the use.",
      falsifier: "The data is missing, restricted without an agreement, or unusable.",
      fallback: "compute_only",
      hard: true,
    },
    {
      key: "compute",
      name: "compute feasibility",
      criteria: "The plan fits the available compute and time.",
      falsifier: "The experiment cannot run within the allocation or calendar.",
      fallback: "reduce_scope",
      hard: true,
    },
    {
      key: "ethics",
      name: "ethics review",
      criteria: "The required review is approved before data collection or deployment.",
      falsifier: "The review is refused or still pending when the work would start.",
      fallback: "none",
      hard: true,
    },
    {
      key: "evaluation",
      name: "evaluation plan",
      criteria:
        "A metric, a baseline, a stopping rule and a negative-result interpretation are written down.",
      falsifier: "There is no metric or no baseline; any result would be reported as success.",
      fallback: "reduce_scope",
      hard: true,
    },
  ],
  briefTemplate: `# Research proposal brief

## Question
What would change our mind?

## Prior art and delta
The three closest works and the gap.

## Data and license
What exists, what is missing, what may be used.

## Method and compute
The smallest experiment that answers the question.

## Evaluation
Metric, baseline, stopping rule, negative-result interpretation.

## Ethics
Review status and constraints.

## Risks and unknowns
What we still do not know.

## Next step
The single next action.`,
};
