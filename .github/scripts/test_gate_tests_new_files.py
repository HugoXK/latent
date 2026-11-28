"""Base mode must also run a PR's own new test files.

Base mode copies the base branch's tests, so a PR that adds `test_new.py` would
never execute it — a real coverage hole in the harness. This drives the script
against a synthetic repo with one base test and one head-only test that fails,
so the run proves the head-only file executed.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest

SAMPLE_BASE = (
    "import unittest\n\n"
    "class BaseTests(unittest.TestCase):\n"
    "    def test_base(self):\n"
    "        self.assertTrue(True)\n"
)
SAMPLE_HEAD_ONLY_FAILS = (
    "import unittest\n\n"
    "class HeadOnlyTests(unittest.TestCase):\n"
    "    def test_head_only(self):\n"
    "        self.assertTrue(False)\n"
)


def git(repo: str, *args: str) -> None:
    subprocess.run(["git", "-C", repo, *args], capture_output=True, check=True)


class NewFileCollectionTests(unittest.TestCase):
    def test_a_head_only_test_file_runs(self) -> None:
        repo = tempfile.mkdtemp()
        scripts = os.path.join(repo, ".github", "scripts")
        try:
            os.makedirs(scripts, exist_ok=True)
            source = os.path.dirname(os.path.abspath(__file__))
            for name in ("gate-tests.sh", "test-integrity.sh"):
                shutil.copy(os.path.join(source, name), os.path.join(scripts, name))
            with open(os.path.join(scripts, "test_sample.py"), "w", encoding="utf-8") as fh:
                fh.write(SAMPLE_BASE)
            git(repo, "init", "-q")
            git(repo, "config", "user.email", "t@example.invalid")
            git(repo, "config", "user.name", "test")
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", "base")

            # The PR adds a new test file that fails; if base mode ignores it the
            # run passes, if it runs it the run fails.
            with open(
                os.path.join(scripts, "test_head_only.py"), "w", encoding="utf-8"
            ) as fh:
                fh.write(SAMPLE_HEAD_ONLY_FAILS)

            result = subprocess.run(
                ["bash", ".github/scripts/gate-tests.sh", "HEAD"],
                cwd=repo,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(
                result.returncode, 0, "a new head-only failing test was not executed"
            )
            self.assertIn("test_head_only", result.stdout + result.stderr)
        finally:
            subprocess.run(["rm", "-rf", repo], check=False)


if __name__ == "__main__":
    unittest.main()
