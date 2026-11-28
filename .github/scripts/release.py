"""Fold changelog fragments, bump workspace versions and extract release notes.

The release is intentionally two-phase: `--write` prepares a reviewable release
pull request, and `--notes` supplies the tag/release notes after that PR merges.
No network, no git, no hidden side effects.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

TYPES = ("added", "changed", "fixed", "security", "removed")
HEADINGS = {
    "added": "Added",
    "changed": "Changed",
    "fixed": "Fixed",
    "security": "Security",
    "removed": "Removed",
}
FRAGMENT_RE = re.compile(r"^(\d+)\.(added|changed|fixed|security|removed)\.md$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ReleaseError(Exception):
    """A release input is not mechanical or not reviewable."""


def read_fragments(directory: Path) -> list[dict]:
    fragments: list[dict] = []
    for path in sorted(directory.glob("*.md")):
        if path.name == "README.md":
            continue
        match = FRAGMENT_RE.match(path.name)
        if not match:
            raise ReleaseError(f"unexpected changelog fragment: {path.name}")
        body = path.read_text(encoding="utf-8").strip()
        if not body:
            raise ReleaseError(f"empty changelog fragment: {path.name}")
        fragments.append(
            {
                "path": path,
                "issue": int(match.group(1)),
                "type": match.group(2),
                "body": body,
            }
        )
    return fragments


def fold(fragments: list[dict], version: str, date: str) -> str:
    lines = [f"## [{version}] - {date}", ""]
    for kind in TYPES:
        items = sorted(
            (fragment for fragment in fragments if fragment["type"] == kind),
            key=lambda fragment: fragment["issue"],
        )
        if not items:
            continue
        lines.extend([f"### {HEADINGS[kind]}", ""])
        for fragment in items:
            body_lines = fragment["body"].splitlines()
            lines.append(f"- **#{fragment['issue']}** — {body_lines[0]}")
            for extra in body_lines[1:]:
                lines.append(f"  {extra}" if extra else "")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def insert_section(changelog: str, section: str) -> str:
    match = re.search(r"^## \[", changelog, flags=re.MULTILINE)
    if not match:
        raise ReleaseError("CHANGELOG.md has no '## [' section")
    return changelog[: match.start()] + section + "\n" + changelog[match.start() :]


def extract_notes(changelog: str, version: str) -> str:
    pattern = re.compile(
        rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## \[|\Z)",
        flags=re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(changelog)
    if not match:
        raise ReleaseError(f"CHANGELOG.md has no section for {version}")
    return match.group(1).strip() + "\n"


def update_versions(root: Path, version: str) -> list[Path]:
    paths = [
        root / "package.json",
        *sorted(root.glob("packages/*/package.json")),
        *sorted(root.glob("apps/*/package.json")),
    ]
    changed: list[Path] = []
    for path in paths:
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") == version:
            continue
        data["version"] = version
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        changed.append(path)
    return changed


def prepare(root: Path, version: str, date: str) -> tuple[list[dict], str, str]:
    fragments = read_fragments(root / "changelog.d")
    if not fragments:
        raise ReleaseError("no changelog fragments to release")
    section = fold(fragments, version, date)
    changelog_path = root / "CHANGELOG.md"
    updated = insert_section(changelog_path.read_text(encoding="utf-8"), section)
    return fragments, section, updated


def write(root: Path, version: str, date: str) -> tuple[list[dict], list[Path]]:
    fragments, _, updated = prepare(root, version, date)
    (root / "CHANGELOG.md").write_text(updated, encoding="utf-8")
    changed = update_versions(root, version)
    for fragment in fragments:
        fragment["path"].unlink()
    return fragments, changed


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--date", default=dt.date.today().isoformat())
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--write", action="store_true")
    parser.add_argument(
        "--notes",
        action="store_true",
        help="print the CHANGELOG section for --version instead of folding",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if not VERSION_RE.match(args.version):
        raise ReleaseError(f"not a semantic version: {args.version}")
    if not DATE_RE.match(args.date):
        raise ReleaseError(f"not a YYYY-MM-DD date: {args.date}")
    root = Path(args.root).resolve()

    if args.notes:
        notes = extract_notes(
            (root / "CHANGELOG.md").read_text(encoding="utf-8"), args.version
        )
        print(notes, end="")
        return 0

    if args.write:
        fragments, changed = write(root, args.version, args.date)
        print(f"release {args.version}: folded {len(fragments)} fragment(s)")
        for path in changed:
            print(f"version: {path.relative_to(root)}")
        return 0

    fragments, section, _ = prepare(root, args.version, args.date)
    print(section, end="")
    print(f"check: {len(fragments)} fragment(s) ready; run with --write to apply")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ReleaseError as error:
        print(f"release: {error}", file=sys.stderr)
        sys.exit(1)
