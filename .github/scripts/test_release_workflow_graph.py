"""Structural guard for release.yml's job graph.

The graph already broke once: `publish` depended on `prepare`, which is skipped in
publish mode, so an implicit success() made publish unreachable. These tests read
the workflow and assert the properties that keep delivery possible.
"""

from __future__ import annotations

import os
import re
import unittest

# Base-mode runs the tests from a flat temp dir, so __file__ cannot locate the
# repository. gate-tests.sh exports REPO_ROOT; GITHUB_WORKSPACE covers CI.
ROOT = (
    os.environ.get("REPO_ROOT")
    or os.environ.get("GITHUB_WORKSPACE")
    or os.getcwd()
)
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "release.yml")


def text() -> str:
    with open(WORKFLOW, encoding="utf-8") as fh:
        return fh.read()


def job_block(name: str) -> str:
    match = re.search(
        rf"^  {name}:\n(?:.*\n)*?(?=^  [a-z]+:\n|\Z)", text(), re.M
    )
    assert match, f"job {name} not found"
    return match.group(0)


class JobGraphTests(unittest.TestCase):
    def test_publish_does_not_depend_on_the_mode_gated_prepare(self) -> None:
        block = job_block("publish")
        needs = re.search(r"^    needs: (.+)$", block, re.M)
        self.assertIsNotNone(needs, "publish has no needs line")
        self.assertNotIn(
            "prepare",
            needs.group(1),
            "publish depends on prepare, which is skipped in publish mode",
        )
        self.assertIn("verify", needs.group(1))

    def test_publish_and_attest_require_a_successful_verify(self) -> None:
        for job in ("publish", "attest"):
            block = job_block(job)
            self.assertIn(
                "needs.verify.result == 'success'",
                block,
                f"{job} does not gate on verify success",
            )

    def test_the_release_is_atomic(self) -> None:
        workflow = text()
        self.assertIn("gh release create \"v$VERSION\" \\\n            --draft", workflow)
        attest = job_block("attest")
        self.assertIn("--draft=false", attest)
        self.assertIn("contents: write", attest)

    def test_prepare_does_not_open_a_checkless_pr_without_a_token(self) -> None:
        prepare = job_block("prepare")
        self.assertIn("RELEASE_PR_TOKEN", prepare)
        self.assertIn("HAS_PR_TOKEN", prepare)


if __name__ == "__main__":
    unittest.main()
