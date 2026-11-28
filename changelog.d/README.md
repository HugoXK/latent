# Changelog fragments

One file per pull request that changes behaviour, named `<issue>.<type>.md`:

- `1234.added.md`
- `1234.changed.md`
- `1234.fixed.md`
- `1234.security.md`
- `1234.removed.md`

Write one or two sentences in the imperative mood. A release folds the fragments
into `CHANGELOG.md` and deletes them in the same PR.

A PR that changes user-facing behaviour without a fragment is incomplete.

## A fragment is added by the PR that ships the work

Never add a fragment in advance for work that is only planned, in review or on a
stack branch. The fold is mechanical: it does not check whether the code exists,
so an advance fragment publishes a claim a reader cannot find on `main`. That is
fabricated evidence, not a clerical detail.

Until the work ships, its fragment lives in `changelog.d/pending/` with the same
filename and the same content. The PR that lands the work moves it up with
`git mv`. Formatting, wording and type stay as written; only the path changes.

## The fold never reads `pending/`

`release.py` reads `changelog.d/*.md`, which does not recurse, so a pending
fragment is invisible to the fold and is not deleted by `--write`. A release
therefore publishes only shipped work, and a fragment still sitting in `pending/`
is a fragment that is deliberately not in the changelog yet.

At publish time `release.yml` refuses while any top-level fragment remains
(`find changelog.d -maxdepth 1 -name '*.md' ! -name README.md`): the release PR
must fold every top-level fragment before the tag is cut.

A PR with no tracker issue uses its own pull request number instead
(`61.fixed.md`, `99.security.md`); the leading number only has to identify the
change in the release notes.
