#!/usr/bin/env python3
"""Exercise the published b7 Pages origin; never substitute a loopback copy."""
import argparse, hashlib, importlib.util, json, os, signal, time, traceback, urllib.request
from pathlib import Path
spec=importlib.util.spec_from_file_location('cloud',Path(__file__).with_name('cloud-validate.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)

def keyboard_probe(context,origin,out):
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    record={'status':'STARTED','origin':origin,'screenReaderTested':False,'OSPickerTested':False}
    try:
        page.goto(origin+'/vr180-studio/',wait_until='networkidle')
        c.select_input(page,c.DOCS/'vr180-studio/fixtures/stereo180-sbs.mp4')
        c.configure(page,'copy','sbs',180,256)
        status=page.locator('#status')
        c.require(status.get_attribute('role')=='status' and status.get_attribute('aria-live')=='polite','STATUS_ANNOUNCEMENT_SEMANTICS')
        record['beforeRun']=status.inner_text();page.locator('#run').focus()
        c.require(page.evaluate('document.activeElement.id')=='run','RUN_FOCUS')
        page.keyboard.press('Enter')
        page.wait_for_function("!document.querySelector('#result').hidden && document.querySelector('#cancel').disabled")
        receipt=json.loads(page.locator('#diagnostics').inner_text())
        record['afterRun']=status.inner_text();record['operationId']=receipt['operationId']
        url=page.locator('#output-video').get_attribute('src');c.require(url and url.startswith('blob:'),'RESULT_URL')
        record['resultURLBytesBeforeClear']=page.evaluate('async u=>(await (await fetch(u)).blob()).size',url)
        c.require(record['resultURLBytesBeforeClear']==receipt['output']['bytes'] and record['resultURLBytesBeforeClear']>0,'RESULT_URL_POSITIVE_CONTROL')
        page.locator('#clear').focus();page.keyboard.press('Enter')
        page.wait_for_function("document.querySelector('#result').hidden && !document.querySelector('#run').disabled")
        record['afterClear']=status.inner_text();record['focusAfterClear']=page.evaluate('document.activeElement.id || document.activeElement.tagName')
        record['clearedURLFetchRejected']=page.evaluate('async u=>{try{await fetch(u);return false;}catch{return true;}}',url)
        c.require(record['clearedURLFetchRejected'],'RESULT_OBJECT_URL_STILL_VALID')
        c.require(not page.locator('#output-video').get_attribute('src'),'OUTPUT_MEDIA_REFERENCE_REMAINS')
        page.locator('#run').focus();page.keyboard.press('Enter')
        page.wait_for_function("!document.querySelector('#result').hidden && document.querySelector('#cancel').disabled")
        record['retryOperationId']=json.loads(page.locator('#diagnostics').inner_text())['operationId']
        c.require(record['operationId']!=record['retryOperationId'],'OPERATION_ID_REUSED')
        page.locator('#clear').click();page.wait_for_function("document.querySelector('#result').hidden")
        page.reload(wait_until='networkidle')
        record['reload']={'resultHidden':not page.locator('#result').is_visible(),'runDisabled':page.locator('#run').is_disabled(),'status':status.inner_text()}
        c.require(record['reload']['resultHidden'] and record['reload']['runDisabled'],'RELOAD_STALE_RESULT')
        c.require(not errors,'PAGE_ERROR');record['status']='PASS'
    finally:
        record['pageErrors']=errors;c.write(out/'keyboard-ui.json',record);page.close()
    return record

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args()
    out=a.output.resolve();c.require(not out.exists() and not out.is_relative_to(c.ROOT),'New output outside checkout required');out.mkdir(parents=True)
    report={'schema':'vr180-public-origin-probe-v1','status':'BLOCKED','runId':os.environ.get('GITHUB_RUN_ID','local')+'-published-origin-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'),
      'origin':c.PAGES.rstrip('/'),'productionBuild':c.BUILD,'mediaTrials':[],'independentVerification':'PENDING',
      'notVerified':['OS picker','screen reader','novice usability','VR player','large media','Sites origin','private indexed candidate']}
    started=time.monotonic()
    def deadline(*_):raise c.Deadline('Published-origin probe deadline')
    signal.signal(signal.SIGALRM,deadline);signal.signal(signal.SIGTERM,deadline);signal.alarm(480)
    try:
        c.require(os.environ.get('GITHUB_REPOSITORY')=='Kushyameln01/kushyameln-works','Repository differs')
        source=c.source_check(out,candidate=True);report['harnessCheckoutCommit']=source['checkoutCommit'];c.preflight(out,True)
        paths=sorted(set(c.PUBLIC_PATHS+('vr180-studio/style.css','shared/media-basic/vendor/mediabunny.mjs',)))
        paths+=['vr180-studio/fixtures/stereo180-sbs.mp4','vr180-studio/fixtures/stereo360-tb.mp4']
        inventory=[]
        for path in paths:
            expected=(c.DOCS/path).read_bytes()
            with urllib.request.urlopen(c.PAGES+path,timeout=20) as response:
                actual=response.read(len(expected)+1);mime=response.headers.get('Content-Type');status=response.status
            c.require(actual==expected,'PUBLIC_SOURCE_MISMATCH: '+path)
            inventory.append({'path':path,'bytes':len(actual),'sha256':hashlib.sha256(actual).hexdigest(),'status':status,'mime':mime})
        c.write(out/'published-source-inventory.json',{'files':inventory,'allMatched':True})
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=str(c.CHROME),headless=True,chromium_sandbox=True,timeout=30000)
            report['browserVersion']=browser.version
            try:
                context=browser.new_context(accept_downloads=True)
                context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(c.PAGES) else r.abort())
                try:
                    for name,mode in [('stereo180-sbs','copy'),('stereo360-tb','convert')]:
                        row=c.run_trial(context,report['origin'],out,name,mode,report['runId'],True)
                        row['scope']='Actual public Pages origin, unchanged b7 application and Module Worker; complete downloaded bytes'
                        c.write(out/name/'trial.json',row);report['mediaTrials'].append(row)
                        c.require(row['status']==c.RECOVERED,'PUBLIC_UI_MEDIA_FAILURE')
                        c.require(not row.get('pageErrors') and not row.get('cleanupError') and not row.get('pageCloseError'),'PUBLIC_UI_ERRORS_OR_CLEANUP_FAILURE')
                    report['keyboardUI']=keyboard_probe(context,report['origin'],out)
                finally:context.close()
            finally:browser.close()
        report['status']='RECOVERED_PENDING_VERIFICATION'
    except Exception as e:
        report.update(status='BLOCKED' if isinstance(e,(c.Blocked,c.Deadline,urllib.error.URLError)) else 'FAIL',error=f'{type(e).__name__}: {e}')
        (out/'failure-traceback.txt').write_text(traceback.format_exc())
    finally:
        signal.alarm(0);report['elapsedSeconds']=time.monotonic()-started;c.write(out/'run.json',report);transported=c.emit_evidence(out,report)
    return 0 if transported and report['status']=='RECOVERED_PENDING_VERIFICATION' else 1
if __name__=='__main__':raise SystemExit(main())
