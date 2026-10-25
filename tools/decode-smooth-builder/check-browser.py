"""Exercise the actual static app, Workers, WASM and saved output in Chromium."""
from pathlib import Path
import argparse,json,hashlib,shutil
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url',required=True)
parser.add_argument('--output-dir',type=Path,required=True)
args=parser.parse_args();out=args.output_dir;out.mkdir(parents=True,exist_ok=True)
errors=[];failed=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('requestfailed',lambda r:failed.append({'url':r.url,'error':r.failure}))
    response=page.goto(args.url,wait_until='networkidle');assert response.status==200
    page.locator('#generate').click();assert '入力してください' in page.locator('#status').inner_text()
    page.locator('#names').fill('v2/EyeLidLeft\n v2/EyeLidRight');page.locator('#generate').click()
    page.wait_for_function("document.querySelector('#status').textContent.includes('2行目')")
    page.locator('#names').fill('v2/EyeLidLeft\nv2/EyeLidLeft');page.locator('#generate').click()
    page.wait_for_function("document.querySelector('#status').textContent.includes('重複')")
    page.locator('#names').fill('v2/EyeLidLeft\nv2/EyeLidRight');page.locator('#generate').click()
    page.wait_for_function("!document.querySelector('#result').hidden || document.querySelector('#status').dataset.error==='true'",timeout=60000)
    assert not page.locator('#result').is_hidden(),page.locator('#status').inner_text()
    assert '5レイヤー' in page.locator('#summary').inner_text()
    with page.expect_download() as wait:page.locator('#download').click()
    archive=out/'ui-final.unitypackage';wait.value.save_as(str(archive));assert archive.stat().st_size>0
    page.screenshot(path=str(out/'desktop.png'),full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(out/'mobile.png'),full_page=True)
    page.locator('#names').fill('v2/MouthSmile');assert page.locator('#result').is_hidden()
    assert page.locator('#download').get_attribute('href') is None
    page.evaluate("document.querySelector('#generate').click();document.querySelector('#cancel').click()")
    page.wait_for_function("document.querySelector('#status').textContent.includes('取り消し')")
    page.locator('#names').fill('v2/TestParameter');page.locator('#generate').click()
    page.wait_for_function("!document.querySelector('#result').hidden || document.querySelector('#status').dataset.error==='true'",timeout=60000)
    assert not page.locator('#result').is_hidden(),page.locator('#status').inner_text()
    assert '4レイヤー' in page.locator('#summary').inner_text()
    payload=page.evaluate("""async()=>{
      const {createDecodeSmoothBuilder,BUILD_ID}=await import('./pipeline.mjs');
      const b=createDecodeSmoothBuilder();
      try{const r=await b.build(['v2/EyeLidLeft','v2/EyeLidRight'],{inputRevision:42});
       return {buildId:BUILD_ID,archive:Array.from(r.archive),summary:r.summary,report:r.report,integratorReport:r.integratorReport,
        sources:[{name:'source-motion.unitypackage',bytes:Array.from(r.intermediates.motionPackage)},
          {name:'source-base.unitypackage',bytes:Array.from(r.intermediates.basePackage)},
          {name:'source-mask.unitypackage',bytes:Array.from(r.intermediates.maskPackage)},
          ...r.intermediates.registrations.map((x,i)=>({name:'registration-'+(i+1)+'.unitypackage',bytes:Array.from(x.archive)}))]};
      }finally{b.dispose()}
    }""")
    (out/'api-final.unitypackage').write_bytes(bytes(payload.pop('archive')))
    for s in payload.pop('sources'):(out/s['name']).write_bytes(bytes(s['bytes']))
    (out/'integrator-report.json').write_text(json.dumps(payload.pop('integratorReport'),ensure_ascii=False,indent=2)+'\n')
    (out/'api-result.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    modes=page.evaluate("""async()=>{
      const {createComputePool}=await import('../shared/compute/client.mjs');
      const {createParameterRegistrar}=await import('../shared/parameter-registrar/client.mjs');const rows=[];
      for(const mode of ['module','bundle']){
       const pool=createComputePool({concurrency:1,workerMode:mode}),registrar=createParameterRegistrar({pool});
       try{
        const jobId='check.'+mode,revision=51;
        const response=await pool.submit({protocolVersion:1,taskType:'parameter-template-generate',taskVersion:1,jobId,inputRevision:revision,payload:{target:'v2/ModeTest'}}).promise;
        if(response.status!=='succeeded'||response.jobId!==jobId||response.inputRevision!==revision)throw Error(JSON.stringify(response));
        const collected=await registrar.collect(response.result.bytes,{inputRevision:revision});
        const generated=await registrar.generate(collected.parameters,{name:'Mode_'+mode},{inputRevision:revision});
        const ft=await pool.submit({protocolVersion:1,taskType:'ft-magnitude-batch',taskVersion:1,jobId:'ft.'+mode,inputRevision:revision,payload:{masks:[0,3,5],weights:[1,2,4]}}).promise;
        if(ft.status!=='succeeded'||JSON.stringify(ft.result)!=='[0,3,5]')throw Error(JSON.stringify(ft));
        rows.push({mode,status:'PASS',templateBytes:response.result.bytes.length,parameterCount:generated.parameterCount,wasmResult:ft.result});
       }finally{registrar.dispose();pool.dispose()}
      }return rows;
    }""")
    page.locator('#names').fill('\n'.join('v2/Limit'+letter for letter in 'ABCDEF'))
    page.locator('#generate').click()
    page.wait_for_function("document.querySelector('#status').dataset.error==='true' || !document.querySelector('#result').hidden",timeout=60000)
    assert page.locator('#result').is_hidden(),'Over-budget output must not be offered for saving'
    assert '256' in page.locator('#status').inner_text(),page.locator('#status').inner_text()
    assert page.locator('#download').get_attribute('href') is None
    page.locator('#names').fill('v2/AfterLimit');page.locator('#generate').click()
    page.wait_for_function("!document.querySelector('#result').hidden || document.querySelector('#status').dataset.error==='true'",timeout=60000)
    assert not page.locator('#result').is_hidden(),page.locator('#status').inner_text()
    assert not errors,errors
    assert not failed,failed
    result={'status':'PASS','url':page.url,'browser':browser.version,'buildId':payload['buildId'],'uiDownloadBytes':archive.stat().st_size,'uiDownloadSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'apiSummary':payload['summary'],'workerModes':modes,'pageErrors':errors,'failedRequests':failed,'cases':['empty input','invalid name line','duplicate input','2name generation and save','mobile overflow','edit invalidates save','cancel','retry newer input','real common API output','module and bundle Template/Registrar/existing WASM','256bit over-budget blocks save','valid retry after budget error']}
    (out/'browser-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False));browser.close()
