# Agent claim protocol

- Status: accepted
- Date: 2026-11-27
- Owner: HugoXK

Several agents may work in parallel while the owner is away. This protocol prevents
two agents claiming one issue and opening duplicate pull requests. It is binding
alongside [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## Labels

| Label | Meaning |
|---|---|
| `agent-ready` | Scoped, with acceptance criteria and no unmet dependency. |
| `blocked` | A dependency, a decision or an owner action is missing; do not start. |
| `agent-working` | An agent has claimed it; the claim comment names the branch. |
| `human` | Only the owner can do it (secrets, repo settings, a PASS decision). |
| `priority:P0`–`P3` | Ordering, not a risk tier. |
| `risk:T0`–`T3` | The expected diff risk; recompute from the diff, never trust the label. |

The pickable queue is:

```sh
gh issue list --label agent-ready \
  --search "-label:blocked -label:agent-working" \
  --limit 30
```

## Claim

Comment on the issue **before** creating a branch:

```text
Claiming: feat/52-memory-graph
Plan: typed owner-scoped edges, migration, CLI/API, tests.
Will run: pnpm check; python3 -m unittest discover -s .github/scripts -p "test_*.py".
Files: packages/core, packages/store, apps/cli, data/schemas.
```

Then apply `agent-working`. If another agent has already claimed it, do not start a
second branch: comment and pick the next issue. When the PR is open, remove
`agent-working` and link the PR in the issue.

## One issue, one branch, one PR

- One issue per agent session and per worktree. One worktree per writer.
- Branch from the integration base; never push to `main`.
- If the issue already has a PR, push to that branch. Never open a second PR and
  close the first.
- Keep the branch focused: no unrelated refactor.
- If a required check or the reviewer is unavailable, follow the
  [stop rule](review.md#when-the-reviewer-is-unavailable); do not bypass.

## Creating labels

Label creation uses the owner's repo-write token, never the reviewer seat:

```sh
gh label create agent-working --description "Claimed by an agent" --color FBCA04
gh label create blocked --description "Dependency or decision missing" --color D93F0B
gh label create human --description "Owner action required" --color 5319E7
```

If a label is missing, comment the blocker; do not create it with a token you do not
own.
