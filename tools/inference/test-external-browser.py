"""Actual external module API over MessagePort, without a synthetic model replacement."""
import json,threading,time
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/workspace/work/inference');OUT=WORK/'integration'
def main():
 class Handler(SimpleHTTPRequestHandler):
  def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'docs'),**kw)
  def log_message(self,*a):pass
 server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();started=time.monotonic()
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.on('console',lambda msg:print(msg.text,flush=True) if msg.text.startswith('API ') else None)
   page.goto(f'http://127.0.0.1:{server.server_port}/text-encoder/')
   page.locator('#bundle').set_input_files(str(WORK/'text-implementation/bundle'));page.locator('#source').set_input_files('/workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors')
   page.evaluate('''for(const [id,dir] of [['vae-bundle',true],['vae-data',false]]){const i=document.createElement('input');i.type='file';i.id=id;i.webkitdirectory=dir;i.multiple=dir;document.body.append(i);}''')
   page.locator('#vae-bundle').set_input_files(str(WORK/'vae-implementation/bundle'));page.locator('#vae-data').set_input_files(str(OUT/'vae-input.wktensor'))
   page.evaluate('''async()=>{
    const {createInferenceAPI,bindInferencePort,decodeTensor,encodeTensor}=await import('/shared/inference/api.mjs');
    const map=id=>new Map(Array.from(document.querySelector(id).files,f=>[f.name,f]));
    const textFiles=map('#bundle');for(const f of document.querySelector('#source').files)textFiles.set(f.name,f);
    const vaeFiles=map('#vae-bundle'),textManifest=JSON.parse(await textFiles.get('manifest.json').text()),vaeManifest=JSON.parse(await vaeFiles.get('manifest.json').text());
    let cancelAfterFirst=false,hub;hub=createInferenceAPI({onState:s=>{if(s.progress?.completed)console.log('API layer '+s.progress.completed+'/24');if(cancelAfterFirst&&s.progress?.completed===1){cancelAfterFirst=false;hub.cancel();}}});
    const {port1,port2}=new MessageChannel();const unbind=bindInferencePort(port1,hub);let serial=0;const pending=new Map();port2.onmessage=({data:m})=>{const job=pending.get(m.id);if(!job)return;pending.delete(m.id);m.ok?job.resolve(m.result):job.reject(Error(m.error));};
    const rpc=(module,method,args)=>new Promise((resolve,reject)=>{const id=String(++serial);pending.set(id,{resolve,reject});port2.postMessage({apiVersion:'works-ai-1',id,module,method,args});});
    try{
     await rpc('vae','configure',{manifest:vaeManifest,files:vaeFiles});const input=await decodeTensor(await document.querySelector('#vae-data').files[0].arrayBuffer());
     const encoded=await rpc('vae','encode',input);const restored=await rpc('vae','decode',encoded.tensor);
     const vaePass=encoded.tensor.meaning==='raw-posterior-mean'&&restored.tensor.shape.join(',')==='1,3,5,16,16';
     await rpc('text_encoder','configure',{manifest:textManifest,files:textFiles});
     cancelAfterFirst=true;let cancelled=false;try{await rpc('text_encoder','encode',{text:'Hello world'});}catch(e){cancelled=e.message.toLowerCase().includes('cancel');}console.log('API cancelled '+cancelled);
     const result=await rpc('text_encoder','encode',{text:'Hello world'});
     let crossRejected=false;try{await rpc('vae','decode',result.tensor);}catch{crossRejected=true;}
     window.externalTensor=await encodeTensor(result.tensor);
     window.externalDone={passed:vaePass&&cancelled&&crossRejected,vaePass,cancelled,crossRejected,textShape:result.tensor.shape,attentionMask:Array.from(result.tensor.attentionMask),evidence:result.evidence};
    }catch(e){window.externalDone={passed:false,error:String(e),stack:e.stack};}
    finally{unbind();port2.close();hub.dispose();}
   }''')
   page.wait_for_function('window.externalDone!==undefined',timeout=600000);result=page.evaluate('window.externalDone');result.update(browser=browser.version,seconds=time.monotonic()-started,pageErrors=errors)
   if result.get('passed'):
    with page.expect_download() as dl:page.evaluate('''()=>{const url=URL.createObjectURL(new Blob([window.externalTensor]));const a=document.createElement('a');a.download='external-text.wktensor';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}''')
    dl.value.save_as(str(OUT/'external-text.wktensor'))
   (OUT/'external-browser-results.json').write_text(json.dumps(result,indent=2));page.screenshot(path=str(OUT/'external-api.png'));browser.close()
 finally:server.shutdown();server.server_close()
 print(json.dumps({k:v for k,v in result.items() if k not in ['attentionMask','evidence']},indent=2));assert result['passed'] and not errors
if __name__=='__main__':main()
