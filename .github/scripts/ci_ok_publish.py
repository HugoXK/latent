"""Publish the `ci-ok-published` check from the default branch.

A pull request can edit its own `ci.yml` and weaken the in-workflow aggregate.
This publisher runs from a `workflow_run` on the default branch, reads the jobs of
the triggering run, and publishes `ci-ok-published` on the pull request head only when the
exact required job set succeeded.

It updates an existing `ci-ok-published` check run when one is present so the context is not
duplicated; it creates one when the pull request removed the aggregate.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any

API = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
CHECK_NAME = "ci-ok-published"
REQUIRED_JOBS = ("spec", "node", "gate-tests")
TRUSTED_WORKFLOW_PATH = ".github/workflows/ci.yml"


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


SHA_RE = re.compile(r"^[0-9a-f]{40}$")


def ci_tokens(text: str) -> list[tuple[str, str, str]]:
    """Normalise a ci.yml file to comparable tokens.

    A `uses:` line becomes ("uses", indent, "owner/repo/path@kind"), where kind is
    "sha" for a 40-hex ref and "tag" for anything else. Every other line keeps its
    raw content, so any trigger, permission, job, step or command change is a
    token difference.
    """
    tokens: list[tuple[str, str, str]] = []
    for raw in text.splitlines():
        line = raw.rstrip()
        match = re.match(
            r"^(\s*)(-\s*)?uses:\s*(\S+)\s*(?:#.*)?$",
            line,
        )
        if match:
            indent = match.group(1)
            ref = match.group(3)
            action, _, ref_value = ref.rpartition("@")
            kind = "sha" if SHA_RE.match(ref_value) else "tag"
            tokens.append(("uses", indent, f"{action}@{kind}:{ref_value}"))
        else:
            tokens.append(("line", "", line))
    return tokens


def evaluate_ref_only(base_text: str, head_text: str) -> tuple[bool, str]:
    """Accept only a tag -> commit SHA change on an unchanged `uses:` line.

    This is deliberately not a workflow exemption: it accepts exactly one shape,
    because a moving tag is a supply-chain risk while its immutable commit is not.
    Every other difference keeps the bootstrap rejection, and an unprovable diff
    fails closed.
    """
    base_tokens = ci_tokens(base_text)
    head_tokens = ci_tokens(head_text)
    if len(base_tokens) != len(head_tokens):
        return (
            False,
            f"ci.yml line count changed from {len(base_tokens)} to {len(head_tokens)}",
        )
    changed = 0
    for index, (base_token, head_token) in enumerate(
        zip(base_tokens, head_tokens), start=1
    ):
        if base_token == head_token:
            continue
        if base_token[0] == "uses" and head_token[0] == "uses":
            if base_token[1] == head_token[1]:
                base_action, _, base_ref = base_token[2].rpartition("@")
                head_action, _, head_ref = head_token[2].rpartition("@")
                base_kind, _, _ = base_ref.partition(":")
                head_kind, _, _ = head_ref.partition(":")
                if (
                    base_action == head_action
                    and base_kind == "tag"
                    and head_kind == "sha"
                ):
                    changed += 1
                    continue
        return (
            False,
            f"ci.yml differs beyond a ref-only pin at line {index} "
            f"({base_token[2]!r} -> {head_token[2]!r})",
        )
    if changed == 0:
        return False, "ci.yml differs but no ref-only uses: pin was found"
    return True, f"ci.yml differs only by {changed} uses: ref pin(s) (tag -> commit SHA)"


def evaluate_run(facts: dict[str, Any]) -> tuple[bool, str]:
    """The triggering run must be the trusted ci workflow on this head.

    `workflow_run` matches a workflow by *name* and exposes no content hash, so a
    pull request that edits `ci.yml` or adds another workflow called `ci` would
    otherwise be published. The publisher requires the trusted path and workflow
    id, the same repository, and an unchanged `ci.yml` blob at the head SHA.
    """
    issues: list[str] = []
    if facts.get("run_path") != TRUSTED_WORKFLOW_PATH:
        issues.append(f"run path {facts.get('run_path')!r} is not {TRUSTED_WORKFLOW_PATH}")
    if facts.get("run_workflow_id") != facts.get("trusted_workflow_id"):
        issues.append("run workflow id is not the trusted ci workflow")
    if facts.get("run_event") != "pull_request":
        issues.append(f"run event {facts.get('run_event')!r} is not pull_request")
    if facts.get("run_head_sha") != facts.get("head_sha"):
        issues.append("run head SHA does not match the published head")
    if facts.get("run_head_repo") != facts.get("repo"):
        issues.append("run did not come from this repository")
    if facts.get("ci_blob_head") != facts.get("ci_blob_base"):
        head_text = facts.get("ci_text_head")
        base_text = facts.get("ci_text_base")
        if not isinstance(head_text, str) or not isinstance(base_text, str):
            issues.append(
                "ci.yml differs from the default branch and the contents are "
                "unavailable to prove a ref-only change"
            )
        else:
            ref_only, ref_detail = evaluate_ref_only(base_text, head_text)
            if not ref_only:
                issues.append(f"ci.yml differs from the default branch: {ref_detail}")
    if not facts.get("pr_open"):
        issues.append("no open pull request at the head SHA")
    elif facts.get("pr_base") != facts.get("default_branch"):
        issues.append(
            f"pull request base {facts.get('pr_base')!r} is not {facts.get('default_branch')!r}"
        )
    if facts.get("pr_head_sha") != facts.get("head_sha"):
        issues.append("pull request head SHA does not match the published head")
    if issues:
        return False, "; ".join(issues)
    return True, "triggered by the trusted ci workflow at this head"


def latest_check(head: str) -> dict[str, Any] | None:
    data = api(
        f"/commits/{head}/check-runs?check_name={CHECK_NAME}&filter=latest&per_page=100"
    )
    runs = data.get("check_runs", [])
    return runs[0] if runs else None


def publish(head: str, ok: bool, detail: str) -> None:
    conclusion = "success" if ok else "failure"
    output = {
        "title": f"ci-ok-published: {'PASS' if ok else 'BLOCKED'}",
        "summary": detail,
    }
    current = latest_check(head)
    if (
        current
        and current.get("status") == "completed"
        and current.get("conclusion") == conclusion
    ):
        if str((current.get("output") or {}).get("summary") or "") == detail:
            print(f"ci-ok-published: {head[:7]} already {conclusion}")
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


def blob_text(blob: Any) -> str | None:
    """Decode a contents-API file body; return None when it is unavailable."""
    content = (blob or {}).get("content")
    if not isinstance(content, str) or not content:
        return None
    try:
        return base64.b64decode(content).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return None


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
        default_branch = str(
            api("").get("default_branch") or "main"
        )
        run = api(f"/actions/runs/{run_id}")
        trusted = api("/actions/workflows/ci.yml")
        head_blob = api(f"/contents/{TRUSTED_WORKFLOW_PATH}?ref={head}")
        base_blob = api(f"/contents/{TRUSTED_WORKFLOW_PATH}?ref={default_branch}")
        pulls = api(f"/commits/{head}/pulls?per_page=100")
        pull = next(
            (
                candidate
                for candidate in pulls
                if str(candidate.get("state", "")) == "open"
                and str(candidate.get("head", {}).get("sha", "")) == head
            ),
            {},
        )
        facts = {
            "repo": REPO,
            "head_sha": head,
            "default_branch": default_branch,
            "run_path": str(run.get("path") or ""),
            "run_workflow_id": run.get("workflow_id"),
            "trusted_workflow_id": trusted.get("id"),
            "run_event": str(run.get("event") or ""),
            "run_head_sha": str(run.get("head_sha") or ""),
            "run_head_repo": str(
                (run.get("head_repository") or {}).get("full_name") or ""
            ),
            "ci_blob_head": (head_blob or {}).get("sha"),
            "ci_blob_base": (base_blob or {}).get("sha"),
            "ci_text_head": blob_text(head_blob),
            "ci_text_base": blob_text(base_blob),
            "pr_open": bool(pull),
            "pr_base": str((pull.get("base") or {}).get("ref") or ""),
            "pr_head_sha": str((pull.get("head") or {}).get("sha") or ""),
        }
        trust_ok, trust_detail = evaluate_run(facts)
        jobs_ok, jobs_detail = evaluate_jobs(run_jobs(run_id))
        ok = trust_ok and jobs_ok
        detail = trust_detail if not trust_ok else jobs_detail
        publish(head, ok, detail)
    except RuntimeError as error:
        print(f"ci-ok: ERROR — {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
