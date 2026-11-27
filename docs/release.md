# Release process

- Status: implemented (`v0.3`)
- Date: 2026-11-27
- Owner: HugoXK

Releases are **manual and two-phase**. Never release from a red `main`, and never
push the release commit directly to `main`; the release PR goes through the same
`ci-ok`, `pr-lint` and `review-gate` gates as any other change.

## 1. Prepare

```sh
gh workflow run release.yml -f mode=prepare -f version=0.3.0
```

The workflow:

1. reads the latest `ci` run on `main` and refuses unless it is `success`;
2. checks out that exact green commit;
3. runs `pnpm check` and the Python script tests;
4. runs `.github/scripts/release.py --version 0.3.0 --write`, which:
   - folds `changelog.d/*.md` into a `## [0.3.0] - YYYY-MM-DD` section in
     `CHANGELOG.md`;
   - bumps the root, `packages/*` and `apps/*` `package.json` versions;
   - deletes the consumed fragments and leaves `changelog.d/README.md`;
5. commits on `release/v0.3.0`, pushes the branch and opens a release PR.

The release PR is mechanical: it contains the changelog and version changes only.
It is reviewed and merged like any other PR.

## 2. Publish

After the release PR is merged and `main` is green again:

```sh
gh workflow run release.yml -f mode=publish -f version=0.3.0
```

The workflow refuses unless `main` is green, no changelog fragments remain, and
`package.json` already carries the version. It then:

1. prints the release notes from `CHANGELOG.md` (`release.py --notes`);
2. builds `sbom.json` with `.github/scripts/sbom.py` from
   `pnpm list --json --depth Infinity`;
3. creates a source archive `latent-0.3.0.tar.gz` from the verified main commit;
4. creates the `v0.3.0` tag at that commit and the GitHub release with the notes;
5. uploads `sbom.json` and the source archive;
6. records a build-provenance attestation for the source archive.

The tag points at the commit whose CI run was verified at the start of the job, not
at whatever `main` happens to be later.

## Failure modes

| Symptom | Action |
|---|---|
| `main` is not green | Fix `main`; do not bypass. |
| `release/vX` already exists | Inspect the open release PR; do not force-push. |
| `vX` already exists | The release was published; bump the version. |
| Fragments remain in publish mode | The release PR did not fold them; fix it. |
| `package.json` version differs | The release PR did not merge the bump; fix it. |
| SBOM generation fails | Inspect `pnpm list --json` output; do not hand-write an SBOM. |

## Scripts

- `.github/scripts/release.py` — fold, insert, bump, notes; tested in
  `test_release.py`. No network and no git.
- `.github/scripts/sbom.py` — deterministic CycloneDX 1.5 from the pnpm list;
  tested in `test_sbom.py`. The root component is metadata, not a dependency.

Both scripts are stdlib-only. The workflows themselves are exercised only on
GitHub; the scripts are exercised in `gate-tests` and in `pnpm check`.
