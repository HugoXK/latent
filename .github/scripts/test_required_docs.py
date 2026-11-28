"""The spec job's required-docs list must match a checked, existing set.

gate-tests.sh discovers test_*.py on the base tree and also copies head-only
test files, so this runs locally and in CI without a ci.yml change. FROZEN below
is this test's own source of truth: `main`'s list plus `docs/replay-plan.md`,
which the test itself covers because the spec step does not list it. The
authoritative ci.yml list is parsed with the stdlib (no PyYAML) and compared for
exact equality, so a path dropped from the step fails the same way as a path
added to it silently.

In base mode the tests run from a flat temp dir, so the repo root is resolved
from the environment, never from __file__.
"""

from __future__ import annotations

import os
import re
import unittest
from pathlib import Path

# The required set: ci.yml's list plus the replay plan. Equality against the
# parsed list is asserted below, in both directions, so this cannot drift.
FROZEN = {
    "README.md",
    "README.zh.md",
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "AGENTS.md",
    "LESSONS.md",
    "docs/vision.md",
    "docs/architecture.md",
    "docs/prior-art.md",
    "docs/roadmap.md",
    "docs/security.md",
    "docs/api.md",
    "docs/glossary.md",
    "docs/code-standards.md",
    "docs/vertical-igem.md",
    "docs/replay-plan.md",
    "docs/review.md",
    "data/schemas/README.md",
    "verticals/igem/README.md",
    ".github/agent/review-policy.json",
    ".github/agent/required-checks.md",
    ".github/scripts/review_gate.py",
    ".github/scripts/pr_lint.py",
    ".github/workflows/review-gate.yml",
    ".github/workflows/pr-lint.yml",
}

# Required, but deliberately not listed in the spec step: the test covers it.
COVERED_BY_TEST = {"docs/replay-plan.md"}


def repo_root() -> Path:
    root = (
        os.environ.get("REPO_ROOT")
        or os.environ.get("GITHUB_WORKSPACE")
        or os.getcwd()
    )
    return Path(root).resolve()


def ci_required(root: Path) -> set[str]:
    text = (root / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    marker = "Check required files"
    start = text.index(marker)
    match = re.search(r"required\s*=\s*\[(.*?)\]", text[start:], re.DOTALL)
    if match is None:
        raise AssertionError("ci.yml has no 'required = [...]' in the required-files step")
    body = match.group(1)
    paths = re.findall(r'"([^"]+)"|\'([^\']+)\'', body)
    return {first or second for first, second in paths}


class RequiredDocsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.root = repo_root()

    def test_ci_list_matches_the_frozen_set_exactly(self) -> None:
        expected = FROZEN - COVERED_BY_TEST
        ci_list = ci_required(self.root)
        self.assertEqual(
            expected,
            ci_list,
            "ci.yml's required list drifted from this test's frozen set: "
            f"only in ci.yml {sorted(ci_list - expected)}, "
            f"only in the frozen set {sorted(expected - ci_list)}",
        )

    def test_every_required_doc_exists(self) -> None:
        missing = [path for path in sorted(FROZEN) if not (self.root / path).is_file()]
        self.assertEqual(missing, [], f"required docs missing: {missing}")


if __name__ == "__main__":
    unittest.main()
