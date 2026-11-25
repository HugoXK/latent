# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Fragments for the next release live in [`changelog.d/`](changelog.d/).

## [Unreleased]

### Added

- The reference runtime (capture → develop → verify → compile) is planned for
  `v0.2`. Nothing in this section is shipped.

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

[Unreleased]: https://github.com/HugoXK/latent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/HugoXK/latent/releases/tag/v0.1.0
