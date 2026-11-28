"""Build a deterministic CycloneDX 1.5 SBOM from `pnpm list --json`.

The release workflow runs `pnpm list --json --depth Infinity` and feeds the result
here. Components are deduplicated by name@version, sorted, and the workspace links
(`link:`) are omitted. No network and no third-party code generator.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from urllib.parse import quote

DEP_FIELDS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)


class SbomError(Exception):
    """The pnpm list input is not usable."""


def walk(node: object, seen: dict[str, dict]) -> None:
    if isinstance(node, list):
        for item in node:
            walk(item, seen)
        return
    if not isinstance(node, dict):
        return

    name = node.get("name")
    version = node.get("version")
    if isinstance(name, str) and isinstance(version, str):
        if not version.startswith(("link:", "file:", "workspace:")):
            key = f"{name}@{version}"
            if key not in seen:
                seen[key] = {
                    "type": "library",
                    "name": name,
                    "version": version,
                    "purl": f"pkg:npm/{quote(name, safe='')}@{quote(version, safe='')}",
                }

    for field in DEP_FIELDS:
        dependencies = node.get(field)
        if not isinstance(dependencies, dict):
            continue
        for dependency_name, dependency in dependencies.items():
            if isinstance(dependency, dict):
                child = dict(dependency)
                child.setdefault("name", dependency_name)
                walk(child, seen)
            elif isinstance(dependency, str):
                # A bare string has no version; do not invent one.
                continue


def build(components: dict[str, dict], root: dict, timestamp: str) -> dict:
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "version": 1,
        "metadata": {
            "timestamp": timestamp,
            "component": {
                "type": "application",
                "name": str(root.get("name") or "latent"),
                "version": str(root.get("version") or "0.0.0"),
            },
        },
        "components": [
            components[key]
            for key in sorted(components, key=lambda key: key.lower())
            if key != f"{root.get('name')}@{root.get('version')}"
        ],
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="pnpm list --json output")
    parser.add_argument("--output", required=True, help="CycloneDX JSON path")
    parser.add_argument("--root-package", default="package.json")
    parser.add_argument(
        "--timestamp",
        default=dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    try:
        raw = json.loads(Path(args.input).read_text(encoding="utf-8"))
        root_path = Path(args.root_package)
        root = json.loads(root_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SbomError(str(error)) from error

    seen: dict[str, dict] = {}
    walk(raw, seen)
    document = build(seen, root, args.timestamp)
    Path(args.output).write_text(
        json.dumps(document, indent=2) + "\n", encoding="utf-8"
    )
    print(f"sbom: {len(document['components'])} component(s) -> {args.output}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SbomError as error:
        print(f"sbom: {error}", file=sys.stderr)
        sys.exit(1)
