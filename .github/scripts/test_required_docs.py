"""The spec job's required-docs list must match a checked, existing set.

gate-tests.sh discovers test_*.py on the base tree and also copies head-only
test files, so this runs locally and in CI without a ci.yml change. The
authoritative list lives in ci.yml's "Check required files" step; it is parsed
with the stdlib (no PyYAML) instead of being retyped here. `docs/replay-plan.md`
is part of the required set but is not in that step, so it is added explicitly.

In base mode the tests run from a flat temp dir, so the repo root is resolved
from the environment, never from __file__.
"""

from __future__ import annotations

import os
import re
import unittest
from pathlib import Path

# ci.yml's required list as of this commit, plus the replay plan. If ci.yml gains
# a path that is not here, the drift assertion below fails.
EXPECTED = {
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

REPLAY_PLAN = "docs/replay-plan.md"


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
        self.ci = ci_required(self.root)
        self.required = self.ci | {REPLAY_PLAN}

    def test_ci_list_does_not_drift_from_this_test(self) -> None:
        unchecked = self.required - EXPECTED
        self.assertEqual(
            unchecked,
            set(),
            f"ci.yml requires paths this test does not check: {sorted(unchecked)}",
        )

    def test_every_required_doc_exists(self) -> None:
        missing = [path for path in sorted(self.required) if not (self.root / path).is_file()]
        self.assertEqual(missing, [], f"required docs missing: {missing}")


if __name__ == "__main__":
    unittest.main()
