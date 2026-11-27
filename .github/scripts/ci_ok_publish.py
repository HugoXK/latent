"""Publish the required `ci-ok` check from the default branch.

A pull request can edit its own `ci.yml` and weaken the in-workflow aggregate.
This publisher runs from a `workflow_run` on the default branch, reads the jobs of
the triggering run, and publishes `ci-ok` on the pull request head only when the
exact required job set succeeded.

It updates an existing `ci-ok` check run when one is present so the context is not
duplicated; it creates one when the pull request removed the aggregate.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

API = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
CHECK_NAME = "ci-ok"
REQUIRED_JOBS = ("spec", "node", "gate-tests")


def api(path: str, method: str = "GET", data: dict[str, Any] | None = None) -> Any:
    if not TOKEN:
        raise RuntimeError("GITHUB_TOKEN is required")
    request = urllib.request.Request(
        f"{API}/repos/{REPO}{path}",
        method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "latent-ci-ok",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:300]
        raise RuntimeError(f"GitHub API {exc.code} {path}: {body}") from exc


def evaluate_jobs(jobs: list[dict[str, Any]]) -> tuple[bool, str]:
    """The exact job set must be present once and every job must have succeeded."""
    by_name: dict[str, list[str]] = {}
    for job in jobs:
        name = str(job.get("name") or "")
        conclusion = str(job.get("conclusion") or job.get("status") or "unknown")
        by_name.setdefault(name, []).append(conclusion)

    issues: list[str] = []
    for name in REQUIRED_JOBS:
        conclusions = by_name.get(name)
        if not conclusions:
            issues.append(f"{name}: missing")
            continue
        if len(conclusions) != 1:
            issues.append(f"{name}: appears {len(conclusions)} times")
            continue
        if conclusions[0] != "success":
            issues.append(f"{name}: {conclusions[0]}")
    if issues:
        return False, "; ".join(issues)
    return True, "spec, node and gate-tests all succeeded"


def latest_check(head: str) -> dict[str, Any] | None:
    data = api(
        f"/commits/{head}/check-runs?check_name={CHECK_NAME}&filter=latest&per_page=100"
    )
    runs = data.get("check_runs", [])
    return runs[0] if runs else None


def publish(head: str, ok: bool, detail: str) -> None:
    conclusion = "success" if ok else "failure"
    output = {
        "title": f"ci-ok: {'PASS' if ok else 'BLOCKED'}",
        "summary": detail,
    }
    current = latest_check(head)
    if (
        current
        and current.get("status") == "completed"
        and current.get("conclusion") == conclusion
    ):
        if str((current.get("output") or {}).get("summary") or "") == detail:
            print(f"ci-ok: {head[:7]} already {conclusion}")
            return
        api(
            f"/check-runs/{current.get('id')}",
            method="PATCH",
            data={"output": output},
        )
        print(f"ci-ok: {head[:7]} refreshed — {detail}")
        return
    api(
        "/check-runs",
        method="POST",
        data={
            "name": CHECK_NAME,
            "head_sha": head,
            "status": "completed",
            "conclusion": conclusion,
            "output": output,
        },
    )
    print(f"ci-ok: {head[:7]} {conclusion} — {detail}")


def run_jobs(run_id: str) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    page = 1
    total = 1
    while len(jobs) < total and page <= 20:
        data = api(f"/actions/runs/{run_id}/jobs?per_page=100&page={page}")
        batch = data.get("jobs", [])
        total = int(data.get("total_count") or len(batch))
        if not batch:
            break
        jobs.extend(batch)
        page += 1
    return jobs


def main() -> None:
    run_id = os.environ.get("RUN_ID", "")
    head = os.environ.get("HEAD_SHA", "")
    if not REPO or not run_id or not head:
        print("ci-ok: GITHUB_REPOSITORY, RUN_ID and HEAD_SHA are required")
        sys.exit(1)
    try:
        ok, detail = evaluate_jobs(run_jobs(run_id))
        publish(head, ok, detail)
    except RuntimeError as error:
        print(f"ci-ok: ERROR — {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
