"""Real browser video export, timing, cancellation and result UI. No models."""
import argparse
import functools
import http.server
import json
import pathlib
import threading
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-url', help='Published docs root URL ending in /')
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[2]
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root / 'docs')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            try:
                page = browser.new_page(accept_downloads=True)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                base_url = args.base_url or f'http://127.0.0.1:{server.server_port}/'
                page.goto(base_url)
                result = page.evaluate('''async moduleUrl=>{
 const m=await import(moduleUrl);
 const assert=(v,msg)=>{if(!v)throw Error(msg);};
 assert(typeof m.saveProductVideo==='function','Video export API missing');
 const frames=[0,1,2].map(i=>({data:new Uint8Array(32*16*4),width:32,height:16,stride:128,timestamp:[2,2.1,2.35][i],duration:[.1,.25,.2][i]}));
 frames.forEach((f,i)=>{for(let p=0;p<f.data.length;p+=4)f.data.set([i*80,60,120,255],p);});
 const media={frames};
 const formats=await m.productVideoFormats(media);
 assert(formats.some(f=>f.id==='webm'&&f.supported),'VP9 encoder unavailable in test browser');
 const done=[];
 for(const f of formats.filter(f=>f.supported)){
  const saved=await m.saveProductVideo(media,{format:f.id,timing:'source'});
  assert(saved.blob.type===f.mimeType&&saved.filename.endsWith('.'+f.id),'Wrong video container');
  const read=await m.readProductMedia(new File([saved.blob],saved.filename,{type:saved.blob.type}));
  assert(read.frames.length===3&&read.frames.every(x=>x.width===32&&x.height===16),'Video frames missing');
  assert(read.frames.every((x,i)=>Math.abs(x.timestamp-[0,.1,.35][i])<.002),'Source playback timestamps changed');
  assert(read.frames[0].data[0]<read.frames[2].data[0],'Frame order changed');
  read.dispose();done.push(f.id);
 }
 const unordered={frames:frames.map((f,i)=>({...f,timestamp:[1,0,1][i],duration:null}))};
 let rejected=false;try{await m.saveProductVideo(unordered,{format:'webm',timing:'source'});}catch(e){rejected=e.code==='VIDEO_TIMING_REQUIRED';}
 assert(rejected,'Invalid lineage times accepted as playback timestamps');
 const fixed=await m.saveProductVideo(unordered,{format:'webm',timing:'fps',fps:10});
 const fixedRead=await m.readProductMedia(new File([fixed.blob],'fixed.webm',{type:'video/webm'}));
 assert(fixedRead.frames.every((x,i)=>Math.abs(x.timestamp-i/10)<.002),'Explicit FPS not applied');fixedRead.dispose();
 const abort=new AbortController();let cancelled=false;
 try{await m.saveProductVideo(media,{format:'webm',timing:'source',signal:abort.signal,onProgress:p=>{if(p.frameCount===1)abort.abort();}});}catch(e){cancelled=e.code==='CANCELLED';}
 assert(cancelled,'Cancelled export published a result or lost cancellation code');
 const retry=await m.saveProductVideo(media,{format:'webm',timing:'source'});
 assert(retry.blob.size>0,'Export after cancellation failed');
 assert(frames.every((f,i)=>f.timestamp===[2,2.1,2.35][i]&&f.data[0]===i*80),'Exporter mutated source frames');
 return {formats:done,frames:3,sourceTiming:true,explicitFps:true,cancelThenRetry:true,sourceUnchanged:true};
}''', base_url + 'shared/ai-connection/product-media.mjs')
                pending = []
                page.route('**/shared/ai-connection/product-management.mjs', lambda route: pending.append(route))
                page.goto(base_url + 'ai-connection/modules/')
                assert page.locator('#result-tensor-file').is_disabled(), 'Tensor input enabled before controller initialization'
                for slot in ('source', 'reference'):
                    assert page.locator(f'#{slot}-tensor-file').is_disabled(), 'Input tensor enabled before initialization'
                assert page.locator('#source-load').is_disabled(), 'Media action enabled before initialization'
                assert pending, 'Controller import was not delayed'
                pending[0].continue_()
                page.unroute('**/shared/ai-connection/product-management.mjs')
                page.wait_for_function("!document.querySelector('#source-load').disabled")
                page.locator('#result-tensor-file').set_input_files({
                    'name': 'test.wktensor', 'mimeType': 'application/octet-stream',
                    'buffer': bytes(page.evaluate('''async moduleUrl=>{
 const {encodeTensor}=await import(moduleUrl);
 const t={dtype:'float32',layout:'NCTHW',meaning:'rgb-unit',shape:[1,3,3,16,32],data:new Float32Array(3*3*16*32).fill(.5)};
 return Array.from(await encodeTensor(t));
}''', base_url + 'shared/inference/tensor.mjs')),
                })
                page.wait_for_function("!document.querySelector('#result-video-save').disabled")
                page.select_option('#video-format', 'webm')
                page.select_option('#video-timing', 'fps')
                page.fill('#video-fps', '10')
                with page.expect_download() as download:
                    page.locator('#result-video-save').click()
                assert download.value.suggested_filename.endswith('.webm')
                page.wait_for_function("!document.querySelector('#result-video-save').disabled")
                assert not errors, errors
                result['publicUiDownload'] = True
                print(json.dumps(result))
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
