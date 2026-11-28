# 0010 — Withdraw the docs-only auto-pass from the review gate

- Status: accepted
- Date: 2026-11-28
- Decision owner: Latent Lead, on Chief's authority
- Supersedes: the `t0DocsAutoPass` proposal in #7 / #8

## Problem

#7 proposed that a pull request whose changed files are all documentation could
pass the review gate with no verdict at all, so that small docs fixes would not
wait for a reviewer. The proposal reached a working branch twice (#8, then the
gate hunk carried inside the v0.3 stack) and was never shipped to `main`.

## Why not

The classifier decided "documentation" by path prefix alone. That made the
auto-pass a gate bypass rather than an optimisation:

- `docs/deploy.sh` (mode 100755) and `docs/page.html` containing a `<script>`
  both classify as documentation;
- a `src/x.ts → docs/x.md` rename classifies as documentation;
- an executable or a security-relevant ops document would reach `main` with
  `review-gate: success` and no human or bot reviewer having read it.

A gate whose waiver can be triggered by choosing a filename is not a gate.
Review Lead reproduced all three evasions at #8's head `2b2e9182` (verdict
2026-11-27T09:27:27Z): `docs/deploy.sh` (mode 100755), `docs/page.html`
containing a `<script>`, and a `src/x.ts → docs/x.md` rename all classified as
documentation. Chief withdrew the T3 approval for the stack on that basis.

## Alternatives

1. **Keep the auto-pass with an extension allowlist** (`.md`, `.txt`, `.rst`,
   regular blobs only, no symlinks, no executable bit) plus negative tests for
   each evasion. Rejected: it is a permanent maintenance surface on a frozen
   path, and it buys one review hop for docs PRs at the cost of a second
   classifier that can be wrong in the same direction as the first.
2. **Remove the auto-pass; every pull request needs a verdict at its head SHA.**
   Chosen. There is no classifier to evade, the policy matches what the gate
   actually does today, and documentation still gets reviewed by the same bot
   that reviews code.

## Decision

No docs-only auto-pass. `t0DocsAutoPass` and `is_docs_only` are withdrawn;
`review-gate` requires a verdict at the head SHA for every pull request,
regardless of which paths changed. Decided by Latent Lead on Chief's authority,
2026-11-28. The gate's own unit tests must assert that a docs-only PR with no
verdict BLOCKS.

## Reopen trigger

Reconsider this decision if docs-only pull requests wait more than 24 hours for a
verdict on more than three occasions in a rolling week. Record the dates and the
PR numbers when that happens; a feeling that reviews are slow is not a trigger.

## Reopen cost

The withdrawal analysis above plus roughly one to two days of work: reinstate the
classifier with an extension allowlist, add the negative tests for executable
bits, symlinks and renames, and re-approve the gate change as T3. No migration,
no stored data, no schema change — the gate is stateless, so reopening is a
revert-plus-review, not a data problem.
