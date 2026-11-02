"""Actual HIGH/LOW final-head and full-target sequence diagnostics."""
import argparse
import hashlib
import http.server
import json
import subprocess
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[4]
DOCS = ROOT / "docs"
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--models", type=Path, default=ROOT.parent / "retained/bernini")
args = parser.parse_args()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *values, **options):
        super().__init__(*values, directory=str(DOCS), **options)

    def log_message(self, *values):
        pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium", headless=True,
            args=["--disable-dev-shm-usage"],
        )
        try:
            page = browser.new_page()
            page.set_default_timeout(180000)
            page.goto(f"http://127.0.0.1:{server.server_port}/")
            page.set_content('<input id="LOW" type="file"><input id="HIGH" type="file">')
            page.locator("#LOW").set_input_files(str(args.models / "Bernini_LOW_fp8_e4m3fn_scaled.safetensors"))
            page.locator("#HIGH").set_input_files(str(args.models / "Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors"))
            result = page.evaluate("""async () => {
                const head = await import('/shared/diffusion-models/execution/model-head-browser.mjs');
                const sequence = await import('/shared/diffusion-models/execution/model-sequence-browser.mjs');
                return {
                    head: await head.runModelHeadBrowser({
                        LOW: document.querySelector('#LOW').files[0],
                        HIGH: document.querySelector('#HIGH').files[0]
                    }),
                    sequence: sequence.runModelSequenceBrowser()
                };
            }""")
            result["chromiumVersion"] = browser.version
        finally:
            browser.close()
finally:
    server.shutdown()

result["passed"] = result["head"]["passed"] and result["sequence"]["passed"]
result["sourceCommit"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
result["workingTreeDirtyAtRun"] = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())
files = [
    Path(__file__), Path(__file__).with_suffix(".mjs"),
    Path(__file__).with_name("model-head.mjs"),
    Path(__file__).with_name("model-sequence.mjs"),
    Path(__file__).with_name("model-sequence-browser.mjs"),
    Path(__file__).with_name("model-weights.mjs"),
    Path(__file__).with_name("model-math.mjs"),
    Path(__file__).with_name("model-math") / "kernel.wasm",
    Path(__file__).with_name("model-math") / "registry.mjs",
    Path(__file__).with_name("batched-ops.mjs"),
    Path(__file__).with_name("batched-attention-graph.mjs"),
    DOCS / "shared/ai-connection/workflow-shapes.mjs",
    DOCS / "shared/diffusion-models/ort-bridge/block-hidden/graph.mjs",
    DOCS / "shared/diffusion-models/ort-bridge/hike.mjs",
    DOCS / "shared/diffusion-models/ort-bridge/kernel/bridge.wasm",
    DOCS / "shared/diffusion-models/api/safetensors.mjs",
    DOCS / "shared/diffusion-models/lora/targets.mjs",
    DOCS / "shared/inference/vendor/ort.wasm.min.mjs",
    DOCS / "shared/inference/vendor/ort-wasm-simd-threaded.wasm",
]
result["sourceSHA256"] = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
args.output.parent.mkdir(parents=True, exist_ok=True)
with args.output.open("x") as output:
    output.write(json.dumps(result, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "output": str(args.output), "models": len(result["head"]["models"]), "comparedHeadElements": result["head"]["comparedElements"], "sequence": result["sequence"]}))
