"""Ref-only ci.yml pin acceptance for the ci-ok publisher.

The publisher must accept a pull request that only replaces a `uses:` tag with a
commit SHA: a moving tag is the supply-chain risk, its immutable commit is not.
Every other workflow difference keeps the bootstrap rejection. This file is
additive; `test_ci_ok_publish.py` is a base test and must not be edited.
"""

from __future__ import annotations

import unittest

import ci_ok_publish

# The real ci.yml pair from #116/#117: base 64affeeb (tags) and the pinned head.
BASE_CI = r"""name: ci

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  spec:
    name: spec
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-python@v7
        with:
          python-version: "3.12"

      - name: Install jsonschema
        run: python -m pip install --disable-pip-version-check jsonschema==4.23.0

      - name: Validate schemas
        run: |
          python - <<'PY'
          import glob, json
          from jsonschema import Draft202012Validator

          paths = sorted(glob.glob("data/schemas/*.schema.json"))
          assert paths, "no schemas found"
          for path in paths:
              with open(path, encoding="utf-8") as fh:
                  doc = json.load(fh)
              assert doc.get("$schema") == "https://json-schema.org/draft/2020-12/schema", path
              Draft202012Validator.check_schema(doc)
              print("ok", path)
          PY

      - name: Check local links
        run: |
          python - <<'PY'
          import glob, os, re, sys

          bad = []
          for path in glob.glob("**/*.md", recursive=True):
              if "node_modules" in path.split(os.sep):
                  continue
              with open(path, encoding="utf-8") as fh:
                  text = fh.read()
              for target in re.findall(r"\]\(([^)]+)\)", text):
                  target = target.strip().split(" ", 1)[0].split("#", 1)[0]
                  if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                      continue
                  if target.startswith("<") and target.endswith(">"):
                      target = target[1:-1]
                  resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
                  if not os.path.exists(resolved):
                      bad.append(f"{path}: {target}")
          if bad:
              print("broken local links:")
              print("\n".join(bad))
              sys.exit(1)
          print("local links ok")
          PY

      - name: Check required files
        run: |
          python - <<'PY'
          import os, sys

          required = [
              "README.md", "README.zh.md", "LICENSE", "CONTRIBUTING.md",
              "SECURITY.md", "CODE_OF_CONDUCT.md", "AGENTS.md", "LESSONS.md",
              "docs/vision.md", "docs/architecture.md", "docs/prior-art.md",
              "docs/roadmap.md", "docs/security.md", "docs/api.md",
              "docs/glossary.md", "docs/code-standards.md",
              "docs/vertical-igem.md",
              "docs/review.md",
              "data/schemas/README.md",
              "verticals/igem/README.md",
              ".github/agent/review-policy.json",
              ".github/agent/required-checks.md",
              ".github/scripts/review_gate.py",
              ".github/scripts/pr_lint.py",
              ".github/workflows/review-gate.yml",
              ".github/workflows/pr-lint.yml",
          ]
          missing = [p for p in required if not os.path.exists(p)]
          if missing:
              print("missing:", missing)
              sys.exit(1)
          print("required files ok")
          PY

  node:
    name: node
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6
        with:
          version: 11.1.2

      - uses: actions/setup-node@v7
        with:
          node-version: "22"
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

  gate-tests:
    name: gate-tests
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          fetch-depth: 0
      - uses: actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0 # v7
        with:
          python-version: "3.12"
      - name: Unit-test the gate scripts from the base branch
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
        run: bash .github/scripts/gate-tests.sh "$BASE_SHA"

  # Bootstrap aggregate: branch protection still requires this `ci-ok` context.
  # ci-ok-publish.yml publishes the trusted `ci-ok-published` context; once
  # protection requires that name, a follow-up PR retires this job.
  ci-ok:
    name: ci-ok
    if: always()
    needs: [spec, node, gate-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Every required job passed
        env:
          SPEC: ${{ needs.spec.result }}
          NODE: ${{ needs.node.result }}
          GATE_TESTS: ${{ needs.gate-tests.result }}
        run: |
          echo "spec=$SPEC node=$NODE gate-tests=$GATE_TESTS"
          [ "$SPEC" = success ] && [ "$NODE" = success ] && [ "$GATE_TESTS" = success ]
"""

HEAD_CI = r"""name: ci

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  spec:
    name: spec
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7

      - uses: actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0 # v7
        with:
          python-version: "3.12"

      - name: Install jsonschema
        run: python -m pip install --disable-pip-version-check jsonschema==4.23.0

      - name: Validate schemas
        run: |
          python - <<'PY'
          import glob, json
          from jsonschema import Draft202012Validator

          paths = sorted(glob.glob("data/schemas/*.schema.json"))
          assert paths, "no schemas found"
          for path in paths:
              with open(path, encoding="utf-8") as fh:
                  doc = json.load(fh)
              assert doc.get("$schema") == "https://json-schema.org/draft/2020-12/schema", path
              Draft202012Validator.check_schema(doc)
              print("ok", path)
          PY

      - name: Check local links
        run: |
          python - <<'PY'
          import glob, os, re, sys

          bad = []
          for path in glob.glob("**/*.md", recursive=True):
              if "node_modules" in path.split(os.sep):
                  continue
              with open(path, encoding="utf-8") as fh:
                  text = fh.read()
              for target in re.findall(r"\]\(([^)]+)\)", text):
                  target = target.strip().split(" ", 1)[0].split("#", 1)[0]
                  if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                      continue
                  if target.startswith("<") and target.endswith(">"):
                      target = target[1:-1]
                  resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
                  if not os.path.exists(resolved):
                      bad.append(f"{path}: {target}")
          if bad:
              print("broken local links:")
              print("\n".join(bad))
              sys.exit(1)
          print("local links ok")
          PY

      - name: Check required files
        run: |
          python - <<'PY'
          import os, sys

          required = [
              "README.md", "README.zh.md", "LICENSE", "CONTRIBUTING.md",
              "SECURITY.md", "CODE_OF_CONDUCT.md", "AGENTS.md", "LESSONS.md",
              "docs/vision.md", "docs/architecture.md", "docs/prior-art.md",
              "docs/roadmap.md", "docs/security.md", "docs/api.md",
              "docs/glossary.md", "docs/code-standards.md",
              "docs/vertical-igem.md",
              "docs/review.md",
              "data/schemas/README.md",
              "verticals/igem/README.md",
              ".github/agent/review-policy.json",
              ".github/agent/required-checks.md",
              ".github/scripts/review_gate.py",
              ".github/scripts/pr_lint.py",
              ".github/workflows/review-gate.yml",
              ".github/workflows/pr-lint.yml",
          ]
          missing = [p for p in required if not os.path.exists(p)]
          if missing:
              print("missing:", missing)
              sys.exit(1)
          print("required files ok")
          PY

  node:
    name: node
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7

      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6
        with:
          version: 11.1.2

      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7
        with:
          node-version: "22"
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test

  gate-tests:
    name: gate-tests
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          fetch-depth: 0
      - uses: actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0 # v7
        with:
          python-version: "3.12"
      - name: Unit-test the gate scripts from the base branch
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}
        run: bash .github/scripts/gate-tests.sh "$BASE_SHA"

  # Bootstrap aggregate: branch protection still requires this `ci-ok` context.
  # ci-ok-publish.yml publishes the trusted `ci-ok-published` context; once
  # protection requires that name, a follow-up PR retires this job.
  ci-ok:
    name: ci-ok
    if: always()
    needs: [spec, node, gate-tests]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Every required job passed
        env:
          SPEC: ${{ needs.spec.result }}
          NODE: ${{ needs.node.result }}
          GATE_TESTS: ${{ needs.gate-tests.result }}
        run: |
          echo "spec=$SPEC node=$NODE gate-tests=$GATE_TESTS"
          [ "$SPEC" = success ] && [ "$NODE" = success ] && [ "$GATE_TESTS" = success ]
"""


def trusted_facts(**overrides: object) -> dict[str, object]:
    facts: dict[str, object] = {
        "repo": "HugoXK/latent",
        "head_sha": "a" * 40,
        "default_branch": "main",
        "run_path": ".github/workflows/ci.yml",
        "run_workflow_id": 123,
        "trusted_workflow_id": 123,
        "run_event": "pull_request",
        "run_head_sha": "a" * 40,
        "run_head_repo": "HugoXK/latent",
        "ci_blob_head": "headblob",
        "ci_blob_base": "baseblob",
        "ci_text_head": HEAD_CI,
        "ci_text_base": BASE_CI,
        "pr_open": True,
        "pr_base": "main",
        "pr_head_sha": "a" * 40,
    }
    facts.update(overrides)
    return facts


class RefOnlyPinTests(unittest.TestCase):
    def test_the_real_pin_pull_request_is_accepted(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts())
        self.assertTrue(ok, detail)
        ref_only, ref_detail = ci_ok_publish.evaluate_ref_only(BASE_CI, HEAD_CI)
        self.assertTrue(ref_only, ref_detail)
        self.assertIn("ref pin", ref_detail)

    def test_missing_contents_fails_closed(self) -> None:
        facts = trusted_facts()
        facts.pop("ci_text_head")
        facts.pop("ci_text_base")
        ok, detail = ci_ok_publish.evaluate_run(facts)
        self.assertFalse(ok)
        self.assertIn("unavailable to prove a ref-only change", detail)

    def test_a_permissions_change_still_fails(self) -> None:
        changed = HEAD_CI.replace(
            "permissions:\n  contents: read",
            "permissions:\n  contents: write",
            1,
        )
        self.assertNotEqual(changed, HEAD_CI)
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts(ci_text_head=changed))
        self.assertFalse(ok)
        self.assertIn("differs beyond a ref-only pin", detail)

    def test_an_added_job_still_fails(self) -> None:
        changed = HEAD_CI + "\n  extra-job:\n    runs-on: ubuntu-latest\n    steps: []\n"
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts(ci_text_head=changed))
        self.assertFalse(ok)
        self.assertIn("line count changed", detail)

    def test_a_tag_to_tag_change_still_fails(self) -> None:
        changed = BASE_CI.replace(
            "actions/checkout@v7", "actions/checkout@v6", 1
        )
        self.assertNotEqual(changed, BASE_CI)
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts(ci_text_head=changed))
        self.assertFalse(ok)
        self.assertIn("differs beyond a ref-only pin", detail)

    def test_a_different_action_repository_still_fails(self) -> None:
        changed = HEAD_CI.replace(
            "actions/checkout@", "evil/checkout@", 1
        )
        self.assertNotEqual(changed, HEAD_CI)
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts(ci_text_head=changed))
        self.assertFalse(ok)
        self.assertIn("differs beyond a ref-only pin", detail)

    def test_a_uses_line_inside_a_run_block_is_not_a_pin(self) -> None:
        base = (
            "jobs:\n"
            "  spec:\n"
            "    runs-on: ubuntu-latest\n"
            "    steps:\n"
            "      - run: |\n"
            "          echo hello\n"
            "          uses: actions/checkout@v7\n"
        )
        head = base.replace("actions/checkout@v7", "actions/checkout@" + "a" * 40)
        self.assertNotEqual(base, head)
        ok, detail = ci_ok_publish.evaluate_ref_only(base, head)
        self.assertFalse(ok)
        self.assertIn("differs beyond a ref-only pin", detail)

    def test_a_sha_to_sha_change_still_fails(self) -> None:
        changed = HEAD_CI.replace(
            "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
            "actions/checkout@" + "0" * 40,
            1,
        )
        self.assertNotEqual(changed, HEAD_CI)
        ok, detail = ci_ok_publish.evaluate_run(
            trusted_facts(ci_text_base=HEAD_CI, ci_text_head=changed)
        )
        self.assertFalse(ok)
        self.assertIn("differs beyond a ref-only pin", detail)


if __name__ == "__main__":
    unittest.main()
