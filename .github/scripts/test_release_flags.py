"""Release publish flags: a hyphenated version is a prerelease, never Latest.

`release.py --release-flags` is the only implementation of that rule, and both
`gh release create` and `gh release edit --draft=false` must consume its output.
A workflow-shape test is included because this defect survived three releases:
the flags were simply absent from every call, and no unit test looked at YAML.
"""

from __future__ import annotations

import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "release.py")
ROOT = (
    os.environ.get("REPO_ROOT")
    or os.environ.get("GITHUB_WORKSPACE")
    or os.path.abspath(os.path.join(HERE, "..", ".."))
)
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "release.yml")


def run_flags(version: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, SCRIPT, "--version", version, "--release-flags"],
        capture_output=True,
        text=True,
        check=False,
    )


class ReleaseFlagTests(unittest.TestCase):
    def test_an_alpha_prints_the_prerelease_flags(self) -> None:
        result = run_flags("0.2.0-alpha.1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "--prerelease --latest=false\n")

    def test_a_release_candidate_is_a_prerelease(self) -> None:
        result = run_flags("1.0.0-rc.2")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "--prerelease --latest=false\n")

    def test_a_final_version_is_latest(self) -> None:
        result = run_flags("1.0.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "--latest\n")

    def test_a_malformed_version_is_rejected(self) -> None:
        result = run_flags("0.2")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a semantic version", result.stderr)


class ReleaseWorkflowShapeTests(unittest.TestCase):
    def workflow(self) -> str:
        with open(WORKFLOW, encoding="utf-8") as handle:
            return handle.read()

    def test_the_workflow_asks_release_py_for_the_flags(self) -> None:
        text = self.workflow()
        self.assertIn("release.py", text)
        self.assertIn("--release-flags", text)

    def test_create_and_edit_both_consume_the_flags(self) -> None:
        calls: list[str] = []
        lines = self.workflow().splitlines()
        index = 0
        while index < len(lines):
            line = lines[index]
            if "gh release create" in line or "gh release edit" in line:
                block = [line]
                while block[-1].rstrip().endswith("\\") and index + 1 < len(lines):
                    index += 1
                    block.append(lines[index])
                calls.append("\n".join(block))
            index += 1
        self.assertEqual(len(calls), 2, calls)
        for call in calls:
            self.assertIn("$FLAGS", call, call)

    def test_no_hardcoded_flags_in_the_workflow(self) -> None:
        text = self.workflow()
        for token in ("--prerelease", "--latest"):
            self.assertNotIn(token, text)


if __name__ == "__main__":
    unittest.main()
