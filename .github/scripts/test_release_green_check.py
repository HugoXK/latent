"""Every `gh` call in release.yml must name its repository unless a checkout did.

Run 46112708165 failed in `verify` with "failed to determine base repo: ... not a
git repository" because `gh run list` ran before `actions/checkout`. The first fix
scoped that one step, and a second call in `attest` -- a job with no checkout at
all -- kept the same defect and would have killed the last step of a release.

So this test is workflow-wide on purpose: it walks every job and every step, and
for each `gh` invocation with no preceding `actions/checkout` in the same job it
requires `-R`/`--repo` on the command or `GH_REPO` in the step/job environment.
A guard that scans a single named step cannot see the next one.
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

JOB_START = re.compile(r"^  ([a-z][a-z0-9_-]*):\s*$", re.M)
STEP_START = re.compile(r"^      - ", re.M)
GH_LINE = re.compile(r"(?<![\w.$-])gh\s+[a-z]")


def workflow_text() -> str:
    with open(WORKFLOW, encoding="utf-8") as fh:
        return fh.read()


def jobs() -> dict[str, str]:
    """Split the workflow into job blocks keyed by job id."""
    text = workflow_text()
    starts = [(m.group(1), m.start()) for m in JOB_START.finditer(text)]
    assert starts, "no jobs found in release.yml"
    blocks: dict[str, str] = {}
    for index, (name, start) in enumerate(starts):
        end = starts[index + 1][1] if index + 1 < len(starts) else len(text)
        blocks[name] = text[start:end]
    return blocks


def steps(job_block: str) -> list[str]:
    """Split a job block into step blocks (a step starts at six-space `- `)."""
    starts = [m.start() for m in STEP_START.finditer(job_block)]
    return [
        job_block[start : starts[i + 1] if i + 1 < len(starts) else len(job_block)]
        for i, start in enumerate(starts)
    ]


def gh_calls(step: str) -> list[str]:
    """Command lines in a step that invoke gh, ignoring YAML comments."""
    calls = []
    for line in step.splitlines():
        if line.lstrip().startswith("#"):
            continue
        if GH_LINE.search(line):
            calls.append(line.strip())
    return calls


def job_env(job_block: str) -> str:
    """The job-level env block, i.e. everything before the steps."""
    head = job_block.split("    steps:", 1)[0]
    return head


ENV_GH_REPO = re.compile(r"^\s+GH_REPO:", re.M)


def is_scoped(step: str, job_block: str, line: str) -> bool:
    """Scoped by a flag on the command itself or by GH_REPO in scope.

    GH_REPO is matched as an env *assignment*, not as a substring, so a comment
    that merely mentions it cannot satisfy the guard.
    """
    if "-R " in line or "--repo " in line or "--repo=" in line:
        return True
    return bool(ENV_GH_REPO.search(step) or ENV_GH_REPO.search(job_env(job_block)))


def unscoped_calls() -> list[str]:
    offenders = []
    for job_name, block in jobs().items():
        checkout_seen = False
        for step in steps(block):
            checked_out = checkout_seen
            if "actions/checkout" in step:
                checkout_seen = True
            for line in gh_calls(step):
                if not checked_out and not is_scoped(step, block, line):
                    offenders.append(f"{job_name}: {line}")
    return offenders


class GhScopeTests(unittest.TestCase):
    def test_the_scan_actually_sees_the_calls(self) -> None:
        # A parser that silently matches nothing would pass every assertion
        # below; pin the known calls so a refactor cannot hollow the guard out.
        found = "\n".join(
            f"{job}: {line}"
            for job, block in jobs().items()
            for step in steps(block)
            for line in gh_calls(step)
        )
        self.assertIn("gh run list", found)
        self.assertIn("gh release create", found)
        self.assertIn("gh release edit", found)
        self.assertIn("gh release upload", found)

    def test_no_gh_call_runs_without_a_repository_context(self) -> None:
        offenders = unscoped_calls()
        self.assertEqual(
            [],
            offenders,
            "gh is invoked where no checkout provides a repository; add "
            "-R \"$GITHUB_REPOSITORY\" or GH_REPO: ${{ github.repository }}:\n"
            + "\n".join(offenders),
        )

    def test_the_pre_checkout_gate_is_scoped(self) -> None:
        block = jobs()["verify"]
        first = steps(block)[0]
        self.assertIn("Require a green main", first)
        self.assertNotIn("actions/checkout", first, "gate must run before checkout")
        calls = gh_calls(first)
        self.assertGreaterEqual(len(calls), 2, calls)
        for line in calls:
            self.assertIn('-R "$GITHUB_REPOSITORY"', line)

    def test_the_undraft_step_is_repository_scoped(self) -> None:
        # The publish probe cannot prove this: `mode=publish, version=9.9.9`
        # fails at the version check, so `attest` never runs. This is the
        # structural half of the acceptance; the dispatch is the behavioural one.
        block = jobs()["attest"]
        undraft = [s for s in steps(block) if "--draft=false" in s]
        self.assertEqual(1, len(undraft), "attest has no single undraft step")
        self.assertNotIn("actions/checkout", block, "attest has no checkout")
        self.assertIn("GH_REPO", undraft[0])


if __name__ == "__main__":
    unittest.main()
