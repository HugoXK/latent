# Glossary

Terms are used consistently across the README, the docs and the schemas. When a
term changes, change it everywhere in the same PR.

| Term | Meaning |
|---|---|
| **Fragment** | A raw capture: text, voice, image, link or sketch, with provenance. Not yet an idea. |
| **Idea** | A versioned object with hypotheses, assumptions, open questions and a status. The unit of development. |
| **Develop** | The act of turning a fragment into an idea: reconstructions, assumptions, questions and a confidence. |
| **Reconstruction** | A candidate reading of an incomplete fragment. There are always alternatives; never one truth. |
| **Hypothesis** | A specific, testable statement inside an idea, with a variant and a confidence. |
| **Assumption** | Something the system had to fill in. It has a risk (`low`/`medium`/`high`) and a status (`unconfirmed`/`confirmed`/`refuted`). |
| **Claim** | A statement with a value, unit, conditions, sources, status and confidence. The atom of the ledger. |
| **Ledger** | The collection of claims with provenance. The source of truth for what is known. |
| **Cite or abstain** | The rule that a claim without a source is `inferred` or `unknown`, never `verified`. |
| **Confidence basis** | The evidence grade behind a confidence: `A` (peer-reviewed characterisation), `B` (registry/wiki data), `C` (sequence only), `expert`. |
| **Gate** | A go/no-go test with a criterion, a falsifier, controls, evidence and a fallback. |
| **Falsifier** | The observation that would prove the gate wrong. Required for every gate. |
| **Fallback** | The allowed response to a failed gate: `change_readout`, `change_host`, `reduce_scope`, `compute_only`, `none`. |
| **Waive** | A human-only decision to accept a gate that did not pass. Always audited. |
| **Brief** | A compiled one-page output with problem, approach, evidence, risks and unknowns. |
| **Spec** | A compiled, implementation-facing output that a coding agent or a lab can execute. |
| **Compile** | To produce a brief or spec after all validators pass. |
| **Incubate** | A scheduled, background process that connects fragments to new evidence and to each other. |
| **Resurface** | To bring an old fragment or idea back when it becomes relevant. |
| **Vertical** | A domain configuration: variables, evidence scale, gates, compiler template, corpus adapters. |
| **Pack** | The shippable form of a vertical. Contains no model-specific logic. |
| **Calibration** | The relationship between predicted confidence and realised outcomes. |
| **Defer** | A first-class decision: there is not enough evidence, so do not promote. |
| **Decide** | Record an outcome: approved, tested, shipped, parked, killed. |
| **Frozen path** | A component that evolution may not modify: the ledger, verifiers, gate engine, promotion rule. |
| **Port / adapter** | An interface in the core and a vendor-specific implementation outside it. |
| **Anti-homogenisation** | Structural measures against the model's tendency to produce similar ideas. |
| **Replay benchmark** | A blind evaluation on historical projects with the outcome hidden. |
| **Outcome** | What actually happened to an idea, recorded after the fact. |
