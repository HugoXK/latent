"""The fold must see top-level fragments only, never `changelog.d/pending/`.

A pending fragment describes work that has not shipped. If the fold published it
the release would claim a feature a reader cannot find on `main`; if `--write`
deleted it the work would lose its fragment. Both directions are pinned here.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import release


def make_tree(root: Path) -> Path:
    changelog = root / "changelog.d"
    (changelog / "pending").mkdir(parents=True)
    (changelog / "README.md").write_text("readme", encoding="utf-8")
    (changelog / "7.added.md").write_text("added: shipped thing", encoding="utf-8")
    (changelog / "pending" / "9.added.md").write_text(
        "added: unshipped thing", encoding="utf-8"
    )
    (root / "CHANGELOG.md").write_text("# Changelog\n\n## [0.1.0]\n\n- old\n", encoding="utf-8")
    return changelog


class PendingFragmentTests(unittest.TestCase):
    def test_read_fragments_ignores_pending(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            changelog = make_tree(Path(directory))
            fragments = release.read_fragments(changelog)
            self.assertEqual([fragment["issue"] for fragment in fragments], [7])

    def test_fold_omits_pending(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            changelog = make_tree(Path(directory))
            fragments = release.read_fragments(changelog)
            section = release.fold(fragments, "0.2.0-alpha.1", "2026-11-28")
            self.assertIn("**#7**", section)
            self.assertNotIn("#9", section)
            self.assertNotIn("unshipped", section)

    def test_write_keeps_pending_and_deletes_only_folded_fragments(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            changelog = make_tree(root)
            pending = changelog / "pending" / "9.added.md"
            before = pending.read_text(encoding="utf-8")

            folded, _ = release.write(root, "0.2.0-alpha.1", "2026-11-28")

            self.assertEqual([fragment["issue"] for fragment in folded], [7])
            self.assertFalse((changelog / "7.added.md").exists())
            self.assertTrue(pending.exists(), "a pending fragment was deleted by --write")
            self.assertEqual(pending.read_text(encoding="utf-8"), before)
            self.assertNotIn(
                "#9",
                (root / "CHANGELOG.md").read_text(encoding="utf-8"),
                "the changelog published a pending fragment",
            )


if __name__ == "__main__":
    unittest.main()
