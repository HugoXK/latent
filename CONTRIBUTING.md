# Contributing

Thanks for helping. Latent is a specification-first project: the schemas and the
decisions are the contract, and the runtime is held to them. Read
[AGENTS.md](AGENTS.md) and [docs/code-standards.md](docs/code-standards.md) before
you start.

## Ground rules

1. **Schemas are the source of truth.** A schema change needs an ADR, a migration
   note and a fixture.
2. **Never fabricate evidence.** A claim is `verified` only when a source span
   supports it. "It sounds right" is not a source.
3. **Humans decide.** No autonomous publication, spend or repository write. A hard
   gate is decided by a human.
4. **No secrets in git.** No `.env`, keys, tokens or private fragments in a commit,
   a test fixture, a screenshot or an issue.
5. **One issue, one branch, one PR.** If an issue already has a PR, push there.
6. **Original material only.** Do not copy code, text, icons or graphics from another
   product. Licensed dependencies keep their notices.
7. **Bilingual.** User-facing copy and both READMEs stay in step (Chinese and
   English).

## Ways to contribute

- **Docs**: a clearer explanation, a missing ADR, a corrected claim with a source.
- **Schemas**: a fixture, a validator test, a migration note.
- **Verticals**: a new pack (research proposal, startup idea, grant) with its
  variables, evidence scale, gates and template.
- **Adapters**: a model, search, runtime, evolver or research-tool adapter that
  passes the port contract tests.
- **Evaluation**: a replayed historical case, an expert rubric, a calibration
  report.

## Development setup

`v0.1` has no runtime yet. Once `v0.2` lands:

```sh
git clone https://github.com/HugoXK/latent.git
cd latent
pnpm install
pnpm check      # lint + typecheck + tests + schema validation
pnpm dev
```

Requirements: Node 22.9+ and pnpm 10+. Python 3.10+ is used only for schema
validation in this spec release.

## Issues

- Search for an existing issue first.
- A bug report includes: what you expected, what happened, a minimal reproduction,
  the version or commit, and whether it is already public.
- A feature request includes: the user problem, the smallest version that helps,
  and how it would be evaluated.
- Never put exploit detail or a private fragment in a public issue.

## Claiming an issue

Read [docs/agent-protocol.md](docs/agent-protocol.md). Comment the branch, plan,
files and commands, then apply `agent-working`. One issue → one branch → one PR; if
a PR already exists, push to it. Never open a duplicate PR.

## Pull requests

A PR states:

1. what changed and why;
2. what you ran, and what you did not run;
3. the evidence (test names, commands, output);
4. the risk tier (T0–T3) and why;
5. open questions.

Checklist:

- [ ] A failing test existed before the fix (bug fixes).
- [ ] `pnpm check` passes.
- [ ] Schemas validate; fixtures cover new required fields.
- [ ] Docs and both READMEs are updated if user-facing.
- [ ] A changelog fragment exists in `changelog.d/`.
- [ ] `ci-ok` and `pr-lint` are green; `HugoXK-bot` posted a `review-gate` PASS at the tip.
- [ ] No secrets, no private data, no copied assets.

A reviewer who did not run the change says so. A new commit voids a previous PASS.

If `review-gate` cannot pass because the reviewer is unavailable, or a required
check is red for infrastructure reasons, comment the exact missing check and run URL
and leave the pull request open. Do not admin-merge, force-push or relax branch
protection. A bypass is not a PASS; see
[docs/review.md](docs/review.md#when-the-reviewer-is-unavailable).

## Review gate

`main` is protected: direct pushes are refused, including the owner's. A pull
request merges only when `ci-ok`, `pr-lint` and `review-gate` pass at the head SHA,
and `HugoXK-bot` posted a PASS at that SHA. A PASS is an `APPROVED` review, a
`Verdict: PASS` review body, a PR comment with the head SHA, or a commit comment on
the head. The gate polls every 10 minutes for commit comments and can be triggered
manually:

```sh
gh workflow run review-gate.yml -f pr=<number>
```

See [docs/review.md](docs/review.md). The reviewer is separate from the author; the
author of the tip may not PASS it.

## Commit messages

Use the imperative mood and a short scope:

```
ledger: demote a claim when the span does not support it
igem: add the 2026 village list to the rules config
docs: clarify the difference between infer and unknown
```

## Releases

- `v0.1`–`v0.2`: release when the exit criteria in
  [docs/roadmap.md](docs/roadmap.md) are met.
- From `v0.3`: a weekly minor on Monday (Asia/Shanghai), patches as needed.
- A release that changes user-facing behaviour updates both READMEs and `docs/` in
  the same PR.

## License

By contributing you agree that your contribution is licensed under Apache-2.0
(section 5 of the licence). There is no separate CLA.

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report
unacceptable behaviour privately to the maintainer listed there.
