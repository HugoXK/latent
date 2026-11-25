# 0004 — Human-in-the-loop and gates

- Status: accepted
- Date: 2026-11-25
- Decision owner: HugoXK

## Context

The temptation is to make the agent autonomous: it develops the idea, runs the
gates, and publishes the brief. That would be faster and demo better. It would also
be wrong. Ideas are personal, gates can change scope or spend, and the cost of a
confident mistake is high — a season, a grant, a company.

Fledge's model is the right precedent: a model may propose, but a human reviews the
artifact, and only a maintainer can enable anything that merges or spends.

## Decision

### Models propose, humans decide

- The system may reconstruct, retrieve, verify, red-team and compile.
- A **human decides** any gate that changes scope, spend, safety or publication.
- A gate's `decided_by` field is `human` for those gates; a model decision is
  rejected by the gate engine.
- A waiver is human-only and always audited with a reason.

### Defer is first-class

- When evidence is insufficient, the decision is `defer`, not a confident answer.
- An idea with a load-bearing unconfirmed assumption cannot be promoted to
  `verifying`.
- A `pass` is tied to a source snapshot and an idea version; new evidence voids it.

### No autonomous side effects

- No autonomous spend above the per-job budget.
- No autonomous publication, email, post or PR.
- No autonomous repository write; the core compiles a spec, a runtime executes it.
- Incubation writes **suggestions**, never silent edits.

### Budgets and consent

- Every job has a budget and an idempotency key.
- A budget overage needs an explicit human action.
- A private fragment goes to a model provider only with per-provider consent, and
  the UI previews what will leave the machine.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Full autonomy with a confidence threshold | A threshold is not a judgement; a high-confidence wrong gate is the worst case |
| Auto-approve low-risk gates | Acceptable only for mechanical checks (schema, existence), never for scope/spend/safety |
| A separate "reviewer model" as the final authority | Models can be wrong together; the human is the reviewer of record |
| No gates, just a warning | A warning is ignored; a gate blocks compilation |

## Consequences

- The product is slower than a pure generator. That is the point: it buys a
  defensible artifact.
- The UX must make review cheap: a gate board, a diff of assumptions, one-click
  confirm or correct.
- The audit log is a product feature, not an internal detail.
- A team can delegate a gate to a named role, but the role is still a human.
