"""A release fold must not push a finished release above `## [Unreleased]`.

Keep a Changelog puts the unreleased section first, and `CHANGELOG.md` says it
follows that format. The fold used to insert the new version before the first
`## [` section, which put a finished release above `[Unreleased]` and stranded
the unreleased notes below it — true ordering damage, not a false claim, but the
kind of record drift that makes the next reader mis-date shipped work.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import release

CHANGELOG = (
    "# Changelog\n"
    "\n"
    "All notable changes are documented here.\n"
    "\n"
    "## [Unreleased]\n"
    "\n"
    "### Added\n"
    "\n"
    "- a pending note with no issue number\n"
    "\n"
    "## [0.2.0-alpha.0] - 2026-11-25\n"
    "\n"
    "### Added\n"
    "\n"
    "- old shipped thing\n"
)


def make_root(root: Path) -> None:
    (root / "changelog.d").mkdir()
    (root / "changelog.d" / "1.added.md").write_text("added: a thing", encoding="utf-8")
    (root / "CHANGELOG.md").write_text(CHANGELOG, encoding="utf-8")


class UnreleasedStaysFirstTests(unittest.TestCase):
    def test_prepare_inserts_below_unreleased_and_keeps_section_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            make_root(root)
            _, _, updated = release.prepare(root, "0.9.0", "2026-12-01")

            self.assertLess(
                updated.index("## [Unreleased]"),
                updated.index("## [0.9.0]"),
                "the fold put a finished release above ## [Unreleased]",
            )
            self.assertLess(
                updated.index("## [0.9.0]"),
                updated.index("## [0.2.0-alpha.0]"),
                "the new release was not placed above older released sections",
            )
            self.assertIn("- a pending note with no issue number", updated)
            self.assertIn("- old shipped thing", updated)
            self.assertNotIn("## [0.2.0-alpha.0] - 2026-11-25\n\n## [0.9.0]", updated)

    def test_without_unreleased_the_release_goes_first(self) -> None:
        changelog = "# Changelog\n\n## [0.1.0] - 2026-11-25\n\n- old\n"
        updated = release.insert_release_section(
            changelog, "## [0.9.0] - 2026-12-01\n\n- new\n"
        )
        self.assertLess(updated.index("## [0.9.0]"), updated.index("## [0.1.0]"))


if __name__ == "__main__":
    unittest.main()
