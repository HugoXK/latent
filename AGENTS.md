# AGENTS.md

Instructions for AI agents and maintainers working on **Latent**. Humans should
read [CONTRIBUTING.md](CONTRIBUTING.md) too; both files are binding.

Read first, in this order:

1. [LESSONS.md](LESSONS.md) — dated, open constraints.
2. [docs/code-standards.md](docs/code-standards.md) — review honesty, risk tiers.
3. [docs/architecture.md](docs/architecture.md) — the frozen contract.

---

## What Latent is

Latent develops an incomplete idea into a version a person can question, test and
act on. It captures a fragment, reconstructs it into hypotheses with an assumption
ledger, incubates it, verifies it through gates, and compiles a brief or spec.

It is **not** an idea generator, a note app, a code runner or an autonomous
researcher. A model proposes; a human decides anything that changes scope, spend,
safety or publication.

Core paths:

| Path | What it is |
|---|---|
| `docs/` | Vision, architecture, prior art, roadmap, security, decisions |
| `data/schemas/` | Canonical JSON Schema for the five primitives |
| `verticals/` | Vertical packs (iGEM first) |
| `apps/`, `packages/` | Runtime (scaffolded in `v0.2`) |
| `README.md`, `README.zh.md` | The public contract |

## Hard rules

0. **Scope the permission.** An approval for Latent grants Latent only. Do not wire
   it to FlyBot, Bot Social or ScienceDiscovery beyond the documented port.

1. **No secrets in git.** Never commit `.env`, keys, tokens, cookies, private
   fragments, the `data/` runtime directory or a model response containing private
   content. Never print a secret in a comment, log, PR body or fixture.

2. **Never fabricate evidence.** A claim is `verified` only when a source span
   supports it and a verifier passed. A missing source is `inferred` or `unknown`.
   A fluent sentence is not evidence. A fake citation is a release blocker.

3. **Schemas are the source of truth.** A schema change needs an ADR, a migration
   note and a fixture. Do not hand-write a runtime type and "keep it in sync".

4. **Humans decide.** No autonomous publication, spend, repository write or
   external side effect. A hard gate is decided by a human; a model decision is
   rejected.

5. **Frozen paths.** The ledger, the verifiers, the gate engine and the promotion
   rule are frozen. An evolution candidate that changes them is rejected before
   evaluation. A change requires an ADR and owner approval.

6. **One issue → one branch → one PR.** If an issue already has a PR, push to that
   branch. Never open a second PR and close the first.

7. **Test first.** A regression test must fail on the unbroken tip, then pass with
   the fix. Keep both halves of the evidence.

8. **Only original material.** Do not copy code, text, icons or graphics from
   another product. Licensed dependencies keep their notices.

9. **One writer, one worktree, one port.** No two agents in the same worktree. Use a
   dedicated port for a verification server, never the documented default.

## Pipeline

```
issue → claim → worktree/branch → red test → fix → gates → PR
      → review at the tip → risk tier → merge → release
```

1. **Issue.** One issue per session and per worktree. Search for duplicates. A
   change is admitted only when it fixes a reproducible defect or is something the
   work itself needs.
2. **Claim.** Comment with the branch name, a one-line plan, and what will be run.
3. **Red test.** Write the failing test first; keep the failure output.
4. **Fix.** The smallest correct change. No unrelated refactor.
5. **Gates.** `pnpm check` once the runtime exists; schema validation now.
6. **PR.** One PR with the test, the doc and the changelog fragment.
7. **Review at the tip.** A PASS names what was run (`Ran: ...`). A new commit
   voids it.
8. **Risk tier.** T0–T3 from the diff, never from a label. T2/T3 need a PASS and,
   for T3, owner approval.

## Risk tiers

| Tier | Examples | Merge rule |
|---|---|---|
| **T0** | Docs, comments, fixtures | Green CI |
| **T1** | A vertical pack, an adapter, a UI string | Green CI + one review |
| **T2** | Ledger, verifier, gate engine, schema with a migration | Green CI + PASS at the tip + ADR |
| **T3** | Auth, encryption, the promotion rule, a frozen path | Green CI + PASS + owner approval |

## Verification honesty

- State what you ran and what you did not run. "Tests pass" without the command is
  not a report.
- Do not soften a failed check. If a citation check fails, the claim is
  `unsupported`; the brief does not compile.
- Do not claim a feature exists because the schema has a field for it.

## Definition of done

- Schema updated and validated; fixtures cover new required fields.
- The test failed before and passes after.
- The ledger/gate behaviour matches the spec.
- Docs and both READMEs updated if user-facing.
- A changelog fragment exists.
- CI is green at the tip; the risk tier is recorded.
