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
- ADR 0006 (model adapter) and seven adapter tests.
- Private-fragment consent: the model adapter refuses a private fragment unless
  `LATENT_MODEL_SEND_PRIVATE=true`; the fragment is JSON-encoded and labelled
  untrusted, and the default model temperature is `0`.
- The compiler records real citation/numeric validator results and marks
  existence/vertical rules as `skipped` instead of stamping them `pass`.
- Runtime JSON Schema validation (Ajv 2020-12) at the store boundary, with a
  schema test suite.
- CI: `ci-ok` aggregate, `pr-lint`, `review-gate`, CodeQL, dependency review and
  secret scan; branch protection requires `ci-ok`, `pr-lint` and `review-gate`.
- `HugoXK-bot` invited as a collaborator with write access; the reviewer policy is
  in `.github/agent/review-policy.json`.
- The review gate reads PR reviews, PR comments and commit comments; the newest
  verdict at the head SHA wins, and a new commit voids a PASS.
- `docs/review.md` and `.github/agent/required-checks.md`.

### Planned

- The iGEM replay benchmark and the expert panel.
- Ten real fragments through the full loop.
- Generated types and a schema-drift check.

## [0.2.0-alpha.1] - 2026-11-28

### Added

- **#15** — replay: add the ReplayCase schema, validator and illustrative fixtures

  The blind replay format is defined in `data/schemas/replay-case.schema.json`, with
  temporal-cutoff and seed-leak checks, exactly one required seed candidate and five
  invalid fixtures. `latent eval validate <file>` checks a case.

- **#18** — model: add request-keyed replay fixtures

  `LATENT_MODEL_REPLAY=1` reads a recorded response keyed by model, temperature,
  messages and response_format. A missing fixture is a typed error and no network
  call is made; the record helper redacts private strings before writing.

- **#20** — Generate the TypeScript schema types from `data/schemas/` and fail CI when the
  committed types are stale (`pnpm schema:types` / `pnpm schema:types:check`); no
  runtime behaviour changes.

- **#21** — schema: add a valid and an invalid fixture for every schema

  `packages/core/test/fixtures.test.ts` iterates `data/schemas/*.schema.json` and
  fails when a schema lacks a fixture. The store rejects an invalid write for every
  primitive, and date-time and numeric bounds are tested.

- **#29** — interviewer: free-text, multi-select and other answers

  `QuestionDefinition` gains `kind` and `allowOther`; `answerConstraint` validates
  the answer shape; the CLI and API normalize multi and text answers.

- **#32** — vertical pack: validator and authoring guide

  `validateVerticalPack` checks variables, questions, dependencies, options and
  gates; `assertValidPack` is exercised by the iGEM pack and documented in
  `docs/vertical-pack.md`.

- **#35** — novelty: add the typed novelty graph

  `NoveltyGraph` stores project, part, mechanism, host, readout, substrate,
  evidence and idea nodes with typed edges and neighbor queries.

- **#36** — novelty: canonicalize mechanism, interface, host and readout

  `canonicalize` normalizes the collision tuple and maps a small, explicit set of
  mechanism aliases.

- **#38** — brief: render the collision report

  `collisionReport` distinguishes mechanism, interface and sequence collisions;
  the brief carries them in `collisions` and renders a "Novelty and collisions"
  section.

- **#44** — safety: enforce the BSL and dual-use classifier before any reconstruction

  Every pack now passes the same pre-reconstruction screen (no opt-in bypass). Select
  agents, toxins and enhancement language are refused after NFKC/lowercase/
  homoglyph/punctuation normalisation and an explicit abbreviation and multilingual
  table; a BSL-2 pathogen requires `team_bsl >= 2` from the API/CLI, defaulting to 1.
  The refusal is a typed error (CLI exit 1, API 422) and the audit event records
  category/bsl only.

- **#46** — spec: add an implementation-facing spec compiler

  `compileSpec` emits assumptions, interfaces, data contracts, gate-derived tests,
  milestones and unknowns; it blocks unsupported claims, unknown hard gates and
  open high-risk assumptions. `latent spec` renders Markdown or JSON.

### Changed

- **#38** — Render collision evidence (claims, source and a checked / not_checked status) in
  compiled briefs, and escape Markdown table cells so a pipe or line break cannot
  break or inject a row.

- **#118** — Document the shipped pack-independent biosafety model: the screen runs before
  `reconstruct` for every vertical, has no per-pack opt-in and no automatic
  override, and surfaces as CLI exit 1 / API `422 BIOSAFETY_BLOCKED` with a
  content-free `biosafety.refused` event.

### Fixed

- **#61** — Fix the replay fixture leak: give the illustrative case a neutral `metadata.title`
  and add a regression test that no visible field can recover the hidden seed title.
  Add ADR 0007 for the ReplayCase schema, its migration note and its anti-leakage
  fixture policy.

### Security

- **#94** — security: keep the default gitleaks ruleset active during secret scans

  The repository-root `.gitleaks.toml` now sets `[extend] useDefault = true`, so it can no longer turn `secret-scan` into a no-op; the one exemption is scoped to `generic-api-key` for a single historical replay-fixture path, with its removal condition documented. The scan is pinned to gitleaks 8.30.1 with a checksum, and a regression script proves the exemption does not widen.

- **#95** — Refuse to record a private fragment or an unredacted fixture under the committed
  `data/model-replay/` tree, and keep the replay constructor on the default-deny
  `LATENT_MODEL_SEND_PRIVATE` gate. Remove the committed sample fixture and the
  allowlist-only `.gitleaks.toml`, which disabled the default secret ruleset.

- **#99** — Reject prototype-polluting constraint variable names and replace the quadratic
  baseUrl trailing-slash regex with a linear scan, closing two CodeQL alerts on
  main (remote property injection and polynomial ReDoS).

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
