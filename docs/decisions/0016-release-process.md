# 0016 — Manual two-phase release with an SBOM and provenance

- Status: accepted (T3; owner approval recorded 2026-11-28)
- Date: 2026-11-27
- Owner: HugoXK
- Issue: #14

## Context

There was no reproducible release path. Changelog fragments are created per PR but
were never folded; package versions were fixed; there was no tag, SBOM or
provenance. A release must not be a local `git tag` that skips review, and it must
not run on every merge.

## Decision

1. **Two-phase manual workflow.** `release.yml` has `mode=prepare` and
   `mode=publish`; both require a green `main` `ci` run and check out that exact
   commit.
2. **Prepare opens a release PR.** `release.py --write` folds `changelog.d/` into
   `CHANGELOG.md`, bumps root/packages/apps versions, deletes the consumed
   fragments, and the workflow opens `release/vX` for normal review.
3. **Publish is gated.** It refuses unless `main` is green, no fragments remain, and
   `package.json` already carries the version. It tags the verified main commit,
   not the current tip.
4. **SBOM is local and deterministic.** `sbom.py` turns
   `pnpm list --json --depth Infinity` into CycloneDX 1.5, deduplicated and sorted.
   The root component is metadata; workspace `link:` entries are omitted.
5. **Provenance is first-party.** `actions/attest-build-provenance` attests the
   source archive; it is not a third-party wrapper.
6. **Releases stay manual.** No release on merge, no auto-bump on every PR.
7. **The release PR uses the normal gate.** It is T2, needs a changelog explanation
   (`Changelog-not-needed:` since it folds fragments), and the usual review-gate
   PASS.

## Migration note

None. A release changes only `CHANGELOG.md`, the `version` fields and deletes
`changelog.d/*.md` (except `README.md`).

## Consequences

- A release is reviewable as a PR before anything is tagged.
- The tag target is the verified SHA, so a concurrent `main` push cannot move it.
- The SBOM is a dependency inventory, not a vulnerability report; `pnpm audit` and
  the security workflow remain separate.
- The workflow cannot be executed locally. The scripts are stdlib-only and unit
  tested; the YAML is validated in review.
- The source archive and SBOM are attached to the GitHub release; a hosted
  distribution channel is out of scope.

## Alternatives considered

- **Release on every merge (`semantic-release`).** Rejected: a new dependency and
  no human checkpoint.
- **A third-party SBOM generator.** Rejected for v0.3: a network dependency for a
  small dependency graph. Revisit if the graph or standards require it.
- **Push the release commit directly to `main`.** Rejected: branch protection and
  the review gate apply to releases too.
- **Tag the current `main` at publish time.** Rejected: it can race a merge; the
  verified SHA is the target.

## Risks

- `gh run list` is the green check; a transient API error fails the release. Retry;
  do not bypass.
- Pinned action versions must be refreshed deliberately.
- The release PR still needs a human PASS; the workflow cannot approve itself.
