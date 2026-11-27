"""Unit tests for the ci-ok publisher's pure decision logic."""

from __future__ import annotations

import unittest

import ci_ok_publish


class EvaluateTests(unittest.TestCase):
    def test_the_exact_success_set_passes(self) -> None:
        ok, detail = ci_ok_publish.evaluate_jobs(
            [
                {"name": "spec", "conclusion": "success"},
                {"name": "node", "conclusion": "success"},
                {"name": "gate-tests", "conclusion": "success"},
            ]
        )
        self.assertTrue(ok)
        self.assertIn("all succeeded", detail)

    def test_a_missing_gate_tests_job_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_jobs(
            [
                {"name": "spec", "conclusion": "success"},
                {"name": "node", "conclusion": "success"},
            ]
        )
        self.assertFalse(ok)
        self.assertIn("gate-tests: missing", detail)

    def test_a_failed_job_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_jobs(
            [
                {"name": "spec", "conclusion": "success"},
                {"name": "node", "conclusion": "failure"},
                {"name": "gate-tests", "conclusion": "success"},
            ]
        )
        self.assertFalse(ok)
        self.assertIn("node: failure", detail)

    def test_a_duplicate_job_name_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_jobs(
            [
                {"name": "spec", "conclusion": "success"},
                {"name": "spec", "conclusion": "success"},
                {"name": "node", "conclusion": "success"},
                {"name": "gate-tests", "conclusion": "success"},
            ]
        )
        self.assertFalse(ok)
        self.assertIn("spec: appears 2 times", detail)

    def test_a_skipped_job_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_jobs(
            [
                {"name": "spec", "conclusion": "success"},
                {"name": "node", "conclusion": "success"},
                {"name": "gate-tests", "conclusion": "skipped"},
            ]
        )
        self.assertFalse(ok)
        self.assertIn("gate-tests: skipped", detail)


if __name__ == "__main__":
    unittest.main()
