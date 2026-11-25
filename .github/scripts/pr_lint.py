"""Validate a pull request body and its changelog obligation.

The body is read through the GitHub API; no pull request code is executed. The
rules mirror the repository's PULL_REQUEST_TEMPLATE.md and stay deliberately
small: a linked issue (or an explicit no-issue line), one risk tier, an evidence
block, and a changelog fragment when code or a schema changes.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Any

API = os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")
REPO = os.environ["GITHUB_REPOSITORY"]
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
PR = os.environ.get("PR", "")
SKIP_AUTHORS = {"dependabot[bot]", "github-actions[bot]"}
LINK_RE = re.compile(r"(?im)^\s*(?:Fixes|Part of|Refs)\s+#\d+\b")
NO_ISSUE_RE = re.compile(r"(?im)^\s*(?:No-issue|Investigates)\s*:")
TIER_RE = re.compile(r"(?m)^\s*-\s*\[[xX]\]\s*T[0-3]\b")
CODE_PREFIXES = ("packages/", "apps/", "data/schemas/")
CHANGELOG_RE = re.compile(r"^changelog\.d/[^/]+\.(added|changed|deprecated|removed|fixed|security)\.md$")


def api(path: str) -> Any:
    if not TOKEN:
        raise RuntimeError("GITHUB_TOKEN is required")
    request = urllib.request.Request(
        f"{API}/repos/{REPO}{path}",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "latent-pr-lint",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:300]
        raise RuntimeError(f"GitHub API {exc.code} {path}: {body}") from exc


def all_files(number: int, expected: int) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    page = 1
    while len(files) < expected and page <= 30:
        batch = api(f"/pulls/{number}/files?per_page=100&page={page}")
        if not batch:
            break
        files.extend(batch)
        page += 1
    return files


def main() -> None:
    if not PR:
        print("pr-lint: no pull request number")
        sys.exit(1)
    number = int(PR)
    pull = api(f"/pulls/{number}")
    author = str(pull.get("user", {}).get("login", ""))
    if author in SKIP_AUTHORS:
        print(f"pr-lint: skipped for {author}")
        return

    body = str(pull.get("body") or "")
    errors: list[str] = []

    if not LINK_RE.search(body) and not NO_ISSUE_RE.search(body):
        errors.append(
            'add "Fixes #N", "Part of #N", "Refs #N", "No-issue:" or "Investigates:"'
        )
    if not TIER_RE.search(body):
        errors.append("check exactly one risk tier (T0–T3)")
    if "Ran:" not in body or "Not run:" not in body:
        errors.append("include the evidence block with both 'Ran:' and 'Not run:'")
    for heading in ("## What and why", "## Evidence", "## Risk tier"):
        if heading.lower() not in body.lower():
            errors.append(f"add the '{heading}' section")

    files = all_files(number, int(pull.get("changed_files") or 0))
    changed_code = any(
        str(file.get("filename", "")).startswith(CODE_PREFIXES) for file in files
    )
    has_fragment = any(
        file.get("status") == "added" and CHANGELOG_RE.match(str(file.get("filename", "")))
        for file in files
    )
    if changed_code and not has_fragment and "Changelog-not-needed:" not in body:
        errors.append(
            "a code or schema change needs a changelog.d fragment or 'Changelog-not-needed:'"
        )

    if errors:
        print("pr-lint: FAIL")
        for error in errors:
            print(f" - {error}")
        sys.exit(1)
    print("pr-lint: PASS")


if __name__ == "__main__":
    main()
