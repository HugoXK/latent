"""Unit tests for the mechanical release script."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import release


def fragment(issue: int, kind: str, body: str) -> dict:
    return {"path": Path(f"{issue}.{kind}.md"), "issue": issue, "type": kind, "body": body}


class FoldTests(unittest.TestCase):
    def test_sections_follow_the_declared_order(self) -> None:
        section = release.fold(
            [
                fragment(9, "fixed", "fixed: a bug\n\nmore detail"),
                fragment(3, "added", "added: a feature"),
                fragment(5, "security", "security: a fix"),
            ],
            "0.3.0",
            "2026-11-27",
        )
        self.assertTrue(section.startswith("## [0.3.0] - 2026-11-27"))
        self.assertLess(section.index("### Added"), section.index("### Fixed"))
        self.assertLess(section.index("### Fixed"), section.index("### Security"))
        self.assertIn("- **#3** — added: a feature", section)
        self.assertIn("  more detail", section)

    def test_read_fragments_rejects_an_unexpected_name(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "notes.md"
            path.write_text("x", encoding="utf-8")
            with self.assertRaises(release.ReleaseError):
                release.read_fragments(Path(directory))

    def test_read_fragments_skips_readme_and_empty_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "README.md").write_text("readme", encoding="utf-8")
            (root / "1.added.md").write_text(" ", encoding="utf-8")
            with self.assertRaises(release.ReleaseError):
                release.read_fragments(root)


class InsertTests(unittest.TestCase):
    def test_insert_before_the_first_release_section(self) -> None:
        existing = "# Changelog\n\n## [Unreleased]\n\nold\n"
        updated = release.insert_section(existing, "## [0.3.0] - 2026-11-27\n\n- x\n")
        self.assertLess(updated.index("## [0.3.0]"), updated.index("## [Unreleased]"))

    def test_insert_requires_a_section(self) -> None:
        with self.assertRaises(release.ReleaseError):
            release.insert_section("# Changelog\n", "## [0.3.0]\n")


class WriteTests(unittest.TestCase):
    def test_write_updates_versions_deletes_fragments_and_folds_changelog(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "changelog.d").mkdir()
            (root / "changelog.d" / "README.md").write_text("readme", encoding="utf-8")
            (root / "changelog.d" / "7.added.md").write_text(
                "added: a thing", encoding="utf-8"
            )
            (root / "CHANGELOG.md").write_text(
                "# Changelog\n\n## [Unreleased]\n", encoding="utf-8"
            )
            (root / "package.json").write_text(
                json.dumps({"name": "root", "version": "0.2.0"}), encoding="utf-8"
            )
            (root / "packages" / "core").mkdir(parents=True)
            (root / "packages" / "core" / "package.json").write_text(
                json.dumps({"name": "core", "version": "0.2.0"}), encoding="utf-8"
            )

            fragments, changed = release.write(root, "0.3.0", "2026-11-27")

            self.assertEqual(len(fragments), 1)
            self.assertEqual(len(changed), 2)
            self.assertFalse((root / "changelog.d" / "7.added.md").exists())
            self.assertTrue((root / "changelog.d" / "README.md").exists())
            self.assertIn(
                "## [0.3.0] - 2026-11-27",
                (root / "CHANGELOG.md").read_text(encoding="utf-8"),
            )
            self.assertEqual(
                json.loads((root / "package.json").read_text(encoding="utf-8"))[
                    "version"
                ],
                "0.3.0",
            )


class NotesTests(unittest.TestCase):
    def test_extract_notes_stops_at_the_next_release(self) -> None:
        changelog = (
            "# Changelog\n\n## [0.3.0] - 2026-11-27\n\n### Added\n\n- x\n\n"
            "## [0.2.0] - 2026-01-01\n\n- old\n"
        )
        notes = release.extract_notes(changelog, "0.3.0")
        self.assertIn("### Added", notes)
        self.assertNotIn("0.2.0", notes)

    def test_extract_notes_requires_the_version(self) -> None:
        with self.assertRaises(release.ReleaseError):
            release.extract_notes("# Changelog\n", "9.9.9")


if __name__ == "__main__":
    unittest.main()
