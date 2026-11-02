"""Source-pinned actual N5 browser diagnostics; private values never enter Git.

This program prepares/runs actual NN work only when invoked explicitly. Require
a committed, unchanged runtime; supply the retained model through a browser File
input, never through a server read of the complete model.
"""
import argparse
import hashlib
import http.server
import json
import math
import os
import re
import shutil
import stat
import subprocess
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
DOCS = ROOT / "docs"
FIXTURE_SHA256 = "a30177ba13a922f29b8d9664ff1b24bc68d6a1e308c95e3a6faf23f402751d3c"
EXECUTION = "docs/shared/diffusion-models/execution/"
SOURCE_FILES = [
    EXECUTION + name for name in [
        "model-candidate-browser.py", "model-candidate-browser.mjs",
        "model-candidate.mjs", "model-weights.mjs", "model-decode.mjs",
        "model-math.mjs", "model-sequence.mjs", "model-head.mjs",
        "batched-ops.mjs", "batched-attention-graph.mjs",
        "model-decode/registry.mjs", "model-decode/model-decode.wasm",
        "model-math/registry.mjs", "model-math/kernel.wasm",
    ]
] + [
    "docs/shared/diffusion-models/" + name for name in [
        "ort-bridge/hike.mjs", "ort-bridge/kernel/registry.mjs",
        "ort-bridge/kernel/bridge.wasm", "ort-bridge/block-hidden/graph.mjs",
        "ort-bridge/qkv/ownership.mjs", "ort-bridge/post-self-attention/conditioning.mjs",
        "api/safetensors.mjs", "lora/targets.mjs", "lora/weights.mjs", "lora/strict-json.mjs",
    ]
] + [
    "docs/shared/ai-connection/workflow-shapes.mjs", "docs/shared/vr180/sha256.mjs",
    "docs/shared/inference/vendor/ort.wasm.min.mjs",
    "docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs",
    "docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm",
    "tools/diffusion-models/standalone-reference.py",
    "development/ai-connection/standalone-d1-d4-20261102/reference/contract.json",
]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def source_guard(commit, previous=None):
    require(bool(re.fullmatch(r"[0-9a-f]{40}", commit)), "Exact source commit SHA required")
    require(git("rev-parse", "HEAD").decode().strip() == commit, "HEAD differs from requested source commit")
    identities = {}
    for relative in SOURCE_FILES:
        git("ls-files", "--error-unmatch", "--", relative)
        actual = (ROOT / relative).read_bytes()
        committed = git("show", f"{commit}:{relative}")
        require(actual == committed, f"Runtime source is uncommitted or changed: {relative}")
        identities[relative] = sha(actual)
    if previous is not None:
        require(identities == previous, "Runtime bytes changed during native execution")
    return identities


def stat_identity(path):
    value = path.stat()
    return {key: getattr(value, key) for key in ["st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns"]}


def private_path(value, label):
    path = value.resolve()
    require(not path.is_relative_to(ROOT), f"{label} must be outside the repository")
    private_root = ROOT.parent / "diffusion-private-hidden"
    temp_root = Path(tempfile.gettempdir()).resolve()
    permitted = path.is_relative_to(private_root) and path != private_root
    permitted = permitted or path.is_relative_to(temp_root) and len(path.relative_to(temp_root).parts) >= 2
    require(permitted, f"{label} must use diffusion-private-hidden or a dedicated temporary subdirectory")
    require(not any((parent / ".git").exists() for parent in path.parents), f"{label} cannot be inside any Git checkout")
    return path


def private_parent(path, create=False):
    if create:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    status = path.parent.stat()
    require(status.st_uid == os.getuid() and stat.S_IMODE(status.st_mode) == 0o700, "Private parent must be owned by this user with mode0700")


def write_json(path, value, private=False):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700 if private else 0o755)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private else 0o644)
    with os.fdopen(descriptor, "w") as output:
        json.dump(value, output, separators=(",", ":") if private else None, indent=None if private else 2, allow_nan=False)
        output.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--contract", type=Path, default=ROOT / "development/ai-connection/standalone-d1-d4-20261102/reference/contract.json")
    parser.add_argument("--core", type=Path, default=ROOT.parent / "diffusion-investigation/model-architecture/comfy_ldm_wan_model.py")
    parser.add_argument("--private-output", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Metrics and identities only")
    parser.add_argument("--model", type=Path)
    parser.add_argument("--models", type=Path, default=ROOT.parent / "retained/bernini")
    parser.add_argument("--side", choices=["LOW", "HIGH"], default="LOW")
    parser.add_argument("--chromium", default=shutil.which("chromium") or "/usr/bin/chromium")
    parser.add_argument("--timeout-seconds", type=float, default=3600)
    parser.add_argument("--stop-after-block", type=int, choices=range(40))
    parser.add_argument("--stop-after-prefix", action="store_true")
    parser.add_argument("--check-only", action="store_true", help="Verify committed sources, fixture, contract and model stat; perform no NN work")
    args = parser.parse_args()
    require(args.timeout_seconds > 0 and math.isfinite(args.timeout_seconds), "Positive timeout required")
    require(not (args.stop_after_prefix and args.stop_after_block is not None), "Choose one cancellation probe")
    fixture = private_path(args.fixture, "Private fixture")
    private_output = private_path(args.private_output, "Private candidate output")
    require(not private_output.exists() and not args.output.exists(), "Outputs must not already exist")
    trace_dir = private_output.with_name(private_output.name + ".traces")
    require(not trace_dir.exists(), "Private trace directory must not already exist")
    metrics_output = args.output.resolve()
    progress_output = metrics_output.with_name(metrics_output.name + ".progress.jsonl")
    require(len({private_output, trace_dir, metrics_output, progress_output}) == 4 and not metrics_output.is_relative_to(trace_dir) and not progress_output.is_relative_to(trace_dir), "Private and public output namespaces must be distinct")
    require(not progress_output.exists(), "Progress output must not already exist")
    private_parent(fixture)
    private_parent(private_output, create=True)
    fixture_bytes = fixture.read_bytes()
    require(sha(fixture_bytes) == FIXTURE_SHA256, "Private fixture differs from fixed pre-execution bytes")
    contract_bytes = args.contract.read_bytes()
    contract = json.loads(contract_bytes)
    require(contract["fixtureSHA256"] == FIXTURE_SHA256 and len(contract["traceShapes"]) == 47, "Fixed controlled-N5 contract required")
    require(sha(args.core.read_bytes()) == contract["coreSourceSHA256"], "Pinned core source differs from pre-execution contract")
    model = (args.model or args.models / contract["models"][args.side]["fileName"]).resolve()
    model_before = stat_identity(model)
    require(model_before["st_size"] == contract["models"][args.side]["bytes"], "Original model size differs from frozen contract")
    source_hashes = source_guard(args.source_commit)
    committed_contract = git("show", args.source_commit + ":development/ai-connection/standalone-d1-d4-20261102/reference/contract.json")
    require(contract_bytes == committed_contract, "Supplied contract differs from the committed pre-execution contract")
    base = {"sourceCommit": args.source_commit, "sourceSHA256": source_hashes, "fixtureSHA256": FIXTURE_SHA256, "contractSHA256": sha(contract_bytes), "side": args.side, "modelStatBefore": model_before, "fullModelFileReadByServer": False, "sourceFullFileHashRecomputed": False, "privateValuesPublished": False}
    if args.check_only:
        print(json.dumps({"checkOnly": True, "passed": True, "guardedSources": len(source_hashes), "fixtureSHA256": FIXTURE_SHA256, "sourceCommit": args.source_commit, "nativeNNExecuted": False}))
        return
    # Import only after the source guard and optional no-NN check have passed.
    from playwright.sync_api import sync_playwright

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *values, **options):
            super().__init__(*values, directory=str(DOCS), **options)

        def log_message(self, *values):
            pass

        def do_GET(self):
            if self.path == "/":
                payload = b'<!doctype html><meta charset="utf-8"><title>Private native diagnostic host</title>'
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            else:
                super().do_GET()

    checkpoints = []
    traces = {}
    trace_dir.mkdir(parents=True, mode=0o700)
    os.chmod(trace_dir, 0o700)
    checkpoint_path = args.output.with_name(args.output.name + ".progress.jsonl")
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_fd = os.open(checkpoint_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    started = time.perf_counter()

    def receive_checkpoint(_source, event):
        checkpoints.append(event)
        with os.fdopen(os.dup(checkpoint_fd), "w") as output:
            output.write(json.dumps(event, separators=(",", ":"), allow_nan=False) + "\n")
            output.flush()
        if event.get("stage") in ("prepared", "block-complete", "terminal"):
            print(json.dumps({key: event.get(key) for key in ["stage", "block", "elapsedMs", "sourceDecodeCalls", "sourcePayloadReadBytes", "sourceDecodedF32Bytes", "outcome"]}), flush=True)

    def receive_trace(_source, trace):
        name = trace["name"]
        require(name in contract["traceShapes"] and name not in traces, "Unexpected or duplicate private trace")
        require(trace["shape"] == contract["traceShapes"][name], "Private trace shape differs from frozen contract")
        require(len(trace["data"]) == math.prod(trace["shape"]) and all(math.isfinite(value) for value in trace["data"]), "Private trace must contain exact finite values")
        path = trace_dir / (name + ".json")
        write_json(path, {"shape": trace["shape"], "data": trace["data"]}, private=True)
        traces[name] = path

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    result = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.chromium, headless=True, args=["--disable-dev-shm-usage"])
            try:
                page = browser.new_page()
                page.expose_binding("privateCandidateTrace", receive_trace)
                page.expose_binding("candidateCheckpoint", receive_checkpoint)
                page.goto(f"http://127.0.0.1:{server.server_port}/")
                page.set_content('<input id="model" type="file"><input id="fixture" type="file">')
                page.locator("#model").set_input_files(str(model))
                page.locator("#fixture").set_input_files(str(fixture))
                result = page.evaluate("""async options => {
                    const {runModelCandidateBrowser} = await import('/shared/diffusion-models/execution/model-candidate-browser.mjs');
                    return runModelCandidateBrowser({
                        ...options, file:document.querySelector('#model').files[0],
                        fixtureFile:document.querySelector('#fixture').files[0],
                        deliverTrace:window.privateCandidateTrace,
                        checkpoint:window.candidateCheckpoint
                    });
                }""", {"side": args.side, "contract": contract, "contractSHA256": sha(contract_bytes), "stopAfterBlock": args.stop_after_block, "stopAfterPrefix": args.stop_after_prefix, "timeoutMs": args.timeout_seconds * 1000})
                result["chromiumVersion"] = browser.version
            finally:
                browser.close()
    except Exception as caught:
        result = {"schemaVersion": "bernini-model-candidate-browser/0.1", "outcome": "browser-failed", "nativeFull40ControlledCaseExecuted": False, "acceptedProduction": False, "generationReady": False, "side": args.side, "fixtureSHA256": FIXTURE_SHA256, "contractSHA256": sha(contract_bytes), "coreSourceSHA256": contract["coreSourceSHA256"], "previouslyVerifiedModelSHA256": contract["models"][args.side]["previouslyVerifiedModelSHA256"], "headerSHA256": contract["models"][args.side]["headerSHA256"], "error": {"name": type(caught).__name__, "message": str(caught)[:1000]}, "traceCount": len(traces), "events": checkpoints}
    finally:
        server.shutdown()
        os.close(checkpoint_fd)
    model_after = stat_identity(model)
    require(model_before == model_after, "Retained original model stat changed during native execution")
    source_guard(args.source_commit, source_hashes)
    require(sha(fixture.read_bytes()) == FIXTURE_SHA256 and sha(args.contract.read_bytes()) == sha(contract_bytes), "Fixture or contract changed during native execution")
    require(sha(args.core.read_bytes()) == contract["coreSourceSHA256"], "Pinned core source changed during native execution")
    bindings = {key: result[key] for key in ["side", "fixtureSHA256", "contractSHA256", "coreSourceSHA256", "previouslyVerifiedModelSHA256", "headerSHA256"]}
    complete = result["outcome"] == "completed"
    if complete:
        require(set(traces) == set(contract["traceShapes"]), "All47 native arrays required")
    private = {"schemaVersion": "bernini-model-candidate-private-traces/0.1", **bindings, "acceptedProduction": False, "nativeFull40ControlledCaseExecuted": complete, "arrays": {name: json.loads(path.read_text()) for name, path in traces.items()}}
    write_json(private_output, private, private=True)
    receipt = {**base, **result, "modelStatAfter": model_after, "sourceStatStableDuringReads": True, "runtimeSourcesUnchanged": True, "privateCandidateSHA256": sha(private_output.read_bytes()), "privateCandidateBytes": private_output.stat().st_size, "hostElapsedSeconds": time.perf_counter() - started, "scope": contract["scope"]}
    write_json(args.output, receipt)
    print(json.dumps({"outcome": result["outcome"], "metricsOutput": str(args.output), "traceCount": len(traces), "nativeFull40ControlledCaseExecuted": complete, "acceptedProduction": False, "required81FrameWorkflowVerified": False}), flush=True)


if __name__ == "__main__":
    main()
