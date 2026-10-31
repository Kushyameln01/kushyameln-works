"""Own Chromium, real file inputs, GET-only local module origin; no inference."""
import json
import os
import shutil
import signal
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
import psutil

config = json.load(sys.stdin)
sys.path.insert(0, os.path.join(config['nativeRoot'], 'tools/inference/vae'))
from process_lifecycle import ProcessOwnership, cleanup_complete
ownership = ProcessOwnership().start()
def terminate(_signum, _frame):
    raise RuntimeError('Configure probe received SIGTERM; closing owned browser/driver')
signal.signal(signal.SIGTERM, terminate)
result = {"passed": False, "pageErrors": [], "requests": [], "blockedRequests": [], "browserClosed": False}
browser = None
try:
    with sync_playwright() as pw:
        try:
            driver = psutil.Process(pw._impl_obj._connection._transport._proc.pid)
            result['playwrightDriver'] = {'pid': driver.pid, 'ctime': driver.create_time()}
            binary = os.environ.get("CHROMIUM_BINARY") or shutil.which("chromium")
            if not binary:
                raise RuntimeError("CHROMIUM_BINARY or chromium on PATH is required")
            browser = pw.chromium.launch(executable_path=binary, headless=True, args=["--no-sandbox"])
            result["browser"] = browser.version
            context = browser.new_context(service_workers="block")
            origin = urlsplit(config["url"])

            def route(request):
                q = request.request
                target = urlsplit(q.url)
                record = {"method": q.method, "url": q.url}
                result["requests"].append(record)
                if q.method == "GET" and (target.scheme, target.netloc) == (origin.scheme, origin.netloc):
                    request.continue_()
                else:
                    result["blockedRequests"].append(record)
                    request.abort()

            context.route("**/*", route)
            page = context.new_page()
            page.on("pageerror", lambda error: result["pageErrors"].append(str(error)))
            page.goto(config["url"], wait_until="networkidle")
            page.wait_for_function("typeof configureProbe === 'function'")
            page.set_input_files("#rect", config["rectFiles"])
            page.set_input_files("#text", config["textFiles"])
            page.set_input_files("#source", config["textSource"])
            result["configure"] = page.evaluate("spec => configureProbe(spec)", config["spec"])
            result["passed"] = result["configure"]["passed"] and not result["pageErrors"] and not result["blockedRequests"]
            context.close()
        finally:
            if browser:
                browser.close()
                result["browserClosed"] = True
except Exception as error:
    result["error"] = {"name": type(error).__name__, "message": str(error)}
finally:
    result['processOwnership'] = ownership.finish(timeout_seconds=5)
    result['cleanupAccepted'] = cleanup_complete(result['processOwnership']['liveAfterClose'], result['processOwnership']['zombiesAfterClose'], result['processOwnership']['errors'])
    result['passed'] = result['passed'] and result['cleanupAccepted']
print(json.dumps(result))
