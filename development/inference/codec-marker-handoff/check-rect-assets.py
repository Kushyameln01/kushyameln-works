#!/usr/bin/env python3
"""Verify the existing Rect bundle without export, load, or inference."""
import argparse
import hashlib
import json
import time
from pathlib import Path

MANIFEST_SHA256 = "450e5f7a60d2fca50498a8d5eae89c7bbc54a9fcfc579250f580f3e008a65a8a"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    started = time.monotonic()
    root = args.bundle.resolve(strict=True)
    raw = (root / "manifest.json").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != MANIFEST_SHA256:
        raise ValueError("Selected Rect manifest bytes do not match the fixed handoff")
    manifest = json.loads(raw)
    assets = []
    for role, asset in manifest["assets"].items():
        path = (root / asset["file"]).resolve(strict=True)
        if not path.is_relative_to(root):
            raise ValueError("Asset escapes bundle root")
        hasher = hashlib.sha256()
        size = 0
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
                size += len(chunk)
                hasher.update(chunk)
        actual = hasher.hexdigest()
        if size != asset["bytes"] or actual != asset["sha256"]:
            raise ValueError(f"Asset identity mismatch: {role}")
        assets.append({"role": role, "mapKey": asset["file"], "bytes": size,
                       "sha256": actual, "passed": True})
    result = {"passed": True, "scope": "Local asset bytes only; no inference or recipient-environment acceptance",
              "manifest": {"bytes": len(raw), "sha256": digest},
              "profile": manifest["profile"], "assets": assets,
              "assetBytes": sum(a["bytes"] for a in assets),
              "elapsedSeconds": time.monotonic() - started,
              "neuralRuns": 0, "exports": 0, "childProcessesStarted": 0,
              "separateManagerEnvironmentVerified": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({"passed": True, "assetCount": len(assets), "assetBytes": result["assetBytes"],
                      "elapsedSeconds": result["elapsedSeconds"]}))


if __name__ == "__main__":
    main()
