# 0015 — Prompt commit-comment verdicts and a default-branch ci-ok-published publisher

- Status: accepted (T3; owner approval recorded by Lead)
- Date: 2026-11-27
- Owner: HugoXK
- Issues: #10, #11

## Context

Two residual risks undermined the merge gate:

1. A verdict posted as a **commit comment** did not trigger a workflow, so it was
   only picked up by a 10-minute schedule. A gate can be green for up to ten
   minutes with a REQUEST_CHANGES already on the head.
2. A pull request could **edit its own `ci.yml`** and weaken the in-workflow
   `ci-ok` aggregate that judges it. The required context was not published from a
   trusted ref.

A third, smaller gap: when the conclusion stayed `failure` but the reason changed
("no verdict" to "REQUEST_CHANGES"), the check summary could stay stale.

## Decision

1. **`commit_comment` triggers `review-gate.yml`** with `created` and `edited`
   types. The script maps the commit SHA to open pull requests through
   `GET /commits/{sha}/pulls`. The schedule remains a fallback.
2. **The summary is refreshed at an unchanged conclusion.** `publish_check`
   PATCHes the existing check run when the conclusion is the same and the summary
   differs; an identical summary is a no-op.
3. **`ci-ok-published` is published from the default branch** by `ci-ok-publish.yml` on the
   `workflow_run` completion of `ci`. It reads the triggering run's jobs and
   requires exactly `spec`, `node` and `gate-tests`, each `success`. It also
   verifies the run: path `.github/workflows/ci.yml`, workflow id equal to the
   repository's `ci` workflow, same repository, `pull_request` event, head SHA
   equal to the published SHA, an open pull request whose base is the default
   branch, and an unchanged `ci.yml` blob at the head SHA. A pull request that
   edits `ci.yml` (or adds another workflow called `ci`) therefore cannot obtain
   a green `ci-ok-published`; the check is published red with the reason.
4. **The publisher checks out the default branch**, never the pull request head.
   It updates the existing `ci-ok-published` check run when one is present, so the context is
   not duplicated; it creates one when the pull request removed the aggregate.
5. **The in-workflow aggregate is bootstrap only.** It keeps the name `ci-ok` so
   the required context exists before the publisher lands on the default branch.
   Once the publisher is live, the aggregate is redundant.
6. **The reviewer and policy still come from the base ref.** The publisher does not
   change the review gate's identity logic.

## Migration note

None. No schema, table or stored format changes. The new workflow requires the
default branch to contain `ci-ok-publish.yml` and the Python script; until then the
in-workflow aggregate is the bootstrap path.

## Consequences

- A commit-comment verdict is picked up in seconds, not up to ten minutes; the
  scheduled run is a safety net.
- A pull request that deletes `gate-tests` (or edits the aggregate) cannot obtain a
  green `ci-ok`: the publisher fails the missing or non-success job.
- The publisher runs with `checks: write` and `actions: read`, but only on the
  default branch's workflow definition.
- A fork pull request may still have a read-only token in the PR workflow; the
  publisher runs from the base repository and creates the check on the head SHA.
  Fork support remains a separate decision.
- The T3 risk is the change itself: owner approval is required before merge.

## Alternatives considered

- **Use `pull_request_target` to get write access.** Rejected: it executes PR code
  with repository secrets.
- **Keep the in-workflow aggregate as the required context.** Rejected: the PR can
  weaken it.
- **Keep commit-comment verdicts schedule-only.** Rejected: a stale green gate for
  up to ten minutes.
- **Create a second `ci-ok` check instead of updating.** Rejected: duplicate
  contexts make branch protection ambiguous.

## Risks

- The bootstrap ordering is delicate: the aggregate must stay until the publisher is
  on the default branch. The required-checks record and `docs/review.md` call this
  out.
- A GitHub API outage can leave the publisher red; that is an infrastructure
  failure, not a code verdict. Do not bypass the gate to work around it.
- The exact job set is a string contract; renaming a job in `ci.yml` without
  updating `REQUIRED_JOBS` turns `ci-ok` red. That is intentional.
