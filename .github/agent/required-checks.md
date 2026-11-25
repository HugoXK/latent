# Required checks — the record

**This file is the record, not the gate.** Required status checks live in the
repository's branch protection; only an owner can write them. Editing this file
changes nothing at merge time. It exists so the enforced set is readable in a
diff.

The required contexts on `main` are exactly what the checks API reports:

| Context | Workflow | What it proves |
|---|---|---|
| `ci-ok` | `ci.yml` | the spec checks and the Node typecheck/test suite passed at the tip |
| `pr-lint` | `pr-lint.yml` | the PR body has a linked issue, one risk tier, an evidence block and a changelog obligation |
| `review-gate` | `review-gate.yml` | `HugoXK-bot` posted a PASS at the pull request head SHA |

`ci-ok` is the aggregate: `spec` (schemas, local links, required files) and
`node` (install, typecheck, 48+ tests). It runs on push and pull request.

Advisory (not required yet):

| Context | Workflow | Why it is advisory |
|---|---|---|
| `codeql` | `codeql.yml` | analysis can be slow or fail for infrastructure reasons; promote it after a stable week |
| `dependency-review` | `dependency-review.yml` | useful signal, not a merge decision |
| `secret-scan` | `security.yml` | full-history scan; keep it visible without blocking a docs PR |

## Branch protection

- Require a pull request before merging.
- Require the three contexts above.
- `enforce_admins`: **true**. Direct pushes to `main` are refused, including the
  owner's.
- Required approving reviews: **0**. The `review-gate` check is the approval; a
  native GitHub approval is not a second source of truth.
- Dismiss stale reviews: false (the gate is tied to the head SHA).
- Require conversation resolution: true.
- Allow force pushes: false. Allow deletions: false.
- `strict` (up-to-date branch): false, as in Fledge. A merge queue is the better
  long-term answer; until then, a semantic conflict is a residual risk.

## Changing this set

A change to branch protection is an owner action through the GitHub API or UI, not
a repository edit. If the reviewer is unavailable, temporarily remove protection
and re-enable it after the emergency; record the reason in the PR.
