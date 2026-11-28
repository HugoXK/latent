"""Regression: the publisher must not double-prefix the repository path.

`api()` already builds f"{API}/repos/{REPO}{path}", so a caller that passes
"/repos/{REPO}" produces /repos/<repo>/repos/<repo> and 404s. That is what
happened on main after #103 merged; the evaluate_* tests could not see it.

This lives in its own file on purpose: test-integrity.sh forbids changing a base
gate test, and a new file is a new control rather than an edited one.
"""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

import ci_ok_publish


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
