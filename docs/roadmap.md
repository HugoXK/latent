# Roadmap

- Status: accepted
- Date: 2026-11-25
- Owner: HugoXK

The roadmap is sequenced by **evidence**, not by features. A version ships when
its exit criteria are met; a version that cannot be evaluated does not ship.

> **Status:** `v0.2.0-alpha.0` ships the working vertical slice (capture →
> interview → develop → gate → brief) with a deterministic reconstructor and an
> information-gain interviewer. The remaining `v0.2` exit criteria are a real
> model adapter and ten real fragments.

## Sequencing principles

1. **Spec before runtime.** The schemas and the decisions are the contract; code
   that violates them is a bug.
2. **Local before hosted.** One machine, SQLite and the user's keys first.
3. **Vertical before platform.** Prove the loop on iGEM before generalising.
4. **Ledger before generation.** A better generator is worthless without a way to
   tell what it invented.
5. **Human before autonomous.** No unsupervised spend, publication or side effect.

## Versions

| Version | Theme | Deliverables | Exit criteria |
|---|---|---|---|
| `v0.1` | **Spec** | PRD, architecture, five schemas, iGEM vertical, evaluation plan, ADRs | Schemas validate in CI; docs reviewed; 3 design partners interviewed |
| `v0.2` | **Capture + develop** | Local store, CLI, interviewer, reconstruction, assumption ledger, brief export | One user goes fragment → brief offline; zero unsupported claims in a compiled brief; first 10 real fragments processed |
| `v0.3` | **Verify** | Retrieval adapters, novelty graph, gate engine, red team, calibration report | Gate verdict agrees with an expert panel on 20 replayed iGEM projects; collision recall measured |
| `v0.4` | **Incubate** | Background jobs, resurfacing, memory graph, taste model, weekly digest | Weekly resurfacing produces ≥ 1 accepted connection per active user; no silent edits |
| `v0.5` | **Ecosystem** | FlyBot runtime adapter, AgentDescent evolver, Janus-style calibrator, ScienceDiscovery tools | One vertical runs end to end on the shared stack; frozen paths enforced |
| `v1.0` | **Team** | Team workspaces, Postgres, public API, vertical SDK, audit export | A paid pilot with a real team; D30 retention and calibration error reported |

## Workstreams

### Product and design

- The five primitives and their UX: capture, reconstruction, assumption ledger,
  gate board, brief.
- The "what I guessed vs what you confirmed" interaction. This is the signature.
- Anti-homogenisation: three variants, cross-domain analogy, adversarial critic.

### Core runtime

- Orchestrator state machine, event log, idempotent jobs.
- SQLite store and content-addressed blobs.
- CLI first, web second.

### Evidence

- Span-level citation verifier.
- Existence checks per vertical (parts, papers, companies).
- Numeric normalisation and sanity bounds.
- Contradiction search.

### Verticals

- iGEM (first), then research proposal, startup idea, grant.
- A vertical pack = variables + evidence scale + gates + compiler template +
  corpus adapters.

### Ecosystem

- FlyBot runtime port (schedules, team memory).
- AgentDescent evolution of prompts, rubrics and templates, offline only.
- Janus-style calibration ledger.
- ScienceDiscovery research-tool adapter for science verticals.

## Evaluation plan

### Level 1 — Claim integrity

- **Metric:** unsupported claims per compiled brief.
- **Method:** automated citation-support verifier plus a human audit of a sample.
- **Target:** `0` in the sample; any failure is a release blocker.

### Level 2 — Reconstruction quality

- **Metric:** share of assumptions the user accepts without editing; share of
  reconstructions the user keeps.
- **Method:** instrumented sessions with consent; a weekly cohort report.
- **Target:** `> 60%` accepted, `> 30%` kept after one week.

### Level 3 — Verification quality

- **Metric:** gate verdict agreement with an expert panel; collision recall.
- **Method:** blind replay of historical iGEM projects; pairwise expert review.
- **Target:** `> 75%` agreement; collision recall reported, not hidden.

### Level 4 — Outcome

- **Metric:** share of ideas reaching a decided state; calibration error.
- **Method:** user-reported outcomes and a follow-up prompt at 30/90 days.
- **Target:** tracked from `v0.3`; no vanity targets before there is data.

### Benchmarks to build

1. **iGEM replay**: given pre-season information, recover a viable topic and the
   right collision report.
2. **Reconstruction**: given a fragment (keywords / 60-second voice), recover the
   user's intended idea; measure against their own reconstruction.
3. **Gate calibration**: predicted gate outcome versus the real DBTL outcome.
4. **Diversity**: set-level distance between the three variants; a floor, not a
   ceiling.

## Release cadence

- `v0.1`–`v0.2`: no fixed cadence; release when the exit criteria are met.
- From `v0.3`: a weekly minor on Monday (Asia/Shanghai), patches as needed, in the
  same spirit as Fledge. A release that changes user-facing behaviour updates both
  READMEs and `docs/` in the same PR.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| "Just use ChatGPT" objection | High | High | Lead with the ledger and gates, not the prose |
| Reconstruction feels like the model's idea | Medium | High | Assumption ledger, variants, "keep/correct/delete" |
| Evaluation is too expensive | Medium | Medium | Start with 20 replayed projects; grow with users |
| Platform absorption | High | Medium | Vertical depth, local-first, ecosystem ports |
| Retention of capture | High | High | Incubation and resurfacing, not notifications for their own sake |
| Biosafety misuse | Low | Severe | Classifier, refusal, human review in science verticals |

## Open questions

1. Which vertical has the strongest retention: iGEM, research proposals, startup
   ideas, or grants?
2. Is the signature interaction the assumption ledger or the gate board?
3. What is the minimum viable memory that still improves reconstruction?
4. Can we price on decided outcomes rather than seats or tokens?
5. What does "team" mean for a private thought: shared idea, shared gate, or
   shared brief?
