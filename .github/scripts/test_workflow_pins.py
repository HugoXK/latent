"""Guard: every workflow `uses:` ref is a full commit SHA, or allowlisted.

A moving tag lets a retagged action execute with the job's token. `review-gate.yml`
holds `checks: write` and creates the required `review-gate` context, so its
checkout must also keep reading the base ref, never the pull request head.
"""

from __future__ import annotations

import os
import re
import unittest

ROOT = os.environ.get("REPO_ROOT") or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)
WORKFLOW_DIR = os.path.join(ROOT, ".github", "workflows")

USES_RE = re.compile(r"^\s*-\s*uses:\s*(\S+)\s*(?:#.*)?$")
SHA_RE = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")

# One line of reason per allowed non-SHA form. Keep this narrow: an allowlist is
# how a supply-chain rule rots, so every entry states why it cannot be a SHA.
ALLOWLIST = {
    "docker://": "container images carry their own digest; no docker:// use exists today",
    "./": "in-tree local actions are pinned by the same checkout as the workflow",
}


def workflow_files() -> list[str]:
    return sorted(
        os.path.join(WORKFLOW_DIR, name)
        for name in os.listdir(WORKFLOW_DIR)
        if name.endswith((".yml", ".yaml"))
    )


def uses_refs(path: str) -> list[tuple[int, str]]:
    refs: list[tuple[int, str]] = []
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, start=1):
            match = USES_RE.match(line)
            if match:
                refs.append((number, match.group(1)))
    return refs


class WorkflowPinTests(unittest.TestCase):
    def test_every_uses_ref_is_a_full_sha_or_allowlisted(self) -> None:
        failures: list[str] = []
        for path in workflow_files():
            for line, ref in uses_refs(path):
                if any(ref.startswith(prefix) for prefix in ALLOWLIST):
                    continue
                if not SHA_RE.match(ref):
                    failures.append(f"{os.path.relpath(path, ROOT)}:{line} {ref}")
        self.assertFalse(
            failures,
            "unpinned action refs (pin to a 40-character commit SHA):\n"
            + "\n".join(failures),
        )

    def test_every_allowlist_entry_has_a_reason(self) -> None:
        for prefix, reason in ALLOWLIST.items():
            self.assertTrue(
                reason.strip(),
                f"allowlist entry {prefix!r} has no reason",
            )

    def test_review_gate_checkout_still_reads_the_base_ref(self) -> None:
        path = os.path.join(WORKFLOW_DIR, "review-gate.yml")
        with open(path, encoding="utf-8") as handle:
            lines = handle.read().splitlines()
        checkouts = [
            index
            for index, line in enumerate(lines)
            if "uses:" in line and "actions/checkout@" in line
        ]
        self.assertTrue(checkouts, "review-gate.yml has no checkout step")
        block = "\n".join(lines[checkouts[0] : checkouts[0] + 8])
        self.assertIn("base.sha", block)
        self.assertNotIn("head.sha", block)
        self.assertIn("persist-credentials: false", block)


if __name__ == "__main__":
    unittest.main()
