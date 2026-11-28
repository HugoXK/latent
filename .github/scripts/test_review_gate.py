"""Unit tests for the review gate's pure decision logic."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import review_gate

HEAD = "a" * 40


class FakeApi:
    def __init__(
        self,
        reviews: list[dict] | None = None,
        issue_comments: list[dict] | None = None,
        commit_comments: list[dict] | None = None,
        files: list[dict] | None = None,
    ) -> None:
        self.reviews = reviews or []
        self.issue_comments = issue_comments or []
        self.commit_comments = commit_comments or []
        self.files = files or []

    def __call__(self, path: str, method: str = "GET", data=None):
        if "/files" in path:
            return self.files
        if "/pulls/" in path and "/reviews" in path:
            return self.reviews
        if "/issues/" in path and "/comments" in path:
            return self.issue_comments
        if "/commits/" in path and "/comments" in path:
            return self.commit_comments
        raise AssertionError(f"unexpected API path: {path}")


def pull(author: str = "HugoXK", changed_files: int = 1) -> dict:
    return {
        "number": 7,
        "user": {"login": author},
        "head": {"sha": HEAD},
        "changed_files": changed_files,
    }


class ParseTests(unittest.TestCase):
    def test_verdict_lines(self) -> None:
        self.assertEqual(review_gate.parse_verdict(f"Verdict: PASS at {HEAD}"), "PASS")
        self.assertEqual(
            review_gate.parse_verdict(f"Verdict: REQUEST_CHANGES at {HEAD}"),
            "REQUEST_CHANGES",
        )
        self.assertEqual(review_gate.parse_verdict("## Review — PASS"), "PASS")
        self.assertIsNone(review_gate.parse_verdict("looks good to me"))


class EvaluateTests(unittest.TestCase):
    def test_code_without_a_verdict_blocks(self) -> None:
        fake = FakeApi(files=[{"filename": "packages/core/src/state.ts"}])
        with patch.object(review_gate, "api", fake):
            ok, detail = review_gate.evaluate(pull(), "HugoXK-bot")
        self.assertFalse(ok)
        self.assertIn("no verdict", detail)

    def test_explicit_request_changes_blocks_docs(self) -> None:
        fake = FakeApi(
            commit_comments=[
                {
                    "user": {"login": "HugoXK-bot"},
                    "created_at": "2026-11-25T00:00:00Z",
                    "body": f"Verdict: REQUEST_CHANGES at {HEAD}",
                }
            ],
            files=[{"filename": "docs/review.md"}],
        )
        with patch.object(review_gate, "api", fake):
            ok, detail = review_gate.evaluate(pull(), "HugoXK-bot")
        self.assertFalse(ok)
        self.assertIn("REQUEST_CHANGES", detail)

    def test_explicit_approval_passes_code(self) -> None:
        fake = FakeApi(
            reviews=[
                {
                    "user": {"login": "HugoXK-bot"},
                    "commit_id": HEAD,
                    "state": "APPROVED",
                    "submitted_at": "2026-11-25T00:00:00Z",
                }
            ],
            files=[{"filename": "packages/core/src/state.ts"}],
        )
        with patch.object(review_gate, "api", fake):
            ok, detail = review_gate.evaluate(pull(), "HugoXK-bot")
        self.assertTrue(ok)
        self.assertIn("PASS", detail)

    def test_reviewer_cannot_approve_its_own_tip(self) -> None:
        fake = FakeApi(files=[{"filename": "docs/review.md"}])
        with patch.object(review_gate, "api", fake):
            ok, detail = review_gate.evaluate(pull(author="HugoXK-bot"), "HugoXK-bot")
        self.assertFalse(ok)
        self.assertIn("identities must be separate", detail)


class EventTests(unittest.TestCase):
    def test_commit_comment_maps_to_open_pulls(self) -> None:
        payload = {"comment": {"commit_id": HEAD}}

        def fake_api(path, method="GET", data=None):
            self.assertIn(f"/commits/{HEAD}/pulls", path)
            return [
                {"number": 7, "state": "open"},
                {"number": 8, "state": "closed"},
            ]

        with patch.dict(os.environ, {"GITHUB_EVENT_NAME": "commit_comment"}):
            with patch.object(review_gate, "api", fake_api):
                self.assertEqual(review_gate.pull_numbers(payload), [7])


class PublishTests(unittest.TestCase):
    def test_refreshes_the_summary_at_the_same_conclusion(self) -> None:
        calls = []

        def fake_api(path, method="GET", data=None):
            calls.append((path, method, data))
            return {}

        current = {
            "id": 99,
            "status": "completed",
            "conclusion": "failure",
            "output": {"summary": "no verdict"},
        }
        with patch.object(review_gate, "latest_check", return_value=current):
            with patch.object(review_gate, "api", fake_api):
                review_gate.publish_check(pull(), False, "REQUEST_CHANGES at aaaaaaa")
        self.assertTrue(
            any(
                method == "PATCH" and path == "/check-runs/99"
                for path, method, _ in calls
            )
        )

    def test_an_unchanged_summary_is_not_repainted(self) -> None:
        calls = []

        def fake_api(path, method="GET", data=None):
            calls.append((path, method, data))
            return {}

        current = {
            "id": 99,
            "status": "completed",
            "conclusion": "failure",
            "output": {"summary": "same reason"},
        }
        with patch.object(review_gate, "latest_check", return_value=current):
            with patch.object(review_gate, "api", fake_api):
                review_gate.publish_check(pull(), False, "same reason")
        self.assertEqual(calls, [])


class StrangerTests(unittest.TestCase):
    def test_a_stranger_commit_comment_does_not_count(self) -> None:
        fake = FakeApi(
            commit_comments=[
                {
                    "user": {"login": "stranger"},
                    "created_at": "2026-11-25T00:00:00Z",
                    "body": f"Verdict: PASS at {HEAD}",
                }
            ],
            files=[{"filename": "packages/core/src/state.ts"}],
        )
        with patch.object(review_gate, "api", fake):
            ok, detail = review_gate.evaluate(pull(), "HugoXK-bot")
        self.assertFalse(ok)
        self.assertIn("no verdict", detail)


if __name__ == "__main__":
    unittest.main()
