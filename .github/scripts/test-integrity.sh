#!/usr/bin/env bash
# Fail when a gate test that exists on the base branch differs at the PR head.
# `gate-tests` runs from the checked-out head, so without this a PR could weaken
# or delete a gate test and still go green. New test files are allowed; changing
# or removing a base test is not.
#
# usage: test-integrity.sh <base-sha-or-ref> [scripts-dir]
set -euo pipefail

BASE="${1:?base sha or ref required}"
DIR="${2:-.github/scripts}"
status=0

for path in "$DIR"/test_*.py; do
  [ -e "$path" ] || continue
  if git cat-file -e "$BASE:$path" 2>/dev/null; then
    if ! git diff --quiet "$BASE" -- "$path"; then
      echo "FAIL: $path differs from $BASE; gate tests must not be weakened in a PR" >&2
      status=1
    fi
  fi
done

for path in $(git ls-tree -r --name-only "$BASE" "$DIR" | grep -E '^.*/test_.*\.py$' || true); do
  if [ ! -e "$path" ]; then
    echo "FAIL: $path exists on $BASE but is deleted at the head" >&2
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "ok: gate tests are not weakened against $BASE"
fi
exit "$status"
