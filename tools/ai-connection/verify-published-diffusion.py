#!/usr/bin/env python3
"""Exercise the published Diffusion panel with local Files and real downloads.

The default run performs no model inference. --sample adds one cancelled sample
and one completed sample. No application API is called outside the public UI.
Requires Python Playwright and Chromium. Outputs remain in a new private folder.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
import traceback
import urllib.error
import urllib.request
from urllib.parse import urlsplit


PUBLIC_ORIGIN = "https://kushyameln01.github.io"
PUBLIC_PREFIX = "/kushyameln-works/"
DEFAULT_URL = PUBLIC_ORIGIN + PUBLIC_PREFIX + "ai-connection/"
RAW_MEANING = "wan21-raw-generated-sample:v1"
RAW_FILENAME = "diffusion-raw-generated-sample.wktensor"
SEMANTIC_KEYS = (
    "dtype", "shape", "layout", "meaning", "normalization", "latentContract",
    "modelSha256", "tokenizerSha256", "attentionMask", "payloadByteLength",
)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def permitted_url(url):
    parts = urlsplit(url)
    return (parts.scheme == "https" and parts.netloc == "kushyameln01.github.io"
            and parts.path.startswith(PUBLIC_PREFIX))


class PublicRedirectsOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if not permitted_url(new_url):
            raise urllib.error.URLError("Remote redirect left the permitted public origin/path")
        return super().redirect_request(request, response, code, message, headers, new_url)


def file_info(path, include_hash=False):
    result = {"name": path.name, "byte_length": path.stat().st_size}
    if include_hash:
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        result["sha256"] = digest.hexdigest()
    return result


def semantic_metadata(metadata):
    return {key: metadata[key] for key in SEMANTIC_KEYS if key in metadata}


def assert_raw(metadata, expected_shape=None):
    require(metadata.get("meaning") == RAW_MEANING, "Displayed result is not a raw generated sample")
    require(metadata.get("dtype") == "float32", "Raw sample dtype is not float32")
    require(metadata.get("layout") == "NCTHW", "Raw sample layout is not NCTHW")
    shape = metadata.get("shape")
    require(isinstance(shape, list) and len(shape) == 5
            and all(isinstance(value, int) and value > 0 for value in shape),
            "Displayed raw shape is invalid")
    if expected_shape is not None:
        require(shape == expected_shape, "Raw sample shape differs from the UI shape plan")
    contract = metadata.get("latentContract", {})
    require(contract.get("representation") == "generated-sample" and contract.get("space") == "raw",
            "Displayed generated-sample/raw contract is missing")
    normalization = contract.get("normalization", {})
    require(normalization.get("state") == "restored"
            and normalization.get("owner") == "diffusion_models"
            and normalization.get("id") == "wan21-comfy-f32-v1",
            "Displayed raw sample does not carry the restored Diffusion normalization contract")


class Verification:
    def __init__(self, args, output):
        self.args, self.output = args, output
        self.started = time.monotonic()
        self.page = None
        self.last_checkpoint = 0.0
        self.worker_serial = 0
        self.report = {
            "status": "running", "stage": "startup", "public_url": args.url,
            "mode": "sample" if args.sample else "model-free",
            "network_adapter": "TLS-verified remote HTTP responses fulfilled into public origin",
            "all_tls_verified": True, "local_content_served": False,
            "application_api_calls_outside_ui": False, "application_source_injected": False,
            "private_file_http_uploads": False,
            "scope": "Public UI File/settings/read/save/dispose/restart; optional cancel and one raw sample. No VAE decode or LoRA validation.",
            "checks": [], "network_requests": [], "blocked_requests": [],
            "network_errors": [], "workers": [], "page_errors": [],
        }
        # Default TLS trust and inherited proxy settings are retained. No local
        # content, TLS bypass, certificate installation, or response rewriting.
        self.remote = urllib.request.build_opener(PublicRedirectsOnly())

    def write_report(self):
        self.report["elapsed_seconds"] = round(time.monotonic() - self.started, 3)
        path = self.output / "verification.json"
        temporary = self.output / "verification.json.tmp"
        temporary.write_text(json.dumps(self.report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def checkpoint(self, event, snapshot=None):
        item = {"event": event, "stage": self.report["stage"],
                "elapsed_seconds": round(time.monotonic() - self.started, 1)}
        if snapshot:
            item.update(snapshot)
        print(json.dumps(item, ensure_ascii=False), flush=True)
        self.last_checkpoint = time.monotonic()

    def stage(self, name):
        self.report["stage"] = name
        self.write_report()
        self.checkpoint("stage")

    def checked(self, name, details):
        self.report["checks"].append({"name": name, "passed": True, "details": details})
        self.write_report()
        self.checkpoint("check-passed", {"check": name})

    def route(self, route):
        request = route.request
        # data:/blob: resources are browser-local, not HTTP destinations.
        if urlsplit(request.url).scheme in ("data", "blob"):
            route.continue_()
            return
        if request.method != "GET" or not permitted_url(request.url):
            self.report["blocked_requests"].append({"url": request.url, "method": request.method})
            route.abort("blockedbyclient")
            return
        try:
            remote_request = urllib.request.Request(request.url, headers={"Accept-Encoding": "identity"})
            try:
                response = self.remote.open(remote_request, timeout=60)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                require(permitted_url(response.geturl()), "Remote HTTP response left the public origin/path")
                body = response.read()
                headers = {key: value for key, value in response.headers.items()
                           if key.lower() not in ("content-length", "transfer-encoding", "connection")}
                self.report["network_requests"].append({
                    "url": request.url, "status": response.status,
                    "byte_length": len(body), "tls_verified": True,
                })
                route.fulfill(status=response.status, headers=headers, body=body)
        except Exception as error:
            self.report["network_errors"].append({"url": request.url, "error": str(error)})
            route.abort("failed")

    def worker_opened(self, worker):
        self.worker_serial += 1
        record = {"id": self.worker_serial, "url": worker.url,
                  "opened_seconds": round(time.monotonic() - self.started, 3), "closed_seconds": None}
        self.report["workers"].append(record)
        worker.on("close", lambda _worker: record.update(closed_seconds=round(time.monotonic() - self.started, 3)))

    def model_workers(self):
        return [worker for worker in self.report["workers"]
                if "/diffusion-models/api/worker.mjs" in worker["url"] and worker["closed_seconds"] is None]

    def snapshot(self):
        return {
            "state": self.page.locator("#df-status").get_attribute("data-state"),
            "status_text": self.page.locator("#df-status").inner_text(),
            "progress_text": self.page.locator("#df-progress-text").inner_text(),
            "progress_value": self.page.locator("#df-progress").get_attribute("value"),
        }

    def json_ui(self, selector):
        return json.loads(self.page.locator(selector).inner_text())

    def capture_failure_ui(self):
        if self.page is None:
            return
        try:
            self.report["failure_ui"] = self.snapshot()
            self.report["failure_error_details"] = self.page.locator("#df-error-details").inner_text()
            self.page.screenshot(path=str(self.output / "failure.png"), full_page=True, timeout=10000)
        except Exception:
            pass

    def wait(self, predicate, timeout=None, allow_error=False):
        deadline = time.monotonic() + (timeout or self.args.timeout)
        last = None
        while time.monotonic() < deadline:
            current = self.snapshot()
            if predicate(current):
                self.checkpoint("ui-ready", current)
                return current
            if current["state"] == "ERROR" and not allow_error:
                raise AssertionError("Public UI error: " + self.page.locator("#df-error-details").inner_text())
            if time.monotonic() - self.last_checkpoint >= 15:
                self.checkpoint("ui-progress" if current != last else "ui-wait", current)
                self.write_report()
            last = current
            self.page.wait_for_timeout(100)
        raise TimeoutError("Timed out waiting for public UI; last state: " + json.dumps(last, ensure_ascii=False))

    def idle(self, state, allow_error=False):
        return self.wait(lambda current: current["state"] == state
                         and self.page.locator("#df-panel").get_attribute("aria-busy") == "false",
                         allow_error=allow_error)

    def read_file(self, path):
        self.page.locator("#df-reuse-file").set_input_files(str(path))
        self.page.locator("#df-read").click()
        self.idle("COMPLETE")
        return self.json_ui("#df-result-metadata")

    def download(self, name):
        with self.page.expect_download(timeout=self.args.timeout * 1000) as pending:
            self.page.locator("#df-save").click()
        download = pending.value
        require(download.suggested_filename == RAW_FILENAME, "Public UI chose an unexpected raw-sample filename")
        target = self.output / name
        download.save_as(str(target))
        require(download.failure() is None, "Browser download failed")
        self.idle("COMPLETE")
        info = file_info(target, include_hash=True)
        info["suggested_filename"] = download.suggested_filename
        require(info["byte_length"] > 0, "Browser download is empty")
        require(info["sha256"] in self.page.locator("#df-saved-state").inner_text(),
                "Actual download SHA-256 differs from the displayed save receipt")
        return target, info

    def settings(self):
        self.stage("public-ui-settings")
        fields = ("width", "height", "frames")
        owner_defaults = {key: self.page.locator("#df-" + key).input_value() for key in fields}
        selected = {key: str(getattr(self.args, key) or owner_defaults[key]) for key in fields}
        for key in fields:
            self.page.locator("#df-" + key).fill(selected[key])
        self.page.locator("#df-threads").select_option("1")
        expected = "要求サイズ {width} × {height} / {frames} フレーム".format(**selected)
        self.wait(lambda current: expected in self.page.locator("#df-shape-summary").inner_text())
        # Read browser environment only; all application work uses visible UI.
        environment = self.page.evaluate("({cross_origin_isolated: globalThis.crossOriginIsolated === true, shared_array_buffer: typeof SharedArrayBuffer === 'function'})")
        four_disabled = self.page.locator('#df-threads option[value="4"]').is_disabled()
        if not (environment["cross_origin_isolated"] and environment["shared_array_buffer"]):
            require(four_disabled, "Four threads is enabled without isolation/SharedArrayBuffer")
        require(self.page.locator("#df-threads").input_value() == "1", "One thread was not selected")
        self.checked("settings-and-thread-gate", {
            "owner_defaults": owner_defaults, "selected": selected,
            "fixed_settings": self.page.locator("#df-fixed-settings").inner_text(),
            "shape_summary": self.page.locator("#df-shape-summary").inner_text(),
            "browser_environment": environment, "four_threads_disabled": four_disabled,
        })
        return selected

    def model_free(self):
        self.stage("read-existing-private-raw-file")
        require(self.page.locator("#df-run").is_disabled(), "Run is enabled without loaded models")
        original = self.read_file(self.args.file)
        assert_raw(original)
        self.report["original_raw_metadata"] = original
        self.checked("existing-raw-file-read", {"input": file_info(self.args.file, True), "metadata": original})

        self.stage("save-and-read-browser-download")
        saved, saved_info = self.download("model-free-raw-generated-sample.wktensor")
        restored = self.read_file(saved)
        assert_raw(restored, original["shape"])
        require(semantic_metadata(restored) == semantic_metadata(original), "Raw semantics changed after save/read through UI")
        require(restored.get("file", {}).get("sha256") == saved_info["sha256"], "UI did not read the actual downloaded File")
        self.checked("actual-download-raw-roundtrip", {"download": saved_info, "restored_metadata": restored})

        self.stage("malformed-file-preserves-result")
        malformed = self.output / "malformed-input.wktensor"
        malformed.write_bytes(b"not a WKTENSOR\n")
        before = self.page.locator("#df-result-metadata").inner_text()
        self.page.locator("#df-reuse-file").set_input_files(str(malformed))
        self.page.locator("#df-read").click()
        self.idle("ERROR", allow_error=True)
        details = self.json_ui("#df-error-details")
        require(details.get("code") not in (None, "CANCELLED"), "Malformed File did not produce a validation error")
        require(self.page.locator("#df-result-metadata").inner_text() == before, "Malformed File replaced the previous result")
        require(self.page.locator("#df-save").is_enabled(), "Previous valid result is no longer saveable")
        self.checked("malformed-file-keeps-previous-result", {"error": details, "previous_result_preserved": True})

        self.stage("dispose-and-restart")
        self.page.locator("#df-reuse-file").set_input_files(str(saved))
        retained = self.page.locator("#df-reuse-file").input_value()
        workers = list(self.model_workers())
        require(workers, "No real public dedicated Worker was observed for File operations")
        self.page.locator("#df-dispose").click()
        self.idle("DISPOSED", allow_error=True)
        self.wait(lambda current: all(worker["closed_seconds"] is not None for worker in workers), timeout=30, allow_error=True)
        require(self.page.locator("#df-read").is_disabled() and self.page.locator("#df-restart").is_enabled(),
                "Disposed UI controls are inconsistent")
        self.page.locator("#df-restart").click()
        self.idle("READY")
        require(self.page.locator("#df-reuse-file").input_value() == retained, "Restart lost the selected File")
        restarted = self.read_file(saved)
        assert_raw(restarted, original["shape"])
        require(semantic_metadata(restarted) == semantic_metadata(original), "Restart changed restored raw metadata")
        self.checked("dispose-restart-retains-file", {"closed_worker_ids": [worker["id"] for worker in workers], "metadata": restarted})

    def load_models(self):
        self.page.locator("#df-load").click()
        self.idle("READY")
        technical = self.json_ui("#df-technical")
        model_id = technical.get("load", {}).get("modelSessionId")
        require(isinstance(model_id, str) and model_id, "UI load receipt has no modelSessionId")
        require(self.page.locator("#df-run").is_enabled(), "Run is disabled after model/conditioning selection")
        return model_id, technical

    def sample(self, selected):
        self.stage("select-real-model-and-canonical-conditioning-files")
        for key, path in (("high", self.args.high), ("low", self.args.low), ("positive", self.args.conditioning)):
            self.page.locator("#df-" + key + "-file").set_input_files(str(path))
        self.page.locator("#df-same-positive").check()
        require(self.page.locator("#df-negative-file").is_disabled(), "Explicit same-positive checkbox did not select both conditioning sides")
        for key, value in selected.items():
            self.page.locator("#df-" + key).fill(value)
        self.page.locator("#df-threads").select_option("1")
        retained = {key: self.page.locator("#df-" + key + "-file").input_value() for key in ("high", "low", "positive")}
        self.stage("load-before-cancellation")
        first_id, first_load = self.load_models()
        self.report["first_load"] = first_load

        self.stage("start-real-sample-and-cancel-immediately")
        workers = list(self.model_workers())
        require(workers, "No real model Worker was observed before cancellation")
        self.page.locator("#df-run").click()
        def sample_started(current):
            require(current["state"] not in ("COMPLETE", "CANCELLED"),
                    "Cancellation sample reached a terminal state before the cancel click")
            return current["state"] == "RUNNING" and "Diffusion を実行" in current["status_text"]
        self.wait(sample_started)
        cancel_started = time.monotonic()
        self.page.locator("#df-cancel").click()
        self.idle("CANCELLED", allow_error=True)
        self.wait(lambda current: all(worker["closed_seconds"] is not None for worker in workers), timeout=30, allow_error=True)
        require(self.json_ui("#df-error-details").get("code") == "CANCELLED", "Original sample did not terminate with CANCELLED")
        require(self.page.locator("#df-load").is_enabled(), "Reload is not available after cancellation")
        require(self.page.locator("#df-run").is_disabled(), "Run remained enabled with a terminated model owner")
        for key, value in retained.items():
            require(self.page.locator("#df-" + key + "-file").input_value() == value, "Cancellation lost a selected model/conditioning File")
        self.checked("real-worker-cancellation", {"model_session_id": first_id,
                     "closed_worker_ids": [worker["id"] for worker in workers],
                     "cancellation_seconds": round(time.monotonic() - cancel_started, 3)})

        self.stage("reload-same-files-after-cancellation")
        second_id, second_load = self.load_models()
        require(second_id != first_id, "Reload reused the cancelled modelSessionId")
        require(self.page.locator("#df-same-positive").is_checked(), "Reload lost explicit same-positive selection")
        self.checked("fresh-model-owner-after-cancel", {"previous_model_session_id": first_id, "new_model_session_id": second_id, "load": second_load})

        self.stage("one-complete-real-sample")
        self.page.locator("#df-run").click()
        terminal = self.wait(lambda current: current["state"] in ("COMPLETE", "ERROR", "CANCELLED"), allow_error=True)
        require(terminal["state"] == "COMPLETE", "Real sample failed: " + self.page.locator("#df-error-details").inner_text())
        self.idle("COMPLETE")
        technical = self.json_ui("#df-technical")
        expected_shape = technical.get("shapePlan", {}).get("target", {}).get("initialLatentShape")
        require(isinstance(expected_shape, list), "UI did not expose its target latent shape plan")
        generated = self.json_ui("#df-result-metadata")
        assert_raw(generated, expected_shape)
        conditioning = self.json_ui("#df-conditioning-summary")
        require(conditioning.get("samePositiveFile") is True, "Sample did not use the explicit same positive File")
        require(conditioning.get("positive") == conditioning.get("negative"), "Conditioning sides differ despite explicit same-positive selection")
        require(conditioning.get("positive", {}).get("shape") == [1, 512, 4096], "Canonical conditioning shape was not preserved")
        self.report["sample_metadata"] = generated
        self.report["sample_conditioning_metadata"] = conditioning
        self.report["sample_technical"] = technical
        self.checked("one-completed-raw-sample", {"model_session_id": second_id, "metadata": generated})

        self.stage("save-real-sample-and-read-actual-download")
        saved, info = self.download("sample-raw-generated-sample.wktensor")
        restored = self.read_file(saved)
        assert_raw(restored, expected_shape)
        require(semantic_metadata(restored) == semantic_metadata(generated), "Generated raw semantics changed after the actual download/read")
        require(restored.get("file", {}).get("sha256") == info["sha256"], "Readback did not use the actual sample download")
        self.checked("real-sample-download-roundtrip", {"download": info, "restored_metadata": restored})

    def run(self):
        context = browser = None
        try:
            for key in ("file", "high", "low", "conditioning"):
                path = getattr(self.args, key)
                if path is not None:
                    require(path.is_file(), "Missing local File: " + str(path))
            self.report["inputs"] = {key: file_info(getattr(self.args, key), key in ("file", "conditioning"))
                                     for key in ("file", "high", "low", "conditioning") if getattr(self.args, key) is not None}
            from playwright.sync_api import sync_playwright
            with sync_playwright() as playwright:
                try:
                    options = {"headless": True, "args": ["--disable-dev-shm-usage"]}
                    if self.args.browser:
                        options["executable_path"] = self.args.browser
                    browser = playwright.chromium.launch(**options)
                    context = browser.new_context(accept_downloads=True, service_workers="block")
                    context.route("**/*", self.route)
                    self.page = context.new_page()
                    self.page.set_default_timeout(30000)
                    self.page.on("worker", self.worker_opened)
                    self.page.on("pageerror", lambda error: self.report["page_errors"].append(str(error)[:2000]))
                    self.stage("open-actual-public-page")
                    self.page.goto(self.args.url, wait_until="domcontentloaded", timeout=180000)
                    require(permitted_url(self.page.url), "Browser did not remain at the permitted public URL")
                    self.idle("READY")
                    self.report["actual_public_url"] = self.page.url
                    self.report["initial_technical"] = self.json_ui("#df-technical")
                    selected = self.settings()
                    self.model_free()
                    if self.args.sample:
                        self.sample(selected)
                    require(not self.report["blocked_requests"], "Page attempted a forbidden HTTP method or destination")
                    require(not self.report["network_errors"], "A verified public HTTP request failed")
                    require(not self.report["page_errors"], "Public page emitted an uncaught JavaScript error")
                    require(self.report["network_requests"], "No verified remote public content was loaded")
                    self.report["final_ui"] = self.snapshot()
                    self.report["status"] = "passed"
                    self.stage("complete")
                except Exception:
                    self.capture_failure_ui()
                    raise
                finally:
                    try:
                        if context is not None:
                            context.close()
                    finally:
                        if browser is not None:
                            browser.close()
        except Exception as error:
            self.report["status"] = "failed"
            self.report["error"] = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
            if "failure_ui" not in self.report:
                self.capture_failure_ui()
            self.checkpoint("failed", {"error_type": type(error).__name__, "error": str(error)})
        finally:
            self.write_report()
        return 0 if self.report["status"] == "passed" else 1


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=DEFAULT_URL, help="Actual public panel URL (default: %(default)s)")
    parser.add_argument("--file", required=True, type=Path, help="Existing private raw generated-sample WKTENSOR; never generated by this runner")
    parser.add_argument("--output", required=True, type=Path, help="New private output directory outside every Git checkout")
    parser.add_argument("--sample", action="store_true", help="Also cancel one real sample, reload, then complete exactly one real sample")
    parser.add_argument("--high", type=Path, help="Private HIGH safetensors File, required with --sample")
    parser.add_argument("--low", type=Path, help="Private LOW safetensors File, required with --sample")
    parser.add_argument("--conditioning", type=Path, help="Canonical private text WKTENSOR, used for both sides via the explicit UI checkbox")
    parser.add_argument("--timeout", type=int, default=7200, help="Seconds allowed for each UI operation, including the complete sample (default: %(default)s)")
    parser.add_argument("--width", type=int, help="Explicit public UI output width; default is the UI owner's value")
    parser.add_argument("--height", type=int, help="Explicit public UI output height; default is the UI owner's value")
    parser.add_argument("--frames", type=int, help="Explicit public UI frame count; default is the UI owner's value")
    parser.add_argument("--browser", default=shutil.which("chromium") or shutil.which("chromium-browser"), help="Chromium executable; otherwise Playwright's installed Chromium")
    args = parser.parse_args()
    if not permitted_url(args.url):
        parser.error("--url must use HTTPS under https://kushyameln01.github.io/kushyameln-works/")
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    if args.sample and any(getattr(args, key) is None for key in ("high", "low", "conditioning")):
        parser.error("--sample requires --high, --low, and --conditioning")
    if not args.sample and any(getattr(args, key) is not None for key in ("high", "low", "conditioning")):
        parser.error("--high, --low, and --conditioning require explicit --sample")
    for key in ("width", "height", "frames"):
        if getattr(args, key) is not None and getattr(args, key) < 1:
            parser.error("--" + key + " must be positive")
    for key in ("file", "output", "high", "low", "conditioning"):
        if getattr(args, key) is not None:
            setattr(args, key, getattr(args, key).expanduser().resolve())
    return parser, args


def main():
    parser, args = parse_args()
    for parent in (args.output, *args.output.parents):
        if (parent / ".git").exists():
            parser.error("--output must be outside Git checkouts; private outputs must never be published")
    if args.output.exists():
        parser.error("--output must be a fresh directory that does not already exist")
    os.umask(0o077)
    args.output.mkdir(parents=True, mode=0o700)
    return Verification(args, args.output).run()


if __name__ == "__main__":
    sys.exit(main())
