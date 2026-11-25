# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Fragments for the next release live in [`changelog.d/`](changelog.d/).

## [Unreleased]

### Added

- Information-gain interviewer: `ConstraintState`, a 10-question iGEM bank with a
  blocking set, `nextQuestion` / `blockingQuestions` / `isReadyForVerification`,
  and a `constraint_states` table in the store.
- CLI `ask`, `answer` and `constraints`; API
  `GET /v1/ideas/{id}/constraints` and
  `POST /v1/ideas/{id}/constraints/answer`.
- `brief` now refuses to compile while a blocking constraint is unanswered.
- OpenAI-compatible `ModelReconstructor`: strict JSON, three variants, grade-C
  only, `inferred`/`unknown` claims, one repair, no silent fallback.
- `LATENT_RECONSTRUCTOR=model` with `LATENT_MODEL_BASE_URL`,
  `LATENT_MODEL_API_KEY`, `LATENT_MODEL_NAME` and `LATENT_MODEL_JSON_MODE`; the
  template remains the default.
- ADR 0006 (model adapter) and seven adapter tests (39 total).

### Planned

- The iGEM replay benchmark and the expert panel.
- Ten real fragments through the full loop.

## [0.2.0-alpha.0] — 2026-11-25

### Added

- pnpm workspace with `packages/core`, `packages/store`, `packages/adapters`,
  `packages/vertical-igem`, `apps/cli` and `apps/server`.
- Core state machine with explicit transitions, blocking assumptions and
  versioned ideas.
- Claim ledger validators: unsupported `verified` claims, grade-C verification,
  numeric claims without a unit, contradictions without a source.
- Gate engine: hard gates require a human to pass or waive; a waiver needs a
  reason; `unknown` and `fail` block promotion.
- Brief compiler with four validators and an explicit "still unknown" section.
- SQLite store (`node:sqlite`) for fragments, ideas, claims, gates, briefs and an
  append-only event log.
- CLI: `capture`, `develop`, `confirm`, `decide`, `brief`, `show`.
- Local Fastify API: fragments, ideas, assumption decisions, gate decisions,
  brief compilation, health and readiness.
- Deterministic `TemplateReconstructor` so the pipeline is testable offline.
- iGEM pack as runtime data: 30 variables, 7 gates, brief template.
- 26 `node:test` tests covering the state machine, ledger, gates, compiler,
  store, adapters, vertical pack, CLI and API.
- CI now runs both the spec checks and the Node typecheck/test suite.
- npm Dependabot is enabled again, with grouped updates.

### Changed

- README status moved from `v0.1 spec` to `v0.2 alpha`, with a runnable quick
  start.

## [0.1.0] — 2026-11-25

### Added

- Product thesis, principles and non-goals (`docs/vision.md`).
- Architecture: state machine, components, ports, trust boundaries, failure modes
  (`docs/architecture.md`).
- Prior-art analysis of the sibling projects and the external landscape, with the
  academic evidence (`docs/prior-art.md`).
- Roadmap with exit criteria and an evaluation plan (`docs/roadmap.md`).
- Security and privacy model, including biosafety and prompt-injection controls
  (`docs/security.md`).
- The iGEM vertical specification (`docs/vertical-igem.md`,
  `verticals/igem/`).
- JSON Schema 2020-12 for Fragment, ConstraintState, Claim, Idea, Gate and Brief
  (`data/schemas/`).
- ADRs: name, stack, evidence ledger, human-in-the-loop, ecosystem
  (`docs/decisions/`).
- Bilingual README, contributing guide, security policy, code of conduct, agent
  rules and lessons.

[Unreleased]: https://github.com/HugoXK/latent/compare/v0.2.0-alpha.0...HEAD
[0.2.0-alpha.0]: https://github.com/HugoXK/latent/releases/tag/v0.2.0-alpha.0
[0.1.0]: https://github.com/HugoXK/latent/releases/tag/v0.1.0
