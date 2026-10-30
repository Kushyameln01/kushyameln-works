import {createInferenceClient} from './client.mjs';
import {encodeTensor,decodeTensor,requireTensor} from './tensor.mjs';
const $=s=>document.querySelector(s),mode=document.body.dataset.inference;
let manifest,files=new Map(),inputTensor,result,outputURL,revision=0,sourceFile;
const status=$('#status'),run=$('#run'),cancel=$('#cancel'),save=$('#save');
function clearResult(){result=null;save.disabled=true;if(outputURL){URL.revokeObjectURL(outputURL);outputURL=null;}$('#output').textContent='';}
function invalidated(){revision++;client.invalidate();clearResult();run.disabled=!manifest;status.textContent=manifest?'入力を変更しました':'実行用モデル一式を選んでください';}
const client=createInferenceClient({onState:s=>{cancel.disabled=s.status!=='running';run.disabled=!manifest||s.status==='running';if(s.status==='running'){const p=s.progress;status.textContent=p?.completed!==undefined?`層 ${p.completed} / ${p.total}`:p?.phase??p?.stage??'準備中';}else if(s.status==='cancelled')status.textContent='取り消しました';else if(s.status==='error')status.textContent=s.error;}});
$('#bundle').addEventListener('change',async event=>{
 invalidated();const rev=revision;files=new Map();manifest=null;
 try{
  const selected=Array.from(event.target.files),matches=selected.filter(f=>f.name==='manifest.json');if(matches.length!==1)throw Error('manifest.jsonが1件入った実行用フォルダを選んでください');
  for(const file of selected){if(files.has(file.name))throw Error('同名ファイルが重複しています: '+file.name);files.set(file.name,file);}
  const parsed=JSON.parse(await matches[0].text());if(rev!==revision)return;
  const isText=parsed.type==='wan-umt5-staged-fp32';if((mode==='text_encoder')!==isText)throw Error('選択したモデル一式は、このモジュールに対応していません');
  manifest=parsed;const source=$('#source')?.files?.[0];if(source){files.set(source.name,source);sourceFile=source;}
  const desc=isText?`UMT5 · 24層 · FP32診断演算 · 最大512 token`:`Wan2.1 · ${parsed.profile.videoShape[2]}フレーム / ${parsed.profile.videoShape[4]}×${parsed.profile.videoShape[3]} · FP32診断演算`;
  $('#model-info').textContent=desc;run.disabled=false;status.textContent='入力を選んで実行できます';
 }catch(e){status.textContent=e.message;run.disabled=true;}
});
$('#source')?.addEventListener('change',e=>{invalidated();if(sourceFile&&files.get(sourceFile.name)===sourceFile)files.delete(sourceFile.name);sourceFile=e.target.files[0];if(sourceFile)files.set(sourceFile.name,sourceFile);});
$('#prompt')?.addEventListener('input',invalidated);
$('#token-input')?.addEventListener('input',invalidated);
$('#operation')?.addEventListener('change',invalidated);
$('#tensor-input')?.addEventListener('change',async e=>{invalidated();const rev=revision;inputTensor=null;try{const decoded=await decodeTensor(new Uint8Array(await e.target.files[0].arrayBuffer()));if(rev!==revision)return;inputTensor=decoded;$('#input-info').textContent=`${inputTensor.meaning} / [${inputTensor.shape.join(', ')}]`;}catch(error){if(rev===revision)status.textContent=error.message;}});
$('#images')?.addEventListener('change',async e=>{
 invalidated();inputTensor=null;const rev=revision;
 try{
  if(!manifest?.profile)throw Error('先に実行用モデル一式を選んでください');
  const shape=manifest.profile.videoShape,[,channels,frames,height,width]=shape,images=Array.from(e.target.files).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  if(images.length!==frames)throw Error(`このプロファイルには${frames}フレーム必要です`);
  const data=new Float32Array(channels*frames*height*width),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  for(let t=0;t<frames;t++){
   const bitmap=await createImageBitmap(images[t]);
   try{if(bitmap.width!==width||bitmap.height!==height)throw Error(`画像寸法は${width}×${height}に揃えてください`);ctx.clearRect(0,0,width,height);ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,width,height).data;
    for(let i=0;i<width*height;i++){if(pixels[i*4+3]!==255)throw Error('透過画像は、背景を明示的に合成してから選んでください');for(let c=0;c<3;c++)data[(c*frames+t)*height*width+i]=pixels[i*4+c]/255;}
   }finally{bitmap.close();}
  }
  if(rev!==revision)return;inputTensor={dtype:'float32',layout:'NCTHW',shape:[...shape],meaning:'rgb-unit',data};$('#operation').value='encode';$('#input-info').textContent=`画像${frames}枚 / [${shape.join(', ')}]`;
 }catch(error){if(rev===revision)status.textContent=error.message;}
});
run.addEventListener('click',async()=>{
 clearResult();const rev=revision;
 try{
  if(!manifest)throw Error('実行用モデル一式を選んでください');
  let operation='encode',input;
  if(mode==='text_encoder'){
   const advanced=$('#token-input').value.trim();
   if(advanced){const tokens=JSON.parse(advanced);input={tokenIds:tokens.tokenIds,attentionMask:tokens.attentionMask};}
   else input={text:$('#prompt').value};
  }else{
   if(!inputTensor)throw Error('Works tensorファイルを選んでください');operation=$('#operation').value;
   requireTensor(inputTensor,{dtype:'float32',layout:'NCTHW'});
   if(operation==='decode'?inputTensor.meaning!=='raw-posterior-mean':!['raw-decoder-rgb','rgb-unit'].includes(inputTensor.meaning))throw Error('この操作に接続できないtensorです');
   input=inputTensor;
  }
  const output=await client.run({module:mode,operation,manifest,files,input});if(rev!==revision)return;
  result=output;status.textContent='完了';$('#output').textContent=`${output.tensor.meaning}\nshape [${output.tensor.shape.join(', ')}]\n${output.tensor.data.byteLength.toLocaleString()} bytes`;
  $('#evidence').textContent=JSON.stringify(output.evidence,null,2);save.disabled=false;
 }catch(e){if(rev===revision)status.textContent=e.message;}
});
cancel.addEventListener('click',()=>{revision++;client.cancel();clearResult();});
save.addEventListener('click',async()=>{try{if(!result)return;const rev=revision,bytes=await encodeTensor(result.tensor);if(rev!==revision||!result)return;if(outputURL)URL.revokeObjectURL(outputURL);outputURL=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=outputURL;a.download=mode+'-'+result.tensor.meaning+'.wktensor';a.click();}catch(e){status.textContent=e.message;}});
addEventListener('pagehide',()=>{client.dispose();if(outputURL)URL.revokeObjectURL(outputURL);});
