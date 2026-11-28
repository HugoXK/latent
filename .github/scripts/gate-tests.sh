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

# The drift test asserts that REQUIRED_JOBS and the aggregate's needs match the
# workflow this PR ships, so it must read the HEAD working-tree ci.yml, not the
# base copy: base has no gate-tests job yet on bootstrap, and a base copy would
# make the assertion unpassable before merge. Weakening ci.yml is caught by the
# publisher's blob-equality check, not here.
export CI_YML_PATH="$PWD/.github/workflows/ci.yml"

if [ "$found" -eq 1 ]; then
  echo "running base-branch gate tests against head scripts"
  (cd "$TMP" && python3 -m unittest discover -s . -p "test_*.py")
else
  echo "no gate tests on $BASE yet; running head tests (bootstrap)"
  python3 -m unittest discover -s "$DIR" -p "test_*.py"
fi
