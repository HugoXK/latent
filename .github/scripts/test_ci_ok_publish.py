"""Unit tests for the ci-ok publisher's pure decision logic."""

from __future__ import annotations

import re
import unittest

import os

import ci_ok_publish

CI_YML = os.environ.get("CI_YML_PATH") or os.path.join(
    os.path.dirname(__file__), "..", "workflows", "ci.yml"
)


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


    def test_required_jobs_exist_in_ci_yml(self) -> None:
        with open(CI_YML, encoding="utf-8") as fh:
            text = fh.read()
        jobs = set(re.findall(r"^  ([a-z0-9-]+):$", text, re.M))
        for job in ci_ok_publish.REQUIRED_JOBS:
            self.assertIn(job, jobs, f"{job} is required but not defined in ci.yml")

    def test_the_aggregate_needs_every_required_job(self) -> None:
        with open(CI_YML, encoding="utf-8") as fh:
            text = fh.read()
        block = re.search(
            r"^  ci-ok:\n(?:.*\n)*?    needs: \[([^\]]*)\]", text, re.M
        )
        self.assertIsNotNone(block, "ci-ok job has no needs: [...] line")
        needed = {item.strip() for item in block.group(1).split(",") if item.strip()}
        for job in ci_ok_publish.REQUIRED_JOBS:
            self.assertIn(
                job, needed, f"ci-ok does not depend on {job}, so its aggregate can lie"
            )

if __name__ == "__main__":
    unittest.main()

class MainPathTests(unittest.TestCase):
    def test_main_never_double_prefixes_the_repo(self) -> None:
        """The publisher built /repos/{repo}/repos/{repo} and 404'd on main."""
        import json as _json
        from unittest.mock import patch

        head = "a" * 40
        run_id = "123"
        calls: list[str] = []

        def fake_api(path, method="GET", data=None):
            calls.append(path)
            if path == "":
                return {"default_branch": "main"}
            if path == f"/actions/runs/{run_id}":
                return {
                    "path": ".github/workflows/ci.yml",
                    "workflow_id": 1,
                    "event": "push",
                    "head_sha": head,
                    "head_repository": {"full_name": "HugoXK/latent"},
                }
            if path == "/actions/workflows/ci.yml":
                return {"id": 1}
            if path.startswith("/contents/"):
                return {"sha": "blob"}
            if path.startswith(f"/commits/{head}/pulls"):
                return [
                    {
                        "state": "open",
                        "head": {"sha": head},
                        "base": {"ref": "main"},
                    }
                ]
            if "/jobs" in path:
                return {"jobs": [{"name": "spec", "conclusion": "success"}], "total_count": 1}
            return {}

        env = {
            "GITHUB_REPOSITORY": "HugoXK/latent",
            "GITHUB_TOKEN": "test-token",
            "RUN_ID": run_id,
            "HEAD_SHA": head,
        }
        # REPO/TOKEN are module constants read at import, so patch the module.
        with patch.dict(os.environ, env, clear=False):
            with patch.object(ci_ok_publish, "REPO", "HugoXK/latent"):
                with patch.object(ci_ok_publish, "TOKEN", "test-token"):
                    with patch.object(ci_ok_publish, "api", fake_api):
                        with patch.object(ci_ok_publish, "publish", lambda *a, **k: None):
                            with patch.object(ci_ok_publish, "run_jobs", lambda rid: []):
                                ci_ok_publish.main()
        self.assertTrue(calls, "main() made no API calls")
        for path in calls:
            self.assertFalse(
                path.startswith("/repos/"),
                f"api() already prefixes the repo, got double-prefixed path {path}",
            )
