#!/usr/bin/env python3
"""Frozen-source diagnostic for selected Q128, H40, all K65520 attention.

No model file is read. F64 reference payloads are written only below /tmp.
Run prepare/self-test before commit; reference/browser require frozen sources.
"""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import resource
import subprocess
import threading
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONTRACT_PATH = HERE / "contract.json"


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True, indent=2) + "\n")


def contract():
    value = json.loads(CONTRACT_PATH.read_text())
    require(value["shape"] == {"heads": 40, "queries": 128, "keys": 65520, "headDim": 128}, "Fixed selected-query/all-key contract required")
    require(value["keyTile"] == 256 and value["tiles"] == 256 and value["tailKeys"] == 240, "Exact tile/tail contract required")
    require(value["gate"]["absolute"] == 0.001 and value["gate"]["relative"] == 0.0001, "Preset all-element gate required")
    return value


def source_evidence(spec, strict=True):
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    hashes, frozen = {}, True
    for name in sorted(spec["sourcePaths"]):
        path = ROOT / name
        require(path.is_file(), "Missing diagnostic/operator source: " + name)
        hashes[name] = sha_file(path)
        current = subprocess.check_output(["git", "hash-object", "--", name], cwd=ROOT, text=True).strip()
        committed = subprocess.run(["git", "rev-parse", "HEAD:" + name], cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        frozen = frozen and committed.returncode == 0 and current == committed.stdout.strip()
    require(not strict or frozen, "Source files must match HEAD before a heavy reference/browser run; commit the prepared sources first")
    return {"sourceCommit": commit, "sourceSHA256": hashes, "allSourcesAtHead": frozen}


def private_directory(value):
    path = Path(value).resolve()
    require(path.is_relative_to(Path("/tmp")) and path != Path("/tmp"), "Private numerical references must use a dedicated /tmp subdirectory")
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_query(np, spec):
    shape = spec["shape"]
    h = np.arange(shape["heads"], dtype=np.int32)[:, None, None]
    r = np.arange(shape["queries"], dtype=np.int32)[None, :, None]
    d = np.arange(shape["headDim"], dtype=np.int32)[None, None, :]
    return np.ascontiguousarray(((h * 7 + r * 3 + d * 5) % 29 - 14).astype(np.float32) / np.float32(64), dtype="<f4")


def generate_key_value(np, spec, offset, count):
    shape = spec["shape"]
    require(0 <= offset < shape["keys"] and 1 <= count <= 256 and offset + count <= shape["keys"], "Exact logical generator range required")
    h = np.arange(shape["heads"], dtype=np.int32)[:, None, None]
    key = np.arange(offset, offset + count, dtype=np.int32)[None, :, None]
    d = np.arange(shape["headDim"], dtype=np.int32)[None, None, :]
    k = ((h * 11 + key * 7 + d * 3) % 31 - 15).astype(np.float32) / np.float32(64)
    k += ((key // 256) % 11 - 5).astype(np.float32) / np.float32(128)
    v = np.float32(1 / 8) + ((h * 13 + key * 5 + d * 7) % 37).astype(np.float32) / np.float32(256)
    if offset + count == shape["keys"]:
        v[:, -1, :] = np.float32(2048) + ((h[:, 0, :] * 3 + d[:, 0, :]) % 17).astype(np.float32) / np.float32(16)
    return np.ascontiguousarray(k, dtype="<f4"), np.ascontiguousarray(v, dtype="<f4")


def self_test(spec):
    import numpy as np
    q = generate_query(np, spec)
    k, v = generate_key_value(np, spec, 65513, 7)
    require(q.shape == (40, 128, 128) and k.shape == v.shape == (40, 7, 128), "Generator shapes")
    for h, r, d in [(0, 0, 0), (39, 127, 127), (13, 45, 61)]:
        require(q[h, r, d] == ((h * 7 + r * 3 + d * 5) % 29 - 14) / 64, "Independent scalar query formula")
    for h, r, d in [(0, 0, 0), (39, 6, 127), (13, 3, 61)]:
        key = 65513 + r
        require(k[h, r, d] == ((h * 11 + key * 7 + d * 3) % 31 - 15) / 64 + ((key // 256) % 11 - 5) / 128, "Independent scalar key formula")
        expected = 2048 + (h * 3 + d) % 17 / 16 if key == 65519 else 1 / 8 + (h * 13 + key * 5 + d * 7) % 37 / 256
        require(v[h, r, d] == expected, "Independent scalar value/sentinel formula")
    counts = [min(256, 65520 - offset) for offset in range(0, 65520, 256)]
    require(len(counts) == 256 and sum(counts) == 65520 and counts[-1] == 240, "All-key exact tail coverage")
    require(float(np.float32(1 / np.sqrt(128.0))) == spec["reference"]["scale"], "Declared F32 scale")
    return {"passed": True, "numpyVersion": np.__version__, "generatorQuerySHA256": hashlib.sha256(q.tobytes()).hexdigest(), "tiles": len(counts), "keysConsumed": sum(counts), "tailKeys": counts[-1], "heavyReferenceRun": False}


def make_reference(args, spec):
    require(os.environ.get("OPENBLAS_NUM_THREADS") == "4", "Set OPENBLAS_NUM_THREADS=4 on this reference command")
    source = source_evidence(spec)
    import numpy as np
    private = private_directory(args.private_dir)
    shape = spec["shape"]
    heads, queries, total_keys, dimension = (shape[name] for name in ("heads", "queries", "keys", "headDim"))
    q = generate_query(np, spec)
    q64 = q.astype(np.float64)
    maximum = np.full((heads, queries), -float(np.finfo(np.float32).max), dtype=np.float64)
    denominator = np.zeros_like(maximum)
    context = np.zeros((heads, queries, dimension), dtype=np.float64)
    hashes = {name: hashlib.sha256() for name in ("q", "k", "v")}
    hashes["q"].update(q.tobytes())
    scale, keys_consumed, tiles = spec["reference"]["scale"], 0, 0
    began = time.perf_counter()
    last_probability = last_value = None
    for offset in range(0, total_keys, 256):
        count = min(256, total_keys - offset)
        k, v = generate_key_value(np, spec, offset, count)
        hashes["k"].update(k.tobytes())
        hashes["v"].update(v.tobytes())
        scores = np.matmul(q64, np.swapaxes(k.astype(np.float64), 1, 2))
        scores *= scale
        next_max = np.maximum(maximum, np.max(scores, axis=2))
        alpha = np.exp(maximum - next_max)
        scores -= next_max[:, :, None]
        np.exp(scores, out=scores)
        denominator *= alpha
        denominator += np.sum(scores, axis=2)
        context *= alpha[:, :, None]
        context += np.matmul(scores, v.astype(np.float64))
        maximum = next_max
        keys_consumed += count
        tiles += 1
        if keys_consumed == total_keys:
            last_probability, last_value = scores[:, :, -1].copy(), v[:, -1, :].astype(np.float64)
        if tiles == 1 or tiles % 16 == 0 or keys_consumed == total_keys:
            print(json.dumps({"phase": "reference", "tiles": tiles, "keysConsumed": keys_consumed, "totalKeys": total_keys, "lastCount": count, "elapsedSeconds": time.perf_counter() - began}), flush=True)
    require(keys_consumed == 65520 and tiles == 256 and count == 240, "Reference must process all 65520 keys including tail240")
    normalized = context / denominator[:, :, None]
    without_last = (context - last_probability[:, :, None] * last_value[:, None, :]) / (denominator - last_probability)[:, :, None]
    sentinel_effect = np.abs(normalized - without_last)
    minimum_effect = float(np.min(sentinel_effect))
    require(minimum_effect > spec["reference"]["sentinelMinimumAbsoluteNormalizedEffect"], "Final-key sentinel must detect a dropped last key at the preset output gate")
    sentinel_gate = spec["gate"]["absolute"] + spec["gate"]["relative"] * np.abs(normalized)
    require(bool(np.all(sentinel_effect > sentinel_gate)), "Every normalized sentinel effect must exceed its exact preset gate")
    require(source_evidence(spec)["sourceSHA256"] == source["sourceSHA256"], "Frozen source content changed during reference computation")
    arrays = {"max": maximum, "denominator": denominator, "context": context, "output": normalized}
    descriptions = {}
    for name, array in arrays.items():
        require(bool(np.all(np.isfinite(array))), "Nonfinite reference " + name)
        path = private / (name + ".f64")
        array.astype("<f8", copy=False).tofile(path)
        descriptions[name] = {"file": path.name, "dtype": "float64-le", "shape": list(array.shape), "elements": int(array.size), "bytes": path.stat().st_size, "sha256": sha_file(path), "minimum": float(np.min(array)), "maximum": float(np.max(array))}
    metadata = {"schemaVersion": spec["schemaVersion"], "scope": spec["scope"], "modelInference": False, "productionQKV": False, "shape": shape, "contractSHA256": sha_file(CONTRACT_PATH), **source, "sourcesVerifiedAfterRun": True, "numpyVersion": np.__version__, "referenceArithmetic": spec["reference"]["compute"], "scale": scale, "openblasNumThreads": os.environ["OPENBLAS_NUM_THREADS"], "keysConsumed": keys_consumed, "tiles": tiles, "tailKeys": count, "phantomKeys": 0, "inputSHA256": {name: digest.hexdigest() for name, digest in hashes.items()}, "arrays": descriptions, "gate": spec["gate"], "sentinel": {"globalKey": 65519, "minimumAbsoluteNormalizedEffect": minimum_effect, "maximumAbsoluteNormalizedEffect": float(np.max(sentinel_effect)), "minimumRequiredEffect": spec["reference"]["sentinelMinimumAbsoluteNormalizedEffect"], "allElementsExceedPresetGate": True, "minimumPresetGateMargin": float(np.min(sentinel_effect - sentinel_gate))}, "elapsedSeconds": time.perf_counter() - began, "maximumResidentBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024, "denseSequenceScoreAllocated": False, "maximumLogicalScoreElements": heads * queries * 256, "privatePayloadBytes": sum(value["bytes"] for value in descriptions.values())}
    write_json(private / "manifest.json", metadata)
    write_json(Path(args.public_meta), metadata)
    print(json.dumps({"phase": "reference-complete", "publicMetadata": str(args.public_meta), "metadataSHA256": sha_file(private / "manifest.json"), "privatePayloadBytes": metadata["privatePayloadBytes"], "elapsedSeconds": metadata["elapsedSeconds"], "maximumResidentBytes": metadata["maximumResidentBytes"]}), flush=True)


def run_browser(args, spec):
    source = source_evidence(spec)
    private = private_directory(args.private_dir)
    manifest_path = private / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    require(manifest["contractSHA256"] == sha_file(CONTRACT_PATH) and manifest["sourceSHA256"] == source["sourceSHA256"], "Private reference must match every frozen source")
    for name, description in manifest["arrays"].items():
        path = private / (name + ".f64")
        require(path.stat().st_size == description["bytes"] and sha_file(path) == description["sha256"], "Private reference byte/hash mismatch: " + name)
    # Serve the exact verified bytes, even if another agent edits a file while
    # Chromium is running. Never reread mutable operator/diagnostic sources.
    frozen_payloads = {"/" + name: (ROOT / name).read_bytes() for name in spec["sourcePaths"]}
    for name, payload in frozen_payloads.items():
        require(hashlib.sha256(payload).hexdigest() == source["sourceSHA256"][name.lstrip("/")], "Source changed while capturing browser payloads: " + name)
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass

        def do_GET(self):
            if self.path == "/":
                payload, mime = b"<!doctype html><meta charset=utf-8><title>Long attention diagnostic</title>", "text/html"
            elif self.path.startswith("/__reference/") and self.path.removeprefix("/__reference/") in {name + ".f64" for name in spec["gate"]["arrays"]}:
                payload, mime = (private / self.path.removeprefix("/__reference/")).read_bytes(), "application/octet-stream"
            elif self.path in frozen_payloads:
                path = ROOT / self.path.lstrip("/")
                payload = frozen_payloads[self.path]
                mime = "application/wasm" if path.suffix == ".wasm" else "application/json" if path.suffix == ".json" else "text/javascript"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--disable-dev-shm-usage", "--js-flags=--max-old-space-size=1024"])
            try:
                page = browser.new_page()
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.expose_function("__longAttentionProgress", lambda progress: print(json.dumps({"phase": "browser", **progress}), flush=True))
                page.goto("http://127.0.0.1:" + str(server.server_port) + "/")
                module = "/" + str((HERE / "browser-cases.mjs").relative_to(ROOT))
                result = page.evaluate("""async input => {try {const api=await import(input.module);return await api.runLongAttention({...input,onProgress:p=>globalThis.__longAttentionProgress(p)});}catch(error){return {passed:false,error:String(error.stack||error)};}}""", {"module": module, "manifest": manifest, "referenceMetadataSHA256": sha_file(manifest_path), **source})
                require(source_evidence(spec)["sourceSHA256"] == source["sourceSHA256"], "Frozen source content changed during browser execution")
                report = {"browserVersion": browser.version, "pageErrors": errors, "sourcesVerifiedAfterRun": True, "sourcesServedFromVerifiedSnapshot": True, **result}
                write_json(Path(args.report), report)
                print(json.dumps({"phase": "browser-complete", "passed": report.get("passed", False), "report": str(args.report), "error": report.get("error")}), flush=True)
                require(report.get("passed") and not errors, "Long-attention browser gate failed; inspect the saved report")
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("prepare", help="Report source hashes and frozen status; no numerical workload")
    commands.add_parser("self-test", help="Small coordinate-generator/tail checks; no MatMul/browser workload")
    reference = commands.add_parser("reference", help="Compute all-key F64 reference after source freeze")
    reference.add_argument("--private-dir", required=True)
    reference.add_argument("--public-meta", required=True)
    browser = commands.add_parser("browser", help="Run all256 actual ORT tiles against a matching private reference")
    browser.add_argument("--private-dir", required=True)
    browser.add_argument("--report", required=True)
    args = parser.parse_args()
    spec = contract()
    if args.command == "prepare":
        print(json.dumps({"contractSHA256": sha_file(CONTRACT_PATH), **source_evidence(spec, strict=False), "heavyWorkStarted": False}, sort_keys=True, indent=2))
    elif args.command == "self-test":
        print(json.dumps(self_test(spec), sort_keys=True))
    elif args.command == "reference":
        make_reference(args, spec)
    else:
        run_browser(args, spec)


if __name__ == "__main__":
    main()
