# Review gate

- Status: active
- Date: 2026-11-25
- Owner: HugoXK

`main` is protected. A pull request merges only when the required checks pass and
**`HugoXK-bot` posted a PASS at the head SHA**. This page explains what counts, how
the gate runs, and how to get a PASS.

## Why a separate reviewer

Latent is an idea-development product; the author is the person most likely to
believe their own reconstruction. The reviewer identity is separate from the
author identity:

- author: `HugoXK` (and the `Day Dreamer` profile);
- reviewer: `HugoXK-bot`.

The author of the tip may never PASS it. That rule is checked, not assumed.

## What counts as a PASS

The gate reads four channels and takes the **newest verdict at the head SHA**:

1. **PR review** — a review by `HugoXK-bot` with `state: APPROVED` and
   `commit_id == head`.
2. **PR review body** — a `COMMENTED` review whose body contains
   `Verdict: PASS` (or `## Review — PASS`).
3. **PR issue comment** — a comment by `HugoXK-bot` that contains the head SHA and
   `Verdict: PASS`.
4. **Commit comment** — a comment by `HugoXK-bot` on the head commit whose body
   contains `Verdict: PASS`. This is the current bot behaviour. `commit_comment`
   now triggers the workflow promptly; the schedule remains a fallback.
5. **T0 docs-only auto-pass** — when every changed file is documentation and the
   reviewer posted no verdict, the gate passes if the base policy sets
   `t0DocsAutoPass: true`. An explicit `REQUEST_CHANGES` still blocks; an explicit
   `PASS` still counts. Code, CI, schema and vertical changes never qualify.

A `REQUEST_CHANGES` at the same SHA blocks, even if an earlier PASS exists. The
newest verdict wins. A new commit moves the head, so every PASS is tied to a tip:
**a new commit voids the PASS**.

The gate also requires that the PR author is not `HugoXK-bot`. A reviewer cannot
approve its own tip.

### T0 docs-only

A docs-only change is one whose changed files are all in `docs/`, `changelog.d/`,
or the root docs set (`README.md`, `README.zh.md`, `CHANGELOG.md`, `LICENSE`,
`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `AGENTS.md`,
`LESSONS.md`). With `t0DocsAutoPass` true, the gate creates a PASS when there is
no explicit verdict. This keeps small documentation fixes from blocking on a bot
that skips T0 commits. Anything under `packages/`, `apps/`, `data/`, `verticals/`
or `.github/` is not docs-only.

## Required checks

| Context | Workflow | What it proves |
|---|---|---|
| `ci-ok` | `ci-ok-publish.yml` | `spec` + `node` + `gate-tests` passed; published from the default branch (the in-workflow aggregate in `ci.yml` is bootstrap only) |
| `pr-lint` | `pr-lint.yml` | linked issue, one risk tier, evidence block, changelog obligation |
| `review-gate` | `review-gate.yml` | the reviewer PASS at the tip |

`codeql`, `dependency-review` and `secret-scan` run as advisory checks. They are
visible in the PR, but they do not decide the merge today.

## How the gate runs

`review-gate.yml` triggers on:

- pull request open / synchronize / reopen / ready for review;
- pull request review submitted / edited / dismissed;
- issue comment created / edited;
- commit comment created / edited;
- every 10 minutes (a fallback repaint for missed events);
- manual dispatch.

The job's own name is `review-gate-runner`; the script creates the required
`review-gate` check run on the pull request head. It creates a new run when the
conclusion changes and refreshes the summary when the reason changes at the same
conclusion; an unchanged summary is not repainted.

The script checks out the **base** ref, reads the reviewer from
`.github/agent/review-policy.json` on the base, and executes no pull request code.

## Getting a PASS

1. Open the PR with the template filled in (`Fixes #N` or `No-issue:`, one risk
   tier, `Ran:` and `Not run:`).
2. Wait for `ci-ok` and `pr-lint`.
3. Let `HugoXK-bot` review the head. A commit comment triggers the gate promptly;
   the 10-minute schedule is only a fallback. You can also run it now:

   ```sh
   gh workflow run review-gate.yml -f pr=<number>
   ```

4. When the verdict is PASS, the `review-gate` check turns green and the PR can
   merge.

If the latest verdict is `REQUEST_CHANGES`, fix the tip. The next commit requires a
new PASS.

## The reviewer account

`HugoXK-bot` was invited as a collaborator with **write** permission. Accept the
invitation from the bot account (or let the bot service accept it). Without write
access the bot can still comment on commits on a public repository, but it cannot
submit a PR review.

The current bot posts a **commit comment**. That is supported by channel 4 above.
If the bot is upgraded to submit PR reviews, channels 1 and 2 apply with no gate
change.

## The ci-ok publisher

`ci-ok` is published by `ci-ok-publish.yml` from the **default branch** on the
`workflow_run` completion of `ci`. The publisher reads the triggering run's jobs and
requires exactly `spec`, `node` and `gate-tests`, each `success`. A pull request
that deletes `gate-tests` cannot obtain a green `ci-ok`. The publisher checks out
the default branch, never the pull request head.

The aggregate job in `ci.yml` keeps the same name during bootstrap so the required
context exists before the publisher lands on the default branch. Once the publisher
is live on `main`, the in-workflow aggregate is redundant; the publisher updates
the existing check run instead of creating a duplicate.

## When the reviewer is unavailable

The reviewer is a hard dependency. If `review-gate` cannot pass because the reviewer
is unavailable, or a required check is red for infrastructure reasons:

1. Comment on the pull request with the exact blocker:

   ```text
   Blocked: review-gate cannot pass.
   - Missing: HugoXK-bot PASS at <head SHA>
   - Required checks: ci-ok, pr-lint, review-gate (current: <names/status>)
   - Run: <workflow run URL>
   - Action: awaiting the reviewer; no admin merge, force-push or protection change.
   ```

2. Leave the pull request open. Do not close and reopen it to reset checks.
3. Do not admin-merge, force-push, remove branch protection or invent a PASS.
   A bypass is not a PASS.

The owner can resolve the blocker; the agent stops and reports it.

## Fork pull requests

The default `GITHUB_TOKEN` is read-only for a pull request from a fork, so the
script cannot create the `review-gate` check. Use a same-repository branch for
now. A maintainer can run the gate manually from a trusted branch if a fork PR
must be evaluated; do not switch to `pull_request_target` just to obtain write
access.

## Emergency

The owner can temporarily remove protection:

```sh
gh api -X DELETE repos/HugoXK/latent/branches/main/protection
# do the emergency work
# re-apply the protection from .github/agent/required-checks.md
```

Record the reason in the PR. A bypass is not a PASS.
