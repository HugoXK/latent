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

for path in "$DIR"/*.py; do
  case "$(basename "$path")" in
    test_*) continue ;;
  esac
  cp "$path" "$TMP/"
done

if [ "$found" -eq 1 ]; then
  echo "running base-branch gate tests against head scripts"
  (cd "$TMP" && python3 -m unittest discover -s . -p "test_*.py")
else
  echo "no gate tests on $BASE yet; running head tests (bootstrap)"
  python3 -m unittest discover -s "$DIR" -p "test_*.py"
fi
