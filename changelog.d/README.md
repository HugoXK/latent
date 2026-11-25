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
