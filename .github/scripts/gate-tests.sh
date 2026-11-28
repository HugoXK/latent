#!/usr/bin/env bash
# Run the gate unit tests, preferring the base branch's test files so a PR
# cannot weaken them, and against the head's gate scripts so the head code is
# what is exercised. On the first PR that introduces the tests there is nothing
# on the base yet; fall back to the head tests and say so.
#
# usage: gate-tests.sh <base-sha-or-ref>
set -euo pipefail

BASE="${1:?base sha or ref required}"
DIR=".github/scripts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

bash "$DIR/test-integrity.sh" "$BASE" "$DIR"

# Tests that read a repository file (release.yml, data/schemas/*) must not resolve
# it relative to __file__: in base mode they run from a flat temp dir.
export REPO_ROOT="$(pwd)"

# The drift assertions read the workflow this PR ships. Anti-weakening lives in
# the base copies of the tests and in test-integrity.sh, not in which ci.yml the
# assertions read; feeding them the base workflow made them tautological.
export CI_YML_PATH="$(cd "$DIR/.." && pwd)/workflows/ci.yml"

found=0
while IFS= read -r path; do
  [ -n "$path" ] || continue
  git show "$BASE:$path" > "$TMP/$(basename "$path")"
  found=1
done < <(git ls-tree -r --name-only "$BASE" "$DIR" | grep -E '^.*/test_.*\.py$' || true)

for path in "$DIR"/*.py "$DIR"/*.sh; do
  [ -e "$path" ] || continue
  case "$(basename "$path")" in
    test_*) continue ;;
  esac
  cp "$path" "$TMP/"
done

if [ "$found" -eq 1 ]; then
  # Base-branch test code against head scripts. Anti-weakening is the base copy
  # of the tests plus test-integrity.sh, not which ci.yml they read.
  echo "running base-branch gate tests against head scripts"
  (cd "$TMP" && python3 -m unittest discover -s . -p "test_*.py")
else
  # Bootstrap: no base tests exist yet, so run the head tests in place; they read
  # the head workflow through the same CI_YML_PATH.
  echo "no gate tests on $BASE yet; running head tests (bootstrap)"
  python3 -m unittest discover -s "$DIR" -p "test_*.py"
fi
