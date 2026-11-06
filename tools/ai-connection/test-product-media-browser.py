"""Short local browser File/PNG/VP9/frame-ZIP smoke. No models or NN work."""
import argparse, functools, http.server, json, pathlib, threading
from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output')
    args = parser.parse_args()
    repo = pathlib.Path(__file__).resolve().parents[2]

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args): pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(repo)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            try:
                page = browser.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{server.server_port}/docs/ai-connection/')
                result = page.evaluate('''async()=>{
 const {readProductMedia,readProductMediaFiles,productMediaTensor,previewProductTensor,saveProductImage,saveProductFrames}=await import('/docs/shared/ai-connection/product-media.mjs');
 const {deriveWorkflowShapes,BERNINI_WORKFLOW_RULE_ID}=await import('/docs/shared/ai-connection/workflow-shapes.mjs');
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 async function png(width,height,alpha=255){const c=new OffscreenCanvas(width,height),ctx=c.getContext('2d'),pixels=new Uint8ClampedArray(width*height*4);for(let i=0;i<pixels.length;i+=4)pixels.set([0,128,255,alpha],i);ctx.putImageData(new ImageData(pixels,width,height),0,0);const blob=await c.convertToBlob({type:'image/png'});c.width=c.height=0;return new File([blob],'selected.png',{type:'image/png'});}
 const image=await readProductMedia(await png(32,16));
 assert(image.frames.length===1&&image.frames[0].timestamp===null&&!Object.hasOwn(image.supply,'sourceFrameTimesSeconds'),'Still-image time was fabricated');
 const geometry={rgbChannels:3,latentChannels:16,temporalCompression:4,spatialCompression:[8,8],patchSize:[1,2,2],hiddenSize:5120,dtype:'float32',temporalRule:'first-then-groups-floor',concatOrder:'target-first'};
 const plan=deriveWorkflowShapes({ruleId:BERNINI_WORKFLOW_RULE_ID,target:{batch:1,frames:1,height:16,width:32},geometry,refMaxSize:848,media:{sourceVideo:image.supply}});
 const tensor=await productMediaTensor(image,{requirement:plan.requirements.find(r=>r.requirementId==='source.rgb')});
 assert(equal(tensor.shape,[1,3,1,16,32])&&tensor.meaning==='rgb-unit'&&tensor.data[0]===0&&Math.abs(tensor.data[512]-128/255)<1e-7&&tensor.data[1024]===1,'Native rgb-unit channel packing changed RGB');
 const direct=await productMediaTensor(image);assert(equal(direct.shape,tensor.shape),'Model-free original-size tensor changed dimensions');
 const savedImage=await saveProductImage(image),pngRead=await readProductMedia(new File([savedImage.blob],savedImage.filename,{type:'image/png'}));
 assert(equal(Array.from(pngRead.frames[0].data),Array.from(image.frames[0].data)),'PNG File save/readback changed bytes');
 const imageZip=await saveProductFrames(image),imageBack=await readProductMedia(new File([imageZip.blob],imageZip.filename,{type:'application/zip'}));
 assert(equal(Array.from(imageBack.frames[0].data),Array.from(image.frames[0].data)),'Frame ZIP image bytes changed');
 const original=new Float32Array([-1,1,-.5,.5,0,2,-2,0,.25,.75,1,-1]);
 const output={dtype:'float32',layout:'NCTHW',meaning:'raw-decoder-rgb',shape:[1,3,2,1,2],data:original,modelSha256:'a'.repeat(64),context:{schemaVersion:1,contextId:'owner:test',inputId:'original:test',inputSha256:'b'.repeat(64),slotId:'owner',sourceFrameIndices:[8,12],sourceFrameTimesSeconds:[.125,.375]},frameProcessing:{sourceFrames:2,unknownFutureFact:['retained']},producerMetadata:{multiple:['first','second'],future:{keep:true}}};
 const display=await previewProductTensor(output);
 assert(equal(Array.from(display.frames[0].data),[0,128,159,255,255,255,223,255]),'Raw decoder display pixel packing changed coordinates/channels');
 assert(display.metadata.pixelPacking.clippedValues===2&&equal(Array.from(original),[-1,1,-.5,.5,0,2,-2,0,.25,.75,1,-1]),'Output packing modified owner floats or lost clipping count');
 const outputZip=await saveProductFrames(display),outputBack=await readProductMedia(new File([outputZip.blob],outputZip.filename,{type:'application/zip'}));
 assert(equal(outputBack.supply.sourceFrameTimesSeconds,[.125,.375])&&equal(outputBack.metadata.sourceTensor.producerMetadata,output.producerMetadata)&&equal(outputBack.metadata.sourceTensor.frameProcessing,output.frameProcessing),'Frame package lost timing or unknown owner metadata');
 const savedNative={dtype:'float32',layout:'NCTHW',meaning:'rgb-unit',shape:[1,3,2,1,1],data:new Float32Array([.125,.33333334,.5,.6666667,.75,.875]),context:{schemaVersion:1,contextId:'saved:context',inputId:'saved:original',inputSha256:'c'.repeat(64),slotId:'reference',sourceFrameIndices:[42,7],sourceFrameTimesSeconds:[.375,.125]}};
 const inputDisplay=await previewProductTensor(savedNative,{asInput:true});
 assert(inputDisplay.nativeTensor===savedNative&&inputDisplay.nativeTensor.data[0]===.125&&equal(inputDisplay.supply.sourceFrameIndices,[42,7])&&equal(inputDisplay.supply.sourceFrameTimesSeconds,[.375,.125])&&inputDisplay.supply.inputId==='saved:original'&&inputDisplay.supply.inputSha256==='c'.repeat(64),'Saved native input lost original float values, identity, frame order, or actual times');
 let inputMappingRejected=false;try{await previewProductTensor({...savedNative,context:{...savedNative.context,sourceFrameIndices:[42]}},{asInput:true});}catch(e){inputMappingRejected=e.code==='MEDIA_INPUT_CONTEXT_MAPPING';}assert(inputMappingRejected,'Ambiguous saved native input mapping was silently replaced');
 const sequence=await readProductMediaFiles([await png(32,16),await png(32,16)]),sequenceTensor=await productMediaTensor(sequence);
 assert(sequence.frames.length===2&&equal(sequenceTensor.shape,[1,3,2,16,32])&&!Object.hasOwn(sequence.supply,'sourceFrameTimesSeconds'),'Still sequence invented timing or dropped frames');
 let alphaRejected=false,resizeRejected=false;
 const alpha=await readProductMedia(await png(1,1,128));try{await productMediaTensor(alpha);}catch(e){alphaRejected=e.code==='MEDIA_ALPHA_UNSUPPORTED';}
 try{await productMediaTensor(image,{requirement:{shape:[1,3,1,32,32],dtype:'float32',preprocessing:{interpolation:'area',crop:'center'}}});}catch(e){resizeRejected=e.code==='MEDIA_RESIZE_UNAVAILABLE';}
 assert(alphaRejected&&resizeRejected,'Unsupported transparent/owner-resize path silently substituted pixels');
 const blob=await(await fetch('/development/media-baseline/evidence/fixtures/short.webm')).blob(),videoFile=new File([blob],'short.webm',{type:'video/webm'});
 const abort=new AbortController();let cancelled=false;try{await readProductMedia(videoFile,{signal:abort.signal,onProgress:p=>{if(p.frameCount===2)abort.abort();}});}catch(e){cancelled=e.code==='CANCELLED'||e.message==='CANCELLED';}assert(cancelled,'Video cancellation did not win');
 const video=await readProductMedia(videoFile),expectedTimes=[0,.1,.2,.3,.4,.5,.6,.7,.8,.9];
 assert(video.frames.length===10&&equal(video.supply.sourceFrameTimesSeconds,expectedTimes),'Actual VP9 frame times/count differ from the independently probed fixture');
 const videoZip=await saveProductFrames(video),videoBack=await readProductMedia(new File([videoZip.blob],videoZip.filename,{type:'application/zip'}));
 assert(equal(videoBack.supply.sourceFrameTimesSeconds,expectedTimes)&&videoBack.frames.every((f,i)=>equal(Array.from(f.data),Array.from(video.frames[i].data))),'Video PNG frame ZIP/readback dropped frame pixels or real times');
 const result={scope:'local browser model-free media File and display packing',image:{width:32,height:16,nativeRgbUnitPacking:true,pngRoundtrip:true,zipRoundtrip:true},output:{rawFloatUnchanged:true,clippedDisplayValues:2,timingAndUnknownMetadataRetained:true,zipBytes:outputZip.blob.size},nativeInput:{originalFloatRetained:true,originalContextFrameIndices:[42,7],originalContextTimes:[.375,.125],inputMappingRejected},video:{codec:'VP9',width:video.frames[0].width,height:video.frames[0].height,frames:video.frames.length,times:video.supply.sourceFrameTimesSeconds,zipBytes:videoZip.blob.size,allFramePixelsReadBack:true,cancelledThenReread:true},unsupported:{alphaRejected,resizeRejected},orderedStillFiles:sequence.frames.length};
 for(const media of [image,pngRead,imageBack,display,outputBack,inputDisplay,sequence,alpha,video,videoBack])media.dispose();
 assert(inputDisplay.nativeTensor===null,'Input display disposal retained the saved native tensor reference');
 assert(video.frames.length===0&&video.preview===null,'Media disposal retained public frame references');return result;
}''')
                if errors:
                    raise RuntimeError(str(errors))
                text = json.dumps(result, ensure_ascii=False, indent=2)
                print(text)
                if args.output:
                    pathlib.Path(args.output).write_text(text + '\n')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    main()
