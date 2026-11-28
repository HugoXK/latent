#!/usr/bin/env bash
# Regression test for the repository secret-scan configuration.
#
# A repository-root .gitleaks.toml replaces gitleaks' default ruleset unless it
# opts back in with [extend] useDefault = true. When that line is missing, the
# scan still exits 0 but checks nothing, so a leaked credential passes silently.
#
# This script plants three synthetic, clearly fake credentials in a temporary
# directory and requires the scan, run with the repository config, to report all
# three. It then proves the one rule-scoped exemption is exactly that narrow: a
# generic key on a non-matching path is still found, an AWS key on the matching
# path is still found (only generic-api-key is exempt there), and a generic key
# on the matching path is the only thing exempted.
#
# Usage: .github/scripts/secret-scan-selftest.sh [gitleaks-binary] [config]
# Requires: python3 (already used by .github/scripts/pr_lint.py in CI).
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
gitleaks_bin=${1:-gitleaks}
config=${2:-"$root/.gitleaks.toml"}

if [[ ! -x $gitleaks_bin ]] && ! command -v "$gitleaks_bin" >/dev/null 2>&1; then
  echo "error: gitleaks binary not found: $gitleaks_bin" >&2
  echo "install gitleaks 8.30.1 or pass its path as the first argument" >&2
  exit 2
fi
if [[ ! -f $config ]]; then
  echo "error: config not found: $config" >&2
  exit 2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

count_findings() {
  python3 - "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    print(len(json.load(handle)))
PY
}

rule_ids() {
  python3 - "$1" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    print(",".join(sorted(finding["RuleID"] for finding in json.load(handle))))
PY
}

scan_clean() { # scan_clean <path> <report-path>: require zero findings
  local target=$1 report=$2
  set +e
  "$gitleaks_bin" dir "$target" --config "$config" --no-banner --redact \
    --exit-code 1 --report-format json --report-path "$report" >/dev/null 2>&1
  local status=$?
  set -e
  if [[ $status -ne 0 ]]; then
    echo "FAIL: expected no finding under $target, gitleaks exited $status" >&2
    if [[ -f $report ]]; then
      echo "rules that fired: $(rule_ids "$report")" >&2
    fi
    exit 1
  fi
}

scan() { # scan <path> <report-path>
  local target=$1 report=$2
  set +e
  "$gitleaks_bin" dir "$target" --config "$config" --no-banner --redact \
    --exit-code 1 --report-format json --report-path "$report" >/dev/null 2>&1
  local status=$?
  set -e
  if [[ $status -eq 0 ]]; then
    echo "FAIL: no finding for planted secrets under $target" >&2
    echo "the config at $config does not load the default gitleaks rules" >&2
    exit 1
  fi
  if [[ $status -ne 1 ]]; then
    echo "error: gitleaks exited $status while scanning $target" >&2
    exit 2
  fi
}

# Three synthetic credentials, one per shape: AWS access key, GitHub PAT and a
# generic API key. The values are fabricated, not real credentials. Each value is
# assembled from quoted fragments so this file is not itself a leak and
# gitleaks' base64 decoding pass has nothing to decode; the assembled values are
# what the scan must find.
aws_key='AKIA''Z3M4N5P6Q7R2S3T4'
github_pat='ghp_''a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8'
generic_key='9f8a7b6c''5d4e3f2a''1b0c9d8e''7f6a5b4c'

mkdir -p "$work/planted"
printf 'aws_access_key_id = %s\n' "$aws_key" > "$work/planted/aws.txt"
printf 'token: %s\n' "$github_pat" > "$work/planted/github.txt"
printf 'api_key = "%s"\n' "$generic_key" > "$work/planted/generic.txt"

scan "$work/planted" "$work/planted.json"
planted=$(count_findings "$work/planted.json")
if [[ $planted -ne 3 ]]; then
  echo "FAIL: expected 3 findings for 3 planted secrets, got $planted" >&2
  echo "rules that fired: $(rule_ids "$work/planted.json")" >&2
  exit 1
fi

# A sibling file under data/model-replay/ does not match the exemption pattern:
# a generic key there must still be found.
mkdir -p "$work/replay/data/model-replay"
printf 'api_key = "%s"\n' "$generic_key" > "$work/replay/data/model-replay/notes.json"

scan "$work/replay" "$work/replay.json"
narrow=$(count_findings "$work/replay.json")
if [[ $narrow -ne 1 ]]; then
  echo "FAIL: expected 1 finding on a non-matching sibling path, got $narrow" >&2
  exit 1
fi

# The exemption is scoped to generic-api-key only. An AWS key under a path that
# matches the exemption pattern must still be found.
replay_hash=39cd49df186ac99df89944af1bb39659906ea22e9354a04c274ce448428471db
mkdir -p "$work/scoped/data/model-replay"
printf 'aws_access_key_id = %s\n' "$aws_key" > "$work/scoped/data/model-replay/$replay_hash.json"

scan "$work/scoped" "$work/scoped.json"
scoped=$(count_findings "$work/scoped.json")
if [[ $scoped -ne 1 ]]; then
  echo "FAIL: expected 1 AWS finding on a path matching the generic-api-key exemption, got $scoped" >&2
  echo "rules that fired: $(rule_ids "$work/scoped.json")" >&2
  exit 1
fi

# The exemption itself: a generic key on the historical path pattern is the one
# case it covers. Delete this check together with the [[allowlists]] block when
# the removal condition in .gitleaks.toml is met.
mkdir -p "$work/exempt/data/model-replay"
printf 'api_key = "%s"\n' "$generic_key" > "$work/exempt/data/model-replay/$replay_hash.json"
scan_clean "$work/exempt" "$work/exempt.json"

echo "ok: 3 planted secrets found ($(rule_ids "$work/planted.json")); exemption is scoped to generic-api-key and one path pattern"
