#!/usr/bin/env python3
"""Verify the vendored Chia WASM glue exposes Solslot EIP-712 helpers."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JS_PATH = ROOT / "src" / "assets" / "chia_wasm" / "chia_wallet_sdk_wasm_bg.js"
DTS_PATH = ROOT / "src" / "assets" / "chia_wasm" / "chia_wallet_sdk_wasm.d.ts"
WASM_PATH = ROOT / "src" / "assets" / "chia_wasm" / "chia_wallet_sdk_wasm_bg.wasm"
PACKAGE_PATH = ROOT / "src" / "assets" / "chia_wasm" / "package.json"
PROVENANCE_PATH = ROOT / "src" / "assets" / "chia_wasm" / "PROVENANCE.json"
EXPECTED_SOURCE_COMMIT = "af8a21a1c9370aa6873ca267bddebd22e500957e"
EXPECTED_RECOVERY_COMMIT = "fb8f4ea8279709287b022d6c388aef4751765d4c"
EXPECTED_WASM_SHA256 = "89ed323a034df2f074f637314d1b1c727113dc6100568d94d722fcdce45cdf48"

REQUIRED_EXPORTS = (
    "eip712TypeHash",
    "eip712DomainSeparator",
    "eip712HashToSign",
    "eip712MemberInnerPuzzleHash",
    "eip712MemberHash",
)


def _missing_exports(path: Path, pattern: str) -> list[str]:
    if not path.exists():
        return [f"{path} is missing"]
    text = path.read_text(encoding="utf-8")
    missing: list[str] = []
    for name in REQUIRED_EXPORTS:
        if re.search(pattern.format(name=re.escape(name)), text) is None:
            missing.append(name)
    return missing


def main() -> int:
    js_missing = _missing_exports(JS_PATH, r"export\s+function\s+{name}\s*\(")
    dts_missing = _missing_exports(DTS_PATH, r"export\s+function\s+{name}\s*\(")

    failures: list[str] = []
    try:
        provenance = json.loads(
            PROVENANCE_PATH.read_text(encoding="utf-8")
        )
        package = json.loads(PACKAGE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"EIP-712 WASM provenance is unreadable: {exc}", file=sys.stderr)
        return 1

    if provenance != {
        "schema": "solslot.eip712-wasm-provenance.v1",
        "purpose": "EIP-712 clear-signing bindings only",
        "sourceRepository": "https://github.com/MattHintz/chia-wallet-sdk",
        "sourceBranch": "solslot-wasm-crackpack",
        "sourceCommit": EXPECTED_SOURCE_COMMIT,
        "package": "chia-wallet-sdk-wasm",
        "version": "0.33.0",
        "license": "Apache-2.0",
        "wasmSha256": EXPECTED_WASM_SHA256,
        "requiredExports": list(REQUIRED_EXPORTS),
        "recoveryAuthority": False,
        "upstreamRecoverySdk": {
            "repository": "https://github.com/Chia-Network/cni-wallet-sdk",
            "commit": EXPECTED_RECOVERY_COMMIT,
        },
    }:
        failures.append(f"{PROVENANCE_PATH}: unsupported or changed provenance")
    if (
        package.get("name") != provenance.get("package")
        or package.get("version") != provenance.get("version")
        or package.get("license") != provenance.get("license")
    ):
        failures.append(
            f"{PACKAGE_PATH}: package identity differs from provenance"
        )
    if js_missing:
        failures.append(f"{JS_PATH}: missing {', '.join(js_missing)}")
    if dts_missing:
        failures.append(f"{DTS_PATH}: missing {', '.join(dts_missing)}")
    if not WASM_PATH.exists():
        failures.append(f"{WASM_PATH}: missing")
    elif (
        hashlib.sha256(WASM_PATH.read_bytes()).hexdigest()
        != provenance.get("wasmSha256")
    ):
        failures.append(f"{WASM_PATH}: SHA-256 mismatch")

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1

    print("EIP-712 WASM exports verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
