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
   contains `Verdict: PASS`. This is the current bot behaviour, and it is why the
   gate also runs on a schedule: a commit comment does not trigger a workflow.

A `REQUEST_CHANGES` at the same SHA blocks, even if an earlier PASS exists. The
newest verdict wins. A new commit moves the head, so every PASS is tied to a tip:
**a new commit voids the PASS**.

The gate also requires that the PR author is not `HugoXK-bot`. A reviewer cannot
approve its own tip.

## Required checks

| Context | Workflow | What it proves |
|---|---|---|
| `ci-ok` | `ci.yml` | `spec` + `node` passed at the tip |
| `pr-lint` | `pr-lint.yml` | linked issue, one risk tier, evidence block, changelog obligation |
| `review-gate` | `review-gate.yml` | the reviewer PASS at the tip |

`codeql`, `dependency-review` and `secret-scan` run as advisory checks. They are
visible in the PR, but they do not decide the merge today.

## How the gate runs

`review-gate.yml` triggers on:

- pull request open / synchronize / reopen / ready for review;
- pull request review submitted / edited / dismissed;
- issue comment created / edited;
- every 10 minutes (a scheduled repaint for commit comments);
- manual dispatch.

The job's own name is `review-gate-runner`; the script creates the required
`review-gate` check run on the pull request head. It creates a new run only when
the conclusion changed, so the schedule does not spam check runs.

The script checks out the **base** ref, reads the reviewer from
`.github/agent/review-policy.json` on the base, and executes no pull request code.

## Getting a PASS

1. Open the PR with the template filled in (`Fixes #N` or `No-issue:`, one risk
   tier, `Ran:` and `Not run:`).
2. Wait for `ci-ok` and `pr-lint`.
3. Let `HugoXK-bot` review the head. If it comments on the commit, the scheduled
   run picks it up within 10 minutes. You can also run it now:

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
