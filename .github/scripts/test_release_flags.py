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

    def release_flags_run_block(self) -> str:
        lines = self.workflow().splitlines()
        try:
            start = next(
                index
                for index, line in enumerate(lines)
                if line.strip() == "id: release_flags"
            )
        except StopIteration:
            self.fail("release.yml has no step with `id: release_flags`")
        run = None
        for index in range(start + 1, len(lines)):
            stripped = lines[index].strip()
            if stripped.startswith("run:"):
                run = index
                break
            if stripped.startswith("- "):
                break
        if run is None:
            self.fail("the release_flags step has no run block")
        indent = len(lines[run]) - len(lines[run].lstrip())
        block: list[str] = []
        for line in lines[run + 1 :]:
            if line.strip() and len(line) - len(line.lstrip()) <= indent:
                break
            block.append(line)
        return "\n".join(block)

    def test_the_flags_step_cannot_swallow_a_failure(self) -> None:
        # The step runs as `bash -e`: a failing command substitution written
        # inside `echo "value=$(...)"` only makes the echo fail, and the step
        # still writes `value=` and exits 0 -- the real error then surfaces a
        # step later as a misleading changelog error. Assign first, echo after,
        # so a bad version stops this step with its own message.
        block = self.release_flags_run_block()
        self.assertRegex(
            block,
            r"(?m)^\s*value=\$\(",
            "the release_flags run block must assign value=$(...) on its own line",
        )
        self.assertNotIn(
            'echo "value=$(',
            block,
            "the release_flags run block wraps the command substitution in echo",
        )


if __name__ == "__main__":
    unittest.main()
