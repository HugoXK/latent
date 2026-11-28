"""Unit tests for the ci-ok publisher's pure decision logic."""

from __future__ import annotations

import re
import unittest

import os

import ci_ok_publish

CI_YML = os.path.join(os.path.dirname(__file__), "..", "workflows", "ci.yml")


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


def trusted_facts(**overrides: object) -> dict[str, object]:
    facts: dict[str, object] = {
        "repo": "HugoXK/latent",
        "head_sha": "a" * 40,
        "default_branch": "main",
        "run_path": ".github/workflows/ci.yml",
        "run_workflow_id": 123,
        "trusted_workflow_id": 123,
        "run_event": "pull_request",
        "run_head_sha": "a" * 40,
        "run_head_repo": "HugoXK/latent",
        "ci_blob_head": "blob123",
        "ci_blob_base": "blob123",
        "pr_open": True,
        "pr_base": "main",
        "pr_head_sha": "a" * 40,
    }
    facts.update(overrides)
    return facts


class EvaluateRunTests(unittest.TestCase):
    def test_the_trusted_run_passes(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts())
        self.assertTrue(ok)
        self.assertIn("trusted ci workflow", detail)

    def test_a_pull_request_copy_of_ci_yml_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(
            trusted_facts(ci_blob_head="weakened")
        )
        self.assertFalse(ok)
        self.assertIn("ci.yml differs", detail)

    def test_another_workflow_called_ci_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(
            trusted_facts(run_path=".github/workflows/fake.yml")
        )
        self.assertFalse(ok)
        self.assertIn("run path", detail)

    def test_another_workflow_id_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(
            trusted_facts(run_workflow_id=999)
        )
        self.assertFalse(ok)
        self.assertIn("workflow id", detail)

    def test_a_fork_run_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(
            trusted_facts(run_head_repo="elsewhere/latent")
        )
        self.assertFalse(ok)
        self.assertIn("this repository", detail)

    def test_a_non_main_base_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts(pr_base="feat/x"))
        self.assertFalse(ok)
        self.assertIn("pull request base", detail)

    def test_no_open_pull_request_fails(self) -> None:
        ok, detail = ci_ok_publish.evaluate_run(trusted_facts(pr_open=False))
        self.assertFalse(ok)
        self.assertIn("no open pull request", detail)


if __name__ == "__main__":
    unittest.main()

    def test_required_jobs_exist_in_ci_yml(self) -> None:
        with open(CI_YML, encoding="utf-8") as fh:
            text = fh.read()
        jobs = set(re.findall(r"^  ([a-z0-9-]+):$", text, re.M))
        for job in ci_ok_publish.REQUIRED_JOBS:
            self.assertIn(job, jobs, f"{job} is required but not defined in ci.yml")
