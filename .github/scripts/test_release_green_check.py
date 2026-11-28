"""The green-main gate runs before checkout, so every gh call must be scoped.

Run 46112708165 failed in `verify` with "failed to determine base repo: ... not a
git repository" because `gh run list` ran before `actions/checkout`. A step-scoped
`-R "$GITHUB_REPOSITORY"` fixes it; this test keeps any new unscoped call out.
"""

from __future__ import annotations

import os
import re
import unittest


def workflow_path() -> str:
    ci = os.environ.get("CI_YML_PATH")
    if ci:
        return os.path.join(os.path.dirname(ci), "release.yml")
    return os.path.join(
        os.path.dirname(__file__), "..", "workflows", "release.yml"
    )


def green_step() -> str:
    with open(workflow_path(), encoding="utf-8") as fh:
        text = fh.read()
    match = re.search(
        r"- name: Require a green main\n(?:.*\n)*?(?=\n      - |\n  [a-z]+:\n)",
        text,
    )
    assert match, "green-main step not found"
    return match.group(0)


class GreenStepTests(unittest.TestCase):
    def test_every_gh_call_in_the_green_step_names_the_repository(self) -> None:
        step = green_step()
        calls = [line for line in step.splitlines() if "gh " in line and not line.strip().startswith("#")]
        self.assertTrue(calls, "no gh invocation found in the green step")
        for line in calls:
            self.assertIn(
                "-R \"$GITHUB_REPOSITORY\"",
                line,
                f"unscoped gh call before checkout: {line.strip()}",
            )


if __name__ == "__main__":
    unittest.main()
