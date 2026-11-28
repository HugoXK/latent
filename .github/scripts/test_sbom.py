"""Unit tests for the local CycloneDX SBOM builder."""

from __future__ import annotations

import unittest

import sbom

ROOT = {"name": "latent", "version": "0.3.0"}
TIMESTAMP = "2026-11-27T00:00:00Z"


class BuildTests(unittest.TestCase):
    def test_components_are_deduplicated_sorted_and_skip_links(self) -> None:
        value = [
            {
                "name": "latent",
                "version": "0.3.0",
                "dependencies": {
                    "b": {"name": "b", "version": "2.0.0"},
                    "a": {
                        "name": "a",
                        "version": "1.0.0",
                        "dependencies": {
                            "b": {"name": "b", "version": "2.0.0"},
                        },
                    },
                    "local": {"name": "local", "version": "link:packages/core"},
                },
            }
        ]
        seen: dict[str, dict] = {}
        sbom.walk(value, seen)
        document = sbom.build(seen, ROOT, TIMESTAMP)

        self.assertEqual(
            [component["name"] for component in document["components"]], ["a", "b"]
        )
        self.assertEqual(document["components"][0]["purl"], "pkg:npm/a@1.0.0")
        self.assertEqual(document["metadata"]["component"]["version"], "0.3.0")
        self.assertEqual(document["specVersion"], "1.5")

    def test_the_same_input_produces_the_same_document(self) -> None:
        value = [{"dependencies": {"x": {"name": "x", "version": "1.0.0"}}}]
        first: dict[str, dict] = {}
        second: dict[str, dict] = {}
        sbom.walk(value, first)
        sbom.walk(value, second)
        self.assertEqual(
            sbom.build(first, ROOT, TIMESTAMP), sbom.build(second, ROOT, TIMESTAMP)
        )


if __name__ == "__main__":
    unittest.main()
