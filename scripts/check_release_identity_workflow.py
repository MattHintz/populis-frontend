#!/usr/bin/env python3
"""Fail CI if an immutable deployment regresses to SHA-only identity."""

from __future__ import annotations

import argparse
from pathlib import Path


COMMON_REQUIRED = (
    'release_id="$sha-$tag"',
    'release_dir="$root/releases/$release_id"',
    'artifact_sha256="$(sha256sum "$archive"',
    'test -f "$release_dir/.artifact-sha256"',
    'test "$(cat "$release_dir/.artifact-sha256")" = "$artifact_sha256"',
    'assert release["commit"] == sys.argv[2]',
    'assert release["release"] == sys.argv[3]',
    'release_id="${{ inputs.rollback_release }}"',
    'sha="${release_id%%-*}"',
    'tag="${release_id#"$sha"-}"',
)

COMMON_FORBIDDEN = (
    'release_dir="$root/releases/$sha"',
    "Previously verified 40-character release SHA",
)

KIND_REQUIRED = {
    "portal": (
        'archive="/tmp/solslot-admin-$release_id.tgz"',
        'assert d["release"] == "${{ inputs.release_tag }}"',
    ),
    "backend": (
        'archive="/tmp/solslot-backend-$release_id.tgz"',
        'transactions/$release_id.previous',
    ),
}


def validate(path: Path, kind: str) -> list[str]:
    text = path.read_text(encoding="utf-8")
    errors = [
        f"missing required invariant: {needle}"
        for needle in (*COMMON_REQUIRED, *KIND_REQUIRED[kind])
        if needle not in text
    ]
    errors.extend(
        f"forbidden SHA-only invariant remains: {needle}"
        for needle in COMMON_FORBIDDEN
        if needle in text
    )
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workflow", type=Path)
    parser.add_argument("kind", choices=sorted(KIND_REQUIRED))
    args = parser.parse_args()

    errors = validate(args.workflow, args.kind)
    if errors:
        for error in errors:
            print(error)
        return 1
    print(f"release identity workflow verified: {args.kind}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
