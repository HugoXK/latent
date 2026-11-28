"""The gate-tests job runs the head's tests unless they are pinned to base.

`test-integrity.sh` is the guard: a PR that weakens or deletes a base-branch gate
test must fail. This test drives it against synthetic repositories so the guard
itself cannot rot.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(__file__), "test-integrity.sh")
SAMPLE_TEST = (
    "import unittest\n\n"
    "class SampleTests(unittest.TestCase):\n"
    "    def test_a(self):\n"
    "        self.assertTrue(True)\n"
)
TEST_FILE = os.path.join(".github", "scripts", "test_sample.py")
SCRIPT_FILE = os.path.join(".github", "scripts", "sample.py")


def git(repo: str, *args: str) -> str:
    out = subprocess.run(
        ["git", "-C", repo, *args], capture_output=True, text=True, check=True
    )
    return out.stdout.strip()


class GuardTests(unittest.TestCase):
    def make_repo(self) -> tuple[str, str]:
        repo = tempfile.mkdtemp()
        git(repo, "init", "-q")
        git(repo, "config", "user.email", "t@example.invalid")
        git(repo, "config", "user.name", "test")
        os.makedirs(os.path.join(repo, ".github", "scripts"), exist_ok=True)
        with open(os.path.join(repo, TEST_FILE), "w", encoding="utf-8") as fh:
            fh.write(SAMPLE_TEST)
        with open(os.path.join(repo, SCRIPT_FILE), "w", encoding="utf-8") as fh:
            fh.write("x = 1\n")
        git(repo, "add", "-A")
        git(repo, "commit", "-q", "-m", "base")
        return repo, git(repo, "rev-parse", "HEAD")

    def run_guard(self, repo: str, base: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["bash", SCRIPT, base, ".github/scripts"],
            cwd=repo,
            capture_output=True,
            text=True,
        )

    def test_unchanged_tests_pass(self) -> None:
        repo, base = self.make_repo()
        try:
            result = self.run_guard(repo, base)
            self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            subprocess.run(["rm", "-rf", repo], check=False)

    def test_a_weakened_test_fails(self) -> None:
        repo, base = self.make_repo()
        try:
            with open(os.path.join(repo, TEST_FILE), "w", encoding="utf-8") as fh:
                fh.write(SAMPLE_TEST.replace("assertTrue(True)", "assertTrue(False)"))
            result = self.run_guard(repo, base)
            self.assertEqual(result.returncode, 1)
            self.assertIn("must not be weakened", result.stderr)
        finally:
            subprocess.run(["rm", "-rf", repo], check=False)

    def test_a_deleted_test_fails(self) -> None:
        repo, base = self.make_repo()
        try:
            os.remove(os.path.join(repo, TEST_FILE))
            result = self.run_guard(repo, base)
            self.assertEqual(result.returncode, 1)
            self.assertIn("deleted", result.stderr)
        finally:
            subprocess.run(["rm", "-rf", repo], check=False)


    def test_the_base_has_tests_path_passes(self) -> None:
        """The path every PR takes after this merges: base already has tests."""
        repo = tempfile.mkdtemp()
        scripts = os.path.join(repo, ".github", "scripts")
        try:
            os.makedirs(scripts, exist_ok=True)
            source = os.path.dirname(os.path.abspath(__file__))
            for name in ("gate-tests.sh", "test-integrity.sh"):
                shutil.copy(os.path.join(source, name), os.path.join(scripts, name))
            with open(os.path.join(scripts, "sample.py"), "w", encoding="utf-8") as fh:
                fh.write("x = 1\n")
            with open(os.path.join(scripts, "test_sample.py"), "w", encoding="utf-8") as fh:
                fh.write(SAMPLE_TEST)
            git(repo, "init", "-q")
            git(repo, "config", "user.email", "t@example.invalid")
            git(repo, "config", "user.name", "test")
            git(repo, "add", "-A")
            git(repo, "commit", "-q", "-m", "base")
            result = subprocess.run(
                ["bash", ".github/scripts/gate-tests.sh", "HEAD"],
                cwd=repo,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("running base-branch gate tests", result.stdout)
        finally:
            subprocess.run(["rm", "-rf", repo], check=False)

if __name__ == "__main__":
    unittest.main()
