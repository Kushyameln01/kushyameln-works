#!/usr/bin/env python3
"""Accept one native-size F=1 VAE profile using the real UI/API and WASM.

All model/reference inputs and generated evidence stay private. This measures
the declared diagnostic profile; it does not assert original GPU equivalence.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import threading
import time
import traceback
from urllib.parse import unquote, urlsplit

import numpy as np
import psutil
from playwright.sync_api import sync_playwright


REPO = Path(__file__).resolve().parents[3]
HOST_MODULE = "/harness/profile-acceptance.mjs"
WORKER_TRACKING = """(() => {
 const OriginalWorker = globalThis.Worker;
 const tracking = {created:0, terminated:0, live:0};
 Object.defineProperty(globalThis, '__workerTracking', {value:tracking});
 globalThis.Worker = class extends OriginalWorker {
  constructor(...args) {super(...args);this.__v1Live=true;tracking.created++;tracking.live++;}
  terminate() {
   if(this.__v1Live){this.__v1Live=false;tracking.terminated++;tracking.live--;}
   return super.terminate();
  }
 };
})();"""


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compare_download(path, reference, shape, meaning, model_hash, gate):
    raw = path.read_bytes()
    if raw[:8] != b"WKTSR001" or len(raw) < 12:
        raise ValueError("Downloaded file is not WKTSR001")
    length = int.from_bytes(raw[8:12], "little")
    if not 0 < length <= 65536 or 12 + length > len(raw):
        raise ValueError("Invalid downloaded tensor header length")
    header = json.loads(raw[12:12 + length].decode("utf-8"))
    payload = raw[12 + length:]
    payload_hash = hashlib.sha256(payload).hexdigest()
    if header.get("schemaVersion") != 1 or header.get("byteOrder") != "little":
        raise ValueError("Unsupported downloaded tensor schema")
    if (header.get("dtype"), header.get("layout"), header.get("meaning")) != ("float32", "NCTHW", meaning):
        raise ValueError("Downloaded tensor dtype/layout/meaning mismatch")
    if header.get("shape") != shape or header.get("modelSha256") != model_hash:
        raise ValueError("Downloaded tensor shape/model mismatch")
    if len(payload) != header.get("byteLength") or payload_hash != header.get("dataSha256"):
        raise ValueError("Downloaded tensor payload length/hash mismatch")
    count = int(np.prod(shape))
    if len(payload) != count * 4:
        raise ValueError("Downloaded tensor payload does not match shape")
    actual = np.frombuffer(payload, dtype="<f4")
    expected = np.fromfile(reference, dtype="<f4")
    if actual.size != expected.size or actual.size != count:
        raise ValueError("Reference/output element count mismatch")
    finite = bool(np.isfinite(actual).all() and np.isfinite(expected).all())
    difference = np.abs(actual.astype(np.float64) - expected.astype(np.float64))
    max_abs = float(difference.max(initial=0))
    rmse = float(np.sqrt(np.mean(np.square(difference))))
    passed = finite and max_abs <= gate["maxAbs"] and bool(np.all(
        difference <= gate["atol"] + gate["rtol"] * np.abs(expected.astype(np.float64))))
    result = {"file": path.name, "bytes": len(raw), "fileSha256": hashlib.sha256(raw).hexdigest(),
              "payloadSha256": payload_hash, "header": header, "referenceFile": reference.name,
              "referenceSha256": sha(reference), "count": count, "allFinite": finite,
              "maxAbs": max_abs, "rmse": rmse, "gate": gate, "passed": passed}
    if not passed:
        raise ValueError("Full downloaded tensor/reference mismatch: " + json.dumps(result))
    return result


class ProcessSampler:
    """100 ms process-tree samples, not an exact memory high-water mark."""
    def __init__(self, pid):
        self.pid = pid
        self.phase = "browser-ready"
        self.samples = []
        self.known = {}
        self.errors = []
        self.started = time.monotonic()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def _sample(self):
        phase = self.phase
        try:
            browser = psutil.Process(self.pid)
            processes = [browser] + browser.children(recursive=True)
        except (psutil.NoSuchProcess, psutil.AccessDenied) as error:
            self.errors.append({"phase": phase, "error": str(error)})
            return
        rss = 0
        pss = 0
        pss_complete = True
        cpu_seconds = 0.0
        identities = []
        for process in processes:
            try:
                identity = (process.pid, process.create_time())
                self.known[identity] = {"pid": identity[0], "created": identity[1], "name": process.name()}
                if process.status() == psutil.STATUS_ZOMBIE:
                    continue
                rss += process.memory_info().rss
                memory = process.memory_full_info()
                value = getattr(memory, "pss", None)
                if value is None:
                    pss_complete = False
                else:
                    pss += value
                cpu = process.cpu_times()
                cpu_seconds += cpu.user + cpu.system
                identities.append(process.pid)
            except psutil.NoSuchProcess:
                continue
            except psutil.AccessDenied as error:
                pss_complete = False
                self.errors.append({"phase": phase, "pid": process.pid, "error": str(error)})
        self.samples.append({"elapsedSeconds": time.monotonic() - self.started, "phase": phase,
                             "processes": identities, "sumRssBytes": rss,
                             "sumPssBytes": pss if pss_complete else None,
                             "observedCpuSeconds": cpu_seconds})

    def _run(self):
        while not self.stop_event.is_set():
            self._sample()
            self.stop_event.wait(.1)

    def start(self):
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=5)

    def report(self):
        phases = {}
        for sample in self.samples:
            summary = phases.setdefault(sample["phase"], {"samples": 0, "sampledPeakSumRssBytes": 0,
                                                         "sampledPeakSumPssBytes": None})
            summary["samples"] += 1
            summary["sampledPeakSumRssBytes"] = max(summary["sampledPeakSumRssBytes"], sample["sumRssBytes"])
            if sample["sumPssBytes"] is not None:
                summary["sampledPeakSumPssBytes"] = max(summary["sampledPeakSumPssBytes"] or 0,
                                                       sample["sumPssBytes"])
        return {"intervalSeconds": .1, "browserPid": self.pid, "phases": phases,
                "processesObserved": list(self.known.values()), "samples": self.samples, "errors": self.errors,
                "scope": "Browser process and its observed descendants; Python/export/reference processes excluded",
                "rssNote": "Sum of process RSS double-counts shared pages; do not add RSS and PSS",
                "pssNote": "Sum of Linux proportional set sizes sampled around 100 ms; not exact peak or total device RAM",
                "cpuNote": "Observed cumulative process CPU seconds; exited processes may disappear between samples"}

    def remaining(self):
        live = []
        zombies = []
        for (pid, created), identity in list(self.known.items()):
            try:
                process = psutil.Process(pid)
                if process.create_time() != created:
                    continue
                (zombies if process.status() == psutil.STATUS_ZOMBIE else live).append(identity)
            except psutil.NoSuchProcess:
                continue
        return live, zombies


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("bundle", "baseline-bundle", "plan", "references", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    args.output = args.output.resolve()
    if "docs" in args.output.parts:
        raise ValueError("Private acceptance output must be outside docs/")
    args.output.mkdir(parents=True, exist_ok=False)
    result = {"passed": False, "scope": "V1 actual F=1 diagnostic profile, unchanged PNG dimensions, actual Hike/ORT WASM",
              "originalGpuEquivalence": False, "generatedSampleInference": False, "phases": {},
              "pageErrors": [], "consoleErrors": [], "requests": [], "httpErrors": [], "requestFailures": []}
    phase = "input-validation"
    server = None
    sampler = None
    browser = None
    page = None
    started = time.monotonic()
    failure = None
    try:
        args.bundle = args.bundle.resolve()
        args.baseline_bundle = args.baseline_bundle.resolve()
        args.references = args.references.resolve()
        args.plan = args.plan.resolve()
        plan = json.loads(args.plan.read_text())
        manifest = json.loads((args.bundle / "manifest.json").read_text())
        baseline = json.loads((args.baseline_bundle / "manifest.json").read_text())
        reference_report = json.loads((args.references / "reference-report.json").read_text())
        assert manifest["profile"]["videoShape"] == plan["videoShape"]
        assert manifest["profile"]["latentShape"] == plan["latentShape"]
        assert plan["videoShape"][2] == 1
        assert sha(plan["input"]["path"]) == plan["input"]["sha256"]
        for record in reference_report["references"].values():
            assert sha(args.references / record["file"]) == record["sha256"]
        result.update(planSha256=sha(args.plan), profileId=manifest["profile"]["id"],
                      manifestSha256=sha(args.bundle / "manifest.json"),
                      baselineProfileId=baseline["profile"]["id"],
                      baselineManifestSha256=sha(args.baseline_bundle / "manifest.json"),
                      comparisonGate=plan["comparisonGate"], input=plan["input"])

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requested = unquote(urlsplit(self.path).path)
                if requested == "/favicon.ico":
                    self.send_response(204)
                    self.end_headers()
                    return
                if requested == "/plan.json":
                    path = args.plan
                else:
                    if requested.startswith("/harness/"):
                        base, relative = REPO / "tools/inference/vae", requested[len("/harness/"):]
                    elif requested.startswith("/references/"):
                        base, relative = args.references, requested[len("/references/"):]
                    else:
                        base, relative = REPO / "docs", requested.lstrip("/")
                    path = (base / relative).resolve()
                    if not path.is_relative_to(base.resolve()):
                        self.send_error(403)
                        return
                    if path.is_dir():
                        path = path / "index.html"
                if not path.is_file():
                    self.send_error(404)
                    return
                kind = ({".mjs": "text/javascript", ".wasm": "application/wasm"}.get(path.suffix)
                        or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(path.stat().st_size))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                try:
                    with path.open("rb") as source:
                        for chunk in iter(lambda: source.read(1024 * 1024), b""):
                            self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f"http://127.0.0.1:{server.server_port}"
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
                                                  args=["--no-sandbox", "--disable-dev-shm-usage"])
            result["browserVersion"] = browser.version
            cdp = browser.new_browser_cdp_session()
            processes = cdp.send("SystemInfo.getProcessInfo")["processInfo"]
            browser_pid = next(int(p["id"]) for p in processes if p["type"] == "browser")
            cdp.detach()
            sampler = ProcessSampler(browser_pid)
            sampler.start()
            context = browser.new_context(accept_downloads=True, service_workers="block")
            context.add_init_script(WORKER_TRACKING)
            page = context.new_page()
            page.set_default_timeout(240000)
            page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
            page.on("console", lambda message: result["consoleErrors"].append(message.text)
                    if message.type == "error" else None)
            page.on("request", lambda request: result["requests"].append(
                {"url": request.url, "method": request.method, "phase": sampler.phase}))
            page.on("response", lambda response: result["httpErrors"].append(
                {"url": response.url, "status": response.status}) if response.status >= 400 else None)
            page.on("requestfailed", lambda request: result["requestFailures"].append(
                {"url": request.url, "failure": request.failure, "phase": sampler.phase}))
            page.route("**/*", lambda route: route.continue_()
                       if route.request.url.startswith(origin + "/") and route.request.method == "GET"
                       else route.abort())
            page.goto(origin + "/vae/")

            def select_bundle(directory, wanted):
                page.locator("#bundle").set_input_files(str(directory))
                page.wait_for_function("([f,w,h])=>document.querySelector('#model-info').textContent.includes(`${f}フレーム / ${w}×${h}`)",
                                       arg=[wanted[2], wanted[4], wanted[3]])
                page.wait_for_function("!document.querySelector('#run').disabled")

            def begin(name):
                nonlocal phase
                phase = name
                sampler.phase = name
                return time.monotonic()

            def finish(name, before, data):
                tracking = page.evaluate("({...globalThis.__workerTracking})")
                result["phases"][name] = {"wallSeconds": time.monotonic() - before,
                                          "workerTracking": tracking, **data}
                if tracking["live"] != 0:
                    raise AssertionError("Live Worker remains after " + name)

            def ui_result(name, reference_name, shape, meaning):
                page.locator("#run").click()
                page.wait_for_function("!document.querySelector('#save').disabled || !document.querySelector('#run').disabled")
                if page.locator("#save").is_disabled():
                    raise RuntimeError("Product UI inference failed: " + page.locator("#status").inner_text())
                # The product keeps evidence in a collapsed <details>; innerText is empty there.
                evidence = json.loads(page.locator("#evidence").text_content())
                with page.expect_download() as download:
                    page.locator("#save").click()
                path = args.output / name
                download.value.save_as(str(path))
                numeric = compare_download(path, args.references / reference_name, shape, meaning,
                                           plan["model"]["sha256"], plan["comparisonGate"])
                return {"download": numeric, "evidence": evidence,
                        "status": page.locator("#status").inner_text(),
                        "inputInfo": page.locator("#input-info").inner_text(),
                        "outputInfo": page.locator("#output").inner_text()}

            before = begin("ui-png-encode")
            select_bundle(args.bundle, plan["videoShape"])
            page.locator("#images").set_input_files(plan["input"]["path"])
            page.wait_for_function("document.querySelector('#input-info').textContent.includes('画像1枚')")
            encoded = ui_result("png-mean.wktensor", "png-mean.f32", plan["latentShape"], "raw-posterior-mean")
            assert encoded["evidence"]["operation"] == "encode"
            assert encoded["evidence"]["hikeCalls"] == 1
            finish(phase, before, encoded)

            before = begin("ui-png-mean-roundtrip-decode")
            page.locator("#operation").select_option("decode")
            page.locator("#tensor-input").set_input_files(str(args.output / "png-mean.wktensor"))
            page.wait_for_function("document.querySelector('#input-info').textContent.includes('raw-posterior-mean')")
            decoded = ui_result("png-roundtrip.wktensor", "png-roundtrip.f32", plan["videoShape"], "raw-decoder-rgb")
            assert decoded["evidence"]["operation"] == "decode"
            assert decoded["evidence"]["hikeContributed"] and not decoded["evidence"]["normalizationApplied"]
            finish(phase, before, decoded)

            before = begin("api-busy-cancel-recovery-dispose")
            with page.expect_download() as download:
                api_probe = page.evaluate("async module=>{const probe=await import(module);return probe.runApiProbe();}", HOST_MODULE)
            assert api_probe["passed"]
            api_path = args.output / "api-recovery.wktensor"
            download.value.save_as(str(api_path))
            api_numeric = compare_download(api_path, args.references / "png-mean.f32", plan["latentShape"],
                                           "raw-posterior-mean", plan["model"]["sha256"], plan["comparisonGate"])
            finish(phase, before, {"probe": api_probe, "download": api_numeric})

            before = begin("f1-real-session-release-and-abort")
            session_probe = page.evaluate("async module=>{const probe=await import(module);return probe.runSessionProbe({baseline:false});}", HOST_MODULE)
            assert session_probe["passed"]
            finish(phase, before, {"probe": session_probe})

            before = begin("baseline-5-frame-real-session-regression")
            select_bundle(args.baseline_bundle, baseline["profile"]["videoShape"])
            baseline_probe = page.evaluate("async module=>{const probe=await import(module);return probe.runSessionProbe({baseline:true});}", HOST_MODULE)
            assert baseline_probe["passed"]
            finish(phase, before, {"probe": baseline_probe})
            result["finalWorkerTracking"] = page.evaluate("({...globalThis.__workerTracking})")
            assert not result["pageErrors"], result["pageErrors"]
            assert not result["httpErrors"], result["httpErrors"]
            assert all(r["method"] == "GET" and r["url"].startswith(origin + "/") for r in result["requests"])
            result["networkScope"] = "Only local GET requests; model files selected through actual local File inputs"
            result["passed"] = True
            sampler.phase = "browser-close"
            browser.close()
            browser = None
    except Exception as error:
        failure = error
        result["failure"] = {"phase": phase, "type": type(error).__name__, "message": str(error),
                             "traceback": traceback.format_exc()}
    finally:
        if browser is not None:
            try:
                browser.close()
            except Exception as error:
                result["browserCloseError"] = str(error)
        if sampler is not None:
            sampler.stop()
            deadline = time.monotonic() + 10
            remaining, zombies = sampler.remaining()
            while remaining and time.monotonic() < deadline:
                time.sleep(.1)
                remaining, zombies = sampler.remaining()
            resources = sampler.report()
            resources.update(liveProcessesAfterClose=remaining, zombieProcessesAfterClose=zombies,
                             allObservedProcessesTerminated=not remaining,
                             allObservedPidsGone=not remaining and not zombies)
            (args.output / "resource-measurements.json").write_text(json.dumps(resources, indent=2) + "\n")
            result["resources"] = {"file": "resource-measurements.json", "sha256": sha(args.output / "resource-measurements.json"),
                                   "browserPid": sampler.pid, "allObservedProcessesTerminated": not remaining,
                                   "allObservedPidsGone": not remaining and not zombies,
                                   "liveProcessesAfterClose": remaining, "zombieProcessesAfterClose": zombies}
            if remaining:
                result["passed"] = False
                result["processCleanupFailure"] = "Observed browser processes remain live after close"
        if server is not None:
            server.shutdown()
            server.server_close()
        result["wallSeconds"] = time.monotonic() - started
        if failure is not None:
            result["passed"] = False
        (args.output / "acceptance-results.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": result["passed"], "output": str(args.output),
                          "completedPhases": list(result["phases"]), "failure": result.get("failure"),
                          "wallSeconds": result["wallSeconds"]}, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
